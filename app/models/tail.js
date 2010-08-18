function tailHandler()
{
	this.scenes = $H();
	this.started = 0;
	this.status = false;
	
	this.request = false;
	
	// make truthy to enable heavy logging
	this.logging = false;
};

// DATE									   2010-08-16T09:22:55.327301Z
tailHandler.LogDateRegExp =		new RegExp(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(.*)$/);

// (every)
tailHandler.LogRegExpEvery =	new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device ([^\.]*).([^\s]*) ([^:]*): (.*)$/);
// (alert)					2010-08-15T02:32:37.110778Z [178667] palm-webos-device user.warning LunaSysMgr: {LunaSysMgrJS}: start
tailHandler.LogRegExpAlert =	new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device user.warning LunaSysMgr: {LunaSysMgrJS}: (.*)$/);
// (mojo.log)				2010-08-15T01:47:25.448852Z [175956] palm-webos-device user.notice LunaSysMgr: {LunaSysMgrJS}: org.webosinternals.lumberjack: Info: start, palmInitFramework346:2520
tailHandler.LogRegExpMojo =		new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device user.([^\s]*) LunaSysMgr: {LunaSysMgrJS}: ([^:]*): ([^:]*): (.*)$/);


tailHandler.prototype.newScene = function(assistant, log, popit)
{
	try
	{
		if (this.logging) Mojo.Log.info('(START) newScene: ', log);
		
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
		
		if (this.logging) Mojo.Log.info('( END ) newScene: ', log);
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
tailHandler.prototype.unregisterScene = function(log)
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
tailHandler.prototype.getStartedScenes = function()
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

tailHandler.prototype.startScene = function(log)
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
tailHandler.prototype.stopScene = function(log)
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
						if (!everyMsg) everyMsg = tailHandler.parseEvery(payload.status);
						if (scene.assistant)
							scene.assistant.addMessage(everyMsg);
					}
					if (keys[k] == 'alert')
					{
						if (!alertMsg) alertMsg = tailHandler.parseAlert(payload.status);
						if (scene.assistant)
							scene.assistant.addMessage(alertMsg);
					}
					else
					{
						if (!mojoMsg) mojoMsg =  tailHandler.parseMojo(payload.status);
						if ((keys[k] == 'allapps') ||
							(mojoMsg.id && keys[k].toLowerCase() == mojoMsg.id.toLowerCase()))
							if (scene.assistant)
								scene.assistant.addMessage(mojoMsg);
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
						scene.assistant.errorMessage('<b>Service Error (tailMessages):</b><br>'+payload.errorText);
				}
			}
		}
	}
}

tailHandler.parseEvery = function(msg)
{
	var l = false;

	var match = tailHandler.LogRegExpEvery.exec(msg);
	if (match)
	{
		var d = tailHandler.parseDate(match[1]);
		l =
		{
			app: match[5],
			id: match[5],
			date: (d ? d.month + '/' + d.day + ' ' + d.hour + ':' + d.min + ':' + d.sec : '?'),
			type: match[3].capitalize() + '.' + match[4].capitalize(),
			rowClass: match[4],
			message: formatForHtml(match[6].replace(/^{(.*)}: /, '')),
			raw: msg,
			copy: (d ? '[' + d.year + '-' + d.month + '-' + d.day + ' ' + d.hour + ':' + d.min + ':' + d.sec + '] ' : '') +
				'(' + match[5] + ') ' + match[3] + '.' + match[4] + ': ' + match[6].replace(/^{(.*)}: /, '')
		};
	}
	
	return l;
}
tailHandler.parseAlert = function(msg)
{
	var l = false;

	var match = tailHandler.LogRegExpAlert.exec(msg);
	if (match)
	{
		if (!match[3].include('palmInitFramework'))
		{
			var d = tailHandler.parseDate(match[1]);
			l =
			{
				app: false,
				id: false,
				date: (d ? d.month + '/' + d.day + ' ' + d.hour + ':' + d.min + ':' + d.sec : '?'),
				type: 'Alert',
				rowClass: 'notice',
				message: formatForHtml(match[3]),
				raw: msg,
				copy:	(d ? '[' + d.year + '-' + d.month + '-' + d.day + ' ' + d.hour + ':' + d.min + ':' + d.sec + '] ' : '') +
					'Alert: ' + match[3]
			};
		}
	}
	
	return l;
}
tailHandler.parseMojo = function(msg)
{
	var l = false;
	
	var match = tailHandler.LogRegExpMojo.exec(msg);
	if (match)
	{
		var d = tailHandler.parseDate(match[1]);
		l =
		{
			app: (appsList.get(match[4])?appsList.get(match[4]):match[4]),
			id: match[4],
			date: (d ? d.month + '/' + d.day + ' ' + d.hour + ':' + d.min + ':' + d.sec : '?'),
			type: match[5],
			rowClass: match[3],
			message: formatForHtml(match[6]).replace(/, palmInitFramework(.*)/, ''),
			raw: msg,
			copy: (d ? '[' + d.year + '-' + d.month + '-' + d.day + ' ' + d.hour + ':' + d.min + ':' + d.sec + '] ' : '') +
				'(' + (appsList.get(match[4])?appsList.get(match[4]):match[4]) + ') ' + match[5] + ': ' + match[6].replace(/, palmInitFramework(.*)/, '')
		};
	}
	
	return l;
}
tailHandler.parseDate = function(string)
{
	var da = tailHandler.LogDateRegExp(string);
	if (da)
	{
		var dobj =
		{
			year:  da[1],
			month: da[2],
			day:   da[3],
			hour:  da[4],
			min:   da[5],
			sec:   da[6]
		};
		return dobj;
	}
	return false;
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