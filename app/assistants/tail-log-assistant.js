function TailLogAssistant()
{
	
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
		
	}
	catch (e)
	{
		Mojo.Log.logException(e, 'tail-log#setup');
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

TailLogAssistant.prototype.activate = function(event) {}
TailLogAssistant.prototype.deactivate = function(event) {}
TailLogAssistant.prototype.cleanup = function(event) {}
