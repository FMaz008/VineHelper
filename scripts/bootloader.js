timeMarker["document_end"] = Date.now();
showRuntime(
	"BOOT: Booterloader starting. DOM load time from Amazon: " +
		(timeMarker["document_end"] - timeMarker["document_start"]) +
		"ms"
);

//Create the 4 grids/tabs:
var gridRegular = null;
var gridUnavailable = null; //Will be populated after the grid will be created.
var gridHidden = null; //Will be populated after the grid will be created.
var gridPinned = null; //Will be populated after the grid will be created.

//Tooltip used to display full titles/description. Same tooltip will get reused for all uses.
const tooltip = document.createElement("div");

//Constants
const NOT_DISCARDED_ORDER_SUCCESS = -4;
const NOT_DISCARDED = 0;
const DISCARDED_ORDER_FAILED = 4;

const VERSION_MAJOR_CHANGE = 3;
const VERSION_MINOR_CHANGE = 2;
const VERSION_REVISION_CHANGE = 1;
const VERSION_NO_CHANGE = 0;

//Timing variable used to wait until the status change before proceeding with further code
var toolbarsDrawn = false;
var productUpdated = false;

const DEBUGGER_TITLE = "Vine Helper - Debugger";
const VINE_INFO_TITLE = "Vine Helper update info";
const GDPR_TITLE = "Vine Helper - GDPR";

var websiteOpts = null;
var vvpContext = null;
var marketplaceId = null;
var customerId = null;

//Do not run the extension if ultraviner is running
if (!ultraviner) {
	init();
}

//#########################
//### Main flow

//Initiate the extension
async function init() {
	//Obtain the marketplaceId
	try {
		vvpContext = JSON.parse(document.querySelector('script[data-a-state=\'{"key":"vvp-context"}\'').innerHTML);

		marketplaceId = vvpContext.marketplaceId;
		customerId = vvpContext.customerId;
	} catch (err) {
		//Do nothing
	}

	//Wait for the config to be loaded before running this script
	showRuntime("BOOT: Waiting on preboot to complete...");
	while (!Settings || !Settings.isLoaded() || !prebootCompleted) {
		await new Promise((r) => setTimeout(r, 10));
	}
	showRuntime("BOOT: Config available. Begining init() function");

	if (Settings.get("thorvarium.darktheme")) {
		document.getElementsByTagName("body")[0].classList.add("darktheme");
	}

	//### Run the boot sequence

	//The following method is called early as it does a XHR request to the server, which takes a while
	//Upon receiving the results, it will loop&wait for initTilesAndDrawToolbars() to have completed.
	//This allow the page to be rendered while we wait for the server's response.

	fetchProductsDatav5(); //Obtain the data to fill the toolbars with it.

	displayAccountData();
	initAddNotificationMonitorLink();
	addRecommendationLink();
	showGDPRPopup();
	await initFlushTplCache(); //And display the version changelog popup
	initInjectScript();
	initSetPageTitle();
	await initCreateTabs();
	initInsertTopPagination();
	await initInsertBookmarkButton();
	initFixPreviousButton();
	await initTilesAndDrawToolbars(); //Create the tiles, and move the locally hidden tiles to the hidden tab
	initModalNagivation();

	updateTileCounts();

	hookExecute("EndOfBootloader", null);

	HiddenList.garbageCollection();
}

//If we are on the Account page, display additional info
function displayAccountData() {
	regex = /^.+?amazon\..+\/vine\/account?$/;
	arrMatches = window.location.href.match(regex);
	if (arrMatches == null) return;

	//Add the Evaluation Metric styling:
	displayAccountDataEvaluationMetrics();

	//Hide Opt out of Vine button
	displayAccountHideOptOutButton();

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

	let date;
	let div;
	div = document.createElement("div");
	div.innerHTML =
		"<h4>Vine Helper extra stats:</h4><strong>Customer Id: </strong><span class='masked-text'>" +
		escapeHTML(customerId) +
		"</span><br /><br />";
	container.appendChild(div);

	const additionalStats = {
		acceptanceDate: "Acceptance date",
		statusEarnedDate: "Status earned date",
		reevaluationDate: "Re-evaluation date",
	};

	for (const [key, value] of Object.entries(additionalStats)) {
		date = new Date(vvpContext.voiceDetails[key]).toLocaleString(I13n.getLocale());
		div = document.createElement("div");
		div.innerHTML = `<strong>${value}:</strong><br /> ${date}<br/><br />`;
		container.appendChild(div);
	}

	div = document.createElement("div");
	div.innerHTML =
		"<strong>Re-evaluation in progress:</strong> " + escapeHTML(vvpContext.voiceDetails.isTierEvaluationInProgress);
	container.appendChild(div);
}

function displayAccountHideOptOutButton() {
	if (Settings.isPremiumUser() && Settings.get("general.hideOptOutButton") == true) {
		document.getElementById("vvp-opt-out-of-vine-button").style.display = "none";
	}
}

/**
 * Contribution from https://github.com/robartsd/VineTools/blob/main/evaluationMetrics.user.js
 */
