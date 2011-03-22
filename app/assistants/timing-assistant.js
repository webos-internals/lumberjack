function TimingAssistant(filter)
{
	this.filter =			(filter.filter ? filter.filter : 'allapps');
	this.custom =			(filter.custom ? filter.custom : '');
	
	this.request =			false;
	this.contents =			'';
	
	// setup menu
	this.menuModel =
	{
		visible: true,
		items:
		[
			{
				label: $L("Clear Log File"),
				command: 'do-log-clear'
			},
			{
				label: $L("Help"),
				command: 'do-help'
			}
		]
	}
	
}

//												 scene 'server-list': layouts: 0: total: 1881ms (1), render: 108ms (12), setup: 984ms (1), widgetInitialize: 462ms (3), widgetAssistantConstructor: 4ms (6), [etc...]
TimingAssistant.TimingRegExp =		new RegExp(/^scene '([^']*)': layouts: ([^:]*): total: ([^m]*)ms \(([\d]]*)\), (.*)$/);
TimingAssistant.TimingExtraRegExp = new RegExp(/^([^:]*): ([^m]*)ms \(([\d]]*)\)$/);

TimingAssistant.prototype.setup = function()
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
		this.reloadButtonElement =		this.controller.get('reloadButton');
		this.spinnerElement =			this.controller.get('spinner');
		this.reloadButtonPressed =		this.reloadButtonPressed.bindAsEventListener(this);
		this.timingTapHandler =			this.timingTap.bindAsEventListener(this);
		
		this.controller.setupWidget('spinner', {spinnerSize: 'large'}, {spinning: false});
		
		switch(this.filter)
		{
			case 'allapps':	this.titleElement.update('All Applications'); break;
			case 'every':	this.titleElement.update('Everything'); break;
			default:		this.titleElement.update((appsList.get(this.filter) ? appsList.get(this.filter) : this.filter)); break;
		}
		
		this.controller.listen(this.reloadButtonElement, Mojo.Event.tap, this.reloadButtonPressed);
		
		this.controller.setupWidget
		(
			'timing',
			{
				itemTemplate: "timing/timing-row",
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
		
		this.controller.listen(this.timingElement, Mojo.Event.listTap, this.timingTapHandler);
		
		
	}
	catch (e)
	{
		Mojo.Log.logException(e, 'timing#setup');
	}
}

TimingAssistant.prototype.reloadButtonPressed = function(event)
{
	this.get();
}

TimingAssistant.prototype.timingTap = function(event)
{
	if (event.item)
	{
		this.controller.stageController.pushScene('timing-func', event.item.scene, event.item.functions);
	}
}

