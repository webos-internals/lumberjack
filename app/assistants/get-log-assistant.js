function GetLogAssistant(filter)
{
	this.filter =			(filter.filter ? filter.filter : 'allapps');
	this.custom =			(filter.custom ? filter.custom : '');
	
	this.request =			false;
	this.contents =			'';
	
	this.copyStart =		-1;
	
	this.searchTimer =		false;
	this.searching =		false;
	this.searchText =		'';
	this.searchIndexes =	[];
	this.searchIndex =		0;
	
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

GetLogAssistant.prototype.setup = function()
{
	try
	{
	    // set theme because this can be the first scene pushed
	    this.controller.document.body.className = prefs.get().theme;
		
		// setup menus
		this.controller.setupWidget(Mojo.Menu.appMenu, { omitDefaultItems: true }, this.menuModel);
		this.controller.setupWidget(Mojo.Menu.commandMenu, { menuClass: 'no-fade' }, this.cmdMenuModel = {items:[]});
		
		this.sceneScroller =			this.controller.sceneScroller;
		this.headerElement =			this.controller.get('logHeader');
		this.searchElement =			this.controller.get('searchText');
		this.searchSpinnerElement =		this.controller.get('searchSpinner');
		this.titleElement =				this.controller.get('get-log-title');
		this.messagesElement =			this.controller.get('messages');
		this.reloadButtonElement =		this.controller.get('reloadButton');
		this.spinnerElement =			this.controller.get('spinner');
		this.reloadButtonPressed =		this.reloadButtonPressed.bindAsEventListener(this);
		this.messageTapHandler =		this.messageTap.bindAsEventListener(this);
		this.searchDelayHandler =		this.searchDelay.bindAsEventListener(this);
		this.keyHandler =				this.keyTest.bindAsEventListener(this);
		this.searchFunction =			this.search.bind(this);
		
		this.controller.setupWidget('spinner', {spinnerSize: 'large'}, {spinning: false});
		
		if (this.filter == 'allapps')
		{
			this.titleElement.update('All Applications');
		}
		else if (this.filter == 'every')
		{
			this.titleElement.update('Everything');
		}
		else if (this.filter == 'alert')
		{
			this.titleElement.update('Alert()s');
		}
		else
		{
			this.titleElement.update((appsList.get(this.filter) ? appsList.get(this.filter) : this.filter));
		}
		
		this.controller.listen(this.reloadButtonElement, Mojo.Event.tap, this.reloadButtonPressed);
		
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
		
		this.controller.setupWidget('searchSpinner', {spinnerSize: 'small'}, {spinning: false});
		
		this.controller.setupWidget
		(
			'searchText',
			{
				focus: false,
				autoFocus: false,
				changeOnKeyPress: true
			},
			this.searchModel = { value: this.searchText }
		);
		
		this.controller.listen(this.searchElement, Mojo.Event.propertyChange, this.searchDelayHandler);
		
		this.controller.listen(this.controller.sceneElement, Mojo.Event.keypress, this.keyHandler);
		
	}
	catch (e)
	{
		Mojo.Log.logException(e, 'get-log#setup');
	}
}

GetLogAssistant.prototype.reloadButtonPressed = function(event)
{
	this.get();
}


GetLogAssistant.prototype.keyTest = function(event)
{
	if (Mojo.Char.isValidWrittenChar(event.originalEvent.charCode)) 
	{
		this.controller.stopListening(this.controller.sceneElement, Mojo.Event.keypress, this.keyHandler);
		this.headerElement.style.display = 'none';
		this.searchElement.style.display = 'inline';
		this.searchElement.mojo.focus();
	}
};
GetLogAssistant.prototype.searchDelay = function(event)
{
	clearTimeout(this.searchTimer);
	
	this.searchText = event.value;
	
	if (this.searchText == '') 
	{
		this.searchSpinnerElement.mojo.stop();
		this.searchElement.mojo.blur();
		this.messageHighlight(-1, 'highlight');
		this.searchElement.style.display = 'none';
		this.headerElement.style.display = 'inline';
		this.controller.listen(this.controller.sceneElement, Mojo.Event.keypress, this.keyHandler);
		this.search();
	}
	else
	{
		this.searchSpinnerElement.mojo.start();
		this.searching = true;
		this.searchTimer = setTimeout(this.searchFunction, 1000);
	}
};
GetLogAssistant.prototype.search = function()
{
	this.searchIndexes = [];
	this.searchIndex = 0;
	this.messageHighlight(-1, 'highlight');
	
	for (var m = 0; m < this.listModel.items.length; m++) 
	{
		var msg = Object.clone(this.listModel.items[m]);
		
		if (this.searchText == '')
		{
			
		}
		else if (msg.raw.toLowerCase().include(this.searchText.toLowerCase()))
		{
			this.searchIndexes.push(m);
		}
	}
	
	if (this.searchIndexes.length > 0)
	{
		this.messageHighlight(this.searchIndexes[this.searchIndex], 'highlight');
		this.messagesElement.mojo.revealItem(this.searchIndexes[this.searchIndex], false);
	}
	
	if (this.searching)
	{
		this.searching = false;
	}
	
	this.updateCommandMenu();
	this.searchSpinnerElement.mojo.stop();
};

GetLogAssistant.prototype.messageTap = function(event)
{
	if (event.item)
	{
		var popupList = [];
		if (this.copyStart > -1)
		{
			popupList.push({label: 'Copy',				command: 'copy'});
			if (this.copyStart == event.index)
			{
				this.copyStart = -1;
				popupList.push({label: 'Copy From Here',	command: 'copy-from'});
			}
			else
			{
				popupList.push({label: '... To Here',		command: 'copy-to'});
			}
		}
		else
		{
			popupList.push({label: 'Copy',				command: 'copy'});
			popupList.push({label: 'Copy From Here',	command: 'copy-from'});
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
GetLogAssistant.prototype.messageTapListHandler = function(choice, item, index)
{
	switch(choice)
	{
		case 'copy':
			this.controller.stageController.setClipboard((prefs.get().copyStyle == 'clean' ? item.copy : item.raw));
			this.copyStart = -1;
			this.messageHighlight(-1, 'selected');
			break;
			
		case 'copy-from':
			this.messageHighlight(index, 'selected');
			this.copyStart = index;
			break;
			
		case 'copy-to':
			if (this.listModel.items.length > 0)
			{
				var message = '';
				
				var start = (this.copyStart > index ? index : this.copyStart);
				var end   = (this.copyStart < index ? index : this.copyStart);
				
				for (var i = start; i <= end; i++)
				{
					if (message != '') message += '\n';
					message += (prefs.get().copyStyle == 'clean' ? this.listModel.items[i].copy : this.listModel.items[i].raw);
				}
				if (message != '')
				{
					this.controller.stageController.setClipboard(message);
				}
			}
			this.copyStart = -1;
			this.messageHighlight(-1, 'selected');
			break;
	}
}
GetLogAssistant.prototype.messageHighlight = function(index, style)
{
	if (this.listModel.items.length > 0)
	{
		for (var i = 0; i < this.listModel.items.length; i++)
		{
			if (i == index)
				this.listModel.items[i].select += ' ' + style;
			else
				this.listModel.items[i].select = this.listModel.items[i].select.replace(style, '');
		}
		this.messagesElement.mojo.noticeUpdatedItems(0, this.listModel.items);
		this.messagesElement.mojo.setLength(this.listModel.items.length);
	}
}

GetLogAssistant.prototype.get = function()
{
	this.request = LumberjackService.getMessages(this.got.bindAsEventListener(this));
}
GetLogAssistant.prototype.got = function(payload)
{
	if (payload.returnValue)
	{
		switch (payload.stage)
		{
			case 'start':
				this.spinnerElement.mojo.start();
				this.contents = '';
				this.listModel.items = [];
				this.messagesElement.mojo.noticeUpdatedItems(0, this.listModel.items);
				this.messagesElement.mojo.setLength(this.listModel.items.length);
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
				this.messagesElement.mojo.noticeUpdatedItems(0, this.listModel.items);
				this.messagesElement.mojo.setLength(this.listModel.items.length);
				this.revealBottom();
				break;
		}
	}
	else
	{
		this.spinnerElement.mojo.stop();
		this.contents = '';
		this.listModel.items = [];
		this.messagesElement.mojo.noticeUpdatedItems(0, this.listModel.items);
		this.messagesElement.mojo.setLength(this.listModel.items.length);
		this.revealBottom();
		
		this.errorMessage('<b>Service Error (getMessages):</b><br>'+payload.errorText);
	}
}
GetLogAssistant.prototype.parseMessages = function(data)
{
	if (data)
	{
		var ary = data.split("\n");
		if (ary.length > 0)
		{
			for (var a = 0; a < ary.length; a++)
			{
				if (this.filter == 'every')
				{
					var everyMsg = tailHandler.parseEvery(ary[a]);
					this.addMessage(everyMsg);
				}
				if (this.filter == 'alert')
				{
					var alertMsg = tailHandler.parseAlert(ary[a]);
					this.addMessage(alertMsg);
				}
				else
				{
					var mojoMsg =  tailHandler.parseMojo(ary[a]);
					if ((this.filter == 'allapps') ||
						(mojoMsg.id && this.filter.toLowerCase() == mojoMsg.id.toLowerCase()))
						this.addMessage(mojoMsg);
				}
			}
		}
	}
}
GetLogAssistant.prototype.addMessage = function(msg)
{
	if (msg)
	{
		msg.select = '';
		if (this.filter == 'allapps' || this.filter == 'every') msg.rowClass += ' showapp';
		this.listModel.items.push(msg);
	}
}

GetLogAssistant.prototype.revealBottom = function()
{
	// palm does this twice in the messaging app to make sure it always reveals the very very bottom
	this.sceneScroller.mojo.revealBottom();
	this.sceneScroller.mojo.revealBottom();
}


GetLogAssistant.prototype.errorMessage = function(msg)
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

GetLogAssistant.prototype.updateCommandMenu = function()
{
	this.cmdMenuModel.items = [];
	this.cmdMenuModel.items.push({});
	this.cmdMenuModel.items.push({});
	
	var item = {command: 'do-first', icon: 'first'};
    if (this.searchIndex == 0) item.disabled = true;
	this.cmdMenuModel.items.push(item);
	
	var item = {command: 'do-prev', icon: 'back'};
    if (this.searchIndex == 0) item.disabled = true;
	this.cmdMenuModel.items.push(item);
	
	var item = {command: 'do-next', icon: 'forward'};
    if (this.searchIndex == (this.searchIndexes.length-1)) item.disabled = true;
	this.cmdMenuModel.items.push(item);
	
	var item = {command: 'do-last', icon: 'last'};
    if (this.searchIndex == (this.searchIndexes.length-1)) item.disabled = true;
	this.cmdMenuModel.items.push(item);
	
	this.cmdMenuModel.items.push({});
	this.cmdMenuModel.items.push({command: 'do-clear', icon: 'stop'});
	
	this.controller.modelChanged(this.cmdMenuModel);
	if (this.searchIndexes.length > 0)
	{
		this.controller.setMenuVisible(Mojo.Menu.commandMenu, true);
	}
	else
	{
		this.controller.setMenuVisible(Mojo.Menu.commandMenu, false);
	}
}

GetLogAssistant.prototype.handleCommand = function(event)
{
	if (event.type == Mojo.Event.command)
	{
		switch (event.command)
		{
			case 'do-first':
				this.searchIndex = 0;
				this.messageHighlight(this.searchIndexes[this.searchIndex], 'highlight');
				this.messagesElement.mojo.revealItem(this.searchIndexes[this.searchIndex], false);
				this.updateCommandMenu();
				break;
			case 'do-prev':
				this.searchIndex--;
				if (this.searchIndex < 0) this.searchIndex = 0;
				this.messageHighlight(this.searchIndexes[this.searchIndex], 'highlight');
				this.messagesElement.mojo.revealItem(this.searchIndexes[this.searchIndex], false);
				this.updateCommandMenu();
				break;
			case 'do-next':
				this.searchIndex++;
				if (this.searchIndex > (this.searchIndexes.length-1)) this.searchIndex = (this.searchIndexes.length-1);
				this.messageHighlight(this.searchIndexes[this.searchIndex], 'highlight');
				this.messagesElement.mojo.revealItem(this.searchIndexes[this.searchIndex], false);
				this.updateCommandMenu();
				break;
			case 'do-last':
				this.searchIndex = (this.searchIndexes.length-1);
				this.messageHighlight(this.searchIndexes[this.searchIndex], 'highlight');
				this.messagesElement.mojo.revealItem(this.searchIndexes[this.searchIndex], false);
				this.updateCommandMenu();
				break;
			case 'do-clear':
				this.searchIndexes = [];
				this.searchIndex = 0;
				this.searchElement.mojo.setValue('');
				this.messageHighlight(-1, 'highlight');
				this.searchDelay({value: ''});
				break;
			
			case 'do-help':
				this.controller.stageController.pushScene('help');
				break;
		}
	}
}

GetLogAssistant.prototype.orientationChanged = function(orientation) {}
GetLogAssistant.prototype.activate = function(event)
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

GetLogAssistant.prototype.deactivate = function(event) {}
GetLogAssistant.prototype.cleanup = function(event) {}
