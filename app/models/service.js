LumberjackService.identifier = 'palm://org.webosinternals.lumberjack';

function LumberjackService() {}

LumberjackService.request = function(callback)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'request',
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};

LumberjackService.subscribe = function(callback, pkg, filename, url)
{
    var request = new Mojo.Service.Request(LumberjackService.identifier,
	{
	    method: 'subscribe',
		parameters:
		{
			"subscribe":true
		},
	    onSuccess: callback,
	    onFailure: callback
	});
    return request;
};
