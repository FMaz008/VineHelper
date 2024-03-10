showRuntime("BOOT: Booterloader starting");

//Create the 2 grids/tabs
var gridRegular = null;
var gridUnavailable = null; //Will be populated after the grid will be created.
var gridHidden = null; //Will be populated after the grid will be created.

//Inject the script to fix the infinite loading wheel into the main environment.
var scriptTag = document.createElement("script");

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

const VERSION_MAJOR_CHANGE = 3;
const VERSION_MINOR_CHANGE = 2;
const VERSION_REVISION_CHANGE = 1;
const VERSION_NO_CHANGE = 0;

var toolbarsDrawn = false;

const DEBUGGER_TITLE = "Vine Helper - Debugger";
const VOTING_TITLE = "Vine Helper - voting feature";
const VINE_INFO_TITLE = "Vine Helper update info";

//Do not run the extension if ultraviner is running
regex = /^.+?amazon\..+\/vine\/ultraviner.*?$/;
if (!regex.test(window.location.href)) {
	init();
}

//#########################
//### Main flow

//Initiate the extension
async function init() {
	//Wait for the config to be loaded before running this script
	showRuntime("BOOT: Waiting on config to be loaded...");
	while ($.isEmptyObject(appSettings)) {
		await new Promise((r) => setTimeout(r, 10));
	}
	showRuntime("BOOT: Config available. Begining init() function");

	//Run the boot sequence
	initFetchProductData();
	await initFlushTplCache(); //And display the version changelog popup
	initInjectScript();
	initSetPageTitle();
	await initCreateTabs();
	initInsertTopPagination();
	await initInsertBookmarkButton();
	initFixPreviousButton();
	await initDrawToolbars();
}

function initFetchProductData() {
	fetchProductsData(getAllAsin()); //Obtain the data to fill the toolbars with it.

	if (appSettings.general.newItemNotification) {
		setTimeout(function () {
			checkNewItems();
		}, 10000);
	}
}

async function initFlushTplCache() {
	//Show version info popup : new version
	if (appVersion != appSettings.general.versionInfoPopup) {
		showRuntime("BOOT: Flushing template cache");
		await TplMgr.flushLocalStorage(); //Delete all template from cache

		if (
			compareVersion(appSettings.general.versionInfoPopup, appVersion) >
			VERSION_REVISION_CHANGE
		) {
			prom = await Tpl.loadFile("view/popup_changelog.html");
			Tpl.setVar("appVersion", appVersion);
			let content = Tpl.render(prom);

			let m = DialogMgr.newModal('info');
			m.title = VINE_INFO_TITLE;
			m.content = content;
			m.show();
		}

		appSettings.general.versionInfoPopup = appVersion;
		saveSettings();
	}
}

function initInjectScript() {
	//Inject the infinite loading wheel fix to the "main world"
	scriptTag.src = chrome.runtime.getURL("scripts/inj.js");
	scriptTag.onload = function () {
		this.remove();
	};
	// see also "Dynamic values in the injected code" section in this answer
	(document.head || document.documentElement).appendChild(scriptTag);
	showRuntime("BOOT: Script injected");
}

function initSetPageTitle() {
	//Update the page title
	let currentUrl = window.location.href;
	regex = /^.+?amazon\..+\/vine\/.*[\?\&]search=(.*?)(?:[\&].*)?$/;
	arrMatches = currentUrl.match(regex);
	if (arrMatches != null)
		$("title").text("Amazon Vine - S: " + arrMatches[1]);
	else if (vineQueue != null) {
		$("title").text("Amazon Vine - " + vineQueueAbbr);
	}

	//Add the category, is any, that is currently being browsed to the title of the page.
	regex =
		/^.+?amazon\..+\/vine\/.*[\?\&]pn=(.*?)(?:[\&]cn=(.*?))?(?:[\&].*)?$/;
	arrMatches = currentUrl.match(regex);
	if (arrMatches != null && arrMatches.length == 3) {
		let categoryText = "";
		if (arrMatches[2] == undefined) {
			categoryText = $(
				"#vvp-browse-nodes-container > .parent-node > a.selectedNode"
			).text();
		} else {
			categoryText = $(
				"#vvp-browse-nodes-container > .child-node > a.selectedNode"
			).text();
		}

		$("title").append(" - " + categoryText);
	}
}

