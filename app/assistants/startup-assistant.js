function StartupAssistant(changelog)
{
	this.justChangelog = changelog;
	
    // on first start, this message is displayed, along with the current version message from below
    this.firstMessage = $L('Here are some tips for first-timers:<ul><li>Lumberjack has no tips yet</li></ul>');
	
    this.secondMessage = $L('We hope you enjoy chopping down trees, skipping and jumping, and wearing high heels, and watching your logs.<br>Please consider making a <a href=http://www.webos-internals.org/wiki/WebOS_Internals:Site_support>donation</a> if you wish to show your appreciation.');
	
    // on new version start
    this.newMessages =
	[
		{ version: '0.4.5', log: [ 'Added BetterListSelector widget to main scene \'What to look for\' selector',
								   'Added ability to quickly change the current log level from the app menu in the Follow Log scene' ] },
		{ version: '0.4.4', log: [ 'Added swipe-delete to the Retrieve Log scene' ] },
		{ version: '0.4.3', log: [ 'Fixed webOS version check funkyness',
								   'Added ability to swipe-delete lines from the Follow Log scene just for Lisa, but everyone else can use it too' ] },
		{ version: '0.4.2', log: [ 'Fixed listApps bug',
								   'Fixed get/follow log on the Pre2',
								   'Fixed Ls2 Monitor for webOS 2.0' ] },
		{ version: '0.4.1', log: [ 'Better graphs for resource monitor',
								   'Added Clear Log File to main scene and get log scene for clearing the /var/log/messages file',
								   'Fixed bug where resource monitor would fail to start a second time' ] },
		{ version: '0.4.0', log: [ 'Added Ls2 Monitor for webOS 2.0 (and hide Dbus Capture in 2.0 as it is no longer used)', 
								   'Added Resource Monitor',
								   'Added font size preference',
								   'Added a way to get back to this changelog from the help scene' ] },
		{ version: '0.3.1', log: [ 'Exclude logging messages from dbus capture' ] },
		{ version: '0.3.0', log: [ 'Added DBus Capture for debugging services'
								 , 'Type-to-Search in get-log scene'
								 , 'More log level preferences' ] },
		{ version: '0.1.1', log: [ 'Service Stability Updates' ] },
		{ version: '0.1.0', log: [ 'Initial Release!' ] }
	];
	
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
	};
	
    // setup command menu
    this.cmdMenuModel =
	{
	    visible: false, 
	    items:
		[
			{},
			{
				label: $L("Ok, I've read this. Let's continue ..."),
				command: 'do-continue'
			},
			{}
		]
	};
};

StartupAssistant.prototype.setup = function()
{
    // set theme because this can be the first scene pushed
    this.controller.document.body.className = prefs.get().theme + ' ' + prefs.get().fontSize;
	
    // get elements
    this.titleContainer = this.controller.get('title');
    this.dataContainer =  this.controller.get('data');
	
    // set title
	if (this.justChangelog)
	{
		this.titleContainer.innerHTML = $L('Changelog');
	}
	else
	{
	    if (vers.isFirst)
		{
			this.titleContainer.innerHTML = $L('Welcome To Lumberjack');
	    }
	    else if (vers.isNew)
		{
			this.titleContainer.innerHTML = $L('Lumberjack Changelog');
	    }
	}
	
	
    // build data
    var html = '';
	if (this.justChangelog)
	{
		for (var m = 0; m < this.newMessages.length; m++) 
		{
		    html += Mojo.View.render({object: {title: 'v' + this.newMessages[m].version}, template: 'startup/changeLog'});
		    html += '<ul>';
		    for (var l = 0; l < this.newMessages[m].log.length; l++)
			{
				html += '<li>' + this.newMessages[m].log[l] + '</li>';
		    }
		    html += '</ul>';
		}
	}
	else
	{
		if (vers.isFirst)
		{
			html += '<div class="text">' + this.firstMessage + '</div>';
		}
	    if (vers.isNew)
		{
			if (!this.justChangelog)
			{
				html += '<div class="text">' + this.secondMessage + '</div>';
			}
			for (var m = 0; m < this.newMessages.length; m++) 
			{
			    html += Mojo.View.render({object: {title: 'v' + this.newMessages[m].version}, template: 'startup/changeLog'});
			    html += '<ul>';
			    for (var l = 0; l < this.newMessages[m].log.length; l++)
				{
					html += '<li>' + this.newMessages[m].log[l] + '</li>';
			    }
			    html += '</ul>';
			}
	    }
	}
    
    // set data
    this.dataContainer.innerHTML = html;
	
	
    // setup menu
    this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
	
	if (!this.justChangelog)
	{
	    // set command menu
	    this.controller.setupWidget(Mojo.Menu.commandMenu, { menuClass: 'no-fade' }, this.cmdMenuModel);
	}
	
    // set this scene's default transition
    this.controller.setDefaultTransition(Mojo.Transition.zoomFade);
};

StartupAssistant.prototype.activate = function(event)
{
    // start continue button timer
    this.timer = this.controller.window.setTimeout(this.showContinue.bind(this), 5 * 1000);
};

StartupAssistant.prototype.showContinue = function()
{
    // show the command menu
    this.controller.setMenuVisible(Mojo.Menu.commandMenu, true);
};

StartupAssistant.prototype.handleCommand = function(event)
{
    if (event.type == Mojo.Event.command)
	{
		switch (event.command)
		{
			case 'do-continue':
				this.controller.stageController.swapScene({name: 'main', transition: Mojo.Transition.crossFade});
				break;
					
			case 'do-prefs':
				this.controller.stageController.pushScene('preferences');
				break;
					
			case 'do-help':
				this.controller.stageController.pushScene('help');
				break;
		}
    }
};

// Local Variables:
// tab-width: 4
// End:
