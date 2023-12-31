

//Create the 2 grids 
var gridRegular = null;
var gridUnavailable = null; //Will be populated after the grid will be created.
var gridHidden = null; //Will be populated after the grid will be created.

//Inject the script to fix the infinite loading wheel into the main environment.
var scriptTag = document.createElement('script');

//Extension settings
var consensusThreshold = 2;
var consensusDiscard= true;
var unavailableOpacity = 100;
var selfDiscard = false;
var topPagination = false;
var unavailableTab = true;
var hiddenTab = true;
var arrHidden = [];
var compactToolbar = false;
var autofixInfiniteWheel = true;

//Constants
const CONSENSUS_NO_FEES = 0;
const CONSENSUS_FEES = 1;
const NO_CONSENSUS = null;

const NOT_DISCARDED_NO_STATUS = -3;
const NOT_DISCARDED_OWN_VOTE = -2;
const NOT_DISCARDED_NO_FEES = -1;
const NOT_DISCARDED = 0; 
const DISCARDED_WITH_FEES = 1;
const DISCARDED_OWN_VOTE = 2;







//#########################
//### Load settings

//Copy/pasted voodoo code
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

//Making the voodoo code usable
async function getLocalStorageVariable(key){
	var r;
	await readLocalStorage(key).then(function(result) {
		r = result;
	}).catch((err) => {
		r = null; //Setting not stored locally, default value will be used as defined.
	});
	return r;
}

