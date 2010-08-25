function PreferencesAssistant()
{
	// setup default preferences in the preferenceCookie.js model
	this.cookie = new preferenceCookie();
	this.prefs = this.cookie.get();
	
	// for secret group
	this.secretString = '';
	this.secretAnswer = 'iknowwhatimdoing';
	
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

PreferencesAssistant.prototype.setup = function()
{
		this.controller.get('preferences-title').innerHTML = $L('Preferences');
		this.controller.get('preferences-global').innerHTML = $L('Global');
		this.controller.get('secret-stuff').innerHTML = $L('Secret Stuff');
		this.controller.get('secret-options').innerHTML = $L('This version has no secret options.');

	try
	{
		// setup menu
		this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
		
		// set this scene's default transition
		this.controller.setDefaultTransition(Mojo.Transition.zoomFade);
		
		// setup handlers for preferences
		this.toggleChangeHandler = this.toggleChanged.bindAsEventListener(this);
		this.listChangedHandler  = this.listChanged.bindAsEventListener(this);
		
		
		// Global Group
		this.controller.setupWidget
		(
			'theme',
			{
				label: $L('Theme'),
				choices:
				[
					{label:$L('Palm Default'),	value:'palm-default'},
					{label:$L('Palm Dark'),		value:'palm-dark'}
				],
				modelProperty: 'theme'
			},
			this.prefs
		);
		this.controller.setupWidget
		(
			'setLogLevel',
			{
				label: $L('Log Level'),
				choices:
				[
					/*	Levels:
						  none        # -1
						  emerg       # 0
						  alert       # 1
						  crit        # 2
						  err         # 3
						  warning     # 4
						  notice      # 5
						  info        # 6
						  debug       # 7	*/
					{label:$L('Don\'t Change'),	value:''},
					{label:$L('Alert'),			value:'alert'},
					{label:$L('Error'),			value:'err'},
					{label:$L('Warning'),		value:'warning'},
					{label:$L('Info'),			value:'info'},
					{label:$L('Debug'),			value:'debug'}
				],
				modelProperty: 'setLogLevel'
			},
			this.prefs
		);
		
		this.controller.listen('theme', Mojo.Event.propertyChange, this.themeChanged.bindAsEventListener(this));
		this.controller.listen('setLogLevel', Mojo.Event.propertyChange, this.logLevelChanged.bindAsEventListener(this));
		
		
		
		// Main Group
		this.controller.setupWidget
		(
			'listStockApps',
			{
	  			trueLabel:  $L("Yes"),
	 			falseLabel: $L("No"),
	  			fieldName:  'listStockApps'
			},
			{
				value : this.prefs.listStockApps,
	 			disabled: false
			}
		);
		this.controller.setupWidget
		(
			'popLog',
			{
	  			trueLabel:  $L("Yes"),
	 			falseLabel: $L("No"),
	  			fieldName:  'popLog'
			},
			{
				value : this.prefs.popLog,
	 			disabled: false
			}
		);

		this.controller.listen('listStockApps',     Mojo.Event.propertyChange, this.toggleChangeHandler);
		this.controller.listen('popLog',    		Mojo.Event.propertyChange, this.toggleChangeHandler);
		
		
		
		// Logs Group
		this.controller.setupWidget
		(
			'copyStyle',
			{
				label: $L('Copy Format'),
				choices:
				[
					{label:$L('Raw Log'),	value:'raw'},
					{label:$L('Cleaned'),	value:'clean'}//,
					//{label:$L('Message'),	value:'msg'}
				],
				modelProperty: 'copyStyle'
			},
			this.prefs
		);
		
		this.controller.listen('copyStyle', Mojo.Event.propertyChange, this.listChangedHandler);
		
		
		// Secret Group
		this.keyPressHandler = this.keyPress.bindAsEventListener(this)
		Mojo.Event.listen(this.controller.sceneElement, Mojo.Event.keypress, this.keyPressHandler);
		
		// hide secret group
		this.controller.get('secretPreferences').style.display = 'none';
		
	}
	catch (e)
	{
		Mojo.Log.logException(e, 'preferences#setup');
	}

}

PreferencesAssistant.prototype.themeChanged = function(event)
{
	this.cookie.put(this.prefs);
	
	// set the theme right away with the body class
	this.controller.document.body.className = event.value;
	
	var keys = appsList.keys();
	if (keys.length > 0)
	{
		for (var k = 0; k < keys.length; k++)
		{
			try
			{
				Mojo.Controller.appController.getStageController('tail-'+keys[k]).activeScene().assistant.controller.document.body.className = event.value;
			}
			catch (e) {}
		}
	}
}
PreferencesAssistant.prototype.logLevelChanged = function(event)
{
	this.cookie.put(this.prefs);
	
	if (event.value)
	{
		LumberjackService.setLogging(function(p){}, 'LunaSysMgrJS', event.value);
	}
	else
	{
		LumberjackService.setLogging(function(p){}, 'LunaSysMgrJS', 'err');
	}
}
PreferencesAssistant.prototype.toggleChanged = function(event)
{
	this.prefs[event.target.id] = event.value;
	this.cookie.put(this.prefs);
};
PreferencesAssistant.prototype.listChanged = function(event)
{
	this.cookie.put(this.prefs);
};

PreferencesAssistant.prototype.handleCommand = function(event)
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

PreferencesAssistant.prototype.keyPress = function(event)
{
	this.secretString += String.fromCharCode(event.originalEvent.charCode);
	
	if (event.originalEvent.charCode == 8)
	{
		this.secretString = '';
	}
	
	if (this.secretString.length == this.secretAnswer.length)
	{
		if (this.secretString === this.secretAnswer)
		{
			this.controller.get('secretPreferences').style.display = '';
			this.controller.getSceneScroller().mojo.revealElement(this.controller.get('secretPreferences'));
			this.secretString = '';
		}
	}
	else if (this.secretString.length > this.secretAnswer.length)
	{
		this.secretString = '';
	}
}

PreferencesAssistant.prototype.alertMessage = function(title, message)
{
	this.controller.showAlertDialog({
	    onChoose: function(value) {},
		allowHTMLMessage: true,
	    title: title,
	    message: message,
	    choices:[{label:$L('Ok'), value:""}]
    });
}

PreferencesAssistant.prototype.activate = function(event)
{
	if (this.controller.stageController.setWindowOrientation)
	{
    	this.controller.stageController.setWindowOrientation("up");
	}
}

PreferencesAssistant.prototype.deactivate = function(event)
{
	// reload global storage of preferences when we get rid of this stage
	var tmp = prefs.get(true);
}

PreferencesAssistant.prototype.cleanup = function(event) {}
