showRuntime("BOOT: Booterloader starting");

//Create the 2 grids/tabs:
var gridRegular = null;
var gridUnavailable = null; //Will be populated after the grid will be created.
var gridHidden = null; //Will be populated after the grid will be created.
var gridPinned = null; //Will be populated after the grid will be created.

//Inject the script to fix the infinite loading wheel into the main environment.
var scriptTag = document.createElement("script");
const tooltip = document.createElement("div");

//Constants
const NOT_DISCARDED_ORDER_SUCCESS = -4;
const NOT_DISCARDED = 0;
const DISCARDED_ORDER_FAILED = 4;

const VERSION_MAJOR_CHANGE = 3;
const VERSION_MINOR_CHANGE = 2;
const VERSION_REVISION_CHANGE = 1;
const VERSION_NO_CHANGE = 0;

var toolbarsDrawn = false;

const DEBUGGER_TITLE = "Vine Helper - Debugger";
const VINE_INFO_TITLE = "Vine Helper update info";
const GDPR_TITLE = "Vine Helper - GDPR";

//Do not run the extension if ultraviner is running
if (!ultraviner) {
	init();
}

//#########################
//### Main flow

//Initiate the extension
async function init() {
	//Wait for the config to be loaded before running this script
	showRuntime("BOOT: Waiting on config to be loaded...");
	while (Object.keys(appSettings).length === 0) {
		await new Promise((r) => setTimeout(r, 10));
	}
	showRuntime("BOOT: Config available. Begining init() function");

	if (appSettings.thorvarium.darktheme) {
		document.getElementsByTagName("body")[0].classList.add("darktheme");
	}

	//### Run the boot sequence
	Notifications.init(); //Ensure the container for notification was created, in case it was not in preboot.

	//The following method is called early as it does a XHR request to the server, which takes a while
	//Upon receiving the results, it will loop&wait for initTilesAndDrawToolbars() to have completed.
	//This allow the page to be rendered while we wait for the server's response.
	fetchProductsData(getAllAsin()); //Obtain the data to fill the toolbars with it.

	displayAccountData();
	showGDPRPopup();
	await initFlushTplCache(); //And display the version changelog popup
	initInjectScript();
	initSetPageTitle();
	await initCreateTabs();
	initInsertTopPagination();
	await initInsertBookmarkButton();
	initFixPreviousButton();
	await initTilesAndDrawToolbars(); //Create the tiles, and move the locally hidden tiles to the hidden tab

	hookExecute("EndOfBootloader", null);

	HiddenList.garbageCollection();
}

//If we are on the Account page, display additional info
function displayAccountData() {
	regex = /^.+?amazon\..+\/vine\/account?$/;
	arrMatches = window.location.href.match(regex);
	if (arrMatches == null) return;

	//Add a container to the status table
	document.getElementById("vvp-current-status-box").style.height = "auto";
	let elem = document.getElementById("vvp-current-status-box").children[0];
	let parentContainer = document.createElement("div");
	parentContainer.classList.add("a-row");
	elem.append(parentContainer);

	let container = document.createElement("div");
	//container.classList.add("a-column");
	container.classList.add("theme-default");
	container.classList.add("vh-container");
	container.id = "account-extra-stats";
	parentContainer.append(container);

	let json = JSON.parse(document.getElementsByClassName("vvp-body")[0].childNodes[0].innerHTML);

	let date;
	let div;

	div = document.createElement("div");
	div.innerHTML =
		"<h4>Vine Helper extra stats:</h4><strong>Customer Id: </strong><span class='masked-text'>" +
		escapeHTML(json.customerId) +
		"</span><br /><br />";
	container.appendChild(div);

	const additionalStats = {
		acceptanceDate: "Acceptance date",
		statusEarnedDate: "Status earned date",
		reevaluationDate: "Re-evaluation date",
	};

	for (const [key, value] of Object.entries(additionalStats)) {
		date = new Date(json.voiceDetails[key]).toLocaleString(vineLocale);
		div = document.createElement("div");
		div.innerHTML = `<strong>${value}:</strong><br /> ${date}<br/><br />`;
		container.appendChild(div);
	}

	div = document.createElement("div");
	div.innerHTML =
		"<strong>Re-evaluation in progress:</strong> " + escapeHTML(json.voiceDetails.isTierEvaluationInProgress);
	container.appendChild(div);
}