async function initCreateTabs() {
	//Create the Discard grid
	showRuntime("BOOT: Creating tabs system");
	var tabSystem =
		appSettings.unavailableTab.active || appSettings.hiddenTab.active;
	if (tabSystem) {
		await createGridInterface();
	}

	gridRegular = new Grid($("#vvp-items-grid"));

	if (appSettings.hiddenTab.active) {
		gridHidden = new Grid($("#tab-hidden"));
	}

	if (
		appSettings.unavailableTab.active ||
		appSettings.unavailableTab.votingToolbar
	) {
		gridUnavailable = new Grid($("#tab-unavailable"));
	}
	showRuntime("BOOT: Grid system completed");
}

function initInsertTopPagination() {
	//Top pagination
	if (appSettings.general.topPagination) {
		$("#vvp-items-grid-container .topPagination").remove();
		$(".a-pagination")
			.parent()
			.css("margin-top", "10px")
			.clone()
			.insertAfter("#vvp-items-grid-container p")
			.addClass("topPagination");
	}
}

async function initInsertBookmarkButton() {
	//Insert bookmark button
	if (appSettings.general.displayFirstSeen && appSettings.general.bookmark) {
		$("button.bookmark").remove();
		prom = await Tpl.loadFile("view/bookmark.html");
		Tpl.setVar("date", appSettings.general.bookmarkDate);
		let bookmarkContent = Tpl.render(prom);
		$("#vvp-items-button-container ~ .vvp-container-right-align").prepend(
			bookmarkContent
		);
		$("button.bookmark").on("click", function (event) {
			//Fetch the current date/time from the server
			let arrJSON = {
				api_version: 4,
				country: vineCountry,
				action: "date",
			};
			let url =
				"https://vinehelper.ovh/vinehelper.php" +
				"?data=" +
				JSON.stringify(arrJSON);
			fetch(url)
				.then((response) => response.json())
				.then(async function (response) {
					appSettings.general.bookmarkDate = new Date(
						response.date + " GMT"
					).toString();
					saveSettings();

					let note = new ScreenNotification();
					note.title = "Marker set !";
					note.lifespan = 30;
					note.content =
						"Marker set for <br />" +
						appSettings.general.bookmarkDate +
						"<br />Newer items will be highlighted.";
					await Notifications.pushNotification(note);
				});
		});
	}
}

function initFixPreviousButton() {
	//Place the text-content of the Previous button before the other child elements.
	//This is to enable the first letter of the previous button to be styled for the keybinding.

	//let text = $("ul.a-pagination li:first-child a").innerText;
	let textContent = "";
	document
		.querySelectorAll("ul.a-pagination li:first-child a")
		.forEach(function (item) {
			textContent = item.childNodes[3].nodeValue;
			item.childNodes[3].nodeValue = "";
		});

	//console.log(text);
	$(".ext-helper-pagination-previous").remove();
	$("ul.a-pagination li:first-child a").append(
		"<span class='ext-helper-pagination-previous'>" +
		textContent +
		"</span>"
	);
	//$("ul.a-pagination li:first-child a").prepend(text);
}
async function initDrawToolbars() {
	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	const arrObj = $(".vvp-item-tile");
	let tile = null;
	for (let i = 0; i < arrObj.length; i++) {
		tile = generateTile(arrObj[i]);
		t = new Toolbar(tile);
		await t.createProductToolbar();
	}
	showRuntime("done creating toolbars.");

	toolbarsDrawn = true;
}

async function checkNewItems() {
	let arrJSON = {
		api_version: 4,
		country: vineCountry,
		orderby: "date",
		limit: 10,
	};
	let jsonArrURL = JSON.stringify(arrJSON);
	showRuntime("Fetching most recent products data...");

	//Display a notification that we have checked for items.
	let note = new ScreenNotification();
	note.template = "view/notification_loading.html";
	note.lifespan = 3;
	await Notifications.pushNotification(note);

	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url =
		"https://vinehelper.ovh/vineHelperLatest.php" + "?data=" + jsonArrURL;
	fetch(url)
		.then((response) => response.json())
		.then(async function (response) {
			let latestProduct = await chrome.storage.local.get("latestProduct");
			if (isEmptyObj(latestProduct)) {
				latestProduct = 0;
			} else {
				latestProduct = latestProduct.latestProduct;
			}

			//Display notification from the server
			if (Array.isArray(latestProduct["notification"])) {
				if (latestProduct["notification"].length > 0) {
					latestProduct["notification"].forEach((msg) => {
						let note = new ScreenNotification();
						note.title = "Server message";
						note.lifespan = 10;
						note.content = msg;
						Notifications.pushNotification(note);
					});
				}
			}

			for (let i = response.products.length - 1; i >= 0; i--) {
				//Only display notification for product more recent than the last displayed notification
				if (
					response.products[i].date > latestProduct ||
					latestProduct == 0
				) {
					//Only display notification for products with a title and image url
					if (
						response.products[i].img_url != "" &&
						response.products[i].title != ""
					) {
						let note2 = new ScreenNotification();
						note2.title = "New item detected !";
						note2.lifespan = 60;

						//Play the notification sound
						if (appSettings.general.newItemNotificationSound)
							note2.sound = "resource/sound/notification.mp3";

						note2.content +=
							"<img src='" +
							response.products[i].img_url +
							"' style='float:left;' width='50' height='50' />";

						note2.content +=
							"<a href='/dp/" +
							response.products[i].asin +
							"' target='_blank'>" +
							response.products[i].title +
							"</a>";
						await Notifications.pushNotification(note2);

						if (i == 0) {
							await chrome.storage.local.set({
								latestProduct: response.products[0].date,
							});
						}
					}
				}
			}

			//Repeat another check in 60 seconds.
			setTimeout(function () {
				checkNewItems();
			}, 60000);
		})
		.catch(function () {
			(error) => console.log(error);
		});
}
function getAllAsin() {
	let arrUrl = []; //Will be use to store the URL identifier of the listed products.
	const arrObj = $(".vvp-item-tile");
	for (let i = 0; i < arrObj.length; i++) {
		//Create the tile and assign it to the main grid
		obj = arrObj[i];
		asin = getAsinFromDom(obj);
		arrUrl.push(asin);
	}
	return arrUrl;
}

//This function will return an array of all the product on the page, with their description and thumbnail url
function getAllProductData() {
	let arrUrl = []; //Will be use to store the URL identifier of the listed products.
	const arrObj = $(".vvp-item-tile");
	for (let i = 0; i < arrObj.length; i++) {
		//Create the tile and assign it to the main grid
		obj = arrObj[i];
		asin = getAsinFromDom(obj);
		title = getTitleFromDom(obj);
		thumbnail = getThumbnailURLFromDom(obj);
		arrUrl.push({ asin: asin, title: title, thumbnail: thumbnail });
	}
	return arrUrl;
}

//Convert the regular tile to the Vine Helper version.
function generateTile(obj) {
	let tile;
	tile = new Tile(obj, gridRegular);

	//Add a container for the image and place the image in it.
	let img = $(obj).children(".vvp-item-tile-content").children("img");
	let imgContainer = $("<div>")
		.addClass("ext-helper-img-container")
		.insertBefore(img);
	$(img).detach().appendTo($(imgContainer));

	//Move the hidden item to the hidden tab
	if (appSettings.hiddenTab.active && tile.isHidden()) {
		tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
	}

	if (appSettings.general.displayVariantIcon) {
		//Check if the item is a parent ASIN (as variants)
		let variant = $(obj)
			.find(".a-button-input")
			.attr("data-is-parent-asin");
		if (variant == "true") {
			let div = $("<div>")
				.addClass("ext-helper-variant-indicator-container")
				.appendTo($(imgContainer));
			let alink = $(
				"<a href='#' onclick='return false;' title='The item has variant(s).'>"
			).appendTo(div);
			alink.append(
				$("<div>").addClass(
					"ext-helper-indicator-icon ext-helper-icon-choice "
				)
			);
		}
	}

	return tile;
}

//Get data from the server about the products listed on this page
function fetchProductsData(arrUrl) {
	let arrJSON = {
		api_version: 4,
		action: "getinfo",
		country: vineCountry,
		uuid: appSettings.general.uuid,
		queue: vineQueue,
		arr_asin: arrUrl,
	};
	let jsonArrURL = JSON.stringify(arrJSON);

	showRuntime("Fetching products data...");

	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url =
		"https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;

	let content = getAllProductData();

	fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: JSON.stringify(content),
	})
		.then((response) => response.json())
		.then(serverProductsResponse)
		.catch(function () {
			//error =>  console.log(error);
			$.each(arrUrl, function (key, val) {
				let t = getTileByAsin(val); //server offline
			});
		});
}

