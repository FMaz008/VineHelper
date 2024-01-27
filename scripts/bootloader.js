showRuntime("BOOT: Booterloader starting");

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

const NOT_DISCARDED_ORDER_SUCCESS = -4;
const NOT_DISCARDED_NO_STATUS = -3;
const NOT_DISCARDED_OWN_VOTE = -2;
const NOT_DISCARDED_NO_FEES = -1;
const NOT_DISCARDED = 0; 
const DISCARDED_WITH_FEES = 1;
const DISCARDED_OWN_VOTE = 2;
const DISCARDED_ORDER_FAILED = 4;


init();



//#########################
//### Utility functions


function getTileByAsin(asin){
	tile = null;
	tile = gridRegular.getTileId(asin);
	if(tile != null)
		return tile;
	
	if(gridUnavailable != null){
		tile = gridUnavailable.getTileId(asin);
		if(tile != null)
			return tile;
	}
	
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
	while($.isEmptyObject(appSettings)){
		await new Promise(r => setTimeout(r, 10));
	}
	showRuntime("BOOT: Config available. Begining init() function");
	
	//Inject the infinite loading wheel fix to the "main world"
	if(appSettings.general.allowInjection){
		scriptTag.src = chrome.runtime.getURL('scripts/inj.js');
		scriptTag.onload = function() { this.remove(); };
		// see also "Dynamic values in the injected code" section in this answer
		(document.head || document.documentElement).appendChild(scriptTag);
		showRuntime("BOOT: Script injected");
	}
	
	//If the sync hidden items is enable, load the hidden item from the server
	//if(appSettings.hiddenTab.remote)
	//	await loadHiddenItems(); //from tile.js
	
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
	
	
	
	//Show version info popup : new version
	if(appVersion != appSettings.general.versionInfoPopup){
		prom = await Tpl.loadFile(chrome.runtime.getURL("view/popup_changelog.html"));
		Tpl.setVar("appVersion", appVersion);
		let content = Tpl.render(prom);
		showModalDialog("Vine Helper update info", content ,600);
		appSettings.general.versionInfoPopup = appVersion;
		saveSettings();
	}
	
	//Bottom pagination
	if(appSettings.general.topPagination){
		$("#vvp-items-grid-container .topPagination").remove();
		$(".a-pagination").parent().css("margin-top","10px").clone().insertAfter("#vvp-items-grid-container p").addClass("topPagination");
	}
	
	
	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	await generateToolbars();
	showRuntime("done creating toolbars.");
	
	//Only contact the home server is necessary
	if(appSettings.unavailableTab.active || appSettings.general.displayETV || appSettings.general.displayFirstSeen){
		await fetchProductsData(getAllAsin());//Obtain the data to fill the toolbars with it.
		
		if(appSettings.general.newItemNotification){
			//Display a notification to activate the sound
			/*
			soundUrl = chrome.runtime.getURL("resource/sound/notification.mp3");
			let note = new ScreenNotification();
			note.title = "Activate your browser sound";
			note.lifespan = 10;
			note.content = "Sounds are only allowed to play if enough interaction has been done on the page. To ensure your sound works, click this button: <input type='button' onclick='new Audio(\""+soundUrl+"\").play();' value='Sound check' />";
			await Notifications.pushNotification(note);
			*/
			
			checkNewItems();
		}
	}
}
async function checkNewItems(){
	let arrJSON = {"api_version":4, "country": vineCountry, "orderby":"date", "limit":10};
	let jsonArrURL = JSON.stringify(arrJSON);
	showRuntime("Fetching most recent products data...");
	
	//Display a notification that we have checked for items.
	let note = new ScreenNotification();
	note.template = chrome.runtime.getURL("view/notification_loading.html")
	note.lifespan = 3;
	await Notifications.pushNotification(note);
	
	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = "https://francoismazerolle.ca/vineHelperLatest.php"
			+ "?data=" + jsonArrURL;
	fetch(url)
		.then((response) => response.json())
		.then(async function(response){
			for(let i = response.products.length-1; i>=0; i--){
				if(appSettings.general.latestProduct == undefined || response.products[i].date > appSettings.general.latestProduct){
				
					let note2 = new ScreenNotification();
					note2.title = "New item(s) detected !";
					note2.lifespan = 60;
					note2.sound = "resource/sound/notification.mp3";
					note2.content = "Most recent item: <a href='/dp/" + response.products[i].asin + "' target='_blank'>" + response.products[i].asin + "</a><br />Server time: " + response.products[i].date;
					await Notifications.pushNotification(note2);
					
					if(i ==0){
						appSettings.general.latestProduct = response.products[0].date;
						saveSettings();
					}
				}
			}
			
			
			//Repeat another check in 60 seconds.
			setTimeout(function(){checkNewItems()}, 60000);
		})
		.catch( 
			function() {
				error =>  console.log(error);
			}
		);
}
function getAllAsin(){
	let tile;
	let arrUrl = []; //Will be use to store the URL identifier of the listed products.
	const arrObj = $(".vvp-item-tile");
	for(let i = 0; i < arrObj.length; i++){
		//Create the tile and assign it to the main grid
		obj = arrObj[i];
		tile = getTileByAsin(getAsinFromDom(obj));
		arrUrl.push(tile.getAsin());
	}
	return arrUrl;
}

