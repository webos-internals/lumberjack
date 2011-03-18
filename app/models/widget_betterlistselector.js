	/**
 * @name widget_betterlistselector.js
 * @fileOverview This file discusses the List selectors which can be used for pop-up multiple-choice style editing of values;
 * See {@link Mojo.Widget.BetterListSelector} for more info. 

Copyright 2009 Palm, Inc.  All rights reserved.

*/

/**
#### Overview ####

List selectors can be used for pop-up multiple-choice style editing of values. 
The current value of the BetterListSelector is always available in the model.value property. 
The BetterListSelector also contains a hidden input field with the current value, so it may 
be wrapped in a form if desired.

#### Declaration ####

		<div x-mojo-element="BetterListSelector" id="betterlistselectorId" class="betterlistselectorClass" name="betterlistselectorName"></div>

		Properties		Required	Value			Description 
		---------------------------------------------------------------------------------------------------------------------------------
		x-mojo-element	Required	BetterListSelector	Declares the widget as type 'BetterListSelector' 
		id				Required	Any String		Identifies the widget element for use when instantiating or rendering
		class			Optional	Any String		BetterListSelector uses the .palm-list-selector by default but you override this setting
		name			Optional	Any String		Add a unique name to the betterlistselector widget; generally used in templates when used 

#### Events ####

		Mojo.Event.listen("betterlistselectorId", Mojo.Event.propertyChange, this.handleUpdate)

		Event Type					Value			Event Handling
		---------------------------------------------------------------------------------------------------------------------------------
		Mojo.Event.propertyChange			event.value 
									or model.value

#### Instantiation ####
    
		this.controller.setupWidget("betterlistselectorId",
			this.attributes = {
				choices: [
					{label: "One", value: 1},
					{label: "Two", value: 2},
					{label: "Three", value: 3}
					],
			
			this.model = {
			value: 3,
			disabled: false
			}
		});

#### Attribute Properties ####

		Attribute Property	Type			Required	Default		Description
		---------------------------------------------------------------------------------------------------------------------------------
		labelPlacement		String			Optional	Mojo.Widget.labelPlacementRight		Mojo.Widget.labelPlacementRight : places label on right, value on left.
																	Mojo.Widget.labelPlacementLeft : places label on left, value on right
		modelProperty		String			Optional	value		Model property name for radiobutton state
		disabledProperty	String			Optional	disabled	Model property name for disabled boolean
		label				String			Optional	Null		Label for the entire list, shown next to selected value in smaller, blue text
		multiline			Boolean			Optional	false		If true, long labels will wrap to the next line instead of being truncated.
		choices				Array			Required	null		List of values for the popup. Must be defined in either the model or attributes and
																	contain at least 2 items:
																		[{label: <displayName>, value: <value set in object>},
																		 {label: <displayName>, value: <value set in object>},
																			...
																		 {label: <displayName>, value: <value set in object>}]"

#### Model Properties ####

		Model Property		Type			Required	Default		Description     
		---------------------------------------------------------------------------------------------------------------------------------
		value				User-defined	Required	none		value of widget
		disabled			Boolean			Optional	false		If true, radiobutton is inactive
		choices				Array			Required	null		List of values for the popup. Must be defined in either the model or attributes and
 																	contain at least 2 items:
																		[{label: <displayName>, value: <value set in object>},
																		 {label: <displayName>, value: <value set in object>},
																			...
																		 {label: <displayName>, value: <value set in object>}]"

** - a choices array must be present in either the attributes or model. If the choices are dynamic, meaning changeable after setup, then it
    should be in the model, otherwise in attributes.

#### Methods ####

		Method		Arguments		Description
		---------------------------------------------------------------------------------------------------------------------------------
		None


*/

