function MainAssistant()
{
    // subtitle random list
    this.randomSub = 
	[
		{weight: 30, text: $L('Always Watching The Log')},
		{weight: 20, text: $L('Sleep All Night, Work All Day')},
		{weight: 20, text: $L('Hack Through Your Logs')},
		{weight: 10, text: $L('I\'m OK')},
		{weight: 1,  text: $L('Is A Logger... Get it?')}
	];
	
	this.appsCache = false;
	
    // setup menu
    this.menuModel =
    {
		visible: true,
		items:
		[
			{
				label: $L("Preferences"),
				command: 'do-prefs'
			},
			{
				label: $L("Help"),
				command: 'do-help'
			}
		]
    };
}

MainAssistant.prototype.setup = function()
{
	
    // set theme because this can be the first scene pushed
    this.controller.document.body.className = prefs.get().theme;
	
	// set loglevel if they want it
	if (prefs.get().setLogLevel) LumberjackService.setLogging(function(p){}, 'LunaSysMgrJS', 'debug');
	
    this.controller.get('main-title').innerHTML = $L('Lumberjack');
    this.controller.get('version').innerHTML = $L('v0.0.0');
    this.controller.get('subTitle').innerHTML = $L('');	

    // setup menu
    this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
	
    // get elements
    this.versionElement = 	this.controller.get('version');
    this.subTitleElement =	this.controller.get('subTitle');
	this.filterElement =	this.controller.get('filter');
	this.tailButton =		this.controller.get('tailButton');
	this.getButton =		this.controller.get('getButton');
	
    this.versionElement.innerHTML = "v" + Mojo.Controller.appInfo.version;
    this.subTitleElement.innerHTML = this.getRandomSubTitle();

    // handlers
    this.listAppsHandler =		this.listApps.bindAsEventListener(this);
	this.appChangedHandler = 	this.appChanged.bindAsEventListener(this);
    this.tailTapHandler =		this.tailTap.bindAsEventListener(this);
    this.getTapHandler =		this.getTap.bindAsEventListener(this);
	
	this.controller.setupWidget
	(
		'filter',
		{},
		this.filterModel =
		{
			value: prefs.get().lastLog,
			choices: 
			[
				{label:$L('Everything'),       value:'every'},
				{label:$L('Alerts'),  		   value:'alert'},
				{label:$L('Mojo.Logs')},
				{label:$L('All Applications'), value:'allapps'}
			]
		}
	);
	
	this.controller.listen('filter', Mojo.Event.propertyChange, this.appChangedHandler);
	
	this.controller.setupWidget
	(
		'tailButton',
		{},
		{
			buttonLabel: $L("Tail Log")
		}
	);
	this.controller.setupWidget
	(
		'getButton',
		{},
		{
			buttonLabel: $L("Get Log")
		}
	);
	
	this.controller.listen(this.tailButton, Mojo.Event.tap, this.tailTapHandler.bindAsEventListener(this));
	this.controller.listen(this.getButton, Mojo.Event.tap, this.getTapHandler.bindAsEventListener(this));
	
	this.request = LumberjackService.listApps(this.listAppsHandler);
};

MainAssistant.prototype.listApps = function(payload)
{
	if (payload.apps && payload.apps.length > 0)
	{
		this.appsCache = payload;
		
		this.filterModel.choices = [];
		appsList = $H();
		
		payload.apps.sort(function(a, b)
		{
			if (a.title && b.title)
			{
				strA = a.title.toLowerCase();
				strB = b.title.toLowerCase();
				return ((strA < strB) ? -1 : ((strA > strB) ? 1 : 0));
			}
			else
			{
				return -1;
			}
		});
		
		this.filterModel.choices.push({label:$L('Everything'),		 value:'every'});
		this.filterModel.choices.push({label:$L('Alerts'), 			 value:'alert'});
		appsList.set('every', 1);
		appsList.set('alert', 1);
		
		this.filterModel.choices.push({label:$L('Mojo.Logs')});
		this.filterModel.choices.push({label:$L('All Applications'), value:'allapps'});
		appsList.set('allapps', 1);
		
		for (var a = 0; a < payload.apps.length; a++)
		{
			//alert('==================');
			//for (var x in payload.apps[a]) alert(x+': '+payload.apps[a][x]);
			
			appsList.set(payload.apps[a].id, payload.apps[a].title);
			
			if (prefs.get().listStockApps)
			{
				this.filterModel.choices.push({label:payload.apps[a].title, value:payload.apps[a].id});
			}
			else
			{
				if (payload.apps[a].size > 0)
				{
					this.filterModel.choices.push({label:payload.apps[a].title, value:payload.apps[a].id});
				}
			}
		}
		
		if (!appsList.get(prefs.get().lastLog))
		{
			this.filterModel.value = 'allapps';
		}
		
		this.controller.modelChanged(this.filterModel);
	}
	else if (payload.returnValue === false)
	{
		this.errorMessage('<b>Service Error (listApps):</b><br>'+payload.errorText);
	}
};

MainAssistant.prototype.appChanged = function(event)
{
	var cookie = new preferenceCookie();
	var tprefs = cookie.get();
	tprefs.lastLog = event.value;
	cookie.put(tprefs);
	var tmp = prefs.get(true);
}

MainAssistant.prototype.tailTap = function(event)
{
	tail.newScene(this, this.filterModel.value, prefs.get().popLog);
};
MainAssistant.prototype.getTap = function(event)
{
	this.controller.stageController.pushScene('get-log', this.filterModel.value);
};
    
MainAssistant.prototype.getRandomSubTitle = function()
{
	// loop to get total weight value
	var weight = 0;
	for (var r = 0; r < this.randomSub.length; r++)
	{
		weight += this.randomSub[r].weight;
	}
	
	// random weighted value
	var rand = Math.floor(Math.random() * weight);
	//alert('rand: ' + rand + ' of ' + weight);
	
	// loop through to find the random title
	for (var r = 0; r < this.randomSub.length; r++)
	{
		if (rand <= this.randomSub[r].weight)
		{
			return this.randomSub[r].text;
		}
		else
		{
			rand -= this.randomSub[r].weight;
		}
	}
	
	// if no random title was found (for whatever reason, wtf?) return first and best subtitle
	return this.randomSub[0].text;
}


MainAssistant.prototype.errorMessage = function(msg)
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

MainAssistant.prototype.handleCommand = function(event)
{
	if (event.type == Mojo.Event.command)
	{
		switch (event.command)
		{
			case 'do-prefs':
				this.controller.stageController.pushScene('preferences');
				break;
	
			case 'do-help':
				this.controller.stageController.pushScene('help');
				break;
		}
	}
}

MainAssistant.prototype.activate = function(event)
{
	if (this.alreadyActivated)
	{
		this.listApps(this.appsCache);
		//this.request = LumberjackService.listApps(this.listAppsHandler);
	}
	
	if (this.controller.stageController.setWindowOrientation)
	{
    	this.controller.stageController.setWindowOrientation("up");
	}
	
	this.alreadyActivated = true;
};
MainAssistant.prototype.deactivate = function(event)
{
};

MainAssistant.prototype.cleanup = function(event)
{
	this.controller.stopListening(this.tailButton, Mojo.Event.tap, this.tailRowTapHandler);
};
