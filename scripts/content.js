

//Create the 2 grids 
var gridRegular = null;
var gridDiscard = null; //Will be populated after the grid will be created.

var consensusThreshold = 2;
var selfDiscard = false;
var arrDiscarded = [];
var compactToolbar = false;

const CONSENSUS_NO_FEES = 0;
const CONSENSUS_FEES = 1;
const NO_CONSENSUS = null;

const NOT_DISCARDED_NO_STATUS = -3;
const NOT_DISCARDED_OWN_VOTE = -2;
const NOT_DISCARDED_NO_FEES = -1;
const NOT_DISCARDED = 0; 
const DISCARDED_WITH_FEES = 1;
const DISCARDED_OWN_VOTE = 2;


function Grid(obj)
{
	//Private variables
	var pGrid = obj;
	var pArrTile = [];
	
	//Private methods
	function getId(){
		return $(pGrid).attr("id");
	}
	
	//Public methods
	this.getId = function(){
		return getId();
	}
	
	this.getDOM = function(){
		return pGrid;
	};
	
	this.addTile = function(t){
		pArrTile.push(t);
	};
	
	this.removeTile = function(t){
		$.each(pArrTile, function(key, value){
			if(value != undefined && value.getPageId() == t.getPageId()){
				pArrTile.splice(key, 1);
			}
		});
	};
	
	this.getTileCount = function(trueCount=false){
		if(trueCount){
			return $(pGrid).children().length;
		}else{
			return pArrTile.length;
		}
	};
	
	this.getTileId = function(pageId){
		var r = null;
		$.each(pArrTile, function(key, value){
			if(value != undefined && value.getPageId() == pageId){
				r = value;
				return false; //Stop the loop
			}
		});
		return r;
	};
	
}

function Tile(obj, gridInstance){
	
	//private properties
	var pTile = obj;
	var pPageId = findPageId();
	var pGrid = gridInstance;
	pGrid.addTile(this);
	var pToolbar = null;
	
	var pVoteFees = 0;
	var pVoteNoFees = 0;
	var pVoteOwn = null;
	
	//Private method
	function findPageId(){
		let regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.
		let url = $(pTile).find(".a-link-normal").attr("href");
		let arrPageId = url.match(regex);
		return arrPageId[1];
	}
	
	function getFees(){
		if(pVoteFees - pVoteNoFees >= consensusThreshold)
			return CONSENSUS_FEES;
		else if(pVoteNoFees - pVoteFees >= consensusThreshold)
			return CONSENSUS_NO_FEES;
		else
			return NO_CONSENSUS;
	}
	
	//Public methods
	this.setToolbar = function(toolbarInstance){
		pToolbar = toolbarInstance;
	}
	this.getToolbar = function(){
		return pToolbar;
	}
	
	this.setVotes = function(no, yes, own){
		pVoteFees = yes;
		pVoteNoFees = no;
		pVoteOwn = own;
	};
	
	this.getVoteFees = function(){
		return pVoteFees;
	};
	this.getVoteNoFees = function(){
		return pVoteNoFees;
	};
	this.getVoteOwn = function(){
		return pVoteOwn;
	};
	
	this.getFees = function(){
		return getFees();
	};
	
	this.getStatus = function(){
		if(getFees() == CONSENSUS_FEES)
			return DISCARDED_WITH_FEES;
		
		if(pVoteOwn == 1 && selfDiscard)
			return DISCARDED_OWN_VOTE;
		
		if(getFees() == CONSENSUS_NO_FEES)
			return NOT_DISCARDED_NO_FEES;
		
		if(pVoteOwn == 0)
			return NOT_DISCARDED_OWN_VOTE;
		
		return NOT_DISCARDED_NO_STATUS;
	};
	
	this.getPageId = function(){
		return pPageId;
	};
	
	this.getDOM = function(){
		return pTile;
	};
	
	this.getGrid = function(){
		return pGrid;
	};
	
	this.getGridId = function(){
		return pGrid.getId();
	};
	
	this.moveToGrid = async function(g, animate = false){
		//If we are asking to move the tile to the same grid, don't do anything
		if(g.getId() == pGrid.getId())
			return false; 
		
		if(pGrid != null){
			pGrid.removeTile(this);
		}
		pGrid = g;
		pGrid.addTile(this);
		
		if(animate)
			await animateVanish($(pTile)); //Will hide the tile
		
		//console.log( pPageId + ' Will be moved to grid ' + "#" + $(pGrid.getDOM()).attr("id"));
		$(pTile).detach().appendTo("#" + $(pGrid.getDOM()).attr("id"));
		$(pTile).show();
	};
}

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
			.addClass("ext-helper-icon ext-helper-icon-info")
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

