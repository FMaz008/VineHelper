

var pageId; //Will be used to store the current pageId within the each loop.
var arrUrl = []; //Will be use to store the URL identifier of the listed products.
const regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.


//Load settings
var consensusThreshold = 2;
var selfDiscard = false;
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
	
	init(); // Initialize the app
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

function getTileGrid(pageId, gridId){
	let grid = $("#ext-helper-toolbar-" + pageId).parents(gridId); //Time consuming, used in a loop
	if(grid.length==0)
		return null;
	return grid;
}

async function moveProductTileToGrid(pageId, gridSelector, animate=false){
	
	if(animate)
		await animateVanish(pageId);
	
	let tile = $("#ext-helper-toolbar-" + pageId).parents(".vvp-item-tile");
	$(tile).detach().appendTo(gridSelector);
}

async function animateVanish(pageId){
	let tile = $("#ext-helper-toolbar-" + pageId).parent(".vvp-item-tile-content");
	let defaultOpacity = $(tile).css("opacity");
	await tile.animate({
		height: "hide",
		opacity: "hide"
	},
	{
		duration: 500,
		complete: function() {
			$(tile).show();
			$(tile).css('opacity', defaultOpacity);
		}
	}).promise(); //Converting the animation to a promise allow for the await clause to work.
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
		.text(" item(s) voted with fees")
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
	if(data["api_version"]!=2){
		console.log("Wrong API version");
	}
	
	$.each(data["arr_url"],function(key,values){
		
		//If there is a consensus of a fee for the product, move it to the discarded grid
		if(values["v1"] - values["v0"] >= consensusThreshold){
			moveProductTileToGrid(key, '#ext-helper-grid', false); //This is the main sort, do not animate it
		}else{
			//We voted "fees" + self discard option is on: move the item on the discard grid
			if(values["s"] == 1 && selfDiscard == true){
				moveProductTileToGrid(key, '#ext-helper-grid', false); //This is the main sort, do not animate it
			}
		}
				
		//Update the toolbar with the information received
		updateToolBarFees(key, values);
	});
	
	//Calculate how many tiles were moved to the discarded grid
	$("#ext-helper-grid-count").text($("#ext-helper-grid").children().length);
}

function updateToolBarFees(pageId, arrValues){
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
	
	v1.bind('click', {'pageId': pageId, 'fees': 1, 'v1': votesFees, 'v0':votesNoFees}, reportfees);
	v0.bind('click', {'pageId': pageId, 'fees': 0, 'v1': votesFees, 'v0':votesNoFees}, reportfees);


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
			grid = getTileGrid(pageId, "#vvp-items-grid");
			if(grid !== null){ //Item is located in the regular grid, but should not
				await moveProductTileToGrid(pageId, "#ext-helper-grid", true);
			}
		}
	}
	
	//Our vote is "nofees" + there's no consensus, yet the item is still in the Discard Grid: move the item to the regular grid
	if(fees == 0 && votesFees - votesNoFees < consensusThreshold){
		grid = getTileGrid(pageId, "#ext-helper-grid");
		if(grid !== null){ //Item is located in the discard grid, but should not
			await moveProductTileToGrid(pageId, '#vvp-items-grid', true);
		}
	}
	
	let url = "https://francoismazerolle.ca/vinehelperCastVote_v2.php"
		+ '?data={"url":"' + pageId +'","fees":'+ fees +'}';
	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	let arrUrl = [pageId];
	fetchData(arrUrl); //Refresh the toolbar for that specific product only
};



