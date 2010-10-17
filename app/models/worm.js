function wormHandler()
{
	this.scenes = $H();
	this.started = 0;
	this.status = false;
	
	this.request = false;
	
	// make truthy to enable heavy logging
	this.logging = false;
};

wormHandler.appIdRegExp = new RegExp(/^([^\s]*) ([\d]*)$/);

wormHandler.prototype.newScene = function(assistant, log, popit)
{
	try
	{
		if (this.logging) Mojo.Log.info('(START) newScene: ', log);
		
		var stageName = 'worm-'+log.filter;
		if (log.filter == 'custom') stageName += Math.random();
		var stageController = Mojo.Controller.appController.getStageController(stageName);
		
        if (stageController && stageController.activeScene().sceneName == 'worm')
		{
			stageController.activate();
			return;
		}
		else if (stageController && stageController.activeScene().sceneName != 'worm')
		{
			stageController.popScenesTo('worm');
			stageController.activate();
			return;
		}
		
		if (!popit)
		{
			assistant.controller.stageController.pushScene('worm', log, false);
		}
		else
		{
			Mojo.Controller.appController.createStageWithCallback({name: stageName, lightweight: true}, this.newSceneCallback.bind(this, log, true));
		}
		
		if (this.logging) Mojo.Log.info('( END ) newScene: ', log);
	}
	catch (e)
	{
		Mojo.Log.logException(e, "wormHandler#newScene");
	}
}
wormHandler.prototype.newSceneCallback = function(log, popped, controller)
{
	controller.pushScene('worm', log, popped);
}

wormHandler.prototype.registerScene = function(log, assistant)
{
	if (this.logging) Mojo.Log.info('(START) registerScene: ', log);
	
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
	
	if (this.logging) Mojo.Log.info('( END ) registerScene: ', log);
};
wormHandler.prototype.unregisterScene = function(log)
{
	if (this.logging) Mojo.Log.info('(START) unregisterScene: ', log);
	
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
	
	if (this.logging) Mojo.Log.info('( END ) unregisterScene: ', log);
};
wormHandler.prototype.getStartedScenes = function()
{
	if (this.logging) Mojo.Log.info('(START) startedScenes');
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
		if (this.logging) Mojo.Log.info('( END ) startedScenes: ', started);
		return started;
	}
	if (this.logging) Mojo.Log.info('( END ) startedScenes: ', 0);
	return 0;
}

wormHandler.prototype.startScene = function(log)
{
	if (this.logging) Mojo.Log.info('(START) startScene: ', log);
	
	var scene = this.scenes.get(log);
	scene.status = true;
	this.scenes.update(log, scene);
	
	this.started = this.getStartedScenes();
	if (this.started > 0 && !this.status)
	{
		this.start();
	}
	
	if (this.logging) Mojo.Log.info('( END ) startScene: ', log);
}
wormHandler.prototype.stopScene = function(log)
{
	if (this.logging) Mojo.Log.info('(START) stopScene: ', log);
	
	var scene = this.scenes.get(log);
	scene.status = false;
	this.scenes.update(log, scene);
	
	this.started = this.getStartedScenes();
	if (this.started < 1 && this.status)
	{
		this.stop();
	}
	
	if (this.logging) Mojo.Log.info('( END ) stopScene: ', log);
}

wormHandler.prototype.start = function()
{
	if (this.logging) Mojo.Log.info('*** start');
	this.request = LumberjackService.getStats(this.handleStats.bindAsEventListener(this));
}
wormHandler.prototype.handleStats = function(payload)
{
	if (payload.documents)
	{
		this.status = true;
		var apps = {};
		var keys = this.scenes.keys();
		if (keys.length > 0)
		{
			for (var d = 0; d < payload.documents.length; d++)
			{
				var match = wormHandler.appIdRegExp.exec(payload.documents[d].appId);
				if (match)
				{
					//alert(match[1]+': '+payload.documents[d].openServiceHandles+' - '+payload.documents[d].nodes);
					if (apps[match[1]])
					{
						apps[match[1]].handles += parseInt(payload.documents[d].openServiceHandles)
						apps[match[1]].nodes += parseInt(payload.documents[d].nodes);
					}
					else
					{
						apps[match[1]] = {handles: parseInt(payload.documents[d].openServiceHandles), nodes: parseInt(payload.documents[d].nodes)};
					}
				}
			}
			
			for (var k = 0; k < keys.length; k++)
			{
				var scene = this.scenes.get(keys[k]);
				var sent = false;
				if (scene.status)
				{
					if (keys[k] == 'custom')
					{
						alert(keys[k]+': '+scene.assistant.custom);
						if (scene.assistant)
						{
							if (scene.assistant.custom && apps[scene.assistant.custom])
							{
								scene.assistant.addStats(apps[scene.assistant.custom].handles, apps[scene.assistant.custom].nodes);
								sent = true;
							}
						}
					}
					else
					{
						if (apps[keys[k]])
						{
							if (scene.assistant)
							{
								scene.assistant.addStats(apps[keys[k]].handles, apps[keys[k]].nodes);
								sent = true;
							}
						}
					}
					if (!sent)
					{
						if (scene.assistant)
						{
							scene.assistant.addStats(0, 0);
						}
					}
				}
			}
		}
	}
	else
	{
		this.stop();
		
		var keys = this.scenes.keys();
		if (keys.length > 0)
		{
			for (var k = 0; k < keys.length; k++)
			{
				var scene = this.scenes.get(keys[k]);
				if (scene.status)
				{
					if (scene.assistant)
						scene.assistant.errorMessage('<b>Service Error (worm):</b><br>'+payload.errorText);
				}
			}
		}
	}
}

wormHandler.prototype.stop = function()
{
	if (this.logging) Mojo.Log.info('*** stop');
	if (this.request)
	{
		this.request.cancel();
	}
}
wormHandler.prototype.stopped = function(payload)
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