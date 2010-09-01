function dbusHandler()
{
	this.scenes = $H();
	this.started = 0;
	this.status = false;
	
	this.request = false;
	
	// make truthy to enable heavy logging
	this.logging = true;
};

// (every)
dbusHandler.LogRegExpEvery =	new RegExp(/^([^\s]+)\t(PUB|PRV)\t(call|return)\t(\d+)\t([^\s]*)\t([^\s]+)\t([^\s]+)(.*)$/);


dbusHandler.prototype.newScene = function(assistant, log, popit)
{
	try
	{
		if (this.logging) Mojo.Log.info('(START) newScene: ', log);
		
		var stageName = 'dbus-'+log;
		var stageController = Mojo.Controller.appController.getStageController(stageName);
		
        if (stageController && stageController.activeScene().sceneName == 'dbus-log')
		{
			stageController.activate();
			return;
		}
		else if (stageController && stageController.activeScene().sceneName != 'dbus-log')
		{
			stageController.popScenesTo('dbus-log');
			stageController.activate();
			return;
		}
		
		if (!popit)
		{
			assistant.controller.stageController.pushScene('dbus-log', log, false);
		}
		else
		{
			Mojo.Controller.appController.createStageWithCallback({name: stageName, lightweight: true}, this.newSceneCallback.bind(this, log, true));
		}
		
		if (this.logging) Mojo.Log.info('( END ) newScene: ', log);
	}
	catch (e)
	{
		Mojo.Log.logException(e, "dbusHandler#newScene");
	}
}
dbusHandler.prototype.newSceneCallback = function(log, popped, controller)
{
	controller.pushScene('dbus-log', log, popped);
}

dbusHandler.prototype.registerScene = function(log, assistant)
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
dbusHandler.prototype.unregisterScene = function(log)
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
dbusHandler.prototype.getStartedScenes = function()
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

dbusHandler.prototype.startScene = function(log)
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
dbusHandler.prototype.stopScene = function(log)
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

dbusHandler.prototype.start = function()
{
	if (this.logging) Mojo.Log.info('*** start');
	this.request = LumberjackService.dbusCapture(this.handleMessages.bindAsEventListener(this));
}

dbusHandler.prototype.handleMessages = function(payload)
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
					if (keys[k] == 'every')
					{
						if (!everyMsg) everyMsg = dbusHandler.parseEvery(payload.status);
						if (scene.assistant)
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
						scene.assistant.errorMessage('<b>Service Error (dbusCapture):</b><br>'+payload.errorText);
				}
			}
		}
	}
}

dbusHandler.parseEvery = function(msg)
{
	var l = false;

	var match = dbusHandler.LogRegExpEvery.exec(msg);
	if (match) {
		
		//alert('============= MATCH');
		//for (var m = 0; m < match.length; m++) alert(m+': '+match[m]);
		
	    if (match[3] == 'call') {
		l =
		{
			seq:      match[4],
			leftid:   match[7],
			rightid:  match[6],
			rowClass: match[3],
			message:  formatForHtml(match[8]),
			raw:      msg,
			copy:     "%%%FIXME%%%"
		};
	    }
	    else if (match[3] == 'return') {
		l =
		{
			seq:      match[4],
			leftid:   match[6],
			rightid:  match[7],
			rowClass: match[3],
			message:  formatForHtml(match[8]),
			raw:      msg,
			copy:     "%%%FIXME%%%"
		};
	    }
	}
	
	return l;
}

dbusHandler.prototype.stop = function()
{
	if (this.logging) Mojo.Log.info('*** stop');
	if (this.request)
	{
		this.request.cancel();
	}
	
	this.request = LumberjackService.killDBusCapture(this.stopped.bindAsEventListener(this));
}
dbusHandler.prototype.stopped = function(payload)
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