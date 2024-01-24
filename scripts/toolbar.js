

function Toolbar(tileInstance){
	var pToolbar = null;
	var pTile = tileInstance;
	pTile.setToolbar(this);
	
	//Create the bare bone structure of the toolbar
	this.createProductToolbar = async function (){
		let toolbarId = "ext-helper-toolbar-" + pTile.getAsin();
		let anchorTo = $(pTile.getDOM()).children(".vvp-item-tile-content");
		
		//Load the toolbar template
		let tpl = new Template();
		await tpl.loadFile(chrome.runtime.getURL("view/toolbar.html"));
		tpl.setVar("toolbarId", toolbarId);
		tpl.setVar("asin", pTile.getAsin());
		tpl.setIf("announce", appSettings.discord.active && appSettings.discord.guid != null && vineQueue != null);
		tpl.setIf("toggleview", appSettings.hiddenTab.active);
		let content = tpl.render();
		
		pToolbar = $(content).prependTo(anchorTo);
		let container = $("#" + toolbarId + " .ext-helper-status-container2");
		$("#" + toolbarId + " .ext-helper-toolbar-etv").hide();
		
		
		//Activate the announce button
		container.find(".etv").on("change", {'asin': pTile.getAsin()}, function(event){
			if($(this).text()=="")
				return false;
			
			let tile = getTileByAsin(event.data.asin);
			$(tile.getDOM()).find(".ext-helper-icon-announcement")
				.css("opacity", "1")
				.parent("a")
					.off("click")
					.on("click", {'asin': pTile.getAsin()}, announceItem);
		});
			
		if(appSettings.thorvarium.smallItems){
			$(".ext-helper-icon-etv").hide();
		}
		
		
		if(appSettings.unavailableTab.compactToolbar){
			pToolbar.addClass("compact");
		}
		
		if(appSettings.unavailableTab.active){
			$("<div />")
				.addClass("ext-helper-icon ext-helper-icon-loading")
				.prependTo("#"+toolbarId + " .ext-helper-status-container");
		}
		
		//If the voting system is off, only the icons have to be shown
		if(!appSettings.unavailableTab.active){
			pToolbar.addClass("toolbar-icon-only");
		}
		
		//Display the hide link
		if(appSettings.hiddenTab.active){
			h = $("#ext-helper-hide-link-"+pTile.getAsin());
			h.on('click', {'asin': pTile.getAsin()}, async function (event){//A hide/display item button was pressed
				let asin = event.data.asin;
				let tile = getTileByAsin(asin);
				let gridId = tile.getGridId();
				
				switch (gridId){ //Current Grid
					case "vvp-items-grid":
					case "tab-unavailable":
						tile.hideTile();
						break;
					case "tab-hidden":
						tile.showTile();
						break;
				}
				
				updateTileCounts();
			});
			
			this.updateVisibilityIcon();
		}
		
		
		showRuntime("Toolbar created");
	};
	
	this.updateVisibilityIcon = function(){
		if(!appSettings.hiddenTab.active)
			return false;
		
		let icon = $("#ext-helper-hide-link-"+pTile.getAsin() + " div.ext-helper-toolbar-icon");
		let gridId = pTile.getGridId();
		
		icon.removeClass("ext-helper-icon-hide");
		icon.removeClass("ext-helper-icon-show");
		switch (gridId){
			case "vvp-items-grid":
			case "tab-unavailable":
				icon.addClass("ext-helper-icon-hide");
				break;
			case "tab-hidden":
				icon.addClass("ext-helper-icon-show");
				break;
		}
	};
	
	this.setStatusIcon = function(iconClass){
		let context = $("#ext-helper-toolbar-" + pTile.getAsin());
		let icon = $(context).find(".ext-helper-icon");
		
		//Remove all images for the icon
		icon.removeClass("ext-helper-icon-info");
		icon.removeClass("ext-helper-icon-sad");
		icon.removeClass("ext-helper-icon-happy");
		icon.removeClass("ext-helper-icon-loading");
		icon.removeClass("ext-helper-icon-order-success");
		icon.removeClass("ext-helper-icon-order-failed");
		
		icon.addClass(iconClass);
	};
	
	this.setETV = function(etv, onlyIfEmpty=false){
		let context = $("#ext-helper-toolbar-" + pTile.getAsin());
		let span = $(context).find(".ext-helper-toolbar-etv .etv");
		
		if(onlyIfEmpty && span.text()!="")
			return false;
		
		
		span.text(etv);
		span.trigger("change");
		
		if(appSettings.general.displayETV)
			context.find(".ext-helper-toolbar-etv").show();
	}
	
	//This method is called from bootloader.js, serverResponse() when the voting data has been received, after the tile was moved.
	this.updateToolbar = function (){
		let context = $("#ext-helper-toolbar-" + pTile.getAsin());
		let icon = $(context).find(".ext-helper-icon");
		let container = $(context).find("div.ext-helper-status-container2");
		
		let tileOpacity;
		let statusText;
		let statusColor;
		
		//If the hidden tab system is activated, update the visibility icon
		if(appSettings.hiddenTab.active)
			this.updateVisibilityIcon();
			
		//Set the icons
		switch (pTile.getStatus()){
			case DISCARDED_ORDER_FAILED:
				this.setStatusIcon("ext-helper-icon-order-failed");
				break;
			case DISCARDED_WITH_FEES:
			case DISCARDED_OWN_VOTE:
				this.setStatusIcon("ext-helper-icon-sad");
				break;
			case NOT_DISCARDED_ORDER_SUCCESS:
				this.setStatusIcon("ext-helper-icon-order-success");
				break;
			case NOT_DISCARDED_NO_FEES:
			case NOT_DISCARDED_OWN_VOTE:
				this.setStatusIcon("ext-helper-icon-happy");
				break;
			case NOT_DISCARDED_NO_STATUS:
				//The item is not registered or needs more votes
				this.setStatusIcon("ext-helper-icon-info");
				break;
		}
		
		//Set other properties
		switch (pTile.getStatus()){
			case DISCARDED_ORDER_FAILED:
			case DISCARDED_WITH_FEES:
			case DISCARDED_OWN_VOTE:
				statusColor = "ext-helper-background-fees";
				tileOpacity = appSettings.unavailableTab.unavailableOpacity/100;
				
				if(appSettings.discord.active)
					$("#ext-helper-announce-link-"+pTile.getAsin()).hide();
				break;
			case NOT_DISCARDED_ORDER_SUCCESS:
			case NOT_DISCARDED_NO_FEES:
			case NOT_DISCARDED_OWN_VOTE:
				statusColor = "ext-helper-background-nofees";
				tileOpacity = 1.0;
				break;
			case NOT_DISCARDED_NO_STATUS:
				//The item is not registered or needs more votes
				statusColor = "ext-helper-background-neutral";
				tileOpacity = 1.0;
				break;
		}
		
		if(appSettings.unavailableTab.compactToolbar){ //No icon, no text
			this.setStatusIcon("");
			context.addClass("compact");
			context.addClass(statusColor);
		}
		
		tile.getDOM().css('opacity', tileOpacity);
		
		//Display voting system if active.
		if(appSettings.unavailableTab.active){
			if(tile.wasOrdered()){
				createOrderWidget();
			}else{
				createVotingWidget();
			}
		}
	}

	//Create the voting widget part of the toolbar
	function createVotingWidget(){
		let context = $("#ext-helper-toolbar-" + pTile.getAsin());
		let container = $(context).find("div.ext-helper-status-container2");
		
		//Remove any previous voting widget, we will create a new one.
		$(container).children(".ext-helper-order-widget").remove();
		$(container).children(".ext-helper-voting-widget").remove();
		
		let pe; //Parent Element
		let v1, v0; //VoteFees(1), VoteNoFees(0)
		pe = $("<div />")
			.addClass("ext-helper-voting-widget")
			.text("")
			.appendTo(container);
		v0 = $("<a />")
			.attr("href", "#" + pTile.getAsin())
			.attr("id", "ext-helper-reportlink-"+pTile.getAsin()+"-no")
			.addClass("ext-helper-reportlink-good")
			.attr("onclick", "return false;")
			.html("&#9745; Yes ("+pTile.getVoteNoFees()+")")
			.appendTo(pe);
		$("<span />")
			.text(" / ")
			.appendTo(pe);
		v1 = $("<a />")
			.attr("href", "#" + pTile.getAsin())
			.attr("id", "ext-helper-reportlink-"+pTile.getAsin()+"-yes")
			.addClass("ext-helper-reportlink-bad")
			.attr("onclick", "return false;")
			.html("&#11199; No ("+pTile.getVoteFees()+")")
			.appendTo(pe);
		
		if(appSettings.thorvarium.smallItems){
			$(".compact div.ext-helper-voting-widget").css("clear", "both");
		}
		
		if(appSettings.unavailableTab.compactToolbar){
			//Make the content of the toolbar as compact as possible
			v0.html("&#9745; ("+pTile.getVoteNoFees()+")");
			v1.html("&#11199; ("+pTile.getVoteFees()+")")
		}else{
			pe.prepend("Available? ");
		}
		
		v1.on('click', {'asin': pTile.getAsin(), 'fees': 1}, reportfees);
		v0.on('click', {'asin': pTile.getAsin(), 'fees': 0}, reportfees);

		//Make the widget transparent if the user voted "no fees"
		//Note: If we voted "fees", the entire card will be transparent.
		//      If we have not voted, we want the option to remain visible.
		pe.css('opacity', (pTile.getVoteOwn() != null) ? 0.4 : 1.0); 
		
		if(pTile.getVoteOwn() == 1){
			v1.addClass("selectedVote");
		}
		if(pTile.getVoteOwn() == 0){
			v0.addClass("selectedVote");
		}
	}
	
	
	//Create the order widget part of the toolbar
	function createOrderWidget(){
		let context = $("#ext-helper-toolbar-" + pTile.getAsin());
		let container = $(context).find("div.ext-helper-status-container2");
		
		//Remove any previous order widget, we will create a new one.
		$(container).children(".ext-helper-order-widget").remove();
		$(container).children(".ext-helper-voting-widget").remove();
		
		let pe; //Parent Element
		let oS, oF; //VoteFees(1), VoteNoFees(0)
		pe = $("<div />")
			.addClass("ext-helper-order-widget")
			.text("")
			.appendTo(container);
		oS = $("<span>")
			.html("<div class='ext-helper-toolbar-large-icon ext-helper-icon-order-success'></div>" + pTile.getOrderSuccess())
			.appendTo(pe);
		$("<span />")
			.html("&nbsp;&nbsp;&nbsp;")
			.appendTo(pe);
		oF = $("<span>")
			.html("<div class='ext-helper-toolbar-large-icon ext-helper-icon-order-failed'></div>" + pTile.getOrderFailed())
			.appendTo(pe);
		
		if(appSettings.thorvarium.smallItems){
			$(".compact div.ext-helper-order-widget").css("clear", "both");
		}
		
	}
}