TimingAssistant.prototype.get = function()
{
	this.request = LumberjackService.getMessages(this.got.bindAsEventListener(this));
}
TimingAssistant.prototype.got = function(payload)
{
	if (payload.returnValue)
	{
		switch (payload.stage)
		{
			case 'start':
				this.spinnerElement.mojo.start();
				this.contents = '';
				this.listModel.items = [];
				this.timingElement.mojo.noticeUpdatedItems(0, this.listModel.items);
				this.timingElement.mojo.setLength(this.listModel.items.length);
				this.revealBottom();
				break;
				
			case 'middle':
				if (payload.contents) 
				{
					this.contents += payload.contents;
					var position = this.contents.lastIndexOf("\n");
					if (position)
					{
						this.parseMessages(this.contents.substr(0, position));
						this.contents = this.contents.substr(position);
					}
				}
				break;
				
			case 'end':
				if (this.contents != '') 
				{
					this.parseMessages(this.contents);
				}
				this.spinnerElement.mojo.stop();
				this.timingElement.mojo.noticeUpdatedItems(0, this.listModel.items);
				this.timingElement.mojo.setLength(this.listModel.items.length);
				this.revealBottom();
				break;
		}
	}
	else
	{
		this.spinnerElement.mojo.stop();
		this.contents = '';
		this.listModel.items = [];
		this.timingElement.mojo.noticeUpdatedItems(0, this.listModel.items);
		this.timingElement.mojo.setLength(this.listModel.items.length);
		this.revealBottom();
		
		this.errorMessage('<b>Service Error (getTiming):</b><br>'+payload.errorText);
	}
}
TimingAssistant.prototype.parseMessages = function(data)
{
	if (data)
	{
		var ary = data.split("\n");
		if (ary.length > 0)
		{
			for (var a = 0; a < ary.length; a++)
			{
				var msg =  tailHandler.parseMojo(ary[a]);
				if ((this.filter == 'allapps' || this.filter == 'every') ||
					(msg.id && this.filter.toLowerCase() == msg.id.toLowerCase()))
				{
					this.considerMessage(msg);
				}
			}
		}
	}
}
TimingAssistant.prototype.considerMessage = function(msg)
{
	if (msg)
	{
		var match = TimingAssistant.TimingRegExp.exec(msg.message);
		if (match)
		{
			
			//for (var m in msg) Mojo.Log.error(m+':', msg[m]);
		
			msg.scene		= match[1];
			msg.layout		= match[2];	// not really sure what layout indicates...
			msg.totalTime	= match[3];
			msg.totalTimeF	= this.formatMs(match[3], true);
			msg.count		= match[4];	// or this number either
			msg.functions	= [];
			
			var extra = match[5].split(', ');
			if (extra)
			{
				for (var e = 0; e < extra.length; e++)
				{
					var extramatch = TimingAssistant.TimingExtraRegExp.exec(extra[e]);
					if (extramatch)
					{
						msg.functions.push({
							name:	extramatch[1],
							time:	extramatch[2],
							timeF:	this.formatMs(extramatch[2], true),
							count:	extramatch[3] // i only think that one above is count because this seems to be the number of times this function ran
						});
					}
				}
			}
			this.addTiming(msg);
		}
	}
}
TimingAssistant.prototype.addTiming = function(obj)
{
	if (obj)
	{
		if (this.filter == 'allapps' || this.filter == 'every') obj.rowClass += ' showapp';
		this.listModel.items.push(obj);
	}
}

TimingAssistant.prototype.revealBottom = function()
{
	// palm does this twice in the messaging app to make sure it always reveals the very very bottom
	this.sceneScroller.mojo.revealBottom();
	this.sceneScroller.mojo.revealBottom();
}

TimingAssistant.prototype.formatMs = function(ms, fancy)
{
	if (!fancy)
	{
		if (parseInt(ms) > 1000) return (Math.round((ms / 1000) * 100) / 100) + 's';
		return ms + 'ms';
	}
	else
	{
		if (parseInt(ms) > 1000) return (Math.round((ms / 1000) * 100) / 100) + '<span class="unit">s</span>';
		return ms + '<span class="unit">ms</span>';
	}
}

TimingAssistant.prototype.errorMessage = function(msg)
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

TimingAssistant.prototype.handleCommand = function(event)
{
	if (event.type == Mojo.Event.command)
	{
		switch (event.command)
		{
			case 'do-log-clear':
				this.request = LumberjackService.clearMessages(function(p){});
				this.contents = '';
				this.listModel.items = [];
				this.timingElement.mojo.noticeUpdatedItems(0, this.listModel.items);
				this.timingElement.mojo.setLength(this.listModel.items.length);
				this.revealBottom();
				break;
			
			case 'do-help':
				this.controller.stageController.pushScene('help');
				break;
		}
	}
}

TimingAssistant.prototype.orientationChanged = function(orientation) {}
TimingAssistant.prototype.activate = function(event)
{
	if (!this.alreadyActivated)
	{
		this.get();
	}
	
	if (this.controller.stageController.setWindowOrientation)
	{
    	this.controller.stageController.setWindowOrientation("free");
	}
	
	this.alreadyActivated = true;
}

TimingAssistant.prototype.deactivate = function(event) {}
TimingAssistant.prototype.cleanup = function(event) {}
