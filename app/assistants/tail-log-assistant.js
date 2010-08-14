function TailLogAssistant()
{
	this.request =		false;
	this.autoScroll =	true;
	
	// setup menu
	this.menuModel =
	{
		visible: true,
		items:
		[
			{
				label: $L("Help"),
				command: 'do-help'
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
	alert('start');
	this.request = LumberjackService.tailMessages(this.handleMessages.bindAsEventListener(this));
	
	this.followToggleModel.value = true;
	this.controller.modelChanged(this.followToggleModel);
}
TailLogAssistant.prototype.handleMessages = function(payload)
{
	if (payload.returnValue)
	{
		if (payload.status)
		{
			this.messagesElement.innerHTML += payload.status+'<br>';
			this.revealBottom();
		}
	}
	else
	{
		this.stop();
	}
	
}

TailLogAssistant.prototype.stop = function()
{
	alert('stop');
	this.request = LumberjackService.killCommand(this.stopped.bindAsEventListener(this));
}
TailLogAssistant.prototype.stopped = function(payload)
{
	alert('stopped');
	
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
		}
	}
}

TailLogAssistant.prototype.activate = function(event)
{
	if (!this.alreadyActivated)
	{
		this.start();
	}
	
	this.alreadyActivated = true;
}

TailLogAssistant.prototype.deactivate = function(event) {}
TailLogAssistant.prototype.cleanup = function(event)
{
	this.stop();
}