//Process the results obtained from the server
//Update each tile with the data pertaining to it.
async function serverProductsResponse(data) {
	if (data["api_version"] != 4) {
		console.log("Wrong API version");
	}

	timenow = data["current_time"];

	//Display notification from the server
	if (Array.isArray(data["notification"])) {
		if (data["notification"].length > 0) {
			data["notification"].forEach((msg) => {
				let note = new ScreenNotification();
				note.title = "Server message";
				note.lifespan = 10;
				note.content = msg;
				Notifications.pushNotification(note);
			});
		}
	}

	showRuntime("FETCH: Waiting toolbars to be drawn...");
	while (toolbarsDrawn == false) {
		await new Promise((r) => setTimeout(r, 10));
	}
	showRuntime("FETCH: Interface loaded, processing fetch data...");

	//Load the ETV value
	$.each(data["products"], function (key, values) {
		showRuntime("DRAW: Processing ASIN #" + key);
		//console.log(values);
		let tile = getTileByAsin(key);
		//console.log(tile);

		if (tile == null) {
			showRunTime("No tile matching " + key);
			return; //Continue the loop with the next item
		}

		if (values.etv_min != null) {
			showRuntime("DRAW: Setting ETV");
			tile.getToolbar().setETV(values.etv_min, values.etv_max);
		}

		if (values.date_added != null) {
			showRuntime("DRAW: Setting Date");
			tile.setDateAdded(timenow, values.date_added);
		}
		//If there is a remote value for the hidden item, ensure it is sync'ed up with the local list
		if (appSettings.hiddenTab.remote == true && values.hidden != null) {
			showRuntime("DRAW: Remote is ordering to show or hide item");
			if (values.hidden == true && !tile.isHidden())
				tile.hideTile(); //Will update the placement and list
			else if (values.hidden == false && tile.isHidden()) tile.showTile(); //Will update the placement and list
		}

		if (
			appSettings.unavailableTab.active ||
			appSettings.unavailableTab.votingToolbar
		) {
			// if the voting system is active.
			showRuntime("DRAW: Setting votes");
			tile.setVotes(values.v0, values.v1, values.s);

			showRuntime("DRAW: Setting orders");
			tile.setOrders(values.order_success, values.order_failed);

			//Assign the tiles to the proper grid
			if (appSettings.hiddenTab.active && tile.isHidden()) {
				//The hidden tiles were already moved, keep the there.
			} else if (tile.getStatus() >= DISCARDED_ORDER_FAILED) {
				showRuntime(
					"DRAW: moving the tile to Unavailable (failed order(s))"
				);
				tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
			} else if (
				appSettings.unavailableTab.consensusDiscard &&
				tile.getStatus() >= NOT_DISCARDED
			) {
				showRuntime("DRAW: moving the tile to Unavailable (consensus)");
				tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
			} else if (
				appSettings.unavailableTab.selfDiscard &&
				tile.getStatus() == DISCARDED_OWN_VOTE
			) {
				showRuntime("DRAW: moving the tile to Unavailable (own vote)");
				tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
			}
			showRuntime("DRAW: Updating the toolbar");
			tile.getToolbar().updateToolbar();
			showRuntime("DRAW: Done updating the toolbar");
		}
	});
	updateTileCounts();
	showRuntime("Done updating products");
}

//#########################
//## Triggered functions (from clicks or whatever)

