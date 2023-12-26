

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
		$("<span />")
			.text("Loading...")
			.appendTo(container);
			
		if(compactToolbar){
			pToolbar.addClass("compact");
		}
		
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
		
	};
	
	function setVisibilityIcon(show){
		if(show){
			$("#ext-helper-hide-link-"+pTile.getPageId()).show();
		}else{
			$("#ext-helper-hide-link-"+pTile.getPageId()).hide();
		}
	};
	
	this.updateVisibilityIcon = function(){
		let icon = $("#ext-helper-hide-link-"+tile.getPageId() + " div.ext-helper-toolbar-icon");
		let gridId = pTile.getGridId();
		
		icon.removeClass("ext-helper-icon-hide");
		icon.removeClass("ext-helper-icon-show");
		switch (gridId){
			case "vvp-items-grid":
				icon.addClass("ext-helper-icon-hide");
				break;
			case "ext-helper-grid":
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
		
		
		//Remove all images for the icon
		icon.removeClass("ext-helper-icon-info");
		icon.removeClass("ext-helper-icon-sad");
		icon.removeClass("ext-helper-icon-happy");
		
		let tileOpacity;
		let statusText;
		let statusIcon;
		let statusColor;
		
		setVisibilityIcon(true);
		this.updateVisibilityIcon();
		switch (pTile.getStatus()){
			case DISCARDED_WITH_FEES:
			case DISCARDED_OWN_VOTE:
				statusIcon = "ext-helper-icon-sad";
				statusColor = "ext-helper-background-fees";
				statusText = "Import fees reported";
				tileOpacity = 0.3;
				setVisibilityIcon(false);
				break;
			case NOT_DISCARDED_NO_FEES:
			case NOT_DISCARDED_OWN_VOTE:
				statusIcon = "ext-helper-icon-happy";
				statusColor = "ext-helper-background-nofees";
				statusText = "No import fees!";
				tileOpacity = 1.0;
				break;
			case NOT_DISCARDED_NO_STATUS:
				//The item is not registered or needs more votes
				statusIcon = "ext-helper-icon-info";
				statusColor = "ext-helper-background-neutral";
				statusText = "Not enough data :-/";
				tileOpacity = 1.0;
				break;
		}
		
		if(compactToolbar){ //No icon, no text
			statusIcon = "";
			statusText = "";
			context.addClass(statusColor);
			context.addClass("compact");
		}
		
		tile.getDOM().css('opacity', tileOpacity);
		icon.addClass(statusIcon);
		container.children("span").text(statusText);
		
		createVotingWidget();
		
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
			pe.text("Any fees?");
		}
		v1 = $("<a />")
			.attr("href", "#" + pTile.getPageId())
			.attr("id", "ext-helper-reportlink-"+pTile.getPageId()+"-yes")
			.addClass("ext-helper-reportlink-bad")
			.attr("onclick", "return false;")
			.html("&#11199; Yes ("+pTile.getVoteFees()+")")
			.appendTo(pe);
		$("<span />")
			.text(" / ")
			.appendTo(pe);
		v0 = $("<a />")
			.attr("href", "#" + pTile.getPageId())
			.attr("id", "ext-helper-reportlink-"+pTile.getPageId()+"-no")
			.addClass("ext-helper-reportlink-good")
			.attr("onclick", "return false;")
			.html("&#9745; No ("+pTile.getVoteNoFees()+")")
			.appendTo(pe);
		
		
		v1.on('click', {'pageId': pTile.getPageId(), 'fees': 1}, reportfees);
		v0.on('click', {'pageId': pTile.getPageId(), 'fees': 0}, reportfees);

		//Make the widget transparent if the user voted "no fees"
		//Note: If we voted "fees", the entire card will be transparent.
		//      If we have not voted, we want the option to remain visible.
		pe.css('opacity', (pTile.getVoteOwn() == 0) ? 0.4 : 1.0); 
		
		if(pTile.getVoteOwn() == 1){
			v1.addClass("selectedVote");
		}
		if(pTile.getVoteOwn() == 0){
			v0.addClass("selectedVote");
		}
	}
	
}
