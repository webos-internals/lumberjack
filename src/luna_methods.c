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

#include "luna_service.h"
#include "luna_methods.h"

#define ALLOWED_CHARS "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"

#define API_VERSION "1"

pthread_t tailMessagesThread;
LSHandle *tailMessagesHandle = NULL;
LSMessage*tailMessagesMessage = NULL;
FILE *    tailMessagesFileHandle = NULL;
bool      tailMessagesRunning = false;;


pthread_mutex_t stopmutex = PTHREAD_MUTEX_INITIALIZER;
bool      tailMessagesStop = false;

//
// Escape a string so that it can be used directly in a JSON response.
// In general, this means escaping quotes, backslashes and control chars.
// It uses the static esc_buffer, which must be twice as large as the
// largest string this routine can handle.
//
static char *json_escape_str(char *str, char *esc_buffer)
{
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
  json_t *object = LSMessageGetPayloadJSON(message);
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

void *tail_messages(void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  char buffer[MAXBUFLEN];
  char esc_buffer[MAXBUFLEN];

  LSHandle* lshandle = tailMessagesHandle;
  LSMessage *message = tailMessagesMessage;
  FILE           *fp = tailMessagesFileHandle;

  fprintf(stderr, "Created thread\n");
  
  // Local buffer to store the current line.
  char line[MAXLINLEN];

  // Has an early termination error been detected?
  bool error = false;

  // Loop through the output lines
  while (fgets(line, sizeof line, fp)) {

    pthread_mutex_lock( &stopmutex );
    if (tailMessagesStop) {
      pthread_mutex_unlock( &stopmutex );
      break;
    }
    pthread_mutex_unlock( &stopmutex );

    // Chomp the newline
    char *nl = strchr(line,'\n'); if (nl) *nl = 0;

    // Have status updates been requested?
    if (lshandle && message) {

      // Send it as a status message.
      strcpy(buffer, "{\"returnValue\": true, \"stage\": \"status\", \"status\": \"");
      strcat(buffer, json_escape_str(line, esc_buffer));
      strcat(buffer, "\"}");

      // %%% Should we break out of the loop here, or just ignore the error? %%%
      if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;

    }

    // If a termination failure has been detected, then break out of the loop.
    if (error) break;

  }

  fprintf(stderr, "Thread exiting\n");
  
  fprintf(stderr, "Closing previous pipe\n");
  pclose(fp);
  
  goto end;

 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  pthread_exit(NULL);
  return;
}

//
// Run tail -f /var/log/messages and provide the output back to Mojo
//
bool tailMessages_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (tailMessagesRunning) {
    fprintf(stderr, "Thread already running\n");
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"stage\": \"failed\"}", &lserror)) goto error;
    return;
  }

  tailMessagesHandle = lshandle;
  tailMessagesMessage = message;

  // Local buffer to store the update command
  char command[MAXLINLEN];

  // Store the command, so it can be used in the error report if necessary
  strcpy(command, "/usr/bin/tail -f /var/log/messages 2>&1");

  fprintf(stderr, "Running command %s\n", command);

  // Start execution of the command, and read the output.
  FILE *fp = popen(command, "r");

  // Return immediately if we cannot even start the command.
  if (!fp) {
    return false;
  }

  tailMessagesFileHandle = fp;
  pthread_mutex_lock( &stopmutex );
  tailMessagesStop = false;
  pthread_mutex_unlock( &stopmutex );

  fprintf(stderr, "Creating thread\n");
  
  if (pthread_create(&tailMessagesThread, NULL, tail_messages, NULL)) {
    fprintf(stderr, "Creating thread failed\n");
    // Report that the update operaton was not able to start
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"stage\": \"failed\"}", &lserror)) goto error;
  }
  else {
    fprintf(stderr, "Creating thread successful\n");
    // Report that the update operaton has begun
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"stage\": \"start\"}", &lserror)) goto error;
  }

  tailMessagesRunning = true;

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

//
// Kill the currently running command
//
bool killCommand_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  if (!tailMessagesRunning) {
    fprintf(stderr, "Thread not running\n");
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"stage\": \"failed\"}", &lserror)) goto error;
    return;
  }

  fprintf(stderr, "Killing thread\n");
  
  pthread_mutex_lock( &stopmutex );
  tailMessagesStop = true;
  pthread_mutex_unlock( &stopmutex );

  pthread_join(tailMessagesThread, NULL);

  tailMessagesRunning = false;

  fprintf(stderr, "Exiting kill\n");
  
  if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"stage\": \"completed\"}", &lserror)) goto error;

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

  char buffer[CHUNKSIZE+CHUNKSIZE+1];
  char esc_buffer[MAXBUFLEN];

  FILE * file = fopen(filename, "r");
  if (!file) {
    sprintf(buffer,
	    "{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Cannot open %s\"}",
	    filename);
    
    if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;
    return true;
  }
  
  char chunk[CHUNKSIZE];
  int chunksize = CHUNKSIZE;

  fprintf(stderr, "Reading file %s\n", filename);

  fseek(file, 0, SEEK_END);
  int filesize = ftell(file);
  fseek(file, 0, SEEK_SET);

  if (subscribed) {
    if (sprintf(buffer,
		"{\"returnValue\": true, \"filesize\": %d, \"chunksize\": %d, \"stage\": \"start\"}",
		filesize, chunksize)) {

      if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;

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
    sprintf(buffer, "{\"returnValue\": true, \"size\": %d, \"contents\": \"", size);
    strcat(buffer, json_escape_str(chunk, esc_buffer));
    strcat(buffer, "\"");
    if (subscribed) {
      strcat(buffer, ", \"stage\": \"middle\"");
    }
    strcat(buffer, "}");

    if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;

  }

  if (!fclose(file)) {
    if (subscribed) {
      sprintf(buffer, "{\"returnValue\": true, \"datasize\": %d, \"stage\": \"end\"}", datasize);

      if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;

    }
  }
  else {
    sprintf(buffer, "{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Cannot close file\"}");

    if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;

  }

  return true;
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

LSMethod luna_methods[] = {
  { "status",		dummy_method },
  { "version",		version_method },

  { "getLogging",	getLogging_method },
  { "setLogging",	setLogging_method },

  { "getMessages",	getMessages_method },
  { "tailMessages",	tailMessages_method },

  { "killCommand",	killCommand_method },

  { "listApps",		listApps_method },

  { 0, 0 }
};

bool register_methods(LSPalmService *serviceHandle, LSError lserror) {
  return LSPalmServiceRegisterCategory(serviceHandle, "/", luna_methods,
				       NULL, NULL, NULL, &lserror);
}