function displayAccountDataEvaluationMetrics() {
	const periodStart = new Date(parseInt(document.querySelector("#vvp-eval-start-stamp").innerText));
	const periodEnd = new Date(parseInt(document.querySelector("#vvp-eval-end-stamp").innerText));

	document.querySelector("#vvp-evaluation-period-tooltip-trigger").innerText =
		`Evaluation period: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleString()}`;

	const percent = Math.round(
		parseFloat(document.querySelector("#vvp-perc-reviewed-metric-display strong").innerText)
	);
	if (percent > 0) {
		const count = parseInt(
			document.querySelector("#vvp-num-reviewed-metric-display strong").innerText.replace(/,/g, "")
		);
		const orderCount = Math.round((count / percent) * 100);
		const orderMin = Math.min(Math.ceil((count / (percent + 0.5)) * 100), orderCount);
		const orderMax = Math.max(Math.floor((count / (percent - 0.5)) * 100), orderCount);
		const targetMin = Math.ceil(orderMin * 0.9) - count;
		const targetMax = Math.ceil(orderMax * 0.9) - count;
		const orderEstimate = orderMin == orderMax ? orderMax : `${orderMin}&ndash;${orderMax}`;
		const targetRequired = targetMin == targetMax ? targetMax : `${targetMin}&ndash;${targetMax}`;

		if (targetMax > 0) {
			document.querySelector("#vvp-perc-reviewed-metric-display p").innerHTML =
				`You have reviewed <strong>${percent}%</strong> of ${orderEstimate} items; review ${targetRequired} more to reach 90%`;
		} else {
			document.querySelector("#vvp-perc-reviewed-metric-display p").innerHTML =
				`You have reviewed <strong>${percent}%</strong> of ${orderEstimate} Vine items this period`;
		}

		const periodFraction = (new Date().setUTCHours(0, 0, 0, 0) - periodStart) / (periodEnd - periodStart);
		if (periodFraction > 0) {
			const awaitingEstimate = orderMax - count;
			const projectedCount = count / periodFraction;
			const projectedOrders = orderMin / periodFraction;
			const projectedPercent = (projectedOrders - awaitingEstimate) / projectedOrders;
			const countBar = document.querySelector("#vvp-num-reviewed-metric-display .animated-progress span");
			const percentBar = document.querySelector("#vvp-perc-reviewed-metric-display .animated-progress span");
			if (projectedCount < 70) {
				countBar.style.backgroundColor = "red";
			} else if (projectedCount < 77) {
				countBar.style.backgroundColor = "orange";
			} else if (projectedCount < 80) {
				countBar.style.backgroundColor = "yellow";
			}

			if (projectedPercent < 0.8) {
				percentBar.style.backgroundColor = "red";
			} else if (projectedPercent < 0.88) {
				percentBar.style.backgroundColor = "orange";
			} else if (projectedPercent < 0.92) {
				percentBar.style.backgroundColor = "yellow";
			}
		}
	}
}

async function showGDPRPopup() {
	if (Settings.get("general.GDPRPopup", false) == true || Settings.get("general.GDPRPopup", false) == undefined) {
		prom = await Tpl.loadFile("view/popup_gdpr.html");
		let content = Tpl.render(prom);

		let m = DialogMgr.newModal("info");
		m.title = GDPR_TITLE;
		m.content = content;
		m.show();

		Settings.set("general.GDPRPopup", false);
	}
}
async function initFlushTplCache() {
	if (appVersion == null) {
		return false;
	}

	//Show version info popup : new version
	if (appVersion != Settings.get("general.versionInfoPopup", false)) {
		showRuntime("BOOT: Flushing template cache");
		await TplMgr.flushLocalStorage(new ScreenNotification()); //Delete all template from cache

		if (compareVersion(Settings.get("general.versionInfoPopup", false), appVersion) > VERSION_REVISION_CHANGE) {
			prom = await Tpl.loadFile("view/popup_changelog.html");
			Tpl.setVar("appVersion", appVersion);
			let content = Tpl.render(prom);

			let m = DialogMgr.newModal("info");
			m.title = VINE_INFO_TITLE;
			m.content = content;
			m.show();
		}

		Settings.set("general.versionInfoPopup", appVersion);
	}
}

function initInjectScript() {
	//Inject the script to fix the infinite loading wheel into the main environment.
	const scriptTag = document.createElement("script");

	//Inject the infinite loading wheel fix to the "main world"
	scriptTag.src = browser.runtime.getURL("scripts/inj.js");
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
		document.title = "Vine - S: " + arrMatches[1];
	} else if (vineQueue != null) {
		document.title = "Vine - " + vineQueueAbbr;
	}

	//Add the category, is any, that is currently being browsed to the title of the page.
	regex = /^.+?amazon\..+\/vine\/.*[?&]pn=(.*?)(?:[&]cn=(.*?))?(?:[&].*)?$/;
	arrMatches = currentUrl.match(regex);
	if (arrMatches?.length === 3) {
		const selector = arrMatches[2] == undefined ? ".parent-node" : ".child-node";
		const selectedNode = document.querySelector(`#vvp-browse-nodes-container > ${selector} > a.selectedNode`);

		// Check if the element exists to avoid errors
		if (selectedNode) {
			// Get the text content of the element
			const selectedNodeText = selectedNode.textContent;
			document.title = document.title + " - " + selectedNodeText;
		}
	}
}