async function generateToolbars(){
	let tile;
	const arrObj = $(".vvp-item-tile");
	let obj = null;
	for(let i = 0; i < arrObj.length; i++){
		obj = $(arrObj[i]);
		tile = new Tile(obj, gridRegular);
		
		//Add a container for the image and place the image in it.
		let img = obj.children(".vvp-item-tile-content").children("img");
		let imgContainer = $("<div>")
			.addClass("ext-helper-img-container")
			.insertBefore(img);
		$(img).detach().appendTo($(imgContainer));
		
		//Move the hidden item to the hidden tab
		if(appSettings.hiddenTab.active && tile.isHidden()){
			tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
		}
		
		
		if(appSettings.general.displayVariantIcon){
			//Check if the item is a parent ASIN (as variants)
			let variant = obj.find(".a-button-input").attr("data-is-parent-asin");
			if(variant == "true"){
				$("<div>")
					.addClass("ext-helper-variant-indicator-container")
					.append($("<div>").addClass("ext-helper-indicator-icon ext-helper-icon-choice "))
					.appendTo($(imgContainer));
			}
		}
		
		t = new Toolbar(tile);
		await t.createProductToolbar();
	}
	
}


//Get data from the server about the products listed on this page
function fetchProductsData(arrUrl){
	let arrJSON = {"api_version":4, "action": "getinfo", "country": vineCountry, "arr_asin":arrUrl};
	let jsonArrURL = JSON.stringify(arrJSON);
	
	showRuntime("Fetching products data...");
	
	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = "https://www.francoismazerolle.ca/vinehelper.php"
			+ "?data=" + jsonArrURL;
	fetch(url)
		.then((response) => response.json())
		.then(serverProductsResponse)
		.catch( 
			function() {
				//error =>  console.log(error);
				$.each(arrUrl, function(key, val){
					let t = getTileByAsin(val);//server offline
				});
			}
		);
}

