

var pageId; //Will be used to store the current pageId within the each loop.
var arrUrl = []; //Will be use to store the URL identifier of the listed products.
const regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.


//Load settings
var consensusThreshold = 2;
var selfDiscard = false;
var arrDiscarded = [];
var compactToolbar = false;

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
	
	await readLocalStorage('settingsThreshold')
		.then(function(result) {
			if(result > 0 && result <10){
				consensusThreshold = result;
			}
		})
		.catch((err) => {
			//Can't retreive the key, probably non-existent
		});

	await readLocalStorage('settingsSelfDiscard')
		.then(function(result) {
			if(result == true || result == false){
				selfDiscard = result;
			}
		})
		.catch((err) => {
			//Can't retreive the key, probably non-existent
		});

	await readLocalStorage('settingsCompactToolbar')
		.then(function(result) {
			if(result == true || result == false){
				compactToolbar = result;
			}
		})
		.catch((err) => {
			//Can't retreive the key, probably non-existent
		});
	
	
	await readLocalStorage('arrDiscarded')
		.then(function(result) {
			arrDiscarded = result;	
		})
		.catch((err) => {
			//Can't retreive the key, probably non-existent
		});
	
	
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

function isDiscarded(pageId){
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

function refreshDiscardCount(){
	$("#ext-helper-grid-count").text($("#ext-helper-grid").children().length);
}

function getTileGridId(pageId){
	let grid = $("#ext-helper-toolbar-" + pageId).parents().filter(function() {
		return $(this).css('display').toLowerCase().indexOf('grid') > -1
	})
	if(grid.length>0)
		return $(grid[0]).attr('id');
	return false;
}

async function moveProductTileToGrid(pageId, gridSelector, animate=false){
	let tile = $("#ext-helper-toolbar-" + pageId).parents(".vvp-item-tile");
	
	if(animate)
		await animateVanish(tile); //Will hide the tile
	
	$(tile).detach().appendTo(gridSelector);
	$(tile).show();
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

function setVisibilityIcon(pageId, gridId){
	let icon = $("#ext-helper-hide-link-"+pageId + " div.ext-helper-toolbar-icon");
	
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
}

async function toggleItemVisibility(event){
	
	let pageId = event.data.pageId;
	let gridId = getTileGridId(pageId);
	
	switch (gridId){ //Current Grid
		case "vvp-items-grid":
			arrDiscarded.push({"pageId" : pageId, "date": new Date});
			await moveProductTileToGrid(pageId, "#ext-helper-grid", true);
			setVisibilityIcon(pageId, "ext-helper-grid");
			break;
		case "ext-helper-grid":
			removePageIdFromArrDiscarded(pageId);
			await moveProductTileToGrid(pageId, "#vvp-items-grid", true);
			setVisibilityIcon(pageId, "vvp-items-grid");
			break;
	}
	
	//Save the new array
	chrome.storage.local.set({ 'arrDiscarded': arrDiscarded });
	refreshDiscardCount();
}



//#########################
//### Main flow


//Initiate the extension
function init(){
	
	//Create the Discard grid
	createInterface();

	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	$(".vvp-item-tile-content").each(function(){
		
		let url = $(this).find(".a-link-normal").attr("href");
		let arrPageId = url.match(regex);
		pageId = arrPageId[1];
		arrUrl.push(pageId);

		createProductToolbar(this, pageId);
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
	
	$("#ext-helper-grid-header").bind('click', {}, toggleDiscardedList);
	toggleDiscardedList(); //Hide at first
}


function createProductToolbar(attachTo, pageId){
	let toolbarId = "ext-helper-toolbar-" + pageId;
	let context = $("<div />")
		.attr("id",toolbarId)
		.addClass("ext-helper-status")
		.prependTo(attachTo);
	$("<div />")
		.addClass("ext-helper-status-container")
		.appendTo("#"+toolbarId);
	$("<div />")
		.addClass("ext-helper-icon ext-helper-icon-info")
		.appendTo("#"+toolbarId + " .ext-helper-status-container");
	$("<div />")
		.addClass("ext-helper-status-container2")
		.text("Loading...")
		.appendTo("#"+toolbarId + " .ext-helper-status-container");
	
	if(compactToolbar){
		context.addClass("compact");
	}
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

function serverResponse(data){
	//let arr = $.parseJSON(data); //convert to javascript array
	let gridId; //Default gridId
	
	if(data["api_version"]!=2){
		console.log("Wrong API version");
	}
	
	$.each(data["arr_url"],function(key,values){
		gridId = "vvp-items-grid"; //Default gridId
		showVisibilityIcon = true;
		
		//If there is a consensus of a fee for the product, move it to the discarded grid
		if(values["v1"] - values["v0"] >= consensusThreshold){
			moveProductTileToGrid(key, '#ext-helper-grid', false); //This is the main sort, do not animate it
			gridId = "ext-helper-grid";
			showVisibilityIcon = false;
		}else{
			//We voted "fees" + self discard option is on: move the item on the discard grid
			if(values["s"] == 1 && selfDiscard == true){
				moveProductTileToGrid(key, '#ext-helper-grid', false); //This is the main sort, do not animate it
				gridId = "ext-helper-grid";
				showVisibilityIcon = false;
			} else {
				//We marked the item to be hidden.
				if(isDiscarded(key)){
					moveProductTileToGrid(key, '#ext-helper-grid', false); //This is the main sort, do not animate it
					gridId = "ext-helper-grid";
				}
			}
		}
				
		//Update the toolbar with the information received
		updateToolBar(key, values, gridId, showVisibilityIcon);
	});
	
	//Calculate how many tiles were moved to the discarded grid
	refreshDiscardCount();
}

function updateToolBar(pageId, arrValues, gridId, showVisibilityIcon){
	let context = $("#ext-helper-toolbar-" + pageId);
	let icon = $(context).find(".ext-helper-icon");
	let container = $(context).find("div.ext-helper-status-container2");
	
	let fees = arrValues["f"];
	let voteUser = arrValues["s"];
	let votesFees = arrValues["v1"];
	let votesNoFees = arrValues["v0"];
	
	//Remove all images for the icon
	icon.removeClass("ext-helper-icon-info");
	icon.removeClass("ext-helper-icon-sad");
	icon.removeClass("ext-helper-icon-happy");
	
	let tileOpacity;
	let statusText;
	let statusIcon;
	let statusColor;
	if(fees==1 || (fees==null && voteUser==1)){
		//The item has fees
		statusIcon = "ext-helper-icon-sad";
		statusColor = "ext-helper-background-fees";
		statusText = "Import fees reported";
		tileOpacity = 0.3;
	}else if(fees==0 || (fees==null && voteUser==0)){
		//The item does not have fees
		statusIcon = "ext-helper-icon-happy";
		statusColor = "ext-helper-background-nofees";
		statusText = "No import fees!";
		tileOpacity = 1.0;
	}else if(fees==null){
		//The item is not registered or needs more votes
		statusIcon = "ext-helper-icon-info";
		statusColor = "ext-helper-background-neutral";
		statusText = "Not enough data :-/";
		tileOpacity = 1.0;
	}
	
	if(compactToolbar){ //No icon, no text
		statusIcon = "";
		statusText = "";
		context.addClass(statusColor);
		context.addClass("compact");
	}
	
	$(context).parent(".vvp-item-tile-content").css('opacity', tileOpacity);
	icon.addClass(statusIcon);
	container.text(statusText);
	
	//Add the show/hide icon
	if(showVisibilityIcon){
		h = $("<a />")
			.attr("href", "#"+pageId)
			.attr("id", "ext-helper-hide-link-"+pageId)
			.addClass("ext-helper-hide-link")
			.attr("onclick", "return false;")
			.appendTo(container);
		hi= $("<div />")
			.addClass("ext-helper-toolbar-icon")
			.appendTo(h);
		
		h.on('click', {'pageId': pageId}, toggleItemVisibility);
		setVisibilityIcon(pageId, gridId);
	}
	
	createVotingWidget(pageId, votesFees, votesNoFees, voteUser);
}



function createVotingWidget(pageId, votesFees, votesNoFees, voteUser){
	let context = $("#ext-helper-toolbar-" + pageId);
	let container = $(context).find("div.ext-helper-status-container2");
	
	let pe; //Parent Element
	let v1, v0; //VoteFees(1), VoteNoFees(0)
	pe = $("<div />").appendTo(container);
	if(!compactToolbar){
		pe.text("Any fees?");
	}
	v1 = $("<a />")
		.attr("href", "#" + pageId)
		.attr("id", "ext-helper-reportlink-"+pageId+"-yes")
		.addClass("ext-helper-reportlink-bad")
		.attr("onclick", "return false;")
		.html("&#11199; Yes ("+votesFees+")")
		.appendTo(pe);
	$("<span />")
		.text(" / ")
		.appendTo(pe);
	v0 = $("<a />")
		.attr("href", "#" + pageId)
		.attr("id", "ext-helper-reportlink-"+pageId+"-no")
		.addClass("ext-helper-reportlink-good")
		.attr("onclick", "return false;")
		.html("&#9745; No ("+votesNoFees+")")
		.appendTo(pe);
	
	
	v1.on('click', {'pageId': pageId, 'fees': 1, 'v1': votesFees, 'v0':votesNoFees}, reportfees);
	v0.on('click', {'pageId': pageId, 'fees': 0, 'v1': votesFees, 'v0':votesNoFees}, reportfees);

	//Make the widget transparent if the user voted "no fees"
	//Note: If we voted "fees", the entire card will be transparent.
	//      If we have not voted, we want the option to remain visible.
	pe.css('opacity', (voteUser == 0) ? 0.4 : 1.0); 
	
	if(voteUser == 1){
		v1.addClass("selectedVote");
	}
	if(voteUser == 0){
		v0.addClass("selectedVote");
	}
}


//A vote button was pressed
async function reportfees(event){
	let pageId = event.data.pageId;
	let fees = event.data.fees;
	let votesFees = event.data.v1;
	let votesNoFees = event.data.v0;
	
	
	let grid = null;
	
	//Our vote "Fees"
	if(fees == 1){
		// + the self discard option is active: move the item to the Discard grid
		// or
		// + the added vote will meet the consensus: move the item to the Discard grid
		if(
			selfDiscard
			||
			votesFees + 1 - votesNoFees >= consensusThreshold
		){
			if(getTileGridId(pageId) == "vvp-items-grid"){ //Item is located in the regular grid, but should not
				await moveProductTileToGrid(pageId, "#ext-helper-grid", true);
			}
		}
	}
	
	//Our vote is "nofees" + there's no consensus, yet the item is still in the Discard Grid: move the item to the regular grid
	if(fees == 0 && votesFees - votesNoFees < consensusThreshold){
		if(getTileGridId(pageId) == "ext-helper-grid"){ //Item is located in the discard grid, but should not
			await moveProductTileToGrid(pageId, '#vvp-items-grid', true);
		}
	}
	
	let url = "https://francoismazerolle.ca/vinehelperCastVote_v2.php"
		+ '?data={"url":"' + pageId +'","fees":'+ fees +'}';
	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	let arrUrl = [pageId];
	fetchData(arrUrl); //Refresh the toolbar for that specific product only
};



