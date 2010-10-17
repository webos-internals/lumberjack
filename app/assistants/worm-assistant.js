function WormAssistant(filter, popped)
{
	this.autoScroll =	true;
	
	this.filter =		(filter.filter ? filter.filter : 'allapps');
	this.custom =		(filter.custom ? filter.custom : '');
	this.popped =		popped;
	
	this.unregister =	true;
	
	this.showBanners =	false;
	
	this.copyStart =	-1;
	
    this.isVisible =	true;
    this.lastFocusMarker =	false;
    this.lastFocusMessage =	false;
	
	// setup menu
	this.menuModel =
	{
		visible: true,
		items: []
	}
	
}

WormAssistant.prototype.setup = function()
{
	try
	{
	    // set theme because this can be the first scene pushed
	    this.controller.document.body.className = prefs.get().theme;
		
		// setup menu
        this.updateAppMenu(true);
		this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
		
        this.documentElement =			this.controller.stageController.document;
		this.sceneScroller =			this.controller.sceneScroller;
		this.titleElement =				this.controller.get('worm-title');
		this.onToggle = 				this.controller.get('onToggle');
		this.popButtonElement =			this.controller.get('popButton');
        this.visibleWindowHandler =		this.visibleWindow.bindAsEventListener(this);
        this.invisibleWindowHandler =	this.invisibleWindow.bindAsEventListener(this);
		this.toggleChangeHandler =		this.toggleChanged.bindAsEventListener(this);
		this.popButtonPressed =			this.popButtonPressed.bindAsEventListener(this);
		
        Mojo.Event.listen(this.documentElement, Mojo.Event.stageActivate, this.visibleWindowHandler);
        Mojo.Event.listen(this.documentElement, Mojo.Event.stageDeactivate, this.invisibleWindowHandler);
		
		switch(this.filter)
		{
			case 'custom':	this.titleElement.update('Custom'); break;
			default:		this.titleElement.update((appsList.get(this.filter) ? appsList.get(this.filter) : this.filter)); break;
		}
		
		if (this.popped)
		{
			this.popButtonElement.style.display = 'none';
			this.titleElement.style.width = '200px';
		}
		else
		{
			this.controller.listen(this.popButtonElement, Mojo.Event.tap, this.popButtonPressed);
			this.onToggle.style.right = '16px';
		}
		
		this.controller.setupWidget
		(
			'onToggle',
			{
	  			trueLabel:  'on',  // follow
	 			falseLabel: 'off', // stopped
			},
			this.onToggleModel = { value: false }
		);
		
		this.controller.listen('onToggle', Mojo.Event.propertyChange, this.toggleChangeHandler);
		
		
		
		// register scene!
		worm.registerScene(this.filter, this);
		
	}
	catch (e)
	{
		Mojo.Log.logException(e, 'worm#setup');
	}
}

WormAssistant.prototype.toggleChanged = function(event)
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
WormAssistant.prototype.popButtonPressed = function(event)
{
	this.unregister = false;
	worm.newScene(this, {filter: this.filter, custom: this.custom}, true);
	this.controller.stageController.popScene();
}

WormAssistant.prototype.start = function()
{
	worm.startScene(this.filter);
	
	this.onToggleModel.value = true;
	this.controller.modelChanged(this.onToggleModel);
}
WormAssistant.prototype.addStats = function(handles, nodes)
{
	alert(handles+'/'+nodes);
}
WormAssistant.prototype.stop = function()
{
	worm.stopScene(this.filter);
}
WormAssistant.prototype.stopped = function()
{
	if (this.controller)
	{
		this.onToggleModel.value = false;
		this.controller.modelChanged(this.onToggleModel);
	}
}

WormAssistant.prototype.visibleWindow = function(event)
{
    if (!this.isVisible)
	{
        this.isVisible = true;
    }
}
WormAssistant.prototype.invisibleWindow = function(event)
{
    this.isVisible = false;
}

WormAssistant.prototype.updateAppMenu = function(skipUpdate)
{
    this.menuModel.items = [];
	
	this.menuModel.items.push({
		label: $L("Clear"),
		command: 'do-clear'
	});
	
	this.menuModel.items.push({
		label: $L("Help"),
		command: 'do-help'
	});
    
    if (!skipUpdate)
	{
        this.controller.modelChanged(this.menuModel);
    }
}


WormAssistant.prototype.errorMessage = function(msg)
{
	this.controller.showAlertDialog(
	{
		allowHTMLMessage:	true,
		preventCancel:		true,
	    title:				'Lumberjack',
	    message:			msg,
	    choices:			[{label:$L("Ok"), value:'ok'}],
	    onChoose:			function(e){}
    });
}


WormAssistant.prototype.handleCommand = function(event)
{
	if (event.type == Mojo.Event.command)
	{
		switch (event.command)
		{
			case 'do-clear':
				// TODO
				break;
			
			case 'do-help':
				this.controller.stageController.pushScene('help');
				break;
		}
	}
}

WormAssistant.prototype.orientationChanged = function(orientation)
{
	
}
WormAssistant.prototype.activate = function(event)
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

WormAssistant.prototype.deactivate = function(event) {}
WormAssistant.prototype.cleanup = function(event)
{
	// unregister scene!
	if (this.unregister)
		worm.unregisterScene(this.filter);
}
