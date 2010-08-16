function tailHandler()
{
	this.scenes = $H();
	this.started = 0;
	this.status = false;
	
	this.request = false;
	
	// make truthy to enable heavy logging
	this.logging = false;
};

tailHandler.prototype.newScene = function(assistant, log, popit)
{
	try
	{
		if (this.logging) Mojo.Log.info('newScene: ', log);
		
		var stageName = 'tail-'+log;
		var stageController = Mojo.Controller.appController.getStageController(stageName);
		
        if (stageController && stageController.activeScene().sceneName == 'tail-log')
		{
			stageController.activate();
			return;
		}
		else if (stageController && stageController.activeScene().sceneName != 'tail-log')
		{
			stageController.popScenesTo('tail-log');
			stageController.activate();
			return;
		}
		
		if (!popit)
		{
			assistant.controller.stageController.pushScene('tail-log', log, false);
		}
		else
		{
			Mojo.Controller.appController.createStageWithCallback({name: stageName, lightweight: true}, this.newSceneCallback.bind(this, log, true));
		}
	}
	catch (e)
	{
		Mojo.Log.logException(e, "tailHandler#newScene");
	}
}
tailHandler.prototype.newSceneCallback = function(log, popped, controller)
{
	controller.pushScene('tail-log', log, popped);
}

tailHandler.prototype.registerScene = function(log, assistant)
{
	if (this.logging) Mojo.Log.info('registerScene: ', log);
	var scene = this.scenes.get(log)
	if (scene)
	{
		scene.assistant = assistant;
		this.scenes.update(log, scene);
	}
	else
	{
		scene =
		{
			assistant: assistant,
			status: false
		};
		this.scenes.set(log, scene);
	}
};
tailHandler.prototype.unregisterScene = function(log)
{
	if (this.logging) Mojo.Log.info('unregisterScene: ', log);
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
		if (this.logging) Mojo.Log.info('startedScenes: ', started);
		return started;
	}
	if (this.logging) Mojo.Log.info('startedScenes: ', 0);
	return 0;
}

tailHandler.prototype.startScene = function(log)
{
	if (this.logging) Mojo.Log.info('startScene: ', log);
	var scene = this.scenes.get(log);
	scene.status = true;
	this.scenes.update(log, scene);
	
	this.started = this.getStartedScenes();
	if (this.started > 0 && !this.status)
	{
		this.start();
	}
}
tailHandler.prototype.stopScene = function(log)
{
	if (this.logging) Mojo.Log.info('stopScene: ', log);
	var scene = this.scenes.get(log);
	scene.status = false;
	this.scenes.update(log, scene);
	
	this.started = this.getStartedScenes();
	if (this.started < 1 && this.status)
	{
		this.stop();
	}
}

tailHandler.prototype.start = function()
{
	if (this.logging) Mojo.Log.info('*** start');
	this.request = LumberjackService.tailMessages(this.handleMessages.bindAsEventListener(this));
}

tailHandler.prototype.handleMessages = function(payload)
{
	if (payload.returnValue)
	{
		this.status = true;
		var alertMsg = tailHandler.parseAlert(payload.status);
		var mojoMsg =  tailHandler.parseMojo(payload.status);
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
					else if ((keys[k] == 'all') ||
							(mojoMsg.id && keys[k].toLowerCase() == mojoMsg.id.toLowerCase()))
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

tailHandler.parseAlert = function(msg)
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
				display: formatForHtml(match[3]),
				message: match[3]
			};
		}
	}
	
	return l;
}
tailHandler.parseMojo = function(msg)
{
	var l = false;
	
	// (mojo.log)	2010-08-15T01:47:25.448852Z [175956] palm-webos-device user.notice LunaSysMgr: {LunaSysMgrJS}: org.webosinternals.lumberjack: Info: start, palmInitFramework346:2520
	var LogRegExpMojo =		new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device user.([^\s]*) LunaSysMgr: {LunaSysMgrJS}: ([^:]*): ([^:]*): (.*)$/);
	
	var match = LogRegExpMojo.exec(msg);
	if (match)
	{
		l =
		{
			app: (appsList.get(match[4])?appsList.get(match[4]):match[4]),
			id: match[4],
			type: match[5],
			rowClass: match[3],
			display: formatForHtml(match[6]).replace(/, palmInitFramework346:2520/, ''),
			message: match[6].replace(/, palmInitFramework346:2520/, '')
		};
	}
	
	return l;
}

tailHandler.prototype.stop = function()
{
	if (this.logging) Mojo.Log.info('*** stop');
	if (this.request)
	{
		this.request.cancel();
	}
	
	this.request = LumberjackService.killCommand(this.stopped.bindAsEventListener(this));
}
tailHandler.prototype.stopped = function(payload)
{
	if (this.logging) Mojo.Log.info('*** stopped');
	this.status = false;
	var keys = this.scenes.keys();
	if (keys.length > 0)
	{
		for (var k = 0; k < keys.length; k++)
		{
			var scene = this.scenes.get(keys[k]);
			if (scene.assistant && scene.assistant.controller)
			{
				scene.assistant.stopped();
			}
		}
	}
}