//Loading the settings from the local storage	
async function getSettings(){
	
	let result;

	result = await getLocalStorageVariable("settingsThreshold");
	if(result > 0 && result <10)
		consensusThreshold = result;
	
	result = await getLocalStorageVariable("settingsUnavailableOpacity");
	if(result > 0 && result <=100)
		unavailableOpacity = result;
	
	
	result = await getLocalStorageVariable("settingsSelfDiscard");
	if(result == true || result == false)
		selfDiscard = result;
	
	result = await getLocalStorageVariable("settingsConsensusDiscard");
	if(result == true || result == false)
		consensusDiscard = result;
	
	result = await getLocalStorageVariable("settingsCompactToolbar");
	if(result == true || result == false)
		compactToolbar = result;
	
	result = await getLocalStorageVariable("settingsTopPagination");
	if(result == true || result == false)
		topPagination = result;
	
	result = await getLocalStorageVariable("settingsAutofixInfiniteWheel");
	if(result == true || result == false)
		autofixInfiniteWheel = result;
	
	result = await getLocalStorageVariable("settingsUnavailableTab");
	if(result == true || result == false)
		unavailableTab = result;

	result = await getLocalStorageVariable("settingsHiddenTab");
	if(result == true || result == false){
		hiddenTab = result;
	
		if(hiddenTab == true){
			result = await getLocalStorageVariable("arrHidden");
			if(result!=null)
				arrHidden = result;
		}
	}
	
	//Figure out what domain the extension is working on
	//De-activate the unavailableTab (and the voting system) for all non-.ca domains.
	let currentUrl = window.location.href; 
	regex = /^(?:.*:\/\/)(?:.+[\.]?)amazon\.(.+)\/vine\/.*$/;
	arrMatches = currentUrl.match(regex);
	if(arrMatches[1] != "ca"){
		unavailableTab = false;
	}

	//Load Thorvarium stylesheets
	if(await getLocalStorageVariable("thorvariumSmallItems"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/small-items.css">');
	
	if(await getLocalStorageVariable("thorvariumRemoveHeader"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-header.css">');
	
	if(await getLocalStorageVariable("thorvariumRemoveFooter"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-footer.css">');
	
	if(await getLocalStorageVariable("thorvariumRemoveAssociateHeader"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-associate-header.css">');
	
	if(await getLocalStorageVariable("thorvariumMoreDescriptionText"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/more-description-text.css">');
	
	if(await getLocalStorageVariable("thorvariumETVModalOnTop"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/etv-modal-on-top.css">');
	
	if(await getLocalStorageVariable("thorvariumCategoriesWithEmojis"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/categories-with-emojis.css">');
	
	if(await getLocalStorageVariable("thorvariumPaginationOnTop"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/pagination-on-top.css">');
	
	if(await getLocalStorageVariable("thorvariumCollapsableCategories"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/collapsable-categories.css">');
	
	if(await getLocalStorageVariable("thorvariumStripedCategories"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/striped-categories.css">');
	
	if(await getLocalStorageVariable("thorvariumLimitedQuantityIcon"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/limited-quantity-icon.css">');
	
	if(await getLocalStorageVariable("thorvariumRFYAFAAITabs"))
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/rfy-afa-ai-tabs.css">');
	
	
	init(); // Initialize the app
	
	
	discardedItemGarbageCollection();
}
getSettings();





//#########################
//### Utility functions


function getTileByPageId(pageId){
	tile = null;
	tile = gridRegular.getTileId(pageId);
	if(tile != null)
		return tile;
	
	tile = gridUnavailable.getTileId(pageId);
	if(tile != null)
		return tile;
	
	tile = gridHidden.getTileId(pageId);
	return tile;
}

function getPageIdFromDom(tileDom){
	let regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.
	let url = $(tileDom).find(".a-link-normal").attr("href");
	let arrPageId = url.match(regex);
	return arrPageId[1];
}

function discardedItemGarbageCollection(){
	var change = false;
	let expiredDate = new Date();
	expiredDate.setDate(expiredDate.getDate() - 90);
	
	$.each(arrHidden, function(key, value){
		if(key!=undefined && arrHidden[key]["date"] < expiredDate){
			arrHidden.splice(key, 1);
			change = true;
		}
	});
	
	//Save array to local storage
	if(change){
		chrome.storage.local.set({ "arrHidden": arrHidden });
	}
}


window.addEventListener("message", async function(event) {
    // We only accept messages from ourselves
    if (event.source != window)
        return;

    if (event.data.type && (event.data.type == "FROM_PAGE")) {
        //console.log("Content script received message: " + event.data.text);
		let healingAnim = $("<div>")
				.attr("id", "ext-helper-healing")
				.addClass("ext-helper-healing")
				.prependTo("#a-popover-content-3");
		$("<div>")
			.addClass("ext-helper-icon-healing")
			.appendTo(healingAnim);
		await healingAnim.delay(1000).animate({opacity: "hide"},{duration: 500}).promise();
		$("#ext-helper-healing").remove();
    }
});





//#########################
//### Main flow


//Initiate the extension
function init(){
	
	//Inject the infinite loading wheel fix to the "main world"
	if(autofixInfiniteWheel){
		scriptTag.src = chrome.runtime.getURL('scripts/infiniteWheelFix.js');
		scriptTag.onload = function() { this.remove(); };
		// see also "Dynamic values in the injected code" section in this answer
		(document.head || document.documentElement).appendChild(scriptTag);
	}
	
	//Create the Discard grid
	if(unavailableTab || hiddenTab){
		createGridInterface();
	}
	
	gridRegular = new Grid($("#vvp-items-grid"));
	
	if(hiddenTab){
		gridHidden = new Grid($("#tab-hidden"));
	}
	
	if(unavailableTab){
		gridUnavailable = new Grid($("#tab-unavailable"));
	}else{ //Disable voting system
		$("#tab-unavailable").parent("ul").hide(); //Doesn't do anything
		compactToolbar = true;
		consensusDiscard = false;
		selfDiscard = false;
	}

	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	var tile;
	var arrUrl = []; //Will be use to store the URL identifier of the listed products.
	$(".vvp-item-tile").each(function(){
		
		tile = new Tile($(this), gridRegular);
		arrUrl.push(tile.getPageId());
		
		//Move the hidden item to the hidden tab
		if(hiddenTab && tile.isHidden()){
			tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
		}
		
		if(unavailableTab || hiddenTab){
			t = new Toolbar(tile);
			t.createProductToolbar();
		}
	});
	
	if(unavailableTab || hiddenTab){
		updateTileCounts();
	}
	
	//Bottom pagination
	if(topPagination){
		$(".a-pagination").parent().css("margin-top","10px").clone().insertAfter("#vvp-items-grid-container p");
	}
	
	//Obtain the data to fill the toolbars with it.
	if(unavailableTab){ //Only query the server (to get vote results) if the voting system is active.
		fetchData(arrUrl);
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
		.catch( 
			function() {
				//error =>  console.log(error);
				$.each(arrUrl, function(key, val){
					let t = getTileByPageId(val);
					t.getToolbar().setStatusText("Server offline");
					t.getToolbar().setStatusIcon("ext-helper-icon-info")
				});
			}
		);
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
		if(hiddenTab && tile.isHidden()){ //The hidden tiles were already moved, but we want to keep them there.
			tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
		}else if(consensusDiscard && tile.getStatus() >= NOT_DISCARDED){
			tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
		} else if(selfDiscard && tile.getStatus() == DISCARDED_OWN_VOTE){
			tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
		}
			
		
		tile.getToolbar().updateToolbar();
	});
	
	updateTileCounts();
}




//#########################
//## Triggered functions (from clicks or whatever)



//A vote button was pressed, send the vote to the server
//If a vote changed the discard status, move the tile accordingly
async function reportfees(event){
	let pageId = event.data.pageId;
	let fees = event.data.fees; // The vote
	let tile = getTileByPageId(pageId);
	
	
	//If the tile is already in the hidden category, a vote won't move it from there.
	if(!tile.isHidden()){
		//Note: If the tile is already in the grid, the method will exit with false.
		//Our vote is "Fees" + the self discard option is active: move the item to the Discard grid
		if(fees == 1 && selfDiscard){
			await tile.moveToGrid(gridUnavailable, true);
		
		//Our vote is "Fees" + the added vote will meet the consensus: move the item to the Discard grid
		}else if(fees == 1 && consensusDiscard && tile.getVoteFees() + 1 - tile.getVoteNoFees() >= consensusThreshold){
			await tile.moveToGrid(gridUnavailable, true);
		
		//Our vote is "nofees" + there's no consensus, move the item to the regular grid
		}else if(fees == 0 && tile.getVoteFees() - tile.getVoteNoFees() < consensusThreshold){
			await tile.moveToGrid(gridRegular, true);
		}
	}
	
	//Send the vote to the server
	let url = "https://francoismazerolle.ca/vinehelperCastVote_v2.php"
		+ '?data={"url":"' + pageId +'","fees":'+ fees +'}';
	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	//Refresh the data for the toolbar of that specific product only
	let arrUrl = [pageId];
	fetchData(arrUrl);
};


//A hide/display item button was pressed
async function toggleItemVisibility(event){
	let pageId = event.data.pageId;
	let tile = getTileByPageId(pageId);
	let gridId = tile.getGridId();
	
	switch (gridId){ //Current Grid
		case "vvp-items-grid":
		case "tab-discarded":
			tile.hideTile();
			break;
		case "tab-hidden":
			tile.showTile();
			break;
	}
	
	updateTileCounts();
}


						