function TailLogAssistant(toShow, popped)
{
	this.autoScroll =	true;
	
	this.toShow =		(toShow ? toShow : 'all');
	this.popped =		popped;
	
	this.unregister =	true;
	
	this.copyStart =	-1;
	
    this.isVisible = true;
    this.lastFocusMarker = false;
    this.lastFocusMessage = false;
	
	// setup menu
	this.menuModel =
	{
		visible: true,
		items:
		[
			{
				label: $L("Help"),
				command: 'do-help'
			}/*,
			{
				label: $L("Log Crap"),
				command: 'do-logcrap'
			}*/
		]
	}
	
}

TailLogAssistant.prototype.setup = function()
{
	try
	{
	    // set theme because this can be the first scene pushed
	    this.controller.document.body.className = prefs.get().theme;
		
		// setup menu
		this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
		
        this.documentElement =			this.controller.stageController.document;
		this.sceneScroller =			this.controller.sceneScroller;
		this.titleElement =				this.controller.get('tail-log-title');
		this.messagesElement =			this.controller.get('messages');
		this.followToggle = 			this.controller.get('followToggle');
		this.popButtonElement =			this.controller.get('popButton');
		this.scrollHandler =			this.onScrollStarted.bindAsEventListener(this);
        this.visibleWindowHandler =		this.visibleWindow.bindAsEventListener(this);
        this.invisibleWindowHandler =	this.invisibleWindow.bindAsEventListener(this);
		this.toggleChangeHandler =		this.toggleChanged.bindAsEventListener(this);
		this.popButtonPressed =			this.popButtonPressed.bindAsEventListener(this);
		this.messageTapHandler =		this.messageTap.bindAsEventListener(this);
		
		Mojo.Event.listen(this.sceneScroller, Mojo.Event.scrollStarting, this.scrollHandler);
        Mojo.Event.listen(this.documentElement, Mojo.Event.stageActivate, this.visibleWindowHandler);
        Mojo.Event.listen(this.documentElement, Mojo.Event.stageDeactivate, this.invisibleWindowHandler);
		
		if (this.toShow == 'all')
		{
			this.titleElement.update('All Applications');
		}
		else if (this.toShow == 'alert')
		{
			this.titleElement.update('Alert()s');
		}
		else
		{
			this.titleElement.update(appsList.get(this.toShow));
		}
		
		if (this.popped)
		{
			this.popButtonElement.style.display = 'none';
			this.titleElement.style.width = '200px';
		}
		else
		{
			this.controller.listen(this.popButtonElement, Mojo.Event.tap, this.popButtonPressed);
			this.followToggle.style.right = '16px';
		}
		
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
		this.controller.listen(this.messagesElement, Mojo.Event.listTap, this.messageTapHandler);
		
		// register scene!
		tail.registerScene(this.toShow, this);
		
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
TailLogAssistant.prototype.popButtonPressed = function(event)
{
	this.unregister = false;
	tail.newScene(this, this.toShow, true);
	this.controller.stageController.popScene();
}

TailLogAssistant.prototype.messageTap = function(event)
{
	if (event.item)
	{
		var popupList = [];
		if (this.copyStart > -1)
		{
			popupList.push({label: 'Copy This',			command: 'copy-this'});
			popupList.push({label: 'Copy To here...',	command: 'copy-to-here'});
		}
		else
		{
			popupList.push({label: 'Copy This',			command: 'copy-this'});
			popupList.push({label: 'Copy From here...',	command: 'copy-from-here'});
		}
		
		this.controller.popupSubmenu(
		{
			onChoose: this.messageTapListHandler.bindAsEventListener(this, event.item, event.index),
			popupClass: 'group-popup',
			placeNear: event.originalEvent.target,
			items: popupList
		});
	}
}
TailLogAssistant.prototype.messageTapListHandler = function(choice, item, index)
{
	switch(choice)
	{
		case 'copy-this':
			this.controller.stageController.setClipboard(item.type+': '+item.message);
			this.copyStart = -1;
			break;
			
		case 'copy-from-here':
			this.messageHighlight(index);
			this.copyStart = index;
			break;
			
		case 'copy-to-here':
			if (this.listModel.items.length > 0)
			{
				var message = '';
				for (var i = this.copyStart; i <= index; i++)
				{
					if (message != '') message += '\n';
					message += this.listModel.items[i].type+': '+this.listModel.items[i].message;
				}
				if (message != '')
				{
					this.controller.stageController.setClipboard(message);
				}
			}
			this.copyStart = -1;
			this.messageHighlight(-1);
			break;
	}
}
TailLogAssistant.prototype.messageHighlight = function(index)
{
	if (this.listModel.items.length > 0)
	{
		for (var i = 0; i < this.listModel.items.length; i++)
		{
			if (i == index)
				this.listModel.items[i].select = 'selected';
			else
				this.listModel.items[i].select = '';
		}
		this.messagesElement.mojo.noticeUpdatedItems(0, this.listModel.items);
		this.messagesElement.mojo.setLength(this.listModel.items.length);
	}
}

TailLogAssistant.prototype.start = function()
{
	tail.startScene(this.toShow);
	
	this.followToggleModel.value = true;
	this.controller.modelChanged(this.followToggleModel);
}
TailLogAssistant.prototype.addMessage = function(theMsg)
{
	if (theMsg)
	{
		var msg = Object.clone(theMsg);
		msg.select = '';
		if (this.toShow == 'all') msg.rowClass += ' showapp';
		this.listModel.items.push(msg);
		var start = this.messagesElement.mojo.getLength();
		this.messagesElement.mojo.noticeUpdatedItems(start, [msg]);
		this.messagesElement.mojo.setLength(start + 1);
		this.revealBottom();
		
		 if (!this.isVisible && this.lastFocusMessage && !this.lastFocusMessage.hasClassName('lostFocus'))
		 {
            if (this.lastFocusMarker && this.lastFocusMarker.hasClassName('lostFocus'))
			{
                this.lastFocusMarker.removeClassName('lostFocus');
                this.lastFocusMarker = false;
            }
            this.lastFocusMessage.addClassName('lostFocus');
        }
	}
}
TailLogAssistant.prototype.stop = function()
{
	tail.stopScene(this.toShow);
}
TailLogAssistant.prototype.stopped = function()
{
	if (this.controller)
	{
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

TailLogAssistant.prototype.visibleWindow = function(event)
{
    if (!this.isVisible)
	{
        this.isVisible = true;
    }
}
TailLogAssistant.prototype.invisibleWindow = function(event)
{
    this.isVisible = false;
    if (this.lastFocusMessage && this.lastFocusMessage.hasClassName('lostFocus'))
	{
        this.lastFocusMarker = this.lastFocusMessage;
    }
    this.lastFocusMessage = this.messagesElement.mojo.getNodeByIndex(this.messagesElement.mojo.getLength() - 1);
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
				//Mojo.Log.error('<b>TEST</b><br><br><u>HTMLFAIL</u>');
				//Mojo.Log.info(Object.toJSON(appsList.toObject()));
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
	// unregister scene!
	if (this.unregister)
		tail.unregisterScene(this.toShow);
}
