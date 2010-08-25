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

LumberjackService.killCommand = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'killCommand',
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