//A vote button was pressed, send the vote to the server
//If a vote changed the discard status, move the tile accordingly
async function reportfees(event) {
	let asin = event.data.asin;
	let fees = event.data.fees; // The vote
	let tile = getTileByAsin(asin);

	//If the tile is already in the hidden category, a vote won't move it from there.
	if (!tile.isHidden()) {
		//Note: If the tile is already in the grid, the method will exit with false.
		//Our vote is "Fees" + the self discard option is active: move the item to the Discard grid
		if (fees == 1 && appSettings.unavailableTab.selfDiscard) {
			await tile.moveToGrid(gridUnavailable, true);

			//Our vote is "Fees" + the added vote will meet the consensus: move the item to the Discard grid
		} else if (
			fees == 1 &&
			appSettings.unavailableTab.consensusDiscard &&
			tile.getVoteFees() + 1 - tile.getVoteNoFees() >=
			appSettings.unavailableTab.consensusThreshold
		) {
			await tile.moveToGrid(gridUnavailable, true);

			//Our vote is "nofees" + there's no consensus, move the item to the regular grid
		} else if (
			fees == 0 &&
			tile.getVoteFees() - tile.getVoteNoFees() <
			appSettings.unavailableTab.consensusThreshold
		) {
			await tile.moveToGrid(gridRegular, true);
		}
	}

	//Send the vote to the server
	let arrJSON = {
		api_version: 4,
		action: "report_fee",
		country: vineCountry,
		uuid: uuid,
		asin: asin,
		fees: fees,
	};
	let jsonArrURL = JSON.stringify(arrJSON);

	let url =
		"https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;

	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	//Refresh the data for the toolbar of that specific product only
	let arrUrl = [asin];
	fetchProductsData(arrUrl);

	//Show first vote popup
	if (appSettings.general.firstVotePopup) {
		prom = await Tpl.loadFile("view/popup_firstvote.html");
		let content = Tpl.render(prom);

		let m = DialogMgr.newModal('voting');
		m.title = VOTING_TITLE;
		m.content = content;
		m.show();

		appSettings.general.firstVotePopup = false;
		saveSettings();
	}
}

//Function to receive a message from the website-end and launch an animation
//if the infinite wheel fix was used.
window.addEventListener("message", async function (event) {
	//Do not run the extension if ultraviner is running
	regex = /^.+?amazon\..+\/vine\/ultraviner.*?$/;
	if (regex.test(window.location.href)) {
		return;
	}

	// We only accept messages from ourselves
	if (event.source != window) return;

	//If we got back a message after we fixed an infinite wheel spin.
	if (event.data.type && event.data.type == "infiniteWheelFixed") {
		//console.log("Content script received message: " + event.data.text);

		prom = await Tpl.loadFile("view/infinite_wheel_fix.html");
		let content = Tpl.render(prom);

		$("#a-popover-content-3").prepend(content);
		let textContainer = $("#ext-helper-healing-text").hide(); //Begin the animation hidden
		let healingAnim = $("#ext-helper-healing");

		await textContainer.slideDown("slow").promise();
		await healingAnim
			.delay(1000)
			.animate({ opacity: "hide" }, { duration: 500 })
			.promise();
		await textContainer.slideUp("slow").promise();
		$("#ext-helper-healing").remove();
		$("#ext-helper-healing-text").remove();

		//Show a notification
		let note = new ScreenNotification();
		note.title = "Infinite spinner fixed!";
		note.lifespan = 10;
		note.content =
			"Vine Helper fixed an item that was bugged with the infinite spinner problem.";
		await Notifications.pushNotification(note);
	}

	//If we got back a message after we found an ETV.
	if (event.data.type && event.data.type == "etv") {
		//Send the ETV info to the server

		let tileASIN;
		if (event.data.data.parent_asin === null) {
			tileASIN = event.data.data.asin;
		} else {
			tileASIN = event.data.data.parent_asin;
		}

		let arrJSON = {
			api_version: 4,
			action: "report_etv",
			country: vineCountry,
			uuid: uuid,
			asin: event.data.data.asin,
			parent_asin: event.data.data.parent_asin,
			queue: vineQueue,
			etv: event.data.data.etv,
		};

		let url =
			"https://vinehelper.ovh/vinehelper.php?data=" +
			JSON.stringify(arrJSON);
		await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

		//Update the product tile ETV in the Toolbar
		let tile = getTileByAsin(tileASIN);
		tile.getToolbar().setETV(
			event.data.data.etv,
			event.data.data.etv,
			true
		);

		//Show a notification
		let note = new ScreenNotification();
		note.title = "ETV data shared";
		note.lifespan = 2;
		note.content =
			"Vine Helper shared the ETV value of " +
			event.data.data.etv +
			" for item " +
			event.data.data.asin +
			".";
		await Notifications.pushNotification(note);
	}

	//If we got back a message after an order was attempted or placed.
	if (event.data.type && event.data.type == "order") {
		let tileASIN;
		if (event.data.data.parent_asin === null) {
			tileASIN = event.data.data.asin;
		} else {
			tileASIN = event.data.data.parent_asin;
		}

		if (
			event.data.data.status == "success" ||
			event.data.data.error == "CROSS_BORDER_SHIPMENT" ||
			event.data.data.error == "ITEM_NOT_IN_ENROLLMENT"
		) {
			//Report the order status to the server
			let arrJSON = {
				api_version: 4,
				action: "report_order",
				country: vineCountry,
				uuid: uuid,
				asin: event.data.data.asin,
				parent_asin: event.data.data.parent_asin,
				order_status: event.data.data.status,
			};

			//Form the full URL
			let url =
				"https://www.vinehelper.ovh/vinehelper.php" +
				"?data=" +
				JSON.stringify(arrJSON);
			await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

			//Update the product tile ETV in the Toolbar
			let tile = getTileByAsin(tileASIN);
			tile.getToolbar().createOrderWidget(
				event.data.data.status == "success"
			);
		}

		if (event.data.data.status == "success") {
			//Show a notification
			let note = new ScreenNotification();
			note.title = "Successful order detected!";
			note.lifespan = 5;
			note.content =
				"Detected item " + event.data.data.asin + " as orderable.";
			await Notifications.pushNotification(note);
		} else {
			//Show a notification
			let note = new ScreenNotification();
			note.title = "Failed order detected.";
			note.lifespan = 5;
			note.content =
				"Detected item " +
				event.data.data.asin +
				" as not orderable with error " +
				event.data.data.error +
				".";
			await Notifications.pushNotification(note);
		}
	}

	if (event.data.type && event.data.type == "error") {
		//Show a notification
		let note = new ScreenNotification();
		note.title = "Broken product detected.";
		note.lifespan = 10;
		note.content = "Item broken with error " + event.data.data.error + ".";
		await Notifications.pushNotification(note);
	}
});

