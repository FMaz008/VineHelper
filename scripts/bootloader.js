showRuntime("BOOT: Booterloader starting");
var sleepSetTimeout_ctrl;

//Create the 2 grids/tabs
var gridRegular = null;
var gridUnavailable = null; //Will be populated after the grid will be created.
var gridHidden = null; //Will be populated after the grid will be created.

//Inject the script to fix the infinite loading wheel into the main environment.
var scriptTag = document.createElement('script');

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


init();



//#########################
//### Utility functions

function sleep(ms) {
    clearInterval(sleepSetTimeout_ctrl);
    return new Promise(resolve => sleepSetTimeout_ctrl = setTimeout(resolve, ms));
}

function getTileByAsin(asin){
	tile = null;
	tile = gridRegular.getTileId(asin);
	if(tile != null)
		return tile;
	
	tile = gridUnavailable.getTileId(asin);
	if(tile != null)
		return tile;
	
	tile = gridHidden.getTileId(asin);
	return tile;
}

function getAsinFromDom(tileDom){
	let regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.
	let url = $(tileDom).find(".a-link-normal").attr("href");
	let arrasin = url.match(regex);
	return arrasin[1];
}








//#########################
//### Main flow



//Initiate the extension
async function init(){
	
	//Wait for the config to be loaded before running this script
	showRuntime("BOOT: Waiting on config to be loaded...");
	let loopCount = 0;
	while($.isEmptyObject(appSettings)){
		await sleep(10);
		loopCount++;
	}
	showRuntime("BOOT: Waited " + (loopCount*10) + "ms for config. Begining init() function");
	
	//Load Thorvarium stylesheets
	if(appSettings.thorvarium.smallItems)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/small-items.css">');
	
	if(appSettings.thorvarium.removeHeader)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-header.css">');
	
	if(appSettings.thorvarium.removeFooter)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-footer.css">');
	
	if(appSettings.thorvarium.removeAssociateHeader)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-associate-header.css">');
	
	if(appSettings.thorvarium.moreDescriptionText)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/more-description-text.css">');
	
	if(appSettings.thorvarium.ETVModalOnTop)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/etv-modal-on-top.css">');
	
	if(appSettings.thorvarium.categoriesWithEmojis)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/categories-with-emojis.css">');
	
	if(appSettings.thorvarium.paginationOnTop)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/pagination-on-top.css">');
	
	if(appSettings.thorvarium.collapsableCategories)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/collapsable-categories.css">');
	
	if(appSettings.thorvarium.stripedCategories)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/striped-categories.css">');
	
	if(appSettings.thorvarium.limitedQuantityIcon)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/limited-quantity-icon.css">');
	
	if(appSettings.thorvarium.RFYAFAAITabs)
		$('head link:last').after('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/rfy-afa-ai-tabs.css">');
	
	showRuntime("BOOT: Thorvarium stylesheets injected");
	
	//Inject the infinite loading wheel fix to the "main world"
	if(appSettings.general.autofixInfiniteWheel){
		scriptTag.src = chrome.runtime.getURL('scripts/infiniteWheelFix.js');
		scriptTag.onload = function() { this.remove(); };
		// see also "Dynamic values in the injected code" section in this answer
		(document.head || document.documentElement).appendChild(scriptTag);
		showRuntime("BOOT: Infinite Wheel fix injected");
	}
	
	//Create the Discard grid
	showRuntime("BOOT: Creating tabs system");
	var tabSystem = appSettings.unavailableTab.active || appSettings.hiddenTab.active;
	if(tabSystem){
		createGridInterface();
	}
	
	gridRegular = new Grid($("#vvp-items-grid"));
	
	if(appSettings.hiddenTab.active){
		gridHidden = new Grid($("#tab-hidden"));
	}
	
	if(appSettings.unavailableTab.active){
		gridUnavailable = new Grid($("#tab-unavailable"));
	}
	showRuntime("BOOT: Grid system completed");
	
	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	var tile;
	var arrUrl = []; //Will be use to store the URL identifier of the listed products.
	$(".vvp-item-tile").each(function(){
		
		tile = new Tile($(this), gridRegular);
		arrUrl.push(tile.getAsin());
		
		//Move the hidden item to the hidden tab
		if(appSettings.hiddenTab.active && tile.isHidden()){
			tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
		}
		
		if(tabSystem){
			t = new Toolbar(tile);
			t.createProductToolbar();
		}
	});
	
	if(tabSystem){
		updateTileCounts();
	}
	
	
	
	//Bottom pagination
	if(appSettings.general.topPagination){
		$(".a-pagination").parent().css("margin-top","10px").clone().insertAfter("#vvp-items-grid-container p");
	}
	
	//Obtain the data to fill the toolbars with it.
	if(appSettings.unavailableTab.active){ //Only query the server (to get vote results) if the voting system is active.
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
					let t = getTileByAsin(val);
					t.getToolbar().setStatusText("Server offline");
					t.getToolbar().setStatusIcon("ext-helper-icon-info")
				});
			}
		);
}

//Process the results obtained from the server
//Update each tile with the data pertaining to it.
function serverResponse(data){
	
	if(data["api_version"]!=2){
		console.log("Wrong API version");
	}
	
	$.each(data["arr_url"],function(key,values){
		
		let tile = getTileByAsin(key);
		
		if(tile==null)
			console.log("No tile matching " + key);
		
		tile.setVotes(values["v0"], values["v1"], values["s"]);
		
		//Assign the tiles to the proper grid
		if(appSettings.hiddenTab.active && tile.isHidden()){ //The hidden tiles were already moved, but we want to keep them there.
			tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
		}else if(appSettings.unavailableTab.consensusDiscard && tile.getStatus() >= NOT_DISCARDED){
			tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
		} else if(appSettings.unavailableTab.selfDiscard && tile.getStatus() == DISCARDED_OWN_VOTE){
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
	let asin = event.data.asin;
	let fees = event.data.fees; // The vote
	let tile = getTileByAsin(asin);
	
	
	//If the tile is already in the hidden category, a vote won't move it from there.
	if(!tile.isHidden()){
		//Note: If the tile is already in the grid, the method will exit with false.
		//Our vote is "Fees" + the self discard option is active: move the item to the Discard grid
		if(fees == 1 && appSettings.unavailableTab.selfDiscard){
			await tile.moveToGrid(gridUnavailable, true);
		
		//Our vote is "Fees" + the added vote will meet the consensus: move the item to the Discard grid
		}else if(fees == 1 && appSettings.unavailableTab.consensusDiscard && tile.getVoteFees() + 1 - tile.getVoteNoFees() >= appSettings.unavailableTab.consensusThreshold){
			await tile.moveToGrid(gridUnavailable, true);
		
		//Our vote is "nofees" + there's no consensus, move the item to the regular grid
		}else if(fees == 0 && tile.getVoteFees() - tile.getVoteNoFees() < appSettings.unavailableTab.consensusThreshold){
			await tile.moveToGrid(gridRegular, true);
		}
	}
	
	//Send the vote to the server
	let url = "https://francoismazerolle.ca/vinehelperCastVote_v2.php"
		+ '?data={"url":"' + asin +'","fees":'+ fees +'}';
	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	//Refresh the data for the toolbar of that specific product only
	let arrUrl = [asin];
	fetchData(arrUrl);
};


//Function to receive a message from the website-end and launch an animation
//if the infinite wheel fix was used.
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

						