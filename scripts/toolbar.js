

function Toolbar(tileInstance){
	var pToolbar = null;
	var pTile = tileInstance;
	pTile.setToolbar(this);
	
	//Create the bare bone structure of the toolbar
	this.createProductToolbar = function (){
		let toolbarId = "ext-helper-toolbar-" + pTile.getPageId();
		let anchorTo = $(pTile.getDOM()).children(".vvp-item-tile-content");
		pToolbar = $("<div />")
			.attr("id",toolbarId)
			.addClass("ext-helper-status")
			.prependTo(anchorTo);
		$("<div />")
			.addClass("ext-helper-status-container")
			.appendTo("#"+toolbarId);
		container = $("<div />")
			.addClass("ext-helper-status-container2")
			.appendTo("#"+toolbarId + " .ext-helper-status-container");
		
			
		if(appSettings.unavailableTab.compactToolbar){
			pToolbar.addClass("compact");
		}
		
		if(appSettings.unavailableTab.active){
			$("<div />")
				.addClass("ext-helper-icon ext-helper-icon-loading")
				.prependTo("#"+toolbarId + " .ext-helper-status-container");
			span = $("<span />")
				.text("Loading...")
				.appendTo(container);
		}
		
		//Only the hidden tab is activated, only the hide icon has to be shown
		if(!appSettings.unavailableTab.active && appSettings.hiddenTab.active){
			pToolbar.addClass("toolbar-icon-only");
		}
		
		//Display the hide link
		if(appSettings.hiddenTab.active){
			let h, hi;
			h = $("<a />")
				.attr("href", "#"+pTile.getPageId())
				.attr("id", "ext-helper-hide-link-"+pTile.getPageId())
				.addClass("ext-helper-floating-icon")
				.attr("onclick", "return false;")
				.appendTo(container);
			hi= $("<div />")
				.addClass("ext-helper-toolbar-icon")
				.appendTo(h);
			h.on('click', {'pageId': pTile.getPageId()}, toggleItemVisibility);
			
			this.updateVisibilityIcon();
		}
		
		//Display the announce link
		if(appSettings.discord.active && appSettings.discord.guid != null){
			let h, hi;
			h = $("<a />")
				.attr("href", "#"+pTile.getPageId())
				.attr("id", "ext-helper-announce-link-"+pTile.getPageId())
				.addClass("ext-helper-floating-icon")
				.attr("onclick", "return false;")
				.appendTo(container);
			hi= $("<div />")
				.addClass("ext-helper-toolbar-icon")
				.addClass("ext-helper-icon-announcement")
				.appendTo(h);
			h.on('click', {'pageId': pTile.getPageId()}, async function(event){
				
				//Post a fetch request to the Brenda API from the AmazonVine Discord server
				//We want to check if the guid is valid.
				let url = "https://api.llamastories.com/brenda/product";
				var details = {
					'version': 1,
					'token': appSettings.discord.guid,
					'domain': "amazon."+vineDomain,
					'tab': vineQueue,
					'asin': event.data.pageId
					//'etv': '0.00',
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
					alert("Announce successful!");
				}else if(response.status == 401){
					alert("API Token invalid, please go in the extension settings to correct it.");
				}else if(response.status == 422){
					alert("Unprocessable entity. The request was malformed and rejected.");
				}else if(response.status == 429){
					alert("Too many announce. Please wait longer between each of them.");
				}else{
					alert("The announce has failed for an unknown reason.");
				}
			});
		}
	};
	
	this.updateVisibilityIcon = function(){
		if(!appSettings.hiddenTab.active)
			return false;
		
		let icon = $("#ext-helper-hide-link-"+pTile.getPageId() + " div.ext-helper-toolbar-icon");
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

	this.setStatusText = function(statusText){
		let context = $("#ext-helper-toolbar-" + pTile.getPageId());
		let container = $(context).find("div.ext-helper-status-container2");
		container.children("span").text(statusText);
	};
	this.setStatusIcon = function(iconClass){
		let context = $("#ext-helper-toolbar-" + pTile.getPageId());
		let icon = $(context).find(".ext-helper-icon");
		
		//Remove all images for the icon
		icon.removeClass("ext-helper-icon-info");
		icon.removeClass("ext-helper-icon-sad");
		icon.removeClass("ext-helper-icon-happy");
		icon.removeClass("ext-helper-icon-loading");
		
		icon.addClass(iconClass);
	};
	
	//This method is called from bootloader.js, serverResponse() when the voting data has been received, after the tile was moved.
	this.updateToolbar = function (){
		let context = $("#ext-helper-toolbar-" + pTile.getPageId());
		let icon = $(context).find(".ext-helper-icon");
		let container = $(context).find("div.ext-helper-status-container2");
		
		let tileOpacity;
		let statusText;
		let statusColor;
		
		//If the hidden tab system is activated, update the visibility icon
		if(appSettings.hiddenTab.active)
			this.updateVisibilityIcon();
			
		switch (pTile.getStatus()){
			case DISCARDED_WITH_FEES:
			case DISCARDED_OWN_VOTE:
				this.setStatusIcon("ext-helper-icon-sad");
				this.setStatusText("Not available.");
				statusColor = "ext-helper-background-fees";
				tileOpacity = appSettings.unavailableTab.unavailableOpacity/100;
				
				if(appSettings.discord.active)
					$("#ext-helper-announce-link-"+pTile.getPageId()).hide();
				
				break;
			case NOT_DISCARDED_NO_FEES:
			case NOT_DISCARDED_OWN_VOTE:
				this.setStatusIcon("ext-helper-icon-happy");
				this.setStatusText("Available!");
				statusColor = "ext-helper-background-nofees";
				tileOpacity = 1.0;
				break;
			case NOT_DISCARDED_NO_STATUS:
				//The item is not registered or needs more votes
				this.setStatusIcon("ext-helper-icon-info");
				this.setStatusText("Not enough data :-/");
				statusColor = "ext-helper-background-neutral";
				tileOpacity = 1.0;
				break;
		}
		
		if(appSettings.unavailableTab.compactToolbar){ //No icon, no text
			this.setStatusIcon("");
			this.setStatusText("");
			context.addClass("compact");
			context.addClass(statusColor);
		}
		
		tile.getDOM().css('opacity', tileOpacity);
		
		//Display voting system if active.
		if(appSettings.unavailableTab.active){
			createVotingWidget();
		}
	}

	//Create the voting widget part of the toolbar
	function createVotingWidget(){
		let context = $("#ext-helper-toolbar-" + pTile.getPageId());
		let container = $(context).find("div.ext-helper-status-container2");
		
		//Remove any previous voting widget, we will create a new one.
		$(container).children(".ext-helper-voting-widget").remove();
		
		let pe; //Parent Element
		let v1, v0; //VoteFees(1), VoteNoFees(0)
		pe = $("<div />")
			.addClass("ext-helper-voting-widget")
			.text("")
			.appendTo(container);
		v0 = $("<a />")
			.attr("href", "#" + pTile.getPageId())
			.attr("id", "ext-helper-reportlink-"+pTile.getPageId()+"-no")
			.addClass("ext-helper-reportlink-good")
			.attr("onclick", "return false;")
			.html("&#9745; Yes ("+pTile.getVoteNoFees()+")")
			.appendTo(pe);
		$("<span />")
			.text(" / ")
			.appendTo(pe);
		v1 = $("<a />")
			.attr("href", "#" + pTile.getPageId())
			.attr("id", "ext-helper-reportlink-"+pTile.getPageId()+"-yes")
			.addClass("ext-helper-reportlink-bad")
			.attr("onclick", "return false;")
			.html("&#11199; No ("+pTile.getVoteFees()+")")
			.appendTo(pe);
		
		if(appSettings.unavailableTab.compactToolbar){
			//Make the content of the toolbar as compact as possible
			v0.html("&#9745; ("+pTile.getVoteNoFees()+")");
			v1.html("&#11199; ("+pTile.getVoteFees()+")")
		}else{
			//If we used the regular toolbar, we need to add a clear:right so the voting widget will not be impeded by the right floated hidden icon.
			$(".ext-helper-voting-widget").css("clear", "right");
			pe.prepend("Available? ");
		}
		
		v1.on('click', {'pageId': pTile.getPageId(), 'fees': 1}, reportfees);
		v0.on('click', {'pageId': pTile.getPageId(), 'fees': 0}, reportfees);

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
	
}