function initAddNotificationMonitorLink() {
	const ul = document.querySelector("ul.vvp-header-links-container");
	if (ul) {
		const li = document.createElement("li");
		li.classList.add("vvp-header-link");
		ul.appendChild(li);

		const a = document.createElement("a");
		a.href = chrome.runtime.getURL("page/notifications.html");
		a.target = "_blank";
		a.innerText = "VH Notifications Monitor";
		li.appendChild(a);
	}
}

function addRecommendationLink() {
	const tab = document.querySelector(".a-tab-container > ul > li:last-of-type");
	if (tab) {
		const rec = tab.cloneNode(true);
		rec.style.float = "right";
		const a = rec.firstChild;
		a.rel = "noreferrer";
		a.href = "/gp/yourstore/iyr/";
		a.textContent = "Recommendations";
		tab.parentNode.appendChild(rec);
	}
}

async function initCreateTabs() {
	//Create the Discard grid
	showRuntime("BOOT: Creating tabs system");
	var tabSystem = Settings.get("unavailableTab.active") || Settings.get("hiddenTab.active");
	if (tabSystem) {
		await createGridInterface();
	}

	gridRegular = new Grid(document.getElementById("vvp-items-grid"));

	if (Settings.get("hiddenTab.active")) {
		gridHidden = new Grid(document.getElementById("tab-hidden"));
	}

	if (Settings.get("unavailableTab.active")) {
		gridUnavailable = new Grid(document.getElementById("tab-unavailable"));
	}

	if (Settings.get("pinnedTab.active")) {
		gridPinned = new Grid(document.getElementById("tab-pinned"));
	}

	showRuntime("BOOT: Grid system completed");
}