//Process the results obtained from the server
//Update each tile with the data pertaining to it.
function serverProductsResponse(data){
	if(data["api_version"]!=4){
		console.log("Wrong API version");
	}
	
	//Load the ETV value
	$.each(data["products"],function(key,values){
		
		let tile = getTileByAsin(key);
		if(tile==null)
			console.log("No tile matching " + key);
		
		if(values.etv_min != null){
			if(values.etv_min == values.etv_max)
				tile.getToolbar().setETV(values.etv_min);
			else
				tile.getToolbar().setETV(values.etv_min + "-" + values.etv_max);
		}
		
		if(values.date_added != null)
			tile.setDateAdded(values.date_added);
		
		
		if(appSettings.unavailableTab.active){ // if the voting system is active.
			tile.setVotes(values.v0, values.v1, values.s);
			tile.setOrders(values.order_success, values.order_failed);
			
			//Assign the tiles to the proper grid
			if(appSettings.hiddenTab.active && tile.isHidden()){ //The hidden tiles were already moved, but we want to keep them there.
				tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
			}else if(appSettings.unavailableTab.consensusDiscard && tile.getStatus() >= NOT_DISCARDED){
				tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
			} else if(appSettings.unavailableTab.selfDiscard && tile.getStatus() == DISCARDED_OWN_VOTE){
				tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
			}
			
			tile.getToolbar().updateToolbar();
		}
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
	let arrJSON = {"api_version":4, "action": "report_fee", "country": vineCountry, "uuid":uuid, "asin": asin, "fees": fees};
	let jsonArrURL = JSON.stringify(arrJSON);
	
	let url = "https://www.francoismazerolle.ca/vinehelper.php"
				+ "?data=" + jsonArrURL;
	
	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	//Refresh the data for the toolbar of that specific product only
	let arrUrl = [asin];
	fetchData(arrUrl);
	
	//Show first vote popup
	if(appSettings.general.firstVotePopup){
		
		prom = await Tpl.loadFile(chrome.runtime.getURL("view/popup_firstvote.html"));
		let content = Tpl.render(prom);
		showModalDialog("Vine Helper - voting feature", content ,600, "resource/sound/upgrade.mp3");
		appSettings.general.firstVotePopup = false;
		saveSettings();
	}
};


//Function to receive a message from the website-end and launch an animation
//if the infinite wheel fix was used.
window.addEventListener("message", async function(event) {
    // We only accept messages from ourselves
    if (event.source != window)
        return;

	//If we got back a message after we fixed an infinite wheel spin.
    if (event.data.type && (event.data.type == "infiniteWheelFixed")) {
        //console.log("Content script received message: " + event.data.text);
		
		prom = await Tpl.loadFile(chrome.runtime.getURL("view/infinite_wheel_fix.html"));
		let content = Tpl.render(prom);
		
		$("#a-popover-content-3").prepend(content);
		let textContainer = $("#ext-helper-healing-text").hide();//Begin the animation hidden
		let healingAnim = $("#ext-helper-healing");
		
		await textContainer.slideDown("slow").promise();
		await healingAnim.delay(1000).animate({opacity: "hide"},{duration: 500}).promise();
		await textContainer.slideUp("slow").promise();
		$("#ext-helper-healing").remove();
		$("#ext-helper-healing-text").remove();
		
		
		//Show a notification
		let note = new ScreenNotification();
		note.title = "Infinite spinner fixed!";
		note.lifespan = 10;
		note.content = "Vine Helper fixed an item that was bugged with the infinite spinner problem.";
		await Notifications.pushNotification(note);
    }
	
	//If we got back a message after we found an ETV.
	if (appSettings.general.shareETV && event.data.type && (event.data.type == "etv")) {
		
		//Send the ETV info to the server
		
		let tileASIN;
		if(event.data.data.parent_asin === null){
			tileASIN = event.data.data.asin;
		}else{
			tileASIN = event.data.data.parent_asin;
			event.data.data.parent_asin = '"' + event.data.data.parent_asin + '"';
		}
		
		let url = "https://francoismazerolle.ca/vinehelper.php"
		+ '?data={"api_version":4, '
		+ '"action":"report_etv",'
		+ '"country":"' + vineCountry + '",'
		+ '"asin":"' + event.data.data.asin + '",'
		+ '"parent_asin": ' + event.data.data.parent_asin + ','
		+ '"etv":"' + event.data.data.etv + '"'
		+ '}'
		await fetch(url); //Await to wait until the vote to have been processed before refreshing the display
	
		//Update the product tile ETV in the Toolbar
		let tile = getTileByAsin(tileASIN);
		tile.getToolbar().setETV(event.data.data.etv, true);
		
		//Show a notification
		let note = new ScreenNotification();
		note.title = "ETV data shared";
		note.lifespan = 2;
		note.content = "Vine Helper shared the ETV value of " +event.data.data.etv+" for item " + event.data.data.asin +".";
		await Notifications.pushNotification(note);
	}
	
	//If we got back a message after an order was attempted or placed.
	if (appSettings.unavailableTab.shareOrder && event.data.type && (event.data.type == "order")) {
		console.log("Item "+event.data.data.asin+ " (parent:"+event.data.data.parent_asin+") ordered: "+ event.data.data.status);
		let tileASIN;
		if(event.data.data.parent_asin === null){
			tileASIN = event.data.data.asin;
		}else{
			tileASIN = event.data.data.parent_asin;
		}
		
		if(event.data.data.status == "success" || event.data.data.error == "CROSS_BORDER_SHIPMENT"){
			//Report the order status to the server
			let arrJSON = {
				"api_version":4, "action": "report_order", "country": vineCountry, "uuid": uuid,
				"asin": event.data.data.asin,
				"parent_asin": event.data.data.parent_asin,
				"order_status": event.data.data.status
			};
			let jsonArrURL = JSON.stringify(arrJSON);
			
			//Form the full URL
			let url = "https://www.francoismazerolle.ca/vinehelper.php"
					+ "?data=" + jsonArrURL;
			await fetch(url); //Await to wait until the vote to have been processed before refreshing the display
			
			//Update the product tile ETV in the Toolbar
			let tile = getTileByAsin(tileASIN);
			tile.getToolbar().createOrderWidget(event.data.data.status == "success");
		}
		
		if(event.data.data.status == "success"){
			//Show a notification
			let note = new ScreenNotification();
			note.title = "Successful order detected!";
			note.lifespan = 5;
			note.content = "Recorded item " + event.data.data.asin +" as orderable.";
			await Notifications.pushNotification(note);
		}
		if(event.data.data.error == "CROSS_BORDER_SHIPMENT"){
			//Show a notification
			let note = new ScreenNotification();
			note.title = "Failed order detected.";
			note.lifespan = 5;
			note.content = "Recorded item " + event.data.data.asin +" as not orderable with error CROSS_BORDER_SHIPMENT.";
			await Notifications.pushNotification(note);
		}else if(event.data.data.error !== null){
			//Show a notification
			let note = new ScreenNotification();
			note.title = "Failed order detected.";
			note.lifespan = 5;
			note.content = "Item " + event.data.data.asin +" could not be ordered with error " + event.data.data.error + ". This error has not been recorded.";
			await Notifications.pushNotification(note);
		}
		
		
	}
});

function showModalDialog(title, text, width=400, sound=null){
	var w = width;
	
	if(sound){
		const audioElement = new Audio(chrome.runtime.getURL(sound));
		audioElement.play();
	}
	
	$("#ext-helper-dialog").remove();
	$("<div id=\"ext-helper-dialog\" title=\"" + title + "\">").appendTo("body")
		.append("<p>")
		.html(text);
	
	  $( function() {
		$( "#ext-helper-dialog" ).dialog({
		  modal:true,
		  width: w,
		  show: {
			effect: "blind",
			duration: 500
		  },
		  hide: {
			effect: "explode",
			duration: 1000
		  },
          buttons: {
			Ok: function() {
			  $( this ).dialog( "close" );
			}
		  }
		});//End dialog
		$("div.ui-dialog").css("background", "white");
	  });
	  $("div.ui-dialog").css("background", "white");
}