async function announceItem(event){
	
	let tile = getTileByAsin(event.data.asin);
	let etv = $(tile.getDOM()).find(".etv").text();
	
	//In case of price range, only send the highest value.
	etv = etv.split("-").pop();
	
	if(!confirm("Send this product to Brenda over on discord?"))
		return false;
	
	
	//Post a fetch request to the Brenda API from the AmazonVine Discord server
	//We want to check if the guid is valid.
	let url = "https://api.llamastories.com/brenda/product";
	var details = {
		'version': 1,
		'token': appSettings.discord.guid,
		'domain': "amazon."+vineDomain,
		'tab': vineQueue,
		'asin': event.data.asin,
		'etv': etv
		//'comment': prompt("(Optional) Comment:")
	};
	
	const response = await fetch(
		url,
		{
			method: "PUT",
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(details)
		}
	);
	if(response.status == 200){
		alert("Announce successful! Brenda still need to process it...");
	}else if(response.status == 401){
		alert("API Token invalid, please go in the extension settings to correct it.");
	}else if(response.status == 422){
		alert("Unprocessable entity. The request was malformed and rejected.");
	}else if(response.status == 429){
		alert("Too many announce. Please wait longer between each of them.");
	}else{
		alert("The announce has failed for an unknown reason.");
	}
	
	//Visually deactivate this item, will be reset on the next page load, but it's just to help navigation and avoid double-clicking
	$(this).off( "click" );
	$(this).css("opacity", "0.3");
}