Mojo.Widget.BetterListSelector = Class.create({
	
	/** @private */
	setup : function() {
		Mojo.assert(this.controller.model, "Mojo.Widget.BetterListSelector requires a model. Did you call controller.setupWidgetModel() with the name of this widget?");
		
		// Which model property to use for our value?
		this.valueName = this.controller.attributes.modelProperty || Mojo.Widget.defaultModelProperty;
		this.disabledProperty = this.controller.attributes.disabledProperty || Mojo.Widget.defaultDisabledProperty;

		// Apply palm-list-selector class to div automatically.
		Element.addClassName(this.controller.element, 'palm-list-selector');
		
		this.updateFromModel();
		
		// Set initial value on hidden input element:
		this.hiddenInput.value = this.controller.model[this.valueName];
		
		// Attach event handling stuff:
		this.clickHandler = this.clickHandler.bindAsEventListener(this);
		this.controller.listen(this.controller.element, Mojo.Event.tap, this.clickHandler);
		this.controller.listen(this.controller.element, Mojo.Event.hold, this.clickHandler);
	},
	
	cleanup: function() {
		this.controller.stopListening(this.controller.element, Mojo.Event.tap, this.clickHandler);
		this.controller.stopListening(this.controller.element, Mojo.Event.hold, this.clickHandler);
	},
	

	/** @private */
	updateFromModel: function() {
		var renderObj;
		
		// Find display name for value:
		var display = this.controller.model[this.valueName];
		this.choices = this.controller.model.choices || this.controller.attributes.choices;
		for(var i=0; i<this.choices.length; i++) {
			if(display == this.choices[i].value) {
				display = this.choices[i].label;
				break;
			}
		}
		

		// Don't do all the manipulation involved in enable/disable unless necessary
		if (this.disabled !== this.controller.model[this.disabledProperty]) {
			this.disabled = this.controller.model[this.disabledProperty];
			if (this.disabled) {
				this.controller.element.addClassName('disabled');
			} else {
				this.controller.element.removeClassName('disabled');
			}
		}
		
		
		renderObj = {label:this.controller.attributes.label, name:this.valueName, value:display};
		if(!this.controller.attributes.multiline) {
			renderObj.truncatingText = 'truncating-text';
		}
		
		if(this.controller.attributes.labelPlacement === Mojo.Widget.labelPlacementLeft) {
			Element.addClassName(this.controller.element, 'right');
		}
		
		this.controller.element.innerHTML = Mojo.View.render({object: renderObj, 
											template:  Mojo.Widget.getSystemTemplatePath("list-selector")});

		// Update reference to our hidden input element:
		this.hiddenInput = this.controller.element.querySelector('input');
		if (this.controller.model[this.valueName] !== undefined) {
			this.hiddenInput.value = this.controller.model[this.valueName];
		}
	},

	/** @private */
	closeSelector: function() {
		//assumes currently open.
		this.openElement.mojo.close();
	},

	/** @private */
	openSelector: function() {
			//assumes not currently open.
			if(!this.disabled) {
				
				var widgetController = this.controller.scene.createDynamicWidget('BetterSubmenu', {
						onChoose:this.popupChoose.bind(this),
						placeNear:this.controller.element,
					// this is a bit of a hack, since a top level items array can't be a toggle group in a regular menu,
					// but the functionality is consistent with toggle groups, and quite valuable here.
						toggleCmd:this.controller.model[this.valueName],
						popupClass:'palm-list-selector-popup',
						items: this.choices.map(this.selectorChoiceToMenuItem)
					});
				this.openElement = widgetController && widgetController.element;
				
			}
	},


	/* @private */
	handleModelChanged: function() {
		if(this.openElement) {
			this.closeSelector();
			this.updateFromModel();
			this.openSelector();
		} else {
			this.updateFromModel();
		}
	},
	
	
	/** @private */
	clickHandler: function(event) {
		Event.stop(event);
		this.openSelector();
	},
	
	// Utility routine to convert choices from our model to standard menu items for use in the popup submenu.
	selectorChoiceToMenuItem: function(choice) {
		choice = Mojo.Model.decorate(choice);
		choice.command = choice.value;
		return choice;
	},
	
	/** @private */
	popupChoose: function(value) {
		
		var oldValue = this.controller.model[this.valueName];
		
		this.openElement = undefined;
		
		if(value === undefined || value == oldValue) {
			return;
		}
		
		
		// save value:
		this.controller.model[this.valueName] = value;
		
		// set value in our hidden input element.
		this.hiddenInput.value = value;
		
		// send change event
		Mojo.Event.send(this.controller.element, Mojo.Event.propertyChange,
			{ property: this.valueName,
				value: value,
				model: this.controller.model
			});
		
		if(this.controller.model[this.valueName] != oldValue) {
			// In case an event listener changed the value, 
			// we update after sending the event,
			this.updateFromModel();
			this.controller.modelChanged();
		}
		
		// Need to set the hidden input value again, since re-rendering the widget removes the old node from the DOM,
		// and/or an event listener might have modified the model.
		this.hiddenInput.value = this.controller.model[this.valueName];
		
	}
	
});