//Key binding for navigation
window.addEventListener("keydown", async function (e) {
	//Do not run the extension if ultraviner is running
	regex = /^.+?amazon\..+\/vine\/ultraviner.*?$/;
	if (regex.test(window.location.href)) {
		return;
	}

	if (!appSettings.keyBindings.active) {
		return false;
	}

	if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
		return false;
	}

	let nodeName = document.activeElement.nodeName;
	let excl = ["INPUT", "TEXTAREA", "SELECT", "LI"];
	if (excl.indexOf(nodeName) != -1) {
		return false;
	}

	if (appSettings.hiddenTab.active) {
		if (e.key == appSettings.keyBindings.hideAll) hideAllItems();
		if (e.key == appSettings.keyBindings.showAll) showAllItems();
	}
	if (e.key == appSettings.keyBindings.nextPage) {
		let link = document.querySelector("ul.a-pagination li:last-child a");
		if (link != null) window.location.href = link.href;
	}
	if (e.key == appSettings.keyBindings.previousPage) {
		let link = document.querySelector("ul.a-pagination li:first-child a");
		if (link != null) window.location.href = link.href;
	}
	if (e.key == appSettings.keyBindings.debug) {
		
		let m = DialogMgr.newModal('debug');
			m.title = DEBUGGER_TITLE;
			m.content = this.getRunTimeJSON();
			m.show();
	}
	if (e.key == appSettings.keyBindings.RFYPage) {
		window.location.href = "/vine/vine-items?queue=potluck";
	}
	if (e.key == appSettings.keyBindings.AFAPage) {
		window.location.href = "/vine/vine-items?queue=last_chance";
	}
	if (e.key == appSettings.keyBindings.AIPage) {
		window.location.href = "/vine/vine-items?queue=encore";
	}
});

function compareVersion(oldVer, newVer) {
	if (oldVer == null || oldVer == undefined || oldVer == true)
		return VERSION_MAJOR_CHANGE;

	if (oldVer == false || oldVer == newVer) return VERSION_NO_CHANGE;

	const regex = /^([0-9]+)\.([0-9]+)(?:\.([0-9]+))?$/;
	const arrOldVer = oldVer.match(regex);
	const arrNewVer = newVer.match(regex);

	if (arrOldVer[1] != arrNewVer[1]) return VERSION_MAJOR_CHANGE;
	if (arrOldVer[2] != arrNewVer[2]) return VERSION_MINOR_CHANGE;
	if (arrOldVer.length == 4 && arrNewVer.length == 4) {
		if (arrOldVer[3] != arrNewVer[3]) return VERSION_REVISION_CHANGE;
		else return VERSION_NO_CHANGE;
	} else return VERSION_REVISION_CHANGE;
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	console.log("Cross message intercepted", request, sender, sendResponse);
	sendResponse("error：" + JSON.stringify("request"));
});