function getTileByPageId(pageId){
	tile = null;
	tile = gridRegular.getTileId(pageId);
	if(tile != null)
		return tile;
	
	tile = gridDiscard.getTileId(pageId);
	return tile;
}



//#########################
//### Load settings


const readLocalStorage = async (key) => {
return new Promise((resolve, reject) => {
  chrome.storage.local.get([key], function (result) {
	if (result[key] === undefined) {
	  reject();
	} else {
	  resolve(result[key]);
	}
  });
});
};

async function getSettings(){
	
	await readLocalStorage('settingsThreshold').then(function(result) {if(result > 0 && result <10){
		consensusThreshold = result;
	}}).catch((err) => {});

	await readLocalStorage('settingsSelfDiscard').then(function(result) {if(result == true || result == false){
		selfDiscard = result;
	}}).catch((err) => {});

	await readLocalStorage('settingsCompactToolbar').then(function(result) {if(result == true || result == false){
		compactToolbar = result;
	}}).catch((err) => {});
	
	await readLocalStorage('arrDiscarded').then(function(result) {
		arrDiscarded = result;	
	}).catch((err) => {});
	
	//Load Thorvarium stylesheets
	await readLocalStorage('thorvariumSmallItems').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/small-items.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumRemoveHeader').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-header.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumRemoveFooter').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-footer.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumRemoveAssociateHeader').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-associate-header.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumMoreDescriptionText').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/more-description-text.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumETVModalOnTop').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/etv-modal-on-top.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumCategoriesWithEmojis').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/categories-with-emojis.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumPaginationOnTop').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/pagination-on-top.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumCollapsableCategories').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/collapsable-categories.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumStripedCategories').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/striped-categories.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumLimitedQuantityIcon').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/limited-quantity-icon.css">');
	}}).catch((err) => {});
	await readLocalStorage('thorvariumRFYAFAAITabs').then(function(r){if(r == true){
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/rfy-afa-ai-tabs.css">');
	}}).catch((err) => {});
	
	init(); // Initialize the app
	
	
	discardedItemGarbageCollection();
}
getSettings();


//#########################
//### Utility functions

function toggleDiscardedList(){
	$('#ext-helper-grid').toggle();
	if($('#ext-helper-grid').is(":hidden")){
		$("#ext-helper-grid-collapse-indicator").html("&#11166;");	
	}else{
		$("#ext-helper-grid-collapse-indicator").html("&#11167;");
	}
}

function isHidden(pageId){
	var found = false;
	$.each(arrDiscarded, function(key, value){
		if(value.pageId == pageId){
			found = true;
			return;
		}
	});
	return found;
}

Date.prototype.removeDays = function(days) {
    var date = new Date(this.valueOf());
    date.setDate(date.getDate() - days);
    return date;
}

function discardedItemGarbageCollection(){
	var change = false;
	let expiredDate = new Date();
	expiredDate = expiredDate.removeDays(90);
	
	$.each(arrDiscarded, function(key, value){
		if(key!=undefined && arrDiscarded[key]["date"] < expiredDate){
			arrDiscarded.splice(key, 1);
			change = true;
		}
	});
	
	//Save array to local storage
	if(change){
		chrome.storage.local.set({ "arrDiscarded": arrDiscarded });
	}
}

function removePageIdFromArrDiscarded(pageId){
	$.each(arrDiscarded, function(key, value){
		if(value != undefined && value.pageId == pageId){
			arrDiscarded.splice(key, 1);
		}
	});
}



async function animateVanish(tile){
	let defaultOpacity = $(tile).css("opacity");
	await tile.animate({
		height: "hide",
		opacity: "hide"
	},
	{
		duration: 500,
		complete: function() {
			$(tile).css('opacity', defaultOpacity);
		}
	}).promise(); //Converting the animation to a promise allow for the await clause to work.
}



async function toggleItemVisibility(event){
	
	let pageId = event.data.pageId;
	let tile = getTileByPageId(pageId);
	let gridId = tile.getGridId();
	
	switch (gridId){ //Current Grid
		case "vvp-items-grid":
			arrDiscarded.push({"pageId" : pageId, "date": new Date});
			await tile.moveToGrid(gridDiscard, true);
			break;
		case "ext-helper-grid":
			removePageIdFromArrDiscarded(pageId);
			await tile.moveToGrid(gridRegular, true);
			break;
	}
	tile.getToolbar().updateVisibilityIcon();
	
	//Save the new array
	chrome.storage.local.set({ 'arrDiscarded': arrDiscarded });
	
	//Refresh discard count
	$("#ext-helper-grid-count").text(gridDiscard.getTileCount());
}



