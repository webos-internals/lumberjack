LumberjackService.identifier = 'palm://org.webosinternals.lumberjack';

//												  Context 'BluetoothMonitor' = debug
LumberjackService.getLoggingRegExp = new RegExp(/^Context '([^']*)' = (.*)$/);

function LumberjackService() {}

LumberjackService.status = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'status',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.version = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'version',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.clearMessages = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'clearMessages',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};
LumberjackService.getMessages = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'getMessages',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.tailMessages = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'tailMessages',
		parameters:
		{
			"subscribe":true
		},
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};
LumberjackService.killTailMessages = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'killTailMessages',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.dbusCapture = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'dbusCapture',
		parameters:
		{
			"subscribe":true
		},
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};
LumberjackService.killDBusCapture = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'killDBusCapture',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.ls2Monitor = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'ls2Monitor',
		parameters:
		{
			"subscribe":true
		},
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};
LumberjackService.killLs2Monitor = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'killLs2Monitor',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.listApps = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'listApps',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};
LumberjackService.getStats = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'getStats',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.getLogging = function(callback, context)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'getLogging',
		parameters: {},
	    onSuccess: LumberjackService.getLoggingHelper.bindAsEventListener(this, callback, context),
	    onFailure: LumberjackService.getLoggingHelper.bindAsEventListener(this, callback, context)
	});
    return request;
};
LumberjackService.getLoggingHelper = function(payload, callback, context)
{
	var response = false;
	
	if (payload.returnValue)
	{
		for (var p = 0; p < payload.stdOut.length; p++)
		{
			var match = LumberjackService.getLoggingRegExp.exec(payload.stdOut[p]);
			if (match && match[1] == context)
			{
				response = match[2];
				break;
			}
		}
	}
	if (callback) callback(response);
};
LumberjackService.setLogging = function(callback, context, level)
{
	//alert('setLogging: ' + context + ' - ' + level);
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'setLogging',
		parameters:
		{
			"context":context,
			"level":level
		},
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};
