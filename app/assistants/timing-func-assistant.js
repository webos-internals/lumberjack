function TimingFuncAssistant(title, list)
{
	this.title = title;
	this.list = list;
	
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

TimingFuncAssistant.prototype.setup = function()
{
	try
	{
	    // set theme because this can be the first scene pushed
    	this.controller.document.body.className = prefs.get().theme + ' ' + prefs.get().fontSize;
		
		// setup menus
		this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
		
		this.sceneScroller =			this.controller.sceneScroller;
		this.headerElement =			this.controller.get('logHeader');
		this.titleElement =				this.controller.get('timing-title');
		this.timingElement =			this.controller.get('timing');
		
		this.titleElement.update(this.title);
		
		if (this.list.length > 0)
		{
			for (var l = 0; l < this.list.length; l++)
			{
				this.list[l].rowClass = 'notice';
			}
		}
		
		this.controller.setupWidget
		(
			'timing',
			{
				itemTemplate: "timing-func/timing-func-row",
				swipeToDelete: false,
				reorderable: false,
				renderLimit: 50,
			},
			this.listModel =
			{
				items: this.list
			}
		);
		
		
	}
	catch (e)
	{
		Mojo.Log.logException(e, 'timing-func#setup');
	}
}

TimingFuncAssistant.prototype.handleCommand = function(event)
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

TimingFuncAssistant.prototype.orientationChanged = function(orientation) {}
TimingFuncAssistant.prototype.activate = function(event)
{
	if (!this.alreadyActivated)
	{
		
	}
	
	if (this.controller.stageController.setWindowOrientation)
	{
    	this.controller.stageController.setWindowOrientation("free");
	}
	
	this.alreadyActivated = true;
}

TimingFuncAssistant.prototype.deactivate = function(event) {}
TimingFuncAssistant.prototype.cleanup = function(event) {}