Mojo.Widget.BetterSubmenu = Class.create({
	
	/*
		Programatically close an open popup menu.
		This will cause the 'choice' handler to be called with 'undefined', close the popup menu, and remove the scrim.
	*/
	close: function() {
		this._activateHandler(); // call choice handler with 'undefined' & close popup.
	},
	
	
	kBorderSize: 7, // minimum pixels between popup & edge of screen
	kMaxRowWidth: 280,	// max width in pixels of a row element in the popup list.
	kMaxHeight: 290,	// max width in pixels of a row element in the popup list.
	kContainerMargin:16, // difference in pixels between container size & content size.
	kSelectorBorderWidth:48,
	kpopupId:'palm-app-menu',
	
	// Template paths:
	kLabelTemplate: Mojo.Widget.getSystemTemplatePath("submenu/label"),
	kGroupTemplate: Mojo.Widget.getSystemTemplatePath("submenu/group"),
	
	/** @private */
	setup : function() {
		var model = this.controller.model;
		var itemsText;
		var scrimClass = model.scrimClass || 'submenu-popup';
		
		this.filterText = '';
		this.filterTimer = false;
		this.filtering = false;
		
		this.containerTemplate = "betterlistselector/list";
		this.itemTemplate = model.itemTemplate || "betterlistselector/item";
		this.itemRowTemplate = Mojo.Widget.getSystemTemplatePath("submenu/item-row");
		
		itemsText = this.renderItems(model.items, model.toggleCmd);
		this.controller.element.innerHTML = Mojo.View.render({
			object: {
				listElements: itemsText, 
				popupClass: model.popupClass, 
				scrimClass: scrimClass, 
				popupId: (model.popupId || ''), 
				touchableRows: Mojo.Environment.DeviceInfo.touchableRows
			}, 
			template: this.containerTemplate
		});
		
		this.animateQueue = Mojo.Animation.queueForElement(this.controller.element);
		
		this.controller.scene.setupWidget
		(
			(model.popupId || '') + '-better-submenu-filter-spinner',
			{spinnerSize: 'small'}, {spinning: false}
		);
		
		this.controller.scene.setupWidget
		(
			(model.popupId || '') + '-better-submenu-filter-text',
			{
				focus: false,
				autoFocus: false,
				changeOnKeyPress: true
			},
			{}
		);
		
		// This means the scroller and any drawers will all share the same model... but it should be okay since
		// scroller doesn't use the model, and we don't need to maintain a consistent 'open' value for the drawers.
		this.controller.instantiateChildWidgets(this.controller.element, {open:false});
		
		this.popup = this.controller.element.querySelector('div[x-mojo-popup-container]');
		this.scrim = this.controller.element.querySelector('div[x-mojo-popup-scrim]');
		this.popupContent = this.controller.element.querySelector('div[x-mojo-popup-content]');
		
		this.textbox = this.controller.element.querySelector('div[x-mojo-element=TextField]');
		this.spinner = this.controller.element.querySelector('div[x-mojo-element=Spinner]');
		
		this.listContainer = this.controller.element.querySelector('div[x-mojo-popup-elements-container]');

		this.scroller = this.controller.element.querySelector('div[x-mojo-element=Scroller]');
		if (this.scroller) {
			this.scroller.mojo.validateScrollPosition();
		}

		this.setPopupMaxHeight(this.controller.window.innerHeight);
		
		// Now we can position it properly:
		// Get width & height of popup:
		var dims = Element.getDimensions(this.popup);
		var width = dims.width;
		var height = dims.height;
		var sceneWidth = this.controller.window.innerWidth;
		var sceneHeight = this.controller.window.innerHeight;
		var placeX, placeY;
		var offset;
		var animateToLeft;
		var placeNearW;
		
		if(!model.manualPlacement) {
			
			// Maybe place the popup near another element:
			if(model.placeNear) {
				placeNearW = Element.getWidth(model.placeNear);
				// Find location of placement element:
				offset = Mojo.View.viewportOffset(model.placeNear);
				
				// Special case to handle fixed position 'placenear' elements.
				// In this case, the scroll position of the scene is mistakenly taken into account,
				// so we need to subtract it out again. 
				if(this.isFixedPosition(model.placeNear)) {
					offset.top -= this.controller.scene.sceneElement.offsetTop;
				}

				placeX = offset.left + placeNearW;
				if(placeX + width > sceneWidth - this.kBorderSize) {
					placeX -= (placeX + width - (sceneWidth - this.kBorderSize));
				}
				
				//animate from left if center of placeNear icon is on the left of the screen
				animateToLeft = (offset.left + (placeNearW / 2) > sceneWidth / 2);

				placeY = offset.top;
				if(placeY + height > sceneHeight - this.kBorderSize)  {
					placeY -= (placeY + height - (sceneHeight - this.kBorderSize));
				}

				// Odd placeNear elements (like long lists scrolled to the
				// bottom) can result in our pop-up being placed offscreen.
				// Center the pop-up in that case
				if (placeX < 0) {
					placeX = (sceneWidth - width)/2;
				}

				if (placeY < 0) {
					placeY = (sceneHeight - height)/2;
				}
			}
			else {
				// Simply center in the screen.
				placeX = (sceneWidth - width)/2;
				placeY = (sceneHeight - height)/2;
			}
	
		}
		else {
			// TODO: Apply this to all submenus when we can break default
			// behavior
			var viewoffset = Element.viewportOffset(this.popup).top;

			if (this.controller.model.popupId === this.kpopupId) {
				if (viewoffset < -2) {
					viewoffset = -2;
				}
			}
			this.setPopupMaxHeight(this.controller.window.innerHeight -	(viewoffset || 0));
		}
		
		// The scrim starts with opacity=0.0, and set to be animated with CSS transitions.
		// We change it to 1.0 here, which should cause it to fade in over the appropriate time.
		// this.scrim = document.getElementById('palm-scrim');
		// this.scrim.style.opacity = 1.0;
		
		// Animated opacity is currently disabled since the demo is soon, and alpha compositing is not currently supported.
		// In order to reenable it:
		// 1: #palm-scrim style in palm.css should get this in order to put it back in: opacity:0.0; -webkit-transition: opacity 01s linear; 
		// 2: Opacity set above should be uncommented.
		// 3: The removeChild call in _clickHandler should be replaced with the commented out code above it.
		
		this._activateHandler = this._activateHandler.bind(this);
		this.handleResize = this.handleResize.bind(this);
		this.handleResizeCallback = this.setPopupMaxHeight.bind(this);
		
		this._moveToChosen = this._moveToChosen.bind(this);
		
		this._keyHandler = this._keyHandler.bindAsEventListener(this);
		this._filterDelayHandler = this._filterDelayHandler.bindAsEventListener(this);
		this._filter = this._filter.bind(this);

		
		this.resizeDebouncer = Mojo.Function.debounce(undefined, this.handleResize, 0.1, this.controller.window);
		this.controller.listen(this.controller.window, 'resize', this.resizeDebouncer);
		
		this.controller.listen(this.controller.element, 'mousedown', this._activateHandler);
		this.controller.listen(this.controller.element, Mojo.Event.tap, this._activateHandler);
		
		this.controller.listen(this.textbox, Mojo.Event.propertyChange, this._filterDelayHandler);
		this.controller.listen(this.controller.window, 'keypress', this._keyHandler);
		
		this.controller.scene.pushCommander(this);
		this.controller.scene.pushContainer(this.controller.element, 
							(model._mojoContainerLayer !== undefined ? model._mojoContainerLayer : this.controller.scene.submenuContainerLayer),
							{cancelFunc:this.close.bind(this)});
		
		// Expose 'close' method for our client:
		this.controller.exposeMethods(["close"]);

		this._animateOff = this._animateOff.bind(this);
		
		this._animateOn(sceneWidth, offset, width, height, placeX, placeY, animateToLeft);
	},
	
	_animateOn: function(sceneWidth, offset, width, height, placeX, placeY, animateToLeft) {
		var that = this;
		var animateSubmenu;
		var cornersTo;
		var cornersFrom;
		var popupContentHeight;
		
		if(this.controller.model.popupId === this.kpopupId){ //animate down	
			if(!placeY){
				placeY = this.popup.offsetTop;
			}
			this.popup.style.top = (-height) +'px';
			this.popup.style.left = placeX+'px';
			this.offsceneY = -height;

			this.onsceneY = placeY;
			
			animateSubmenu = Mojo.Animation.Appmenu.animate.curry(this.popup, this.offsceneY, this.onsceneY, this._moveToChosen);
			//set the starting scrim opacity
			this.scrim.style.opacity = 0;
			Mojo.Animation.Scrim.animate(this.scrim, 0, 1, animateSubmenu);
		} else if(this.controller.model.placeNear) { //animate out
			popupContentHeight = this.popupContent.offsetHeight;
			
			this.popup.style.top = offset.top +'px';
			
			//if the popup is aligned to the right of the screen, animate out from that side.
			if(animateToLeft || ((animateToLeft === undefined) &&
						(sceneWidth - (placeX + width) - this.kBorderSize) === 0)) {
				//aligned on the right
				this.onsceneXStart = placeX + width - this.kSelectorBorderWidth;
			} else {
				//aligned somewhere else
				this.onsceneXStart = placeX;
			}	
			this.popup.style.left = this.onsceneXStart+'px';
			
			this.onsceneYStart = offset.top - this.kSelectorBorderWidth;
			this.onsceneY = placeY;
			this.onsceneX = placeX;
			this.popup.style['min-width'] = '0px';
			this.popup.style.width = this.kSelectorBorderWidth+'px';
			this.popupContent.style.height = '0px';
			this.popup.hide();
			
			cornersFrom = {
				top:this.onsceneYStart,
				left:this.onsceneXStart,
				width:this.kSelectorBorderWidth,
				height:0
			};
				
			cornersTo = {
				top:this.onsceneY,
				left:this.onsceneX,
				width:width,
				height:popupContentHeight
			};
			
			animateSubmenu = function(){
				that.popup.show();
				Mojo.Animation.Submenu.animate(that.popup, that.popupContent, cornersFrom ,cornersTo, this._moveToChosen);
			}.bind(this);
			
			//set the starting scrim opacity
			this.scrim.style.opacity = 0;
			Mojo.Animation.Scrim.animate(this.scrim, 0, 1, animateSubmenu);
		} else {
			this.popup.style.top = placeY+'px';
			this.popup.style.left = placeX+'px';
		}

		//Mojo.Log.info("Title width4: "+this.controller.element.querySelector('div.title').getWidth());
	},
	
	_animateOff: function() {
		var that = this;
		var cornersTo;
		var cornersFrom;
		var animateScrim;
		//animate the scrim off the scene and then remove
		if(this.controller.model.placeNear){
			this.popup.style['min-width'] = '0px';
			
			cornersFrom = {
				top:this.popup.offsetTop,
				left:this.popup.offsetLeft,
				width:this.popup.offsetWidth,
				height:this.popupContent.offsetHeight
			};
				
			cornersTo = {
				top:this.onsceneYStart + this.kSelectorBorderWidth,
				left:this.onsceneXStart,
				width:this.kSelectorBorderWidth,
				height:0
			};
			
			animateScrim = function(){
				that.popup.hide();
				Mojo.Animation.Scrim.animate(that.scrim, 1, 0, that.controller.remove.bind(that.controller));
			};
			
			Mojo.Animation.Submenu.animate(this.popup, this.popupContent ,cornersFrom ,cornersTo, 
				animateScrim);
		} else if(this.controller.model.popupId === this.kpopupId) {
			Mojo.Animation.Appmenu.animate(this.popup, this.onsceneY, -this.popup.offsetHeight, 
			Mojo.Animation.Scrim.animate.curry(this.scrim, 1, 0, this.controller.remove.bind(this.controller)));
		} else {
			this.controller.remove();
		}
	},
	
	_moveToChosen: function()
	{
		if (this.scroller && this.controller.model.toggleCmd !== undefined) {
			var node = this.scroller.querySelector('.chosen');
			if (node) {
				this.scroller.mojo.revealElement(node);
			}
		}
	},
	
	cleanup: function() {
		this.controller.stopListening(this.controller.element, 'mousedown', this._activateHandler);
		this.controller.stopListening(this.controller.element, Mojo.Event.tap, this._activateHandler);
		this.controller.stopListening(this.controller.window, 'resize', this.resizeDebouncer);
		this.controller.stopListening(this.textbox, Mojo.Event.propertyChange, this._filterDelayHandler);
		this.controller.stopListening(this.controller.window, 'keypress', this._keyHandler);
	},
	
	renderItems: function(items, toggleCmd, prevParentItem, nextParentItem) {
		var groupText;
		var item;
		var renderParams;
		var itemsText = '';
		var i;
		var cmdItemCount = 0;
		var startOfMenu;
		var endOfMenu;
		var endOfSection;
		
		for(i=0; i<items.length; i++) {
			item = items[i];

			renderParams = {
				formatters: {
					shortcut: this.itemFormatter,
					value: this.dividerFormatter.bind(this),
					disabled: this.disabledFormatter
				},
				attributes: {
					itemClass: item.itemClass
				}
			};

			// group template, or regular item template?
			if(item.items) {
				groupText = this.renderItems(item.items, item.toggleCmd, item, items[i+1] || nextParentItem);	// Include nextParentItem in case we're at the end of a sub-submenu
				renderParams.attributes.groupItems = groupText;
				renderParams.template = this.kGroupTemplate;
			} else if(item.command !== undefined) {
				
				// Apply correct 'chosen' class variant, if the chosen property is specified or if this is the currently chosen item in a toggle group
				if(item.chosen || (item.command !== undefined && item.command == toggleCmd)) {
					renderParams.attributes.chosenClass = 'chosen';
					renderParams.attributes.checkmarkFormattedHTML = "<div class='popup-item-checkmark'></div>";
				} 
				
				renderParams.template = this.itemTemplate;
				
			} else if(item.label !== undefined) {
				// It's a text label, use special template:
				renderParams.template = this.kLabelTemplate;
				cmdItemCount = -1;
			} else {
				// it's a divider, or icon-label.  Use the item template.
				renderParams.template = this.itemTemplate;
				cmdItemCount = -1;
			}
			
			// The menu item should be rendered with the appropriate item model.
			renderParams.object = item;
			
			// Determine if this is the end of a section by peeking at the next item
			item = items[i+1];
			endOfSection = !item || ((item.command === undefined || item.command === null) && !item.items);
			startOfMenu = !prevParentItem && i === 0;
			endOfMenu = !item && !nextParentItem;
			
			// Apply appropriate class to this item, if any.
			if(cmdItemCount === 0 && endOfSection) {
				renderParams.attributes.listClass = 'single';
			} else if (startOfMenu) {
				renderParams.attributes.listClass = 'first menu-start';
			} else if (cmdItemCount === 0){
				renderParams.attributes.listClass = 'first';
			} else if (endOfMenu) {
				renderParams.attributes.listClass = 'last menu-end';
			} else if (endOfSection){
				renderParams.attributes.listClass = 'last';
			} else {
				delete renderParams.attributes.listClass;
			}

			// For normal items, we have a 2 stage rendering process to support
			// the user giving us an arbitrary item template.
			if (renderParams.template == this.itemTemplate) {
				renderParams.object.renderedItem = Mojo.View.render(renderParams);
				renderParams.template = this.itemRowTemplate;
			}

			itemsText += Mojo.View.render(renderParams);
			cmdItemCount++;
		}
		
		return itemsText;
	},
	
	
	itemFormatter: function(shortcut, itemModel) {
		var formatterProps = {};
		if(this.theOldWaysAreBest) {
			return shortcut && ($LL("alt-")+shortcut);
		}
		
		if(itemModel.shortcut) {
			formatterProps.shortcutFormattedHTML = ("<div class='label'>"+$LL("+ ")+itemModel.shortcut+"</div>");
		}
		
		if(itemModel.icon) {
			formatterProps.iconFormattedHTML = "<div class='palm-popup-icon right "+itemModel.icon+"'></div>";
		} else if(itemModel.iconPath) {
			formatterProps.iconFormattedHTML = "<div class='palm-popup-icon right' style='background-image: url("+itemModel.iconPath+");'></div>";
		}
		
		if(itemModel.secondaryIcon) {
			formatterProps.secondaryIconFormattedHTML = "<div class='palm-popup-icon left "+itemModel.secondaryIcon+"'></div>";
		} else if(itemModel.secondaryIconPath) {
			formatterProps.secondaryIconFormattedHTML = "<div class='palm-popup-icon left' style='background-image: url("+itemModel.secondaryIconPath+");'></div>";
		}
		
		
		if(!itemModel.disabled && !itemModel.items) {
			formatterProps.tapHighlightHTML = 'x-mojo-tap-highlight="persistent"';
		}
		
		return formatterProps;
	},
	
	// Adds a divider class to popup menu items with no value.
	// We also check label, & the icons to avoid the item "disappearing" if the value is accidentally left out.
	dividerFormatter: function(value, model) {
		if(value === undefined && model.label === undefined && 
			model.lefticon === undefined && model.righticon === undefined) {
			return {dividerClass: "palm-section-divider"};	
		}
		return undefined;
	},
	
	// Adds a disabled class to popup menu items with model.disabled === true.
	disabledFormatter: function(disabled) {
		if(disabled) {
			return {disabledClass: "disabled"};	
		}
		return undefined;
	},
	
	/** @private */
	_activateHandler: function(e) {
		var cmd, node, toggleNode, open;
		var activateTarget;
		
		if (this.activated) {
			return;
		}
		
		// We only do something if e is undefined, or a tap event (anywhere), or any event on the scrim.
		if(e && e.type != Mojo.Event.tap && e.target.id != 'palm-scrim') {
			return;
		}
		
		if(e) {
			Event.stop(e);
			
			activateTarget = e.target;
			
			
			// Handle taps to choose items or toggle drawers.
			if(!cmd && e.type == Mojo.Event.tap) {
				
				// find command item node, if any:
				node = Mojo.View.findParentByAttribute(activateTarget, this.controller.element, 'x-mojo-menu-cmd');
				
				// We ignore taps on disabled items (and don't even dismiss the menu)
				if(!node || Element.hasClassName(node, 'disabled')) {
					return;
				}
				
				cmd = node.getAttribute('x-mojo-menu-cmd');
				
				// No command? Maybe toggle a drawer and return.
				// For tap events, we don't dismiss the popup unless it was on a valid choice
				if(!cmd) {
					
					// Was the tap in a drawer toggle handle?
					// If so, go up to the top of the group, and search for the drawer.
					toggleNode = Mojo.View.findParentByAttribute(activateTarget, this.controller.element, 'x-mojo-submenu-toggle');
					node = toggleNode && Mojo.View.findParentByAttribute(toggleNode, this.controller.element, 'x-mojo-submenu-group');
					node = node && node.querySelector('div[x-mojo-element=Drawer]');
					
					if(node) {
						open = node.mojo.getOpenState();
						
						if(open) {
							Element.removeClassName(toggleNode, 'palm-submenu-group-opened');
						} else {
							Element.addClassName(toggleNode, 'palm-submenu-group-opened');
						}
												
						node.mojo.setOpenState(!open);
						return;
					}
										
				}
			}
		}
		
		this.activated = true;
		this.controller.model.onChoose.call(this.controller.scene.assistant, cmd, activateTarget);
		
		this.controller.scene.removeCommander(this);
		this.controller.scene.removeContainer(this.controller.element);
		
		
		if (e && e.type === Mojo.Event.tap && (activateTarget && activateTarget.id) !== 'palm-scrim') {
			this._animateOff.delay(0.2);
		} else {
			this._animateOff();
		}
		
		return;
	},
	
	_keyHandler: function(e)
	{
		if (Mojo.Char.isValidWrittenChar(e.charCode)) 
		{
			this.controller.stopListening(this.controller.window, 'keypress', this._keyHandler);
			this.popup.addClassName('filtering');
			this.textbox.mojo.focus();
		}
	},
	_filterDelayHandler: function(e)
	{
		clearTimeout(this.filterTimer);
		
		this.filterText = e.value;
		
		if (this.filterText == '') 
		{
			this.spinner.mojo.stop();
			this.textbox.mojo.blur();
			this.popup.removeClassName('filtering');
			this.controller.listen(this.controller.window, 'keypress', this._keyHandler);
			this._filter();
		}
		else
		{
			this.spinner.mojo.start();
			this.filtering = true;
			this.filterTimer = setTimeout(this._filter, 1000);
		}
	},
	_filter: function()
	{
		//Mojo.Log.error('Filter: ', this.filterText);
		
		if (this.filterText != '')
		{
			var tmpItems = [];
			
			for(i = 0; i < this.controller.model.items.length; i++)
			{
				var item = Object.clone(this.controller.model.items[i]);
				if (item.value && item.value.toLowerCase().include(this.filterText.toLowerCase()))
				{
					if (item.label) item.label = item.label.replace(new RegExp('(' + this.filterText + ')', 'gi'), '<span class="highlight">$1</span>');
					tmpItems.push(item);
				}
			}
			
			this.listContainer.update(this.renderItems(tmpItems, this.controller.model.toggleCmd));
		}
		else
		{
			this.listContainer.update(this.renderItems(this.controller.model.items, this.controller.model.toggleCmd));
		}
		
		if (this.filtering)
		{
			this.scroller.mojo.revealTop();
			this.filtering = false;
		}
		
		this.spinner.mojo.stop();
	},

	/** @private */
	_removeSubmenu: function() {
		this.controller.remove();	
	},
	
	/** @private */
	handleCommand: function(event) {
		if(event.type == Mojo.Event.back) {
			this.close();
			Event.stop(event); // 'back' is now handled.
		}
	},
	
	setPopupMaxHeight: function(height) {
		this.popupContent.style.maxHeight = (height - Mojo.View.getBorderWidth(this.popup, 'top') - Mojo.View.getBorderWidth(this.popup, 'bottom')) + 'px';
		this.popup.style.maxHeight = height + 'px';		
	},
	
	handleResizeComplete: function(height) {
		delete this.menuResizeAnimator;
		Mojo.Widget.Scroller.validateScrollPositionForElement(this.popupContent);
	},
	
	/* On orientation change, close the menu. This is easier than trying to figure out where it should
	 * be in the new layout and what the size should be. Matches past behavior as well.
	 */
	orientationChange: function(e) {
		this.close();
	},
	
	/** @private */
	handleResize: function(event) {
		var viewoffset = Element.viewportOffset(this.popup).top;
		var height;
		var details;
		
		if (this.controller.model.popupId === this.kpopupId) {
			if (viewoffset < -2) {
				viewoffset = -2;
			}
		}
		height = this.controller.window.innerHeight -
				(viewoffset || 0);
		
		details = {
			from: parseInt(this.popup.style.maxHeight, 10),
			to: height,
			onComplete: this.handleResizeComplete.bind(this, this.controller.window.innerHeight),
			duration: 0.1
		};
		if(this.menuResizeAnimator) {
			this.menuResizeAnimator.cancel();
		}
		
		if(details.from !== details.to) {
			this.menuResizeAnimator = Mojo.Animation.animateValue(this.animateQueue, 'ease-in-out', this.handleResizeCallback, details);
		}
	},
	
	isFixedPosition: function(el) {
		var targetBody = el.ownerDocument.body;
		while(el && el !== targetBody) {      
			if(Element.getStyle(el, 'position') == 'fixed') {
				return true;
			}
			el=el.parentNode;
		}
		
		return false;
	}
		
});



// tell mojo about our widgets
Mojo.Config.JS_FRAMEWORK_WIDGETS.BetterListSelector = null;
Mojo.Config.JS_FRAMEWORK_WIDGETS.BetterSubmenu = null;