async function showGDPRPopup() {
	if (appSettings.general.GDPRPopup == true || appSettings.general.GDPRPopup == undefined) {
		prom = await Tpl.loadFile("view/popup_gdpr.html");
		let content = Tpl.render(prom);

		let m = DialogMgr.newModal("info");
		m.title = GDPR_TITLE;
		m.content = content;
		m.show();

		appSettings.general.GDPRPopup = false;
		saveSettings();
	}
}
async function initFlushTplCache() {
	//Show version info popup : new version
	if (appVersion != appSettings.general.versionInfoPopup) {
		showRuntime("BOOT: Flushing template cache");
		await TplMgr.flushLocalStorage(new ScreenNotification()); //Delete all template from cache

		if (compareVersion(appSettings.general.versionInfoPopup, appVersion) > VERSION_REVISION_CHANGE) {
			prom = await Tpl.loadFile("view/popup_changelog.html");
			Tpl.setVar("appVersion", appVersion);
			let content = Tpl.render(prom);

			let m = DialogMgr.newModal("info");
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
	regex = /^.+?amazon\..+\/vine\/.*[?&]search=(.*?)(?:[&].*)?$/;
	arrMatches = currentUrl.match(regex);
	if (arrMatches?.length) {
		$("title").text("Vine - S: " + arrMatches[1]);
	} else if (vineQueue != null) {
		$("title").text("Vine - " + vineQueueAbbr);
	}

	//Add the category, is any, that is currently being browsed to the title of the page.
	regex = /^.+?amazon\..+\/vine\/.*[?&]pn=(.*?)(?:[&]cn=(.*?))?(?:[&].*)?$/;
	arrMatches = currentUrl.match(regex);
	if (arrMatches?.length === 3) {
		const selector = arrMatches[2] == undefined ? ".parent-node" : ".child-node";
		$("title").append(" - " + $(`#vvp-browse-nodes-container > ${selector} > a.selectedNode`).text());
	}
}

async function initCreateTabs() {
	//Create the Discard grid
	showRuntime("BOOT: Creating tabs system");
	var tabSystem = appSettings.unavailableTab?.active || appSettings.hiddenTab?.active;
	if (tabSystem) {
		await createGridInterface();
	}

	gridRegular = new Grid(document.getElementById("vvp-items-grid"));

	if (appSettings.hiddenTab?.active) {
		gridHidden = new Grid(document.getElementById("tab-hidden"));
	}

	if (appSettings.unavailableTab?.active) {
		gridUnavailable = new Grid(document.getElementById("tab-unavailable"));
	}

	if (appSettings.pinnedTab?.active) {
		gridPinned = new Grid(document.getElementById("tab-pinned"));
	}

	showRuntime("BOOT: Grid system completed");
}

function initInsertTopPagination() {
	//Top pagination
	if (appSettings.general.topPagination) {
		removeElements("#vvp-items-grid-container .topPagination");
		removeElements("#vvp-items-grid-container .topPaginationVerbose");

		let currentPageDOM = document.querySelector("ul.a-pagination li.a-selected"); //If Null there is no pagination on the page
		if (appSettings.general.verbosePagination && vineQueueAbbr == "AI" && currentPageDOM != undefined) {
			//Fetch total items from the page
			const TOTAL_ITEMS = parseInt(
				document.querySelector("#vvp-items-grid-container p strong:last-child").innerText.replace(/,/g, "")
			);
			const ITEM_PER_PAGE = 36;
			const CURRENT_PAGE = parseInt(currentPageDOM.innerText.replace(/,/g, ""));

			const URL = window.location.pathname + window.location.search; //Sample URL to be modified
			let pagination = generatePagination(URL, TOTAL_ITEMS, ITEM_PER_PAGE, CURRENT_PAGE);

			document.querySelector("#vvp-items-grid-container p").appendChild(pagination);
		} else {
			// Clone the bottom pagination to the top of the listing
			let paginationElement = document.querySelector(".a-pagination");
			if (paginationElement != null) {
				let parentElement = paginationElement.parentNode;
				parentElement.style.marginTop = "10px";

				// Clone the parent element
				let clonedElement = parentElement.cloneNode(true);
				clonedElement.classList.add("topPagination");
				document.querySelector("#vvp-items-grid-container p").appendChild(clonedElement);
			}
		}
	}
}

async function initInsertBookmarkButton() {
	//Insert bookmark button
	if (appSettings.general.displayFirstSeen && appSettings.general.bookmark) {
		removeElements("button.bookmark");
		prom = await Tpl.loadFile("view/bookmark.html");
		Tpl.setVar("date", appSettings.general.bookmarkDate);
		let bookmarkContent = Tpl.render(prom);
		document.querySelector("#vvp-items-button-container").insertAdjacentHTML("beforeend", bookmarkContent);
		$("button.bookmarknow").on("click", function (event) {
			//Fetch the current date/time from the server
			let arrJSON = {
				api_version: 4,
				country: vineCountry,
				action: "date",
			};
			let url = VINE_HELPER_API_URL + JSON.stringify(arrJSON);
			fetch(url)
				.then((response) => response.json())
				.then(async function (response) {
					appSettings.general.bookmarkDate = new Date(response.date + " GMT").toString();
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
		$("button.bookmark3").on("click", function (event) {
			//Fetch the current date/time from the server
			let arrJSON = {
				api_version: 4,
				country: vineCountry,
				action: "date",
			};
			let url = VINE_HELPER_API_URL + JSON.stringify(arrJSON);
			fetch(url)
				.then((response) => response.json())
				.then(async function (response) {
					appSettings.general.bookmarkDate = new Date(
						new Date(response.date + " GMT").getTime() - 3 * 60 * 60 * 1000
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
		$("button.bookmark12").on("click", function (event) {
			//Fetch the current date/time from the server
			let arrJSON = {
				api_version: 4,
				country: vineCountry,
				action: "date",
			};
			let url = VINE_HELPER_API_URL + JSON.stringify(arrJSON);
			fetch(url)
				.then((response) => response.json())
				.then(async function (response) {
					appSettings.general.bookmarkDate = new Date(
						new Date(response.date + " GMT").getTime() - 12 * 60 * 60 * 1000
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
		$("button.bookmark24").on("click", function (event) {
			//Fetch the current date/time from the server
			let arrJSON = {
				api_version: 4,
				country: vineCountry,
				action: "date",
			};
			let url = VINE_HELPER_API_URL + JSON.stringify(arrJSON);
			fetch(url)
				.then((response) => response.json())
				.then(async function (response) {
					appSettings.general.bookmarkDate = new Date(
						new Date(response.date + " GMT").getTime() - 24 * 60 * 60 * 1000
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
	document.querySelectorAll("ul.a-pagination li:first-child a").forEach(function (item) {
		if (item.childNodes[3] != undefined) {
			textContent = item.childNodes[3].nodeValue;
			item.childNodes[3].nodeValue = "";
		}
	});

	//console.log(text);
	removeElements(".vh-pagination-previous");
	$("div:not([class*='topPaginationVerbose']) > ul.a-pagination li:first-child a").append(
		"<span class='vh-pagination-previous'>" + textContent + "</span>"
	);
	//$("ul.a-pagination li:first-child a").prepend(text);
}
async function initTilesAndDrawToolbars() {
	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	//- Create the tooltip to display full titles when hovering item names

	tooltip.className = "hover-tooltip";
	document.body.appendChild(tooltip);

	const arrObj = document.querySelectorAll(".vvp-item-tile");
	let tile = null;
	let a = null;
	for (let i = 0; i < arrObj.length; i++) {
		tile = generateTile(arrObj[i]);
		t = new Toolbar(tile);

		//Add tool tip to the truncated item title link
		if (appSettings.general.displayFullTitleTooltip === true) {
			a = arrObj[i].querySelector(".a-link-normal");
			a.setAttribute("data-tooltip", tile.getTitle());
			a.addEventListener("mouseenter", (event) => {
				tooltip.textContent = event.currentTarget.getAttribute("data-tooltip");
				tooltip.style.display = "block";
				positionTooltip(event);
			});

			a.addEventListener("mouseleave", () => {
				tooltip.style.display = "none";
			});

			a.addEventListener("mousemove", (event) => {
				positionTooltip(event);
			});
		}

		//Generate the toolbar
		await t.createProductToolbar();
	}

	showRuntime("done creating toolbars.");

	toolbarsDrawn = true;
}

// Function to position the tooltip
function positionTooltip(event) {
	const tooltipRect = tooltip.getBoundingClientRect();
	const offsetX = 10; // horizontal offset from the link element
	const offsetY = 10; // vertical offset from the link element

	// Use pageX and pageY to account for the scrolled distance
	let tooltipX = event.pageX + offsetX;
	let tooltipY = event.pageY + offsetY;

	// Ensure the tooltip doesn't go off-screen
	if (tooltipX + tooltipRect.width > window.pageXOffset + document.documentElement.clientWidth) {
		tooltipX = event.pageX - tooltipRect.width - offsetX;
	}

	if (tooltipY + tooltipRect.height > window.pageYOffset + document.documentElement.clientHeight) {
		tooltipY = event.pageY - tooltipRect.height - offsetY;
	}

	tooltip.style.left = `${tooltipX}px`;
	tooltip.style.top = `${tooltipY}px`;
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
	let imgContainer = $("<div>").addClass("vh-img-container").insertBefore(img);
	$(img).detach().appendTo($(imgContainer));

	//If the listing are set to listview, move the image container before its parent item.
	if (appSettings.general.listView) {
		$(imgContainer).detach().prependTo($(obj));

		//Display the full titles
		/*
		//Don't work because a-offscreen class are still in the process of being applied when this code run.
		const full = obj.querySelector(".a-truncate-full");
		console.log(full);
		console.log(full.classList);
		full.classList.remove("a-offscreen");
		console.log(full.classList);
		obj.querySelector(".a-truncate-cut").classList.add("a-offscreen");
		*/
	}

	//Move the hidden item to the hidden tab
	if (appSettings.hiddenTab.active && tile.isHidden()) {
		showRuntime("BOOT: The item is locally hidden, move it to the hidden grid.");
		tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
	}

	if (appSettings.general.displayVariantIcon) {
		//Check if the item is a parent ASIN (as variants)
		let variant = $(obj).find(".a-button-input").attr("data-is-parent-asin");
		if (variant == "true") {
			let div = $("<div>").addClass("vh-variant-indicator-container").appendTo($(imgContainer));
			let alink = $("<a href='#' onclick='return false;' title='The item has variant(s).'>").appendTo(div);
			alink.append($("<div>").addClass("vh-indicator-icon vh-icon-choice "));
		}
	}

	return tile;
}

//Get data from the server about the products listed on this page
function fetchProductsData(arrUrl) {
	let arrJSON = {
		api_version: 4,
		app_version: appVersion,
		action: "getinfo",
		country: vineCountry,
		uuid: appSettings.general.uuid,
		queue: vineQueue,
		arr_asin: arrUrl,
	};
	let jsonArrURL = JSON.stringify(arrJSON);

	showRuntime("Fetching products data...");

	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = VINE_HELPER_API_URL + jsonArrURL;

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

	if (data["invalid_uuid"] == true) {
		await obtainNewUUID();

		//Reattempt to obtain product data
		fetchProductsData(getAllAsin());

		//Do no complete this execution
		return false;
	}

	if (appSettings.hiddenTab.active) {
		showRuntime("FETCH: Waiting on hidden items list to be loaded...");
		while (!HiddenList.listLoaded) {
			await new Promise((r) => setTimeout(r, 10));
		}
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

	//For each product provided by the server, modify the local listings
	$.each(data["products"], function (key, values) {
		showRuntime("DRAW: Processing ASIN #" + key);
		//console.log(values);
		let tile = getTileByAsin(key);
		//console.log(tile);

		if (tile == null) {
			showRuntime("No tile matching " + key);
			return; //Continue the loop with the next item
		}

		//Load the ETV value
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
			if (values.hidden == true && !tile.isHidden()) {
				showRuntime("DRAW: Remote is ordering to hide item");
				tile.hideTile(); //Will update the placement and list
			} else if (values.hidden == false && tile.isHidden()) {
				showRuntime("DRAW: Remote is ordering to show item");
				tile.showTile(); //Will update the placement and list
			}
		}

		if (appSettings.unavailableTab.active) {
			showRuntime("DRAW: Setting orders");
			tile.setOrders(values.order_success, values.order_failed);
			showRuntime("DRAW: A");
			//Assign the tiles to the proper grid
			if (appSettings.hiddenTab?.active && tile.isHidden()) {
				//The hidden tiles were already moved, keep the there.
				showRuntime("DRAW: B");
			} else if (tile.getStatus() >= DISCARDED_ORDER_FAILED) {
				showRuntime("DRAW: moving the tile to Unavailable (failed order(s))");
				tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
			}

			showRuntime("DRAW: Updating the toolbar");
			tile.getToolbar().updateToolbar();
			showRuntime("DRAW: Done updating the toolbar");
		}
		tile.initiateTile();
	});

	if (appSettings.pinnedTab?.active && appSettings.hiddenTab?.remote) {
		if (data["pinned_products"] != undefined) {
			showRuntime("DRAW: Loading remote pinned products");
			for (let i = 0; i < data["pinned_products"].length; i++) {
				await addPinnedTile(
					data["pinned_products"][i]["asin"],
					data["pinned_products"][i]["title"],
					data["pinned_products"][i]["thumbnail"]
				); //grid.js
			}
		}
	}

	updateTileCounts();
	showRuntime("Done updating products");
}

//#########################
//## Triggered functions (from clicks or whatever)

//Messaging from accross tabs and context
//Messages sent via window.postMessage({}, "*");
//Most requests comes from the inj.js file, which is in a different scope/context.
window.addEventListener("message", async function (event) {
	//Do not run the extension if ultraviner is running
	if (ultraviner) {
		return;
	}

	// We only accept messages from ourselves
	if (event.source != window) return;

	//If we received a request for validation of a variant
	if (event.data.type && event.data.type == "variantValidationRequest") {
		let lastResortFixUsed = false;
		for (const idx in event.data.variant) {
			for (const dimension in event.data.variant[idx]["dimensions"]) {
				try {
					$(document).children(
						'option[id="vvp-size-' + event.data.variant[idx]["dimensions"][dimension] + '-option"]'
					); //This does nothing, just test the selector
					//Don't change anything, it passed the test.
				} catch (error) {
					//If the validation failed, use the ASIN as a value for the variant's dimension which failed.
					showRuntime("Found unfixable variant: " + event.data.variant[idx]["dimensions"][dimension]);
					event.data.variant[idx]["dimensions"][dimension] =
						event.data.variant[idx]["asin"] +
						"-" +
						event.data.variant[idx]["dimensions"][dimension].replace(/[^a-zA-Z0-9]/g, "");
					lastResortFixUsed = true;
				}
			}
		}
		window.postMessage(
			{
				type: "variantValidationResponse",
				result: event.data.variant,
			},
			"/" //message should be sent to the same origin as the current document.
		);

		if (lastResortFixUsed) {
			window.postMessage(
				{
					type: "infiniteWheelFixed",
					text: "Last resort method used.",
				},
				"/" //message should be sent to the same origin as the current document.
			);
		}
	}

	//Sometime, mostly for debugging purpose, the Service worker can try to display notifications.
	if (event.data.type && event.data.type == "rawNotification") {
		let note = new ScreenNotification();
		note.title = "System";
		note.lifespan = 10;
		note.content = event.data.content;
		await Notifications.pushNotification(note);
	}

	//If we got back a message after we fixed an infinite wheel spin.
	if (event.data.type && event.data.type == "infiniteWheelFixed") {
		//console.log("Content script received message: " + event.data.text);

		let prom = await Tpl.loadFile("view/infinite_wheel_fix.html");
		let content = Tpl.render(prom);

		$("#a-popover-content-3").prepend(content);
		let textContainer = $("#vh-healing-text").hide(); //Begin the animation hidden
		let healingAnim = $("#vh-healing");

		await textContainer.slideDown("slow").promise();
		await healingAnim.delay(1000).animate({ opacity: "hide" }, { duration: 500 }).promise();
		await textContainer.slideUp("slow").promise();
		removeElements("#vh-healing");
		removeElements("#vh-healing-text");

		//Show a notification
		let note = new ScreenNotification();
		note.title = "Infinite spinner fixed!";
		note.lifespan = 10;
		note.content = "Vine Helper fixed an item bugged an infinite spinner: " + event.data.text;
		await Notifications.pushNotification(note);
	}

	//If we got back a message after we found an ETV.
	if (event.data.type && event.data.type == "etv") {
		//Send the ETV info to the server
		let tileASIN = event.data.data.parent_asin;
		if (tileASIN === null) {
			tileASIN = event.data.data.asin;
		}

		const arrJSON = {
			api_version: 4,
			action: "report_etv",
			country: vineCountry,
			uuid: uuid,
			asin: event.data.data.asin,
			parent_asin: event.data.data.parent_asin,
			queue: vineQueue,
			etv: event.data.data.etv,
		};

		const url = VINE_HELPER_API_URL + JSON.stringify(arrJSON);
		await fetch(url); //Await to wait until the query to have been processed before refreshing the display

		//Update the product tile ETV in the Toolbar
		const tile = getTileByAsin(tileASIN);
		tile.getToolbar().setETV(event.data.data.etv, event.data.data.etv, true);

		//Show a notification
		if (!appSettings.notification.reduce) {
			const note = new ScreenNotification();
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

		if (
			appSettings.general.displayModalETV &&
			document.getElementById("vvp-product-details-modal--tax-value").style?.display == "none"
		) {
			document.getElementById("vvp-product-details-modal--tax-value").style.display = "block";
			document.getElementById("vvp-product-details-modal--tax-spinner").style.display = "none";
			document.getElementById("vvp-product-details-modal--tax-value-string").innerText = event.data.data.etv;
		}
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
			const arrJSON = {
				api_version: 4,
				action: "report_order",
				country: vineCountry,
				uuid: uuid,
				asin: event.data.data.asin,
				parent_asin: event.data.data.parent_asin,
				order_status: event.data.data.status,
			};

			//Form the full URL
			const url = VINE_HELPER_API_URL + JSON.stringify(arrJSON);
			await fetch(url); //Await to wait until the query to have been processed before refreshing the display

			//Update the product tile ETV in the Toolbar
			let tile = getTileByAsin(tileASIN);
			tile.getToolbar().createOrderWidget(event.data.data.status == "success");
		}

		const note = new ScreenNotification();
		if (event.data.data.status == "success") {
			//Show a notification
			note.title = "Successful order detected!";
			note.lifespan = 10;
			note.content = "Detected item " + event.data.data.asin + " as orderable.";
		} else {
			//Show a notification

			note.title = "Failed order detected.";
			note.lifespan = 5;
			note.content =
				"Detected item " + event.data.data.asin + " as not orderable with error " + event.data.data.error + ".";
		}
		await Notifications.pushNotification(note);
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

//Message from within the context of the extension
//Messages sent via: browser.tabs.sendMessage(tab.id, data);
//In this case, all messages are coming from the service_worker file.
browser.runtime.onMessage.addListener(async function (message, sender, sendResponse) {
	let data = message;
	if (data.type == undefined) return;

	//If we received a request for a hook execution
	if (data.type && data.type == "hookExecute") {
		console.log("Hook Execute request");
		hookExecute(data.hookname, data.data);
	}

	if (data.type == "newItemCheck") {
		if (appSettings.notification.screen.active) {
			//Display a notification that we have checked for items.
			let note = new ScreenNotification();
			note.template = "view/notification_loading.html";
			note.lifespan = 3;
			await Notifications.pushNotification(note);
		}
	}

	if (data.type == "newItem") {
		if (
			data.index < 10 && //Limit the notification to the top 10 most recents
			vineBrowsingListing && //Only show notification on listing pages
			appSettings.notification.screen.active
		) {
			let { date, asin, title, search, img_url, domain, etv } = data;

			//Generate the content to be displayed in the notification
			const prom = await Tpl.loadFile("/view/notification_new_item.html");

			Tpl.setIf("show_image", appSettings.notification.screen.thumbnail);
			Tpl.setVar("date", date);
			Tpl.setVar("search", search);
			Tpl.setVar("asin", asin);
			Tpl.setVar("description", title);
			Tpl.setVar("img_url", img_url);

			//Generate the notification
			let note2 = new ScreenNotification();
			note2.title = "New item detected !";
			note2.lifespan = 60;

			//Play the notification sound
			if (
				appSettings.notification.screen.regular.volume > 0 &&
				appSettings.notification.screen.regular.sound != "0"
			) {
				note2.sound = "resource/sound/" + appSettings.notification.screen.regular.sound + ".mp3";
				note2.volume = appSettings.notification.screen.regular.volume;
			}
			note2.content = Tpl.render(prom);
			Notifications.pushNotification(note2);
		}
	}
});

//Key bindings/keyboard shortcuts for navigation
window.addEventListener("keyup", async function (e) {
	//Do not run the extension if ultraviner is running
	if (ultraviner) {
		return;
	}

	if (!appSettings.keyBindings?.active || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
		return false;
	}

	let nodeName = document.activeElement.nodeName;
	let excl = ["INPUT", "TEXTAREA", "SELECT", "LI"];
	if (excl.indexOf(nodeName) != -1) {
		return false;
	}

	//Debug: secret keybind to generate dummy hidden items
	/*if (e.key == "g") {
		if (
			this.confirm(
				"Generate 10,000 dummy items in local storage? (Will take ~1min)"
			)
		) {
			for (i = 0; i < 10000; i++) {
				fakeAsin = generateString(10);
				HiddenList.addItem(fakeAsin, false);
			}
			HiddenList.saveList();
			this.alert("10000 items generated");
		}
	}
	*/

	const keybindingMap = {
		[appSettings.keyBindings?.hideAll]: hideAllItems,
		[appSettings.keyBindings?.showAll]: showAllItems,
		[appSettings.keyBindings?.nextPage]: () =>
			document.querySelector("#vvp-items-grid-container>div>ul.a-pagination li:last-child a")?.click(),
		[appSettings.keyBindings?.previousPage]: () =>
			document.querySelector("#vvp-items-grid-container>div>ul.a-pagination li:first-child a")?.click(),
		[appSettings.keyBindings?.debug]: async () => {
			let content = await getRunTimeJSON();
			regex = /\s*{<br\/>\n\s*"time": ([0-9]+),<br\/>\n\s*"event": "(.+?)"<br\/>\n\s*}(?:,<br\/>\n)?/gm;
			const content2 = content.replace(regex, `<strong>$1ms:</strong> $2<br/>\n`);
			let m = DialogMgr.newModal("debug");
			m.title = DEBUGGER_TITLE;
			m.content = content2;
			m.show();
		},
		[appSettings.keyBindings?.RFYPage]: () => (window.location.href = "/vine/vine-items?queue=potluck"),
		[appSettings.keyBindings?.AFAPage]: () => (window.location.href = "/vine/vine-items?queue=last_chance"),
		[appSettings.keyBindings?.AIPage]: () => (window.location.href = "/vine/vine-items?queue=encore"),
		[appSettings.keyBindings?.AIPage2]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=2"),
		[appSettings.keyBindings?.AIPage3]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=3"),
		[appSettings.keyBindings?.AIPage4]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=4"),
		[appSettings.keyBindings?.AIPage5]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=5"),
		[appSettings.keyBindings?.AIPage6]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=6"),
		[appSettings.keyBindings?.AIPage7]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=7"),
		[appSettings.keyBindings?.AIPage8]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=8"),
		[appSettings.keyBindings?.AIPage9]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=9"),
		[appSettings.keyBindings?.AIPage10]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=10"),
	};

	//Only allow the hideAll and showAll keybinding if the hiddenTab is activated.
	if (
		(e.key.toLowerCase() == appSettings.keyBindings?.hideAll ||
			e.key.toLowerCase() == appSettings.keyBindings?.showAll) &&
		!appSettings.hiddenTab?.active
	) {
		return false;
	}

	const cb = keybindingMap[e.key.toLowerCase()];
	if (typeof cb === "function") {
		cb();
	}
});

function compareVersion(oldVer, newVer) {
	if (oldVer == null || oldVer == undefined || oldVer == true) return VERSION_MAJOR_CHANGE;

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

function escapeHTML(value) {
	let val = String(value);
	val = val.replace(/[&<>"'`=/]/g, function (match) {
		return {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
			"/": "&#x2F;",
			"`": "&#x60;",
			"=": "&#x3D;",
		}[match];
	});
	return val;
}

/**
 * Only unescape characters which are frequent in vine title and pause no risk of code injection
 * Used by tile.js
 * @param {string} value
 */
function unescapeHTML(encodedString) {
	const entityMap = {
		"&amp;": "&",
		"&#34;": '"',
		"&#39;": "'",
	};

	// Use a for...in loop for better performance
	for (const key in entityMap) {
		const value = entityMap[key];
		encodedString = encodedString.split(key).join(value);
	}

	return encodedString;
}

/** Remove an element from the DOM, ignore if it does not exist
 * @param selector CSS style selector of the element to remove
 */
function removeElements(selector) {
	let elementsToRemove = document.querySelectorAll(selector);

	elementsToRemove.forEach(function (element) {
		element.remove();
	});
}

function getRandomNumber(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
