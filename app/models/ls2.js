function ls2Handler()
{
	this.scenes = $H();
	this.started = 0;
	this.status = false;
	
	this.request = false;
	
	// make truthy to enable heavy logging
	this.logging = false;
};

// (every)
ls2Handler.LogRegExpEvery =	new RegExp(/^([^\s]+)\t\[(PUB|PRV)\]\t(call|return)\t(\d+)\t+([^\s]+) \([^\)]+\)\t+([^\s]+) \([^\)]+\)(.*)$/);


ls2Handler.prototype.newScene = function(assistant, log, popit)
{
	try
	{
		if (this.logging) Mojo.Log.info('(START) newScene: ', log);
		
		var stageName = 'ls2-'+log.filter;
		if (log.filter == 'custom') stageName += Math.random();
		var stageController = Mojo.Controller.appController.getStageController(stageName);
		
        if (stageController && stageController.activeScene().sceneName == 'ls2-log')
		{
			stageController.activate();
			return;
		}
		else if (stageController && stageController.activeScene().sceneName != 'ls2-log')
		{
			stageController.popScenesTo('ls2-log');
			stageController.activate();
			return;
		}
		
		if (!popit)
		{
			assistant.controller.stageController.pushScene('ls2-log', log, false);
		}
		else
		{
			Mojo.Controller.appController.createStageWithCallback({name: stageName, lightweight: true}, this.newSceneCallback.bind(this, log, true));
		}
		
		if (this.logging) Mojo.Log.info('( END ) newScene: ', log);
	}
	catch (e)
	{
		Mojo.Log.logException(e, "ls2Handler#newScene");
	}
}
ls2Handler.prototype.newSceneCallback = function(log, popped, controller)
{
	controller.pushScene('ls2-log', log, popped);
}

ls2Handler.prototype.registerScene = function(log, assistant)
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
ls2Handler.prototype.unregisterScene = function(log)
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
ls2Handler.prototype.getStartedScenes = function()
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

ls2Handler.prototype.startScene = function(log)
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
ls2Handler.prototype.stopScene = function(log)
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

ls2Handler.prototype.start = function()
{
	if (this.logging) Mojo.Log.info('*** start');
	this.request = LumberjackService.ls2Monitor(this.handleMessages.bindAsEventListener(this));
}

ls2Handler.prototype.handleMessages = function(payload)
{
	if (payload.returnValue)
	{
		this.status = true;
		var mojoMsg = false;
		var alertMsg = false;
		var everyMsg = false;
		var keys = this.scenes.keys();
		if (keys.length > 0)
		{
			for (var k = 0; k < keys.length; k++)
			{
				var scene = this.scenes.get(keys[k]);
				if (scene.status)
				{
					if (keys[k] == 'every' || keys[k] == 'allapps' || keys[k] == 'custom')
					{
						if (!everyMsg) everyMsg = ls2Handler.parseEvery(payload.status);
						if (scene.assistant)
							scene.assistant.addMessage(everyMsg);
					}
					else
					{
						if (!everyMsg) everyMsg = ls2Handler.parseEvery(payload.status);
						var push = false;
						if (everyMsg)
						{
							if (everyMsg.leftid.include(keys[k]))  push = true;
							if (everyMsg.rightid.include(keys[k])) push = true;
						}
						if (scene.assistant && push)
							scene.assistant.addMessage(everyMsg);
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
						scene.assistant.errorMessage('<b>Service Error (ls2Monitor):</b><br>'+payload.errorText);
				}
			}
		}
	}
}

ls2Handler.parseEvery = function(msg)
{
	var l = false;
	
	var match = ls2Handler.LogRegExpEvery.exec(msg);
	if (match)
	{
	    if (match[3] == 'call')
		{
			l =
			{
				seq:      match[4],
				leftid:   match[5],
				rightid:  match[6],
				rowClass: match[3],
				message:  formatForHtml(match[7]),
				raw:      msg,
				copy:     '[' + match[4] + '] ' + match[5] + ' -> ' + match[6] + ': ' + match[7]
			};
	    }
	    else if (match[3] == 'return')
		{
			l =
			{
				seq:      match[4],
				leftid:   match[6],
				rightid:  match[5],
				rowClass: match[3],
				message:  formatForHtml(match[7]),
				raw:      msg,
				copy:     '[' + match[4] + '] ' + match[5] + ' -> ' + match[6] + ': ' + match[7]
			};
	    }
	}
	else
	{
	    //alert('============= NO MATCH');
	    //alert(msg);
	}
	
	return l;
}

ls2Handler.prototype.stop = function()
{
	if (this.logging) Mojo.Log.info('*** stop');
	if (this.request)
	{
		this.request.cancel();
	}
	
	this.request = LumberjackService.killLs2Monitor(this.stopped.bindAsEventListener(this));
}
ls2Handler.prototype.stopped = function(payload)
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