

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
		$("<div />")
			.addClass("ext-helper-icon ext-helper-icon-loading")
			.appendTo("#"+toolbarId + " .ext-helper-status-container");
		container = $("<div />")
			.addClass("ext-helper-status-container2")
			.appendTo("#"+toolbarId + " .ext-helper-status-container");
		span = $("<span />")
			.appendTo(container);
			
		if(compactToolbar){
			pToolbar.addClass("compact");
		}
		
		if(unavailableTab){
			span.text("Loading...");
		}
		
		//Only the hidden tab is activated, only the hide icon has to be shown
		if(!unavailableTab && hiddenTab){
			pToolbar.addClass("toolbar-icon-only");
		}
		
		//Display the hide link
		if(hiddenTab){
			let h, hi;
			h = $("<a />")
				.attr("href", "#"+pTile.getPageId())
				.attr("id", "ext-helper-hide-link-"+pTile.getPageId())
				.addClass("ext-helper-hide-link")
				.attr("onclick", "return false;")
				.appendTo(container);
			hi= $("<div />")
				.addClass("ext-helper-toolbar-icon")
				.appendTo(h);
			h.on('click', {'pageId': pTile.getPageId()}, toggleItemVisibility);
			
			this.updateVisibilityIcon();
		}
	};
	
	this.updateVisibilityIcon = function(){
		if(!hiddenTab)
			return false;
		
		let icon = $("#ext-helper-hide-link-"+pTile.getPageId() + " div.ext-helper-toolbar-icon");
		let gridId = pTile.getGridId();
		
		icon.removeClass("ext-helper-icon-hide");
		icon.removeClass("ext-helper-icon-show");
		switch (gridId){
			case "vvp-items-grid":
			case "tab-discarded":
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
	
	this.updateToolbar = function (){
		let context = $("#ext-helper-toolbar-" + pTile.getPageId());
		let icon = $(context).find(".ext-helper-icon");
		let container = $(context).find("div.ext-helper-status-container2");
		
		
		let tileOpacity;
		let statusText;
		let statusColor;
		
		//If the hidden tab system is activated, update the visibility icon
		if(hiddenTab)
			this.updateVisibilityIcon();
		
		switch (pTile.getStatus()){
			case DISCARDED_WITH_FEES:
			case DISCARDED_OWN_VOTE:
				this.setStatusIcon("ext-helper-icon-sad");
				this.setStatusText("Not available.");
				statusColor = "ext-helper-background-fees";
				tileOpacity = unavailableOpacity/100;
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
		
		if(compactToolbar){ //No icon, no text
			this.setStatusIcon("");
			this.setStatusText("");
			context.addClass("compact");
			context.addClass(statusColor);
		}
		
		tile.getDOM().css('opacity', tileOpacity);
		
		//Display voting system if active.
		if(unavailableTab){
			createVotingWidget();
		}
	}

	//Create the voting widget part of the toolbar
	function createVotingWidget(){
		let context = $("#ext-helper-toolbar-" + pTile.getPageId());
		let container = $(context).find("div.ext-helper-status-container2");
		
		$(container).children(".ext-helper-voting-widget").remove();
		
		let pe; //Parent Element
		let v1, v0; //VoteFees(1), VoteNoFees(0)
		pe = $("<div />")
			.addClass("ext-helper-voting-widget")
			.appendTo(container);
		
		if(!compactToolbar){
			pe.text("Available? ");
		}
		
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
		
		if(compactToolbar){
			v0.html("&#9745; ("+pTile.getVoteNoFees()+")");
			v1.html("&#11199; ("+pTile.getVoteFees()+")")
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
