

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

async function readLocalStorage2(key){

	data = await chrome.storage.local.get([key]);
	return data;
}
async function getSettings(){
	
	await readLocalStorage('settingsThreshold').then(function(result) {if(result > 0 && result <10){
		consensusThreshold = result;
	}}).catch((err) => {});

	await readLocalStorage('settingsSelfDiscard').then(function(result) {if(result == true || result == false){
		selfDiscard = result;
	}}).catch((err) => {});
	//console.log("b:" + consensusThreshold + " "+ selfDiscard);

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


function getTileByPageId(pageId){
	tile = null;
	tile = gridRegular.getTileId(pageId);
	if(tile != null)
		return tile;
	
	tile = gridDiscard.getTileId(pageId);
	return tile;
}



function discardedItemGarbageCollection(){
	var change = false;
	let expiredDate = new Date();
	expiredDate.setDate(expiredDate.getDate() - 90);
	
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
	createDiscardGridInterface();

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
		if(tile.getStatus() >= NOT_DISCARDED || tile.isHidden()){
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