function initInsertTopPagination() {
	//Top pagination
	if (Settings.get("general.topPagination")) {
		removeElements("#vvp-items-grid-container .topPagination");
		removeElements("#vvp-items-grid-container .topPaginationVerbose");

		let currentPageDOM = document.querySelector("ul.a-pagination li.a-selected"); //If Null there is no pagination on the page
		if (
			Settings.isPremiumUser() &&
			Settings.get("general.verbosePagination") &&
			vineQueueAbbr == "AI" &&
			currentPageDOM != undefined
		) {
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

async function setBookmarkDate(timeOffset) {
	//Fetch the current date/time from the server
	let arrJSON = {
		api_version: 5,
		country: I13n.getCountryCode(),
		action: "date",
	};
	const options = {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(arrJSON),
	};
	fetch(VINE_HELPER_API_V5_URL, options)
		.then((response) => response.json())
		.then(async function (response) {
			Settings.set(
				"general.bookmarkDate",

				new Date(YMDHiStoISODate(response.date).getTime() - timeOffset).toString()
			);

			let note = new ScreenNotification();
			note.title = "Marker set !";
			note.lifespan = 30;
			note.content =
				"Marker set for <br />" +
				Settings.get("general.bookmarkDate") +
				"<br />Newer items will be highlighted.";
			await Notifications.pushNotification(note);
		});
}

async function initInsertBookmarkButton() {
	//Insert bookmark button
	if (Settings.get("general.displayFirstSeen") && Settings.get("general.bookmark")) {
		removeElements("button.bookmark");
		prom = await Tpl.loadFile("view/bookmark.html");
		Tpl.setVar("date", Settings.get("general.bookmarkDate"));
		let bookmarkContent = Tpl.render(prom);
		document.querySelector("#vvp-items-button-container").insertAdjacentHTML("beforeend", bookmarkContent);
		const button0 = document.querySelector("button.bookmarknow");
		if (button0) {
			button0.addEventListener("click", function (event) {
				setBookmarkDate(0);
			});
		}
		const button3 = document.querySelector("button.bookmark3");
		if (button3) {
			button3.addEventListener("click", function (event) {
				setBookmarkDate(3 * 60 * 60 * 1000);
			});
		}

		const button12 = document.querySelector("button.bookmark12");
		if (button12) {
			button12.addEventListener("click", function (event) {
				setBookmarkDate(12 * 60 * 60 * 1000);
			});
		}

		const button24 = document.querySelector("button.bookmark24");
		if (button24) {
			button24.addEventListener("click", function (event) {
				setBookmarkDate(24 * 60 * 60 * 1000);
			});
		}
	}
}

function initFixPreviousButton() {
	//Place the text-content of the Previous button before the other child elements.
	//This is to enable the first letter of the previous button to be styled for the keybinding.

	let textContent = "";
	document.querySelectorAll("ul.a-pagination li:first-child a").forEach(function (item) {
		if (item.childNodes[3] != undefined) {
			textContent = item.childNodes[3].nodeValue;
			item.childNodes[3].nodeValue = "";
		}
	});

	//console.log(text);
	removeElements(".vh-pagination-previous");

	document
		.querySelectorAll("div:not([class*='topPaginationVerbose']) > ul.a-pagination li:first-child a")
		.forEach((div) => {
			const span = document.createElement("span");
			span.className = "vh-pagination-previous";
			span.textContent = textContent;

			div.appendChild(span);
		});
}
async function initTilesAndDrawToolbars() {
	//Browse each items from the Regular grid
	//- Create an array of all the products listed on the page
	//- Create an empty toolbar for the item tile
	//- Create the tooltip to display full titles when hovering item names

	tooltip.className = "hover-tooltip";
	document.body.appendChild(tooltip);

	const arrObj = document.querySelectorAll(".vvp-item-tile:not(.pinned)");
	let tile = null;
	let a = null;
	for (let i = 0; i < arrObj.length; i++) {
		tile = await generateTile(arrObj[i]);
		t = new Toolbar(tile);

		//Add tool tip to the truncated item title link
		if (Settings.get("general.displayFullTitleTooltip")) {
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

	// Scoll to the RFY/AFA/AI header
	if (Settings.get("general.scrollToRFY")) {
		var scrollTarget = document.getElementById("vvp-items-button-container");
		scrollTarget.scrollIntoView({ behavior: "smooth" });
	}

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
	if (tooltipX + tooltipRect.width > window.scrollX + document.documentElement.clientWidth) {
		tooltipX = event.pageX - tooltipRect.width - offsetX;
	}

	if (tooltipY + tooltipRect.height > window.scrollY + document.documentElement.clientHeight) {
		tooltipY = event.pageY - tooltipRect.height - offsetY;
	}

	tooltip.style.left = `${tooltipX}px`;
	tooltip.style.top = `${tooltipY}px`;
}

//This function will return an array of all the product on the page, with their description and thumbnail url
function getAllProductsData() {
	let arrUrl = []; //Will be use to store the URL identifier of the listed products.
	const arrObj = document.querySelectorAll(".vvp-item-tile");

	if (arrObj.length == 0) {
		return [];
	}

	for (let i = 0; i < arrObj.length; i++) {
		const obj = arrObj[i];
		const asin = getAsinFromDom(obj);
		const btn = document.querySelector(`input[data-asin="${asin}"]`);
		const isParent = btn.dataset.isParentAsin == "true";
		const enrollmentGUID = btn.dataset.recommendationId.match(/#vine\.enrollment\.([a-f0-9-]+)/i)[1];
		const title = getTitleFromDom(obj);
		const thumbnail = getThumbnailURLFromDom(obj);
		//Do not query product info for product without a title or a thumbnail.
		if (title && thumbnail) {
			arrUrl.push({
				asin: asin,
				title: title,
				thumbnail: thumbnail,
				is_parent_asin: isParent,
				enrollment_guid: enrollmentGUID,
			});
		}
	}
	return arrUrl;
}

//Convert the regular tile to the Vine Helper version.
async function generateTile(obj) {
	let tile;
	tile = new Tile(obj, gridRegular);

	//Add a container for the image and place the image in it.
	let img = obj.querySelector(".vvp-item-tile-content img"); // Get the img element
	let imgContainer = document.createElement("div"); // Create a new div element
	imgContainer.classList.add("vh-img-container"); // Add the 'vh-img-container' class to the div
	img.parentNode.insertBefore(imgContainer, img); // Insert the imgContainer before the img element

	// Remove (detach) the img from its parent node
	img.parentNode.removeChild(img);
	imgContainer.appendChild(img); // Move the img into the imgContainer

	//If the listing are set to listview, move the image container before its parent item.
	if (Settings.get("general.listView")) {
		imgContainer.parentNode.removeChild(imgContainer);
		obj.insertBefore(imgContainer, obj.firstChild);

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

		//If small items stylesheet are used, add a class to resize-down the thumnails.
		if (
			Settings.get("thorvarium.mobileios") ||
			Settings.get("thorvarium.mobileandroid") ||
			Settings.get("thorvarium.smallItems")
		) {
			document.querySelector("#vh-tabs").classList.add("smallitems");
		}
	}

	//Move the hidden item to the hidden tab
	if (Settings.get("hiddenTab.active") && tile.isHidden()) {
		showRuntime("BOOT: The item is locally hidden, move it to the hidden grid.");
		await tile.moveToGrid(gridHidden, false); //This is the main sort, do not animate it
	}

	if (Settings.get("general.displayVariantIcon")) {
		//Check if the item is a parent ASIN (as variants)
		let buttonInput = obj.querySelector(".a-button-input");
		let variant = buttonInput.getAttribute("data-is-parent-asin");

		if (variant === "true") {
			// Create the div element and add a class
			let div = document.createElement("div");
			div.classList.add("vh-variant-indicator-container");
			imgContainer.appendChild(div);

			// Create the <a> element with a link that does nothing
			let alink = document.createElement("a");
			alink.href = "#";
			alink.setAttribute("onclick", "return false;");
			alink.setAttribute("title", "The item has variant(s).");
			div.appendChild(alink);

			// Create another div element for the icon and add classes
			let iconDiv = document.createElement("div");
			iconDiv.classList.add("vh-indicator-icon", "vh-icon-choice");
			alink.appendChild(iconDiv);
		}
	}

	return tile;
}

//Get data from the server about the products listed on this page
function fetchProductsDatav5() {
	const arrProductsData = getAllProductsData();
	if (arrProductsData.length == 0) {
		return false; //No product on this page
	}

	timeMarker["fetch_start"] = Date.now();
	showRuntime("FETCH: Fetching data from VineHelper's server...");

	const content = {
		api_version: 5,
		app_version: appVersion,
		action: "get_info",
		country: I13n.getCountryCode(),
		uuid: Settings.get("general.uuid", false),
		queue: vineQueue,
		items: arrProductsData,
	};

	fetch(VINE_HELPER_API_V5_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	})
		.then((response) => response.json())
		.then(serverProductsResponse)
		.catch(function () {
			//error =>  console.log(error);
			/*
			content.items.forEach(function (val, key) {
				let t = getTileByAsin(val.asin); //server offline
			});
			*/
		});
}

//Process the results obtained from the server
//Update each tile with the data pertaining to it.
async function serverProductsResponse(data) {
	timeMarker["fetch_end"] = Date.now();
	showRuntime(
		"FETCH: Response received from VineHelper's server..." +
			(timeMarker["fetch_end"] - timeMarker["fetch_start"]) +
			"ms"
	);
	if (data["invalid_uuid"] == true) {
		await obtainNewUUID();

		//Reattempt to obtain product data
		fetchProductsDatav5();

		//Do no complete this execution
		return false;
	}

	if (Settings.get("hiddenTab.active")) {
		showRuntime("FETCH: Waiting on hidden items list to be loaded...");
		while (!HiddenList.listLoaded) {
			await new Promise((r) => setTimeout(r, 10));
		}
		showRuntime("FETCH: Hidden items list loaded...");
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
	for (const [key, values] of Object.entries(data["products"])) {
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
		if (Settings.isPremiumUser() && Settings.get("hiddenTab.remote") && values.hidden != null) {
			if (values.hidden == true && !tile.isHidden()) {
				showRuntime("DRAW: Remote is ordering to hide item");
				await tile.hideTile(false); //Will update the placement and list
			} else if (values.hidden == false && tile.isHidden()) {
				showRuntime("DRAW: Remote is ordering to show item");
				await tile.showTile(false); //Will update the placement and list
			}
		}

		if (Settings.get("unavailableTab.active")) {
			showRuntime("DRAW: Setting orders");
			tile.setOrders(values.order_success, values.order_failed);
			showRuntime("DRAW: A");
			//Assign the tiles to the proper grid
			if (Settings.get("hiddenTab.active") && tile.isHidden()) {
				//The hidden tiles were already moved, keep the there.
				showRuntime("DRAW: B");
			} else if (tile.getStatus() >= DISCARDED_ORDER_FAILED) {
				showRuntime("DRAW: moving the tile to Unavailable (failed order(s))");
				await tile.moveToGrid(gridUnavailable, false); //This is the main sort, do not animate it
			}

			showRuntime("DRAW: Updating the toolbar");
			tile.getToolbar().updateToolbar();
			showRuntime("DRAW: Done updating the toolbar");
		}
		await tile.initiateTile();
	}

	//Loading remote stored pinned items
	if (Settings.isPremiumUser() && Settings.get("pinnedTab.active") && Settings.get("hiddenTab.remote")) {
		if (data["pinned_products"] != undefined) {
			showRuntime("DRAW: Loading remote pinned products");
			for (let i = 0; i < data["pinned_products"].length; i++) {
				await addPinnedTile(
					data["pinned_products"][i]["asin"],
					data["pinned_products"][i]["queue"],
					data["pinned_products"][i]["title"],
					data["pinned_products"][i]["thumbnail"],
					data["pinned_products"][i]["is_parent_asin"],
					data["pinned_products"][i]["enrollment_guid"]
				); //grid.js
			}
		}
	}

	//Update Patreon tier
	if (Settings.get("general.patreon.tier") != data["patreon_membership_tier"]) {
		Settings.set("general.patreon.tier", data["patreon_membership_tier"]);
	}

	updateTileCounts();
	showRuntime("Done updating products");
	productUpdated = true;
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
	if (event.source != window) {
		return;
	}

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

		// Prepend content to the element with ID 'a-popover-content-3'
		const popoverContent = document.getElementById("a-popover-content-3");
		if (popoverContent) {
			popoverContent.insertAdjacentHTML("afterbegin", content);
		}

		//Animate

		const healingAnim = document.getElementById("vh-healing");
		if (healingAnim) {
			healingAnim.classList.add("slide-transition");
			await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay 1 second
			await fadeOut(healingAnim);
		}

		const textContainer = document.getElementById("vh-healing-text");
		if (textContainer) {
			await fadeOut(textContainer);
		}

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
		const content = {
			api_version: 5,
			action: "record_etv",
			country: I13n.getCountryCode(),
			uuid: uuid,
			asin: event.data.data.asin,
			parent_asin: event.data.data.parent_asin,
			queue: vineQueue,
			etv: event.data.data.etv,
		};

		await fetch(VINE_HELPER_API_V5_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		});

		//Update the product tile ETV in the Toolbar
		const tile = getTileByAsin(tileASIN);
		if (tile) {
			tile.getToolbar().setETV(event.data.data.etv, event.data.data.etv, true);
		} else {
			//This can happen when we force an open modal for an item that is not present on the page
			//console.error("Unable to find the tile for ASIN " + tileASIN);
		}

		//Show a notification
		if (!Settings.get("notification.reduce")) {
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
			Settings.get("general.displayModalETV") &&
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
			const content = {
				api_version: 5,
				action: "record_order",
				country: I13n.getCountryCode(),
				uuid: uuid,
				asin: event.data.data.asin,
				parent_asin: event.data.data.parent_asin,
				order_status: event.data.data.status,
			};

			//Form the full URL
			await fetch(VINE_HELPER_API_V5_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(content),
			});

			//Update the product tile ETV in the Toolbar
			let tile = getTileByAsin(tileASIN);
			if (tile) {
				tile.getToolbar().createOrderWidget(event.data.data.status == "success");
			} else {
				//This can happen when we force an open modal for an item that is not present on the page
				//console.error("Unable to find the tile for ASIN " + tileASIN);
			}
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
		note.title = "Product unavailable.";
		note.lifespan = 10;
		note.content =
			"<strong>Type:</strong> " +
			event.data.data.errorType +
			"<br/><strong>Details:</strong> " +
			event.data.data.error;
		await Notifications.pushNotification(note);
	}

	if (event.data.type && event.data.type == "websiteOpts") {
		websiteOpts = event.data.data;
		if (!marketplaceId) {
			marketplaceId = websiteOpts.obfuscatedMarketId;
		}
		if (!customerId) {
			customerId = websiteOpts.customerId;
		}
		showRuntime("BOOT: Opts data obtained from inj.js.");

		//Check the current URL for the following pattern:
		///vine/vine-items#openModal;${asin};${is_parent_asin};${enrollment_guid}
		const currentUrl = window.location.href;
		regex = /^[^#]+#openModal;(.+);(.+);(.+);(.+)$/;
		arrMatches = currentUrl.match(regex);
		if (arrMatches != null) {
			showRuntime("BOOT: Open modal URL detected.");
			//We have an open modal URL
			const asin = arrMatches[1];
			const queue = arrMatches[2];
			const isParentAsin = arrMatches[3];
			const enrollmentGUID = arrMatches[4];

			openDynamicModal(asin, queue, isParentAsin, enrollmentGUID);
		}
	}
});

//Message from within the context of the extension
//Messages sent via: browser.tabs.sendMessage(tab.id, data);
//In this case, all messages are coming from the service_worker file.
browser.runtime.onMessage.addListener(async function (message, sender, sendResponse) {
	let data = message;
	if (data.type == undefined) return;

	sendResponse({ success: true });

	//If we received a request for a hook execution
	if (data.type == "hookExecute") {
		hookExecute(data.hookname, data);
	}

	if (data.type == "newItem") {
		if (
			data.index < 10 && //Limit the notification to the top 10 most recents
			vineBrowsingListing && //Only show notification on listing pages
			Settings.get("notification.screen.active")
		) {
			let { date, asin, queue, title, search, img_url, domain, etv, is_parent_asin, enrollment_guid } = data;

			//Generate the content to be displayed in the notification
			const prom = await Tpl.loadFile("/view/notification_new_item.html");

			if (
				Settings.isPremiumUser() &&
				Settings.get("general.searchOpenModal") &&
				is_parent_asin != null &&
				enrollment_guid != null
			) {
				Tpl.setVar(
					"url",
					`https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin ? "true" : "false"};${enrollment_guid}`
				);
			} else {
				Tpl.setVar("url", `https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?search=${search}`);
			}
			Tpl.setIf("show_image", Settings.get("notification.screen.thumbnail"));
			Tpl.setVar("date", date);
			Tpl.setVar("search", search);
			Tpl.setVar("asin", asin);
			Tpl.setVar("description", title);
			Tpl.setVar("img_url", img_url);
			Tpl.setVar("queue", queue);
			Tpl.setVar("is_parent_asin", is_parent_asin);
			Tpl.setVar("enrollment_guid", enrollment_guid);

			//Generate the notification
			let note2 = new ScreenNotification();
			note2.title = "New item detected !";
			note2.lifespan = 60;

			//Play the notification sound
			if (
				Settings.get("notification.screen.regular.volume") > 0 &&
				Settings.get("notification.screen.regular.sound") != "0"
			) {
				note2.sound = "resource/sound/" + Settings.get("notification.screen.regular.sound") + ".mp3";
				note2.volume = Settings.get("notification.screen.regular.volume");
			}
			note2.content = Tpl.render(prom);
			Notifications.pushNotification(note2);
		}
	}
});

// ##########################################
// #### ANIMATIONS

function fadeOut(element) {
	element.style.transition = "opacity 0.5s ease-out";
	element.style.opacity = "0";
	return new Promise((resolve) => {
		element.addEventListener(
			"transitionend",
			function handler() {
				element.removeEventListener("transitionend", handler);
				resolve();
			},
			{ once: true }
		);
	});
}

function fadeIn(element) {
	element.style.transition = "opacity 0.5s ease-in";
	element.style.opacity = "1";
}

//Key bindings/keyboard shortcuts for navigation
window.addEventListener("keyup", async function (e) {
	//Do not run the extension if ultraviner is running
	if (ultraviner) {
		return;
	}

	if (!Settings.get("keyBindings.active") || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
		return false;
	}

	let nodeName = document.activeElement.nodeName;
	let excl = ["INPUT", "TEXTAREA", "SELECT", "LI"];
	if (excl.indexOf(nodeName) != -1) {
		return false;
	}

	if (Settings.get("general.modalNavigation") && (e.key == "ArrowRight" || e.key == "ArrowLeft")) {
		showRuntime("Arrow key detected.");
		handleModalNavigation(e);
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
		[Settings.get("keyBindings.hideAll")]: hideAllItems,
		[Settings.get("keyBindings.showAll")]: showAllItems,
		[Settings.get("keyBindings.hideAllNext")]: hideAllItemsNext,
		[Settings.get("keyBindings.nextPage")]: () =>
			document.querySelector("#vvp-items-grid-container>div>ul.a-pagination li:last-child a")?.click(),
		[Settings.get("keyBindings.previousPage")]: () =>
			document.querySelector("#vvp-items-grid-container>div>ul.a-pagination li:first-child a")?.click(),
		[Settings.get("keyBindings.debug")]: async () => {
			let content = await getRunTimeJSON();
			regex = /\s*{<br\/>\n\s*"time": ([0-9]+),<br\/>\n\s*"event": "(.+?)"<br\/>\n\s*}(?:,<br\/>\n)?/gm;
			const content2 = content.replace(regex, `<strong>$1ms:</strong> $2<br/>\n`);
			let m = DialogMgr.newModal("debug");
			m.title = DEBUGGER_TITLE;
			m.content = content2;
			m.show();
		},
		[Settings.get("keyBindings.RFYPage")]: () => (window.location.href = "/vine/vine-items?queue=potluck"),
		[Settings.get("keyBindings.AFAPage")]: () => (window.location.href = "/vine/vine-items?queue=last_chance"),
		[Settings.get("keyBindings.AIPage")]: () => (window.location.href = "/vine/vine-items?queue=encore"),
		[Settings.get("keyBindings.AIPage2")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=2"),
		[Settings.get("keyBindings.AIPage3")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=3"),
		[Settings.get("keyBindings.AIPage4")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=4"),
		[Settings.get("keyBindings.AIPage5")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=5"),
		[Settings.get("keyBindings.AIPage6")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=6"),
		[Settings.get("keyBindings.AIPage7")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=7"),
		[Settings.get("keyBindings.AIPage8")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=8"),
		[Settings.get("keyBindings.AIPage9")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=9"),
		[Settings.get("keyBindings.AIPage10")]: () =>
			(window.location.href = "/vine/vine-items?queue=encore&pn=&cn=&page=10"),
		[Settings.get("keyBindings.availableTab")]: () => {
			const tab = document.querySelector('#tabs ul a[href="#vvp-items-grid"]');
			if (tab) {
				tab.click();
			}
		},
		[Settings.get("keyBindings.unavailableTab")]: () => {
			const tab = document.querySelector('#tabs ul a[href="#tab-unavailable"]');
			if (tab) {
				tab.click();
			}
		},
		[Settings.get("keyBindings.hiddenTab")]: () => {
			const tab = document.querySelector('#tabs ul a[href="#tab-hidden"]');
			if (tab) {
				tab.click();
			}
		},
		[Settings.get("keyBindings.pinnedTab")]: () => {
			const tab = document.querySelector('#tabs ul a[href="#tab-pinned"]');
			if (tab) {
				tab.click();
			}
		},
	};

	//Only allow the hideAll, hideAllNext and showAll keybinding if the hiddenTab is activated.
	if (
		(e.key.toLowerCase() == Settings.get("keyBindings.hideAll") ||
			e.key.toLowerCase() == Settings.get("keyBindings.hideAllNext") ||
			e.key.toLowerCase() == Settings.get("keyBindings.showAll")) &&
		!Settings.get("hiddenTab.active")
	) {
		return false;
	}

	const cb = keybindingMap[e.key.toLowerCase()];
	if (typeof cb === "function") {
		cb();
	}
});

function compareVersion(oldVer, newVer) {
	//Sometimes newVer is not populated for some odd reason. Assume no version change.
	if (newVer == null) return VERSION_NO_CHANGE;

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

/**
 * ========================================================================
 * ================ EXPERIMENTAL FEATURE: MODAL NAVIGATION ================
 * ========================================================================
 */

/**
 * Tracks the index of the current active tile within the grid
 * Defaulted it to -1 to indicate no active tile initially (on load)
 *
 * @type {number}
 */
let modalNavigatorCurrentIndex = -1;

/**
 * Tracks the index of the current active tile we want to navigate to
 * Defaulted to 0 to start from the first tile, unless another is clicked
 *
 * @type {number}
 */
let modalNavigatorNextIndex = 0;

/**
 * Handles the click event on the detail button and stores both the index and ASIN code.
 *
 * @param {number} index - The index of the current tile
 * @param {string} asin - The ASIN code associated with the product/tile
 */
function modalNavigatorHandleTileButtonClick(index, asin) {
	modalNavigatorCurrentIndex = index;
	showRuntime("[DEBUG] Tile clicked, current index: " + modalNavigatorCurrentIndex + " with ASIN: " + asin);
}

/**
 * Closes popup modal and returns the Promise when it's finished
 *
 * @param {HTMLElement} modal - The modal that we need to close
 * @returns {Promise<void>} - A promise that resolves after it's closed
 */
function modalNavigatorCloseModal(modal) {
	return new Promise((resolve) => {
		showRuntime("[DEBUG] Closing modal...");
		modal.querySelector('button[data-action="a-popover-close"]').click();
		setTimeout(() => {
			showRuntime("[DEBUG] Modal closed!");
			resolve();
		}, 300);
	});
}

async function initModalNagivation() {
	if (!Settings.isPremiumUser() || !Settings.get("general.modalNavigation")) {
		return false;
	}

	//Wait for the interface to be loaded and product to have been sorted
	while (productUpdated == false) {
		await new Promise((r) => setTimeout(r, 10));
	}

	/**
	 * Attach the 'click' eventListener to each yellow "See Details" button in the grid
	 */
	document.querySelectorAll("#vvp-items-grid .vvp-item-tile").forEach((tile, index) => {
		const modalNavigatorButton = tile.querySelector(".vvp-details-btn input");
		const modalNavigatorAsin = modalNavigatorButton.getAttribute("data-modalNavigatorAsin");

		modalNavigatorButton.addEventListener("click", function () {
			modalNavigatorHandleTileButtonClick(index, modalNavigatorAsin);
		});
	});
}

async function handleModalNavigation(event) {
	/**
	 * Let's check if the modal is open by looking for the (active) modal element on the page
	 * If not, let's exit since there is nothing to click
	 */
	let modalNavigatorModal = document.querySelector('.a-popover-modal[aria-hidden="false"]');
	const itemCount = document.querySelectorAll("#vvp-items-grid .vvp-item-tile").length;
	if (!modalNavigatorModal) {
		showRuntime("[DEBUG] Modal not open, nothing to navigate through; ignoring!");
		return;
	}

	if (modalNavigatorCurrentIndex === -1) {
		showRuntime("[DEBUG] There is no active tile; exiting");
		return; // Exit if there's no current tile tracked
	}

	/**
	 * Figure out the previous/next index based on keyPress
	 * We'll use the {document[...].length} to find the first/last item so we'll not run out of bounds
	 */
	if (event.key === "ArrowRight") {
		modalNavigatorNextIndex = (modalNavigatorCurrentIndex + 1) % itemCount;
	} else if (event.key === "ArrowLeft") {
		modalNavigatorNextIndex = (modalNavigatorCurrentIndex - 1 + itemCount) % itemCount;
	} else {
		showRuntime("[DEBUG] No left/right arrowkey pressed; exiting");
		return;
	}

	showRuntime("[DEBUG] Next index in the grid: " + modalNavigatorNextIndex);

	// Close the modalNavigatorModal, await it, then continue
	await modalNavigatorCloseModal(modalNavigatorModal);

	/**
	 * Target the button with the correct {data-asin} and click it, baby!
	 * HOWEVER, we require a delay of 600ms right now, perhaps fixable in a later release
	 */
	setTimeout(() => {
		const modalNavigatorNextTile = document.querySelectorAll("#vvp-items-grid .vvp-item-tile")[
			modalNavigatorNextIndex
		];
		const modalNavigatorNextButton = modalNavigatorNextTile.querySelector(".vvp-details-btn input");
		const modalNavigatorNextAsin = modalNavigatorNextButton.getAttribute("data-asin");

		if (modalNavigatorNextButton) {
			showRuntime("[DEBUG] Trying to open modal with ASIN: " + modalNavigatorNextAsin);
			modalNavigatorNextButton.click();
		} else {
			showRuntime("[DEBUG] There is no such button, broken? ASIN: " + modalNavigatorNextAsin);
		}
	}, 600);

	// Finally update the current index
	modalNavigatorCurrentIndex = modalNavigatorNextIndex;
	showRuntime("[DEBUG] Updated the current index to: " + modalNavigatorCurrentIndex);
}

function openDynamicModal(asin, queue, isParent, enrollmentGUID, autoClick = true) {
	if (!marketplaceId || !customerId) {
		console.error("Failed to fetch opts/vvp-context data");
	}

	const recommendationTypes = {
		potluck: "VENDOR_TARGETED",
		last_chance: "VENDOR_VINE_FOR_ALL",
		encore: "VINE_FOR_ALL",
	};

	const recommendationType = recommendationTypes[queue] || null;

	//Generate the dynamic modal button
	const container1 = document.createElement("span");
	container1.id = "dynamicModalBtn-" + asin;
	container1.classList.add("vvp-details-btn");
	const container2 = document.createElement("span");
	container1.appendChild(container2);
	const btn = document.createElement("input");
	btn.type = "submit";
	btn.dataset.asin = asin;
	btn.dataset.isParentAsin = isParent;

	if (recommendationType == "VENDOR_TARGETED") {
		btn.dataset.recommendationType = recommendationType;
		btn.dataset.recommendationId =
			marketplaceId + "#" + asin + "#" + customerId + "#vine.enrollment." + enrollmentGUID;
	} else {
		btn.dataset.recommendationType = recommendationType;
		btn.dataset.recommendationId = marketplaceId + "#" + asin + "#vine.enrollment." + enrollmentGUID;
	}
	container2.appendChild(btn);
	document.getElementById("vvp-items-grid").appendChild(container1);

	//Dispatch a click event on the button
	if (autoClick) {
		btn.click();

		setTimeout(function () {
			container1.remove(); // Removes container1 from the DOM
		}, 1000);
	}

	return btn;
}