//#########################
//### Main flow


//Initiate the extension
function init(){
	
	//Create the Discard grid
	createInterface();

	gridRegular = new Grid($("#vvp-items-grid"));
	gridDiscard = new Grid($("#ext-helper-grid"));

	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	var tile;
	var arrUrl = []; //Will be use to store the URL identifier of the listed products.
	$(".vvp-item-tile").each(function(){
		
		tile = new Tile($(this), gridRegular);
		arrUrl.push(tile.getPageId());
		
		t = new Toolbar(tile);
		t.createProductToolbar();
	});

	//Obtain the data to fill the toolbars with it.
	fetchData(arrUrl);
}

function createInterface(){
	//Clean up interface (in case of the extension being reloaded)
	$("div#discardedItems").remove();
	$(".ext-helper-separator").remove();
	$(".ext-helper-status").remove(); //remove all toolbars
	
	$("<div />")
		.attr("id","discardedItems")
		.insertBefore("#vvp-items-grid");
	$("<br /><hr /><br />")
		.addClass("ext-helper-separator")
		.insertBefore("#vvp-items-grid");
	$("<div />")
		.attr("id", "ext-helper-grid-header")
		.text(" discarded item(s)")
		.appendTo("#discardedItems");
	$("<div />")
		.attr("id", "ext-helper-grid")
		.appendTo("#discardedItems");
	$("<span />")
		.attr("id", "ext-helper-grid-count")
		.prependTo("#ext-helper-grid-header");
	$("<span />")
		.attr("id", "ext-helper-grid-collapse-indicator")
		.prependTo("#ext-helper-grid-header");
	
	$("#ext-helper-grid-header").on('click', {}, toggleDiscardedList);
	toggleDiscardedList(); //Hide at first
}






//Get data from the server about the products listed on this page
function fetchData(arrUrl){
	let arrJSON = {"api_version":2, "arr_url":arrUrl};
	let jsonArrURL = JSON.stringify(arrJSON);
	
	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = "https://www.francoismazerolle.ca/vinehelper_v2.php"
			+ "?data=" + jsonArrURL;
	fetch(url)
		.then((response) => response.json())
		.then(serverResponse)
		.catch( error =>  console.log(error) );
}

//Process the results obtained from the server
//Update each tile with the data pertaining to it.
function serverResponse(data){
	//let arr = $.parseJSON(data); //convert to javascript array
	if(data["api_version"]!=2){
		console.log("Wrong API version");
	}
	
	$.each(data["arr_url"],function(key,values){
		
		let tile = getTileByPageId(key);
		
		if(tile==null)
			console.log("No tile matching " + key);
		
		tile.setVotes(values["v0"], values["v1"], values["s"]);
		
		//Assign the tiles to the proper grid
		if(tile.getStatus() >= NOT_DISCARDED || isHidden(tile.getPageId())){
			tile.moveToGrid(gridDiscard, false); //This is the main sort, do not animate it
		}
		
		tile.getToolbar().updateToolbar();
	});
	
	//Calculate how many tiles were moved to the discarded grid
	$("#ext-helper-grid-count").text(gridDiscard.getTileCount());
}








//A vote button was pressed, send the vote to the server
//If a vote changed the discard status, move the tile accordingly
async function reportfees(event){
	let pageId = event.data.pageId;
	let fees = event.data.fees; // The vote
	let tile = getTileByPageId(pageId);
	
	
	//Note: If the tile is already in the grid, the method will exit with false.
	//Our vote is "Fees" + the self discard option is active: move the item to the Discard grid
	if(fees == 1 && selfDiscard){
		await tile.moveToGrid(gridDiscard, true);
	
	//Our vote is "Fees" + the added vote will meet the consensus: move the item to the Discard grid
	}else if(fees == 1 && tile.getVoteFees() + 1 - tile.getVoteNoFees() >= consensusThreshold){
		await tile.moveToGrid(gridDiscard, true);
	
	//Our vote is "nofees" + there's no consensus, move the item to the regular grid
	}else if(fees == 0 && tile.getVoteFees() - tile.getVoteNoFees() < consensusThreshold){
		await tile.moveToGrid(gridRegular, true);
	}
	
	
	//Send the vote to the server
	let url = "https://francoismazerolle.ca/vinehelperCastVote_v2.php"
		+ '?data={"url":"' + pageId +'","fees":'+ fees +'}';
	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	//Refresh the data for the toolbar of that specific product only
	let arrUrl = [pageId];
	fetchData(arrUrl);
};



