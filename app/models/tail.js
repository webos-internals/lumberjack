function tailHandler()
{
	this.scenes = $H();
	this.started = 0;
	this.status = false;
	
	this.request = false;
};

tailHandler.prototype.registerScene = function(log, assistant)
{
	var scene =
	{
		assistant: assistant,
		status: false
	};
	this.scenes.set(log, scene);
};
tailHandler.prototype.unregisterScene = function(log)
{
	this.scenes.unset(log);
	this.started = this.getStartedScenes();
	
	if (this.started > 0 && !this.status)
	{
		this.start();
	}
	if (this.started < 1 && this.status)
	{
		this.stop();
	}
};
tailHandler.prototype.getStartedScenes = function()
{
	var keys = this.scenes.keys();
	if (keys.length > 0)
	{
		var started = 0;
		for (var k = 0; k < keys.length; k++)
		{
			var scene = this.scenes.get(keys[k]);
			if (scene.status)
			{
				started++;
			}
		}
		return started;
	}
	return 0;
}

tailHandler.prototype.startScene = function(log)
{
	var scene = this.scenes.get(log);
	scene.status = true;
	this.scenes.update(log, scene);
	
	this.started++;
	if (this.started > 0 && !this.status)
	{
		this.start();
	}
}
tailHandler.prototype.stopScene = function(log)
{
	var scene = this.scenes.get(log);
	scene.status = false;
	this.scenes.update(log, scene);
	
	this.started--;
	if (this.started < 1 && this.status)
	{
		this.stop();
	}
}

tailHandler.prototype.start = function()
{
	this.request = LumberjackService.tailMessages(this.handleMessages.bindAsEventListener(this));
}

tailHandler.prototype.handleMessages = function(payload)
{
	if (payload.returnValue)
	{
		this.status = true;
		var alertMsg = this.parseAlert(payload.status);
		var mojoMsg =  this.parseMojo(payload.status);
		var keys = this.scenes.keys();
		if (keys.length > 0)
		{
			for (var k = 0; k < keys.length; k++)
			{
				var scene = this.scenes.get(keys[k]);
				if (scene.status)
				{
					if (keys[k] == 'alert')
					{
						if (scene.assistant.controller)
							scene.assistant.addMessage(alertMsg);
					}
					else if (keys[k] == 'all')
					{
						mojoMsg.rowClass += ' showapp';
						if (scene.assistant.controller)
							scene.assistant.addMessage(mojoMsg);
					}
					else if (mojoMsg.id && keys[k].toLowerCase() == mojoMsg.id.toLowerCase())
					{
						if (scene.assistant.controller)
							scene.assistant.addMessage(mojoMsg);
					}
				}
			}
		}
	}
	else
	{
		this.stop();
	}
}

tailHandler.prototype.parseAlert = function(msg)
{
	var l = false;
	
	// (alert)		2010-08-15T02:32:37.110778Z [178667] palm-webos-device user.warning LunaSysMgr: {LunaSysMgrJS}: start
	var LogRegExpAlert =	new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device user.warning LunaSysMgr: {LunaSysMgrJS}: (.*)$/);

	var match = LogRegExpAlert.exec(msg);
	if (match)
	{
		if (!match[3].include('palmInitFramework'))
		{
			l =
			{
				app: false,
				id: false,
				type: 'alert',
				rowClass: 'generic',
				message: match[3]
			};
		}
	}
	
	return l;
}
tailHandler.prototype.parseMojo = function(msg)
{
	var l = false;
	
	// (mojo.log)	2010-08-15T01:47:25.448852Z [175956] palm-webos-device user.notice LunaSysMgr: {LunaSysMgrJS}: org.webosinternals.lumberjack: Info: start, palmInitFramework346:2520
	var LogRegExpMojo =		new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device user.([^\s]*) LunaSysMgr: {LunaSysMgrJS}: ([^:]*): ([^:]*): (.*), palmInitFramework(.*)$/);
	
	var match = LogRegExpMojo.exec(msg);
	if (match)
	{
		l =
		{
			app: appsList.get(match[4]),
			id: match[4],
			type: match[5],
			rowClass: match[5],
			message: match[6]
		};
	}
	
	return l;
}

tailHandler.prototype.stop = function()
{
	if (this.request)
	{
		this.request.cancel();
	}
	
	this.request = LumberjackService.killCommand(this.stopped.bindAsEventListener(this));
}
tailHandler.prototype.stopped = function(payload)
{
	this.status = false;
	var keys = this.scenes.keys();
	if (keys.length > 0)
	{
		for (var k = 0; k < keys.length; k++)
		{
			var scene = this.scenes.get(keys[k]);
			if (scene.assistant.controller)
			{
				scene.assistant.stopped();
			}
		}
	}
}