function TailLogAssistant(toShow)
{
	this.request =		false;
	this.autoScroll =	true;
	
	this.toShow =		(toShow ? toShow : 'all');
	
	// setup menu
	this.menuModel =
	{
		visible: true,
		items:
		[
			{
				label: $L("Help"),
				command: 'do-help'
			},
			{
				label: $L("Log Crap"),
				command: 'do-logcrap'
			}
		]
	}

}

TailLogAssistant.prototype.setup = function()
{
	try
	{
		// setup menu
		this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
		
		
		this.sceneScroller =			this.controller.sceneScroller;
		this.messagesElement =			this.controller.get('messages');
		this.followToggle = 			this.controller.get('followToggle');
		this.scrollHandler =			this.onScrollStarted.bindAsEventListener(this);
		this.toggleChangeHandler =		this.toggleChanged.bindAsEventListener(this);
		
		Mojo.Event.listen(this.sceneScroller, Mojo.Event.scrollStarting, this.scrollHandler);
		
		
		this.controller.setupWidget
		(
			'followToggle',
			{
	  			trueLabel:  'on',  // follow
	 			falseLabel: 'off', // stopped
			},
			this.followToggleModel = { value: false }
		);
		
		this.controller.listen('followToggle', Mojo.Event.propertyChange, this.toggleChangeHandler);
		
		
		this.controller.setupWidget
		(
			'messages',
			{
				itemTemplate: "log/message-row",
				swipeToDelete: false,
				reorderable: false,
				renderLimit: 50,
			},
			this.listModel =
			{
				items: []
			}
		);
		this.revealBottom();
		//Mojo.Event.listen(this.messagesElement, Mojo.Event.listTap, this.messageTapHandler);
		
	}
	catch (e)
	{
		Mojo.Log.logException(e, 'tail-log#setup');
	}
}

TailLogAssistant.prototype.toggleChanged = function(event)
{
	if (event.value)
	{
		this.start();
	}
	else
	{
		this.stop();
	}
}

TailLogAssistant.prototype.start = function()
{
	Mojo.Log.info('start');
	this.request = LumberjackService.tailMessages(this.handleMessages.bindAsEventListener(this));
	
	this.followToggleModel.value = true;
	this.controller.modelChanged(this.followToggleModel);
}
TailLogAssistant.prototype.handleMessages = function(payload)
{
	if (payload.returnValue)
	{
		var newMessages = [];
		if (payload.status)
		{
			var msg = this.parseMessage(payload.status);
			if (msg)
			{
				this.listModel.items.push(msg);
				var start = this.messagesElement.mojo.getLength();
				this.messagesElement.mojo.noticeUpdatedItems(start, [msg]);
				this.messagesElement.mojo.setLength(start + 1);
				this.revealBottom();
			}
		}
	}
	else
	{
		this.stop();
	}
}

TailLogAssistant.prototype.parseMessage = function(msg)
{
	var s = false;
	
	// (alert)		2010-08-15T02:32:37.110778Z [178667] palm-webos-device user.warning LunaSysMgr: {LunaSysMgrJS}: start
	// (mojo.log)	2010-08-15T01:47:25.448852Z [175956] palm-webos-device user.notice LunaSysMgr: {LunaSysMgrJS}: org.webosinternals.lumberjack: Info: start, palmInitFramework346:2520
	
	var LogRegExpAlert =	new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device user.warning LunaSysMgr: {LunaSysMgrJS}: (.*)$/);
	var LogRegExpMojo =		new RegExp(/^([^\s]*) \[(.*)\] palm-webos-device user.([^\s]*) LunaSysMgr: {LunaSysMgrJS}: ([^:]*): ([^:]*): (.*), palmInitFramework(.*)$/);
	
	if (this.toShow == 'alert')
	{
		var match = LogRegExpAlert.exec(msg);
		if (match)
		{
			if (!match[3].include('palmInitFramework'))
			{
				s =
				{
					rowClass: 'generic',
					message: match[3]
				};
			}
		}
	}
	else
	{
		var match = LogRegExpMojo.exec(msg);
		if (match)
		{
			if (this.toShow == 'all')
			{
				s =
				{
					id: match[4],
					type: match[5],
					rowClass: match[5] + ' showid',
					message: match[6]
				};
			}
			else if (match[4].toLowerCase() == this.toShow.toLowerCase()) 
			{
				s =
				{
					type: match[5],
					rowClass: match[5],
					message: match[6]
				};
			}
		}
	}
	
	return s;
}

TailLogAssistant.prototype.stop = function()
{
	Mojo.Log.info('stop');
	this.request = LumberjackService.killCommand(this.stopped.bindAsEventListener(this));
}
TailLogAssistant.prototype.stopped = function(payload)
{
	Mojo.Log.info('stopped');
	
	if (this.controller)
	{	// the scene may no longer exist...
		this.followToggleModel.value = false;
		this.controller.modelChanged(this.followToggleModel);
	}
}

TailLogAssistant.prototype.onScrollStarted = function(event)
{
	event.addListener(this);
}
TailLogAssistant.prototype.moved = function(stopped, position)
{
	if (this.sceneScroller.scrollHeight - this.sceneScroller.scrollTop > this.sceneScroller.clientHeight) 
	{
		this.autoScroll = false;
	}
	else
	{
		this.autoScroll = true;
	}
}
TailLogAssistant.prototype.revealBottom = function()
{
	if (this.autoScroll) 
	{
		//var height = this.inputContainerElement.clientHeight;
		//this.messageListElement.style.paddingBottom = height + 'px';
		
		// palm does this twice in the messaging app to make sure it always reveals the very very bottom
		this.sceneScroller.mojo.revealBottom();
		this.sceneScroller.mojo.revealBottom();
	}
}


TailLogAssistant.prototype.handleCommand = function(event)
{
	if (event.type == Mojo.Event.command)
	{
		switch (event.command)
		{
			case 'do-help':
				this.controller.stageController.pushScene('help');
				break;
				
			case 'do-logcrap':
				alert('Test Alert Message');
				Mojo.Log.info('Test Info Message');
				Mojo.Log.warn('Test Warn Message');
				Mojo.Log.error('Test Error Message');
				break;
		}
	}
}

TailLogAssistant.prototype.orientationChanged = function(orientation)
{
	this.revealBottom();
}
TailLogAssistant.prototype.activate = function(event)
{
	if (!this.alreadyActivated)
	{
		this.start();
	}
	
	if (this.controller.stageController.setWindowOrientation)
	{
    	this.controller.stageController.setWindowOrientation("free");
	}
	
	this.alreadyActivated = true;
}

TailLogAssistant.prototype.deactivate = function(event) {}
TailLogAssistant.prototype.cleanup = function(event)
{
	this.stop();
}
