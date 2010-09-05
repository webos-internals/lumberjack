LumberjackService.identifier = 'palm://org.webosinternals.lumberjack';

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
