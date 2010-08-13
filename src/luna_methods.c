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

//
// We use static buffers instead of continually allocating and deallocating stuff,
// since we're a long-running service, and do not want to leak anything.
//
static char buffer[MAXBUFLEN];
static char esc_buffer[MAXBUFLEN];
static char run_command_buffer[MAXBUFLEN];
static char read_file_buffer[CHUNKSIZE+CHUNKSIZE+1];

pthread_t tailMessagesThread;
LSHandle *tailMessagesHandle;
LSMessage*tailMessagesMessage;

//
// Escape a string so that it can be used directly in a JSON response.
// In general, this means escaping quotes, backslashes and control chars.
// It uses the static esc_buffer, which must be twice as large as the
// largest string this routine can handle.
//
static char *json_escape_str(char *str)
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
// Run a shell command and send back status messages.
// The return value says whether the command executed successfully or not.
//
static bool run_command(char *command, LSHandle* lshandle, LSMessage *message) {
  LSError lserror;
  LSErrorInit(&lserror);

  // Local buffer to store the current line.
  char line[MAXLINLEN];

  // Has an early termination error been detected?
  bool error = false;

  fprintf(stderr, "Running command %s\n", command);

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

    // Have status updates been requested?
    if (lshandle && message) {

      // Send it as a status message.
      strcpy(buffer, "{\"returnValue\": true, \"stage\": \"status\", \"status\": \"");
      strcat(buffer, json_escape_str(line));
      strcat(buffer, "\"}");

      // %%% Should we break out of the loop here, or just ignore the error? %%%
      if (!LSMessageReply(lshandle, message, buffer, &lserror)) goto error;

    }

    // If a termination failure has been detected, then break out of the loop.
    if (error) break;

  }

  // Check the close status of the process, and return the combined error status
  if (pclose(fp) || error) {
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

void *tail_messages(void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  LSHandle* lshandle = tailMessagesHandle;
  LSMessage *message = tailMessagesMessage;


  // Local buffer to store the update command
  char command[MAXLINLEN];

  // Capture any errors
  bool error = false;

  fprintf(stderr, "Created thread\n");
  
  // Store the command, so it can be used in the error report if necessary
  strcpy(command, "/usr/bin/tail -f /var/log/messages 2>&1");

  // Run the command
  if (!run_command(command, lshandle, message)) {
    fprintf(stderr, "Command failed\n");
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": false, \"stage\": \"failed\"}", &lserror)) goto error;
  }
  else {
    fprintf(stderr, "Command passed\n");
    if (!LSMessageReply(lshandle, message, "{\"returnValue\": true, \"stage\": \"completed\"}", &lserror)) goto error;
  }

  fprintf(stderr, "Thread exiting\n");
  
  return;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return;
}

//
// Run tail -f /var/log/messages and provide the output back to Mojo
//
bool tail_messages_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  tailMessagesHandle = lshandle;
  tailMessagesMessage = message;

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
bool kill_command_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
  LSError lserror;
  LSErrorInit(&lserror);

  fprintf(stderr, "Killing thread\n");
  
  pthread_cancel(tailMessagesThread);

  // Report that the update operaton has begun
  if (!LSMessageReply(lshandle, message, "{\"returnValue\": true}", &lserror)) goto error;

  fprintf(stderr, "Exiting kill\n");
  
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
    sprintf(read_file_buffer,
	    "{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Cannot open %s\"}",
	    filename);
    
    if (!LSMessageReply(lshandle, message, read_file_buffer, &lserror)) goto error;
    return true;
  }
  
  char chunk[CHUNKSIZE];
  int chunksize = CHUNKSIZE;

  fprintf(stderr, "Reading file %s\n", filename);

  fseek(file, 0, SEEK_END);
  int filesize = ftell(file);
  fseek(file, 0, SEEK_SET);

  if (subscribed) {
    if (sprintf(read_file_buffer,
		"{\"returnValue\": true, \"filesize\": %d, \"chunksize\": %d, \"stage\": \"start\"}",
		filesize, chunksize)) {

      if (!LSMessageReply(lshandle, message, read_file_buffer, &lserror)) goto error;

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
    sprintf(read_file_buffer, "{\"returnValue\": true, \"size\": %d, \"contents\": \"", size);
    strcat(read_file_buffer, json_escape_str(chunk));
    strcat(read_file_buffer, "\"");
    if (subscribed) {
      strcat(read_file_buffer, ", \"stage\": \"middle\"");
    }
    strcat(read_file_buffer, "}");

    if (!LSMessageReply(lshandle, message, read_file_buffer, &lserror)) goto error;

  }

  if (!fclose(file)) {
    if (subscribed) {
      sprintf(read_file_buffer, "{\"returnValue\": true, \"datasize\": %d, \"stage\": \"end\"}", datasize);

      if (!LSMessageReply(lshandle, message, read_file_buffer, &lserror)) goto error;

    }
  }
  else {
    sprintf(read_file_buffer, "{\"returnValue\": false, \"errorCode\": -1, \"errorText\": \"Cannot close file\"}");

    if (!LSMessageReply(lshandle, message, read_file_buffer, &lserror)) goto error;

  }

  return true;
 error:
  LSErrorPrint(&lserror, stderr);
  LSErrorFree(&lserror);
 end:
  return false;
}

bool get_messages_method(LSHandle* lshandle, LSMessage *message, void *ctx) {
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

  { "getMessages",	get_messages_method },
  { "tailMessages",	tail_messages_method },

  { "killCommand",	kill_command_method },

  { "listApps",		listApps_method },

  { 0, 0 }
};

bool register_methods(LSPalmService *serviceHandle, LSError lserror) {
  return LSPalmServiceRegisterCategory(serviceHandle, "/", luna_methods,
				       NULL, NULL, NULL, &lserror);
}
