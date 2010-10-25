/*=============================================================================
 Copyright (C) 2010 WebOS Internals <support@webos-internals.org>

 This program is free software; you can redistribute it and/or
 modify it under the terms of the GNU General Public License
 as published by the Free Software Foundation; either version 2
 of the License, or (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 =============================================================================*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <syslog.h>

#include "luna_service.h"
#include "luna_methods.h"

#define ALLOWED_CHARS "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"

#define API_VERSION "1"

static char file_buffer[CHUNKSIZE+CHUNKSIZE+1];
static char file_esc_buffer[MAXBUFLEN];

typedef struct {
  LSMessage *message;
  FILE *fp;
} THREAD_DATA;

pthread_t tailMessagesThread = 0;
pthread_t dbusCaptureThread = 0;
pthread_t ls2MonitorThread = 0;

//
// Escape a string so that it can be used directly in a JSON response.
// In general, this means escaping quotes, backslashes and control chars.
// It uses the static esc_buffer, which must be twice as large as the
// largest string this routine can handle.
//
static char *json_escape_str(char *str, char *esc_buffer) {
  const char *json_hex_chars = "0123456789abcdef";

  // Initialise the output buffer
  strcpy(esc_buffer, "");

  // Check the constraints on the input string
  if (strlen(str) > MAXBUFLEN) return (char *)esc_buffer;

  // Initialise the pointers used to step through the input and output.
  char *resultsPt = (char *)esc_buffer;
  int pos = 0, start_offset = 0;

  // Traverse the input, copying to the output in the largest chunks
  // possible, escaping characters as we go.
  unsigned char c;
  do {
    c = str[pos];
    switch (c) {
    case '\0':
      // Terminate the copying
      break;
    case '\b':
    case '\n':
    case '\r':
    case '\t':
    case '"':
    case '\\': {
      // Copy the chunk before the character which must be escaped
      if (pos - start_offset > 0) {
	memcpy(resultsPt, str + start_offset, pos - start_offset);
	resultsPt += pos - start_offset;
      };
      
      // Escape the character
      if      (c == '\b') {memcpy(resultsPt, "\\b",  2); resultsPt += 2;} 
      else if (c == '\n') {memcpy(resultsPt, "\\n",  2); resultsPt += 2;} 
      else if (c == '\r') {memcpy(resultsPt, "\\r",  2); resultsPt += 2;} 
      else if (c == '\t') {memcpy(resultsPt, "\\t",  2); resultsPt += 2;} 
      else if (c == '"')  {memcpy(resultsPt, "\\\"", 2); resultsPt += 2;} 
      else if (c == '\\') {memcpy(resultsPt, "\\\\", 2); resultsPt += 2;} 

      // Reset the start of the next chunk
      start_offset = ++pos;
      break;
    }

    default:
      
      // Check for "special" characters
      if ((c < ' ') || (c > 127)) {

	// Copy the chunk before the character which must be escaped
	if (pos - start_offset > 0) {
	  memcpy(resultsPt, str + start_offset, pos - start_offset);
	  resultsPt += pos - start_offset;
	}

	// Insert a normalised representation
	sprintf(resultsPt, "\\u00%c%c",
		json_hex_chars[c >> 4],
		json_hex_chars[c & 0xf]);

	// Reset the start of the next chunk
	start_offset = ++pos;
      }
      else {
	// Just move along the source string, without copying
	pos++;
      }
    }
  } while (c);

  // Copy the final chunk, if required
  if (pos - start_offset > 0) {
    memcpy(resultsPt, str + start_offset, pos - start_offset);
    resultsPt += pos - start_offset;
  } 

  // Terminate the output buffer ...
  memcpy(resultsPt, "\0", 1);

  // and return a pointer to it.
  return (char *)esc_buffer;
}

//
// A dummy method, useful for unimplemented functions or as a status function.
// Called directly from webOS, and returns directly to webOS.
//
bool dummy_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (!LSMessageReply(lshandle, message, "{\"returnValue\": true}", &lserror)) goto error;

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Return the current API version of the service.
// Called directly from webOS, and returns directly to webOS.
//
bool version_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"version\": \"" VERSION "\", \"apiVersion\": \"" API_VERSION "\"}", &lserror)) goto error;

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Run a shell command, and return the output in-line in a buffer for returning to webOS.
// The global run_command_buffer must be initialised before calling this function.
// The return value says whether the command executed successfully or not.
//
static bool run_command(char *command, bool escape, char *buffer) {
  LSError lserror;
  LSErrorInit(&lserror);

  char esc_buffer[MAXBUFLEN];

  // Local buffers to store the current and previous lines.
  char line[MAXLINLEN];

  // fprintf(stderr, "Running command %s\n", command);

  // buffer is assumed to be initialised, ready for strcat to append.

  // Is this the first line of output?
  bool first = true;

  bool array = false;

  // Start execution of the command, and read the output.
  FILE *fp = popen(command, "r");

  // Return immediately if we cannot even start the command.
  if (!fp) {
    return false;
  }

  // Loop through the output lines
  while (fgets(line, sizeof line, fp)) {

    // Chomp the newline
    char *nl = strchr(line,'\n'); if (nl) *nl = 0;

    // Add formatting breaks between lines
    if (first) {
      if (buffer[strlen(buffer)-1] == '[') {
	array = true;
      }
      first = false;
    }
    else {
      if (array) {
	strcat(buffer, ", ");
      }
      else {
	strcat(buffer, "<br>");
      }
    }
    
    // Append the unfiltered output to the buffer.
    if (escape) {
      if (array) {
	strcat(buffer, "\"");
      }
      strcat(buffer, json_escape_str(line, esc_buffer));
      if (array) {
	strcat(buffer, "\"");
      }
    }
    else {
      strcat(buffer, line);
    }
  }
  
  // Check the close status of the process
  if (pclose(fp)) {
    return false;
  }

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  // %%% We need a way to distinguish command failures from LSMessage failures %%%
  // %%% This may need to be true if we just want to ignore LSMessage failures %%%
  return false;
}

//
// Send a standard format command failure message back to webOS.
// The command will be escaped.  The output argument should be a JSON array and is not escaped.
// The additional text  will not be escaped.
// The return value is from the LSMessageReply call, not related to the command execution.
//
static bool report_command_failure(LSHandle* lshandle, LSMessage *message, char *command, char *stdErrText, char *additional) {
  LSError lserror;
  LSErrorInit(&lserror);

  char buffer[MAXBUFLEN];
  char esc_buffer[MAXBUFLEN];

  // Include the command that was executed, in escaped form.
  snprintf(buffer, MAXBUFLEN,
	   "{\"errorText\": \"Unable to run command: %s\"",
	   json_escape_str(command, esc_buffer));

  // Include any stderr fields from the command.
  if (stdErrText) {
    strcat(buffer, ", \"stdErr\": ");
    strcat(buffer, stdErrText);
  }

  // Report that an error occurred.
  strcat(buffer, ", \"returnValue\": false, \"errorCode\": -1");

  // Add any additional JSON fields.
  if (additional) {
    strcat(buffer, ", ");
    strcat(buffer, additional);
  }

  // Terminate the JSON reply message ...
  strcat(buffer, "}");

  // fprintf(stderr, "Message is %s\n", buffer);

  // and send it.
  if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Run a simple shell command, and return the output to webOS.
//
static bool simple_command(LSHandle* lshandle, LSMessage *message, char *command) {
  LSError lserror;
  LSErrorInit(&lserror);

  char run_command_buffer[MAXBUFLEN];

  // Initialise the output buffer
  strcpy(run_command_buffer, "{\"stdOut\": [");

  // Run the command
  if (run_command(command, true, run_command_buffer)) {

    // Finalise the message ...
    strcat(run_command_buffer, "], \"returnValue\": true}");

    // fprintf(stderr, "Message is %s\n", run_command_buffer);

    // and send it to webOS.
    if (!LSMessageReply(lshandle, message, run_command_buffer, &lserror)) goto error;
  }
  else {

    // Finalise the command output ...
    strcat(run_command_buffer, "]");

    // and use it in a failure report message.
    if (!report_command_failure(lshandle, message, command, run_command_buffer+11, NULL)) goto end;
  }

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Run command to get Logging context level.
//
bool getLogging_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  // Local buffer to store the update command
  char command[MAXLINLEN];

  // Store the command, so it can be used in the error report if necessary
  sprintf(command, "PmLogCtl show 2>&1");
  
  return simple_command(lshandle, message, command);

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Run command to set Logging context level.
//
bool setLogging_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  // Local buffer to store the update command
  char command[MAXLINLEN];

  // Extract the context argument from the message
  json_t *object = json_parse_document(LSMessageGetPayload(message));
  json_t *context = json_find_first_label(object, "context");
  if (!context || (context->child->type != JSON_STRING) || (strspn(context->child->text, ALLOWED_CHARS) != strlen(context->child->text))) {
    if (!LSMessageReply(lshandle, message,
			"{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Invalid or missing context\"}",
			&lserror)) goto error;
    return true;
  }

  // Extract the level argument from the message
  json_t *level = json_find_first_label(object, "level");
  if (!level || (level->child->type != JSON_STRING) || (strspn(level->child->text, ALLOWED_CHARS) != strlen(level->child->text))) {
    if (!LSMessageReply(lshandle, message,
			"{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Invalid or missing level\"}",
			&lserror)) goto error;
    return true;
  }

  // Store the command, so it can be used in the error report if necessary
  sprintf(command, "PmLogCtl set %s %s 2>&1", context->child->text, level->child->text);
  
  return simple_command(lshandle, message, command);

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

void tail_thread_cleanup(void *arg) {
  THREAD_DATA *data = (THREAD_DATA *)arg;

  syslog(LOG_DEBUG, "Tail thread cleanup, closing pipe %p, unref message %p\n", 
      data->fp, data->message);

  if (data->fp) pclose(data->fp);
  if (data->message) LSMessageUnref(data->message);
}


void *tail_messages(void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);
  LSHandle* lshandle = pub_serviceHandle;
  char buffer[MAXBUFLEN];
  char esc_buffer[MAXBUFLEN];
  char command[MAXLINLEN] = "/usr/bin/tail -f /var/log/messages 2>&1";
  THREAD_DATA data;
  char line[MAXLINLEN];
  pthread_key_t key;

  if (ctx) 
    data.message = (LSMessage *)ctx;
  else
    return NULL;

  // Create thread key/value
  pthread_key_create(&key, tail_thread_cleanup);
  pthread_setspecific(key, &data);

  data.fp = popen(command, "r");
  syslog(LOG_DEBUG, "tail pipe fp %p\n", data.fp);

  if (!data.fp) {
    if (!LSMessageReply(lshandle, data.message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return NULL;
  }

  // Loop through the output lines
  while (fgets(line, sizeof line, data.fp)) {
    // Chomp the newline
    char *nl = strchr(line,'\n'); if (nl) *nl = 0;

    // Have status updates been requested?
    if (lshandle && data.message) {

      // Send it as a status message.
      strcpy(buffer, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"status\", \"status\": \"");
      strcat(buffer, json_escape_str(line, esc_buffer));
      strcat(buffer, "\"}");

      // %%% Should we break out of the loop here, or just ignore the error? %%%
      if (!LSMessageReply(lshandle, data.message, buffer, &lserror)) goto error;

    }
  }

  goto end;

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return NULL;
}

//
// Run tail -f /var/log/messages and provide the output back to Mojo
//
bool tailMessages_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (tailMessagesThread) {
    syslog(LOG_NOTICE, "Tail thread already running\n");
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return true;
  }

  syslog(LOG_DEBUG, "Create tail thread, ref message %p\n", message);

  // Ref and save the message for use in tail thread
  LSMessageRef(message);

  if (pthread_create(&tailMessagesThread, NULL, tail_messages, (void*)message)) {
    syslog(LOG_ERR, "Creating tail thread failed (0x%x)\n", tailMessagesThread);
    // Report that the tail operation was not able to start
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"errorCode\": -1, \"errorText\": \"Unable to start tail thread\"}", &lserror)) goto error;
  }
  else {
    syslog(LOG_DEBUG, "Created tail thread successfully (0x%x)\n", tailMessagesThread);
    // Report that the tail operation has begun
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"start\"}", &lserror)) goto error;
  }

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Kill the currently running tail
//
bool killTailMessages_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (!tailMessagesThread) {
    syslog(LOG_NOTICE, "Tail thread 0x%x not running\n", tailMessagesThread);
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return true;
  }

  syslog(LOG_DEBUG, "Killing tail thread 0x%x\n", tailMessagesThread);
  
  pthread_cancel(tailMessagesThread);
  tailMessagesThread = 0;

  if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"completed\"}", &lserror)) goto error;

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

void dbus_thread_cleanup(void *arg) {
  THREAD_DATA *data = (THREAD_DATA *)arg;

  syslog(LOG_DEBUG, "DBus thread cleanup, closing pipe %p, unref message %p\n", 
      data->fp, data->message);

  if (data->fp) pclose(data->fp);
  if (data->message) LSMessageUnref(data->message);
}


void *dbus_capture(void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);
  LSHandle* lshandle = pub_serviceHandle;
  char buffer[MAXBUFLEN];
  char esc_buffer[MAXBUFLEN];
  char command[MAXLINLEN] = "/usr/bin/dbus-util --capture 2>&1";
  THREAD_DATA data;
  char line[MAXLINLEN];
  pthread_key_t key;

  if (ctx) 
    data.message = (LSMessage *)ctx;
  else
    return NULL;

  // Create thread key/value
  pthread_key_create(&key, dbus_thread_cleanup);
  pthread_setspecific(key, &data);

  data.fp = popen(command, "r");
  syslog(LOG_DEBUG, "dbus pipe fp %p\n", data.fp);

  if (!data.fp) {
    if (!LSMessageReply(lshandle, data.message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return NULL;
  }

  // Loop through the output lines
  while (fgets(line, sizeof line, data.fp)) {
    // Chomp the newline
    char *nl = strchr(line,'\n'); if (nl) *nl = 0;

    // Have status updates been requested?
    if (lshandle && data.message) {

      if (!strstr(line, "ouroboros")) {

	// Send it as a status message.
	strcpy(buffer, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"status\", \"status\": \"");
	strcat(buffer, json_escape_str(line, esc_buffer));
	strcat(buffer, "\"}");

	// %%% Should we break out of the loop here, or just ignore the error? %%%
	if (!LSMessageReply(lshandle, data.message, buffer, &lserror)) goto error;

      }
    }
  }

  goto end;

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return NULL;
}

//
// Run dbus-util --capture and provide the output back to Mojo
//
bool dbusCapture_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (dbusCaptureThread) {
    syslog(LOG_NOTICE, "DBus thread already running\n");
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return true;
  }

  syslog(LOG_DEBUG, "Create dbus thread, ref message %p\n", message);

  // Ref and save the message for use in dbus thread
  LSMessageRef(message);

  if (pthread_create(&dbusCaptureThread, NULL, dbus_capture, (void*)message)) {
    syslog(LOG_ERR, "Creating dbus thread failed (0x%x)\n", dbusCaptureThread);
    // Report that the dbus operation was not able to start
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"errorCode\": -1, \"errorText\": \"Unable to start dbus thread\"}", &lserror)) goto error;
  }
  else {
    syslog(LOG_DEBUG, "Created dbus thread successfully (0x%x)\n", dbusCaptureThread);
    // Report that the dbus operation has begun
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"start\"}", &lserror)) goto error;
  }

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Kill the currently running commands
//
bool killDBusCapture_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (!dbusCaptureThread) {
    syslog(LOG_NOTICE, "DBus thread 0x%x not running\n", dbusCaptureThread);
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return true;
  }

  syslog(LOG_DEBUG, "Killing dbus thread 0x%x\n", dbusCaptureThread);
  
  pthread_cancel(dbusCaptureThread);
  dbusCaptureThread = 0;

  if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"completed\"}", &lserror)) goto error;

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

void ls2_thread_cleanup(void *arg) {
  THREAD_DATA *data = (THREAD_DATA *)arg;

  syslog(LOG_DEBUG, "Ls2 thread cleanup, closing pipe %p, unref message %p\n", 
      data->fp, data->message);

  if (data->fp) pclose(data->fp);
  if (data->message) LSMessageUnref(data->message);
}


void *ls2_monitor(void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);
  LSHandle* lshandle = pub_serviceHandle;
  char buffer[MAXBUFLEN];
  char esc_buffer[MAXBUFLEN];
  char command[MAXLINLEN] = "/usr/bin/ls-monitor 2>&1";
  THREAD_DATA data;
  char line[MAXLINLEN];
  pthread_key_t key;

  if (ctx) 
    data.message = (LSMessage *)ctx;
  else
    return NULL;

  // Create thread key/value
  pthread_key_create(&key, ls2_thread_cleanup);
  pthread_setspecific(key, &data);

  data.fp = popen(command, "r");
  syslog(LOG_DEBUG, "ls2 pipe fp %p\n", data.fp);

  if (!data.fp) {
    if (!LSMessageReply(lshandle, data.message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return NULL;
  }

  // Loop through the output lines
  while (fgets(line, sizeof line, data.fp)) {
    // Chomp the newline
    char *nl = strchr(line,'\n'); if (nl) *nl = 0;

    // Have status updates been requested?
    if (lshandle && data.message) {

      if (!strstr(line, "ouroboros")) {

	// Send it as a status message.
	strcpy(buffer, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"status\", \"status\": \"");
	strcat(buffer, json_escape_str(line, esc_buffer));
	strcat(buffer, "\"}");

	// %%% Should we break out of the loop here, or just ignore the error? %%%
	if (!LSMessageReply(lshandle, data.message, buffer, &lserror)) goto error;

      }
    }
  }

  goto end;

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return NULL;
}

//
// Run ls-monitor --capture and provide the output back to Mojo
//
bool ls2Monitor_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (ls2MonitorThread) {
    syslog(LOG_NOTICE, "Ls2 thread already running\n");
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return true;
  }

  syslog(LOG_DEBUG, "Create ls2 thread, ref message %p\n", message);

  // Ref and save the message for use in ls2 thread
  LSMessageRef(message);

  if (pthread_create(&ls2MonitorThread, NULL, ls2_monitor, (void*)message)) {
    syslog(LOG_ERR, "Creating ls2 thread failed (0x%x)\n", ls2MonitorThread);
    // Report that the ls2 operation was not able to start
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"errorCode\": -1, \"errorText\": \"Unable to start ls2 thread\"}", &lserror)) goto error;
  }
  else {
    syslog(LOG_DEBUG, "Created ls2 thread successfully (0x%x)\n", ls2MonitorThread);
    // Report that the ls2 operation has begun
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"start\"}", &lserror)) goto error;
  }

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Kill the currently running commands
//
bool killLs2Monitor_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (!ls2MonitorThread) {
    syslog(LOG_NOTICE, "Ls2 thread 0x%x not running\n", ls2MonitorThread);
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"ouroboros\": true, \"stage\": \"failed\"}", &lserror)) goto error;
    return true;
  }

  syslog(LOG_DEBUG, "Killing ls2 thread 0x%x\n", ls2MonitorThread);
  
  pthread_cancel(ls2MonitorThread);
  ls2MonitorThread = 0;

  if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"ouroboros\": true, \"stage\": \"completed\"}", &lserror)) goto error;

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

static bool read_file(LSHandle* lshandle, LSMessage *message, char *filename, bool subscribed) {
  LSError lserror;
  LSErrorInit(&lserror);

  FILE * file = fopen(filename, "r");
  if (!file) {
    sprintf(file_buffer,
	    "{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Cannot open %s\"}",
	    filename);
    
    if (!LSMessageReply(lshandle, message, file_buffer, &lserror)) goto error;
    return true;
  }
  
  char chunk[CHUNKSIZE];
  int chunksize = CHUNKSIZE;

  syslog(LOG_DEBUG, "Reading file %s\n", filename);

  fseek(file, 0, SEEK_END);
  int filesize = ftell(file);
  fseek(file, 0, SEEK_SET);

  if (subscribed) {
    if (sprintf(file_buffer,
		"{\"returnValue\": true, \"filesize\": %d, \"chunksize\": %d, \"stage\": \"start\"}",
		filesize, chunksize)) {

      if (!LSMessageReply(lshandle, message, file_buffer, &lserror)) goto error;

    }
  }
  else if (filesize < chunksize) {
    chunksize = filesize;
  }

  int size;
  int datasize = 0;
  while ((size = fread(chunk, 1, chunksize, file)) > 0) {
    datasize += size;
    chunk[size] = '\0';
    sprintf(file_buffer, "{\"returnValue\": true, \"size\": %d, \"contents\": \"", size);
    strcat(file_buffer, json_escape_str(chunk, file_esc_buffer));
    strcat(file_buffer, "\"");
    if (subscribed) {
      strcat(file_buffer, ", \"stage\": \"middle\"");
    }
    strcat(file_buffer, "}");

    if (!LSMessageReply(lshandle, message, file_buffer, &lserror)) goto error;

  }

  if (!fclose(file)) {
    if (subscribed) {
      sprintf(file_buffer, "{\"returnValue\": true, \"datasize\": %d, \"stage\": \"end\"}", datasize);

      if (!LSMessageReply(lshandle, message, file_buffer, &lserror)) goto error;

    }
  }
  else {
    sprintf(file_buffer, "{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Cannot close file\"}");

    if (!LSMessageReply(lshandle, message, file_buffer, &lserror)) goto error;

  }

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

bool clearMessages_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  char command[MAXLINLEN];

  sprintf(command, "rm -rf /var/log/messages 2>&1");

  return simple_command(lshandle, message, command);

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

bool getMessages_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  char filename[MAXLINLEN];

  strcpy(filename, "/var/log/messages");

  return read_file(lshandle, message, filename, true);

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Handler for the listApps service.
//
bool listApps_handler(LSHandle* lshandle, LSMessage *reply, void *ctx) {
  bool retVal;
  LSError lserror;
  LSErrorInit(&lserror);
  LSMessage* message = (LSMessage*)ctx;
  retVal = LSMessageRespond(message, LSMessageGetPayload(reply), &lserror);
  LSMessageUnref(message);
  if (!retVal) {
    LSErrorPrint(&lserror, stderr);
    LSErrorFree(&lserror);
  }
  return retVal;
}

//
// Call the listApps service using liblunaservice and return the output to webOS.
//
bool listApps_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  bool retVal;
  LSError lserror;
  LSErrorInit(&lserror);
  LSMessageRef(message);
  retVal = LSCall(priv_serviceHandle, "palm://com.palm.applicationManager/listApps", "{}",
		  listApps_handler, message, NULL, &lserror);
  if (!retVal) {
    LSErrorPrint(&lserror, stderr);
    LSErrorFree(&lserror);
  }
  return retVal;
}

//
// Handler for the getStats service.
//
bool getStats_handler(LSHandle* lshandle, LSMessage *reply, void *ctx) {
  bool retVal;
  LSError lserror;
  LSErrorInit(&lserror);
  LSMessage* message = (LSMessage*)ctx;
  retVal = LSMessageRespond(message, LSMessageGetPayload(reply), &lserror);
  if (!retVal) {
    LSErrorPrint(&lserror, stderr);
    LSErrorFree(&lserror);
  }
  return retVal;
}

//
// Call the getStats service using liblunaservice and return the output to webOS.
//
bool getStats_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  bool retVal;
  LSError lserror;
  LSErrorInit(&lserror);
  LSMessageRef(message);
  retVal = LSCall(priv_serviceHandle, "palm://com.palm.lunastats/getStats", "{\"subscribe\":true}",
		  getStats_handler, message, NULL, &lserror);
  if (!retVal) {
    LSErrorPrint(&lserror, stderr);
    LSErrorFree(&lserror);
  }
  return retVal;
}

LSMethod luna_methods[] = {
  { "status",		dummy_method },
  { "version",		version_method },

  { "getLogging",	getLogging_method },
  { "setLogging",	setLogging_method },

  { "clearMessages",	clearMessages_method },
  { "getMessages",	getMessages_method },

  { "tailMessages",	tailMessages_method },
  { "killTailMessages",	killTailMessages_method },

  { "dbusCapture",	dbusCapture_method },
  { "killDBusCapture",	killDBusCapture_method },

  { "ls2Monitor",	ls2Monitor_method },
  { "killLs2Monitor",	killLs2Monitor_method },

  { "listApps",		listApps_method },
  { "getStats",		getStats_method },

  { 0, 0 }
};

bool register_methods(LSPalmService *serviceHandle, LSError lserror) {
  return LSPalmServiceRegisterCategory(serviceHandle, "/", luna_methods,
				       NULL, NULL, NULL, &lserror);
}
