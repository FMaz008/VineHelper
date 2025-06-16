/*global chrome*/

import { Logger } from "./Logger.js";
var logger = new Logger();

logger.add("BOOT: Bootloader starting.");

// TODO: This bootloader needs refactoring to use dependency injection
// Currently using compatibility layer for SettingsMgr as first step
// Future work:
// - Create a DI container instance at the top
// - Register all services in the container
// - Use container.resolve() instead of direct instantiation
// See scripts/infrastructure/DIContainer.js for the DI implementation
import { SettingsMgr } from "./SettingsMgrCompat.js";
var Settings = new SettingsMgr();

import { Internationalization } from "./Internationalization.js";
var i13n = new Internationalization();

import { Environment } from "./Environment.js";
var env = new Environment();

import { Template } from "./Template.js";
var Tpl = new Template();

import { YMDHiStoISODate } from "./DateHelper.js";

import { openDynamicModal } from "./DynamicModalHelper.js";

import { CryptoKeys } from "./CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

//Grid
import {
	Grid,
	addPinnedTile,
	createGridInterface,
	hideAllItems,
	hideAllItemsNext,
	showAllItems,
	updateTileCounts,
	getTileByAsin,
} from "./Grid.js";

import { isPageLogin, isPageCaptcha, isPageDog } from "./DOMHelper.js";

import { HiddenListMgr } from "./HiddenListMgr.js";
var HiddenList = new HiddenListMgr();

import { HookMgr } from "./HookMgr.js";
var hookMgr = new HookMgr();

import { Item } from "./Item.js";
import { ModalMgr } from "./ModalMgr.js";
var DialogMgr = new ModalMgr();

import { News } from "./News.js";

import { NotificationMonitorV3 } from "./notification_monitor/NotificationMonitorV3.js";

import { Pagination } from "./Pagination.js";
var pagination = new Pagination();
import { PinnedListMgr } from "./PinnedListMgr.js";
var PinnedList = new PinnedListMgr();

import { ScreenNotification, ScreenNotifier } from "./ScreenNotifier.js";
var Notifications = new ScreenNotifier();

import { Tile, getTileFromDom } from "./Tile.js";

import { TileSizer } from "./TileSizer.js";
var tileSizer = new TileSizer();

import { Toolbar } from "./Toolbar.js";

import { Tooltip } from "./Tooltip.js";
import { unescapeHTML } from "./StringHelper.js";

var tooltip = new Tooltip();

const ultraviner = env.data.ultraviner; //If Ultravine is detected, Vine Helper will deactivate itself to avoid conflicts.

//Create the 4 grids/tabs instance of Grid:
env.data.grid = {
	gridRegular: null,
	gridUnavailable: null, //Will be populated after the grid will be created.
	gridHidden: null, //Will be populated after the grid will be created.
	gridPinned: null, //Will be populated after the grid will be created.
};

//Store the DOM objects of the grids/tabs:
//Populated after the grids/tabs are created in initCreateTabs()
env.data.gridDOM = {
	container: null,
	regular: null,
	unavailable: null,
	hidden: null,
	pinned: null,
};

//Constants
env.data.NOT_DISCARDED_ORDER_SUCCESS = -4;
env.data.NOT_DISCARDED = 0;
env.data.DISCARDED_ORDER_FAILED = 4;

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

var vvpContext = null;
env.data.marketplaceId = null;
env.data.customerId = null;

var notificationMonitor = null;
var channel = new BroadcastChannel("vinehelper-notification-monitor");

//Do not run the extension if ultraviner is running
if (!ultraviner) {
	init();
}

//#########################
//### Main flow

//Initiate the extension
async function init() {
	//if (window.location.href.endsWith("#AR")) {
	//Check if page is dogpage
	if (isPageDog(document)) {
		channel.postMessage({ type: "dogpage" });
		return;
	}
	if (isPageCaptcha(document)) {
		channel.postMessage({ type: "captchapage" });
		return;
	}
	if (isPageLogin(document)) {
		console.log("loginpage detected");
		channel.postMessage({ type: "loginpage" });
		return;
	}
	//}

	//Obtain the marketplaceId
	try {
		vvpContext = JSON.parse(document.querySelector('script[data-a-state=\'{"key":"vvp-context"}\'').innerHTML);

		env.data.marketplaceId = vvpContext.marketplaceId;
		env.data.customerId = vvpContext.customerId;
	} catch (err) {
		//Do nothing
	}

	//Add a div to the body to indicate VH's status(es)
	const divStatus = document.createElement("div");
	divStatus.id = "vh-status";
	divStatus.style.display = "none";
	document.body.appendChild(divStatus);

	hookMgr.hookBind("productsUpdated", () => {
		//Add a div to the body with a data-status attribute to indicate the products
		//have been updated.
		const div = document.getElementById("vh-status");
		div.setAttribute("data-status", "productsUpdated");
	});

	//Wait for the config to be loaded before running this script
	logger.add("BOOT: Waiting on preboot to complete...");
	await Settings.waitForLoad();
	logger.add("BOOT: Config available. Begining init() function");

	if (Settings.get("thorvarium.darktheme")) {
		document.getElementsByTagName("body")[0].classList.add("darktheme");
	}

	//If the UUID is not set, display a toaster notification that the UUID request failed.
	await env.waitForUUID();
	if (!Settings.get("general.uuid", false)) {
		//Display a toaster notification that the UUID request failed.
		const notification = new ScreenNotification();
		notification.title = "UUID request failed";
		notification.content =
			"Vine Helper failed to create an account for this device. Please ensure you are not using a VPN or proxy. If the issue persist, please contact the developer.";
		Notifications.pushNotification(notification);
	}

	//### Run the boot sequence
	initAddNotificationMonitorLink();
	hidePageContent();
	showGDPRPopup();
	await initFlushTplCache(); //And display the version changelog popup
	initInjectScript();

	//Check if we want to display the notification monitor
	const currentUrl = window.location.href;
	let regex = /^[^#]+#monitor.*$/;
	let arrMatches = currentUrl.match(regex);
	if (arrMatches != null) {
		env.data.monitorActive = true;
		if (Settings.get("notification.monitor.listView")) {
			logger.add("BOOT: Loading listView stylesheet");
			loadStyleSheet("resource/css/listView.css");
		}

		//Initate the notification monitor
		notificationMonitor = new NotificationMonitorV3();
		await notificationMonitor.initialize();

		hookMgr.hookExecute("productsUpdated", null);
		return; //Do not initialize the page as normal
	}

	// If a search has been performed, unescape the HTML encoded characters for the line
	// X item(s) matching "[SEARCH STRING WITH HTML ENCODED CHARACTERS]"
	const gridContainer = document.querySelector("#vvp-items-grid-container");
	if (gridContainer) {
		for (const node of gridContainer.childNodes) {
			if (node.nodeName === "P") {
				const matchingSearchText = node.innerHTML;

				if (matchingSearchText) {
					node.innerHTML = unescapeHTML(unescapeHTML(matchingSearchText));
				}
			}
		}
	}

	// If a search has been performed, unescape the HTML encoded characters for the text in the search box
	const searchTextInput = document.querySelector("#vvp-search-text-input");
	if (searchTextInput) {
		searchTextInput.value = unescapeHTML(unescapeHTML(searchTextInput.value));
	}

	if (Settings.get("general.blindLoading")) {
		const gridContainer = document.querySelector("#vvp-items-grid-container");
		if (gridContainer) {
			gridContainer.style.display = "none";
		}
	}

	if (Settings.get("general.listView")) {
		logger.add("BOOT: Loading listView stylesheet");
		loadStyleSheet("resource/css/listView.css");
	} else {
		initTileSizeWidget();
	}
	await initCreateTabs(); //Create the 4 grids/tabs
	await initTilesAndDrawToolbars(); //Create the tiles, and move the locally hidden tiles to the hidden tab
	fetchProductsDatav5(); //Obtain the data to fill the toolbars with it.

	displayAccountData();
	loadPinnedList();
	initSetPageTitle();
	initInsertTopPagination();
	await initInsertBookmarkButton();
	initFixPreviousButton();
	initModalNagivation();
	updateTileCounts();

	hookMgr.hookExecute("EndOfBootloader", null);

	HiddenList.garbageCollection();
}

async function initTileSizeWidget() {
	if (Settings.get("general.tileSize.active")) {
		const container = document.querySelector("#vvp-items-grid-container");
		if (container) {
			if (Settings.get("general.tileSize.enabled")) {
				//Inject the GUI for the tile sizer widget
				tileSizer.injectGUI(container);
			}
		}
	}

	//Display full descriptions
	//Not all of them are loaded at this stage and some get skipped.
	//container.querySelector(".a-truncate-full").classList.remove("a-offscreen");
	//container.querySelector(".a-truncate-cut").style.display = "none";

	//Set the slider default value
	//Wait until the items are loaded.
	if (!Settings.get("general.listView")) {
		hookMgr.hookBind("tilesUpdated", () => {
			tileSizer.adjustAll();
		});
	}
}

//If we are on the Account page, display additional info
function displayAccountData() {
	let regex = /^.+?amazon\..+\/vine\/account?$/;
	let arrMatches = window.location.href.match(regex);
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
		escapeHTML(env.data.customerId) +
		"</span><br /><br />";
	container.appendChild(div);

	const additionalStats = {
		acceptanceDate: "Acceptance date",
		statusEarnedDate: "Status earned date",
		reevaluationDate: "Re-evaluation date",
	};

	for (const [key, value] of Object.entries(additionalStats)) {
		date = new Date(vvpContext.voiceDetails[key]).toLocaleString(i13n.getLocale());
		div = document.createElement("div");
		div.innerHTML = `<strong>${value}:</strong><br /> ${date}<br/><br />`;
		container.appendChild(div);
	}

	div = document.createElement("div");
	div.innerHTML =
		"<strong>Re-evaluation in progress:</strong> " + escapeHTML(vvpContext.voiceDetails.isTierEvaluationInProgress);
	container.appendChild(div);
}

function hidePageContent() {
	//Hide recommendation and browsing history
	if (Settings.isPremiumUser() && Settings.get("general.hideRecommendations") == true) {
		const rhf = document.getElementById("rhf");
		if (rhf) {
			rhf.style.display = "none";
		}
	}

	//Hide side cart
	if (Settings.isPremiumUser() && Settings.get("general.hideSideCart") == true) {
		//Firefox will load the side cart before VH run this code, and it will also reset the display value to the default.
		//So we need to wait for the side cart to be created, and then observe it to make sure it gets hidden again after it's modified.
		//Wait for nav-flyout-ewc to be created, without interupting the main thread
		(async () => {
			let sideCart, sideCartArrow;
			await new Promise((resolve) => {
				const interval = setInterval(() => {
					sideCart = document.getElementById("nav-flyout-ewc");
					sideCartArrow = document.querySelector(".nav-ewc-arrow");
					if (sideCart) {
						clearInterval(interval);
						resolve();
					}
				}, 100);
			});

			sideCart.style.display = "none";
			sideCartArrow.style.display = "none";

			//Observe the side cart style.display value to be alerted if it becomes something else than "none"
			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === "attributes" && mutation.attributeName === "style") {
						if (sideCart.style.display !== "none") {
							sideCart.style.display = "none"; // Force it back to hidden
						}
					}
				});
			});

			observer.observe(sideCart, { attributes: true });
		})();
	}

	//Hide category in RFY and AFA
	if (Settings.isPremiumUser() && Settings.get("general.hideCategoriesRFYAFA")) {
		//If the current page is RFY or AFA, hide the category
		if (["last_chance", "potluck"].indexOf(env.data.vineQueue) != -1) {
			const categories = document.getElementById("vvp-browse-nodes-container");
			if (categories) {
				categories.style.display = "none";
			}
		}
	}
}
function displayAccountHideOptOutButton() {
	if (Settings.isPremiumUser() && Settings.get("general.hideOptOutButton") == true) {
		const optOut = document.getElementById("vvp-opt-out-of-vine-button");
		if (optOut) {
			optOut.style.display = "none";
		}
	}
}

/**
 * Contribution from https://github.com/robartsd/VineTools/blob/main/evaluationMetrics.user.js
 */
function displayAccountDataEvaluationMetrics() {
	if (!Settings.get("general.projectedAccountStatistics")) {
		return false; //Setting not activated.
	}

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
		const prom = await Tpl.loadFile("view/popup_gdpr.html");
		let content = Tpl.render(prom);

		let m = DialogMgr.newModal("gdpr");
		m.title = GDPR_TITLE;
		m.content = content;
		m.show();

		Settings.set("general.GDPRPopup", false);
	}
}
async function initFlushTplCache() {
	if (env.data.appVersion == null) {
		return false;
	}

	//Show version info popup : new version
	if (env.data.appVersion != Settings.get("general.versionInfoPopup", false)) {
		logger.add("BOOT: Flushing template cache");
		await Tpl.flushLocalStorage(); //Delete all template from cache

		let notification = new ScreenNotification();
		notification.title = "Template cache flushed.";
		notification.lifespan = 3;
		notification.content = "";
		notification.title_only = true;
		Notifications.pushNotification(notification);

		if (
			compareVersion(Settings.get("general.versionInfoPopup", false), env.data.appVersion) >
			VERSION_REVISION_CHANGE
		) {
			/*
			//First installs don't need v3.5 warning.
			if (!Settings.get("general.versionInfoPopup", false)) {
				await Settings.set("general.warning350", true);
			}
			if (!Settings.get("general.warning350", false)) {
				let warning = DialogMgr.newModal("warning");
				warning.title = "/!\\ Warning";
				warning.content =
					"Vine Helper 3.5.0 requires a <strong><u>reload of ALL VINE RELATED TABS</u></strong>, incuding the notification monitor(s). <br /><br />Failure to do so will likely lead to a loss of all locally stored hidden and pinned items.";
				warning.show();
				await Settings.set("general.warning350", true);
				return;
			}
			*/
			const prom = await Tpl.loadFile("view/popup_changelog.html");
			Tpl.setVar("appVersion", env.data.appVersion);
			let content = Tpl.render(prom);

			let m = DialogMgr.newModal("changelog");
			m.title = VINE_INFO_TITLE;
			m.content = content;
			m.show();
		}

		await Settings.set("general.versionInfoPopup", env.data.appVersion);
	}
}

function initInjectScript() {
	//Inject the script to fix the infinite loading wheel into the main environment.
	const scriptTag = document.createElement("script");

	scriptTag.setAttribute("data-country-code", i13n.getCountryCode());

	//Inject the infinite loading wheel fix to the "main world"
	scriptTag.src = chrome.runtime.getURL("scripts/inj.js");
	scriptTag.onload = function () {
		this.remove();
	};
	// see also "Dynamic values in the injected code" section in this answer
	(document.head || document.documentElement).appendChild(scriptTag);
	logger.add("BOOT: Script injected");
}

function initSetPageTitle() {
	//Update the page title
	let currentUrl = window.location.href;
	let regex = /^.+?amazon\..+\/vine\/.*[?&]search=(.*?)(?:[&].*)?$/;
	let arrMatches = currentUrl.match(regex);
	if (arrMatches?.length) {
		document.title = "Vine - S: " + arrMatches[1];
	} else if (env.data.vineQueue != null) {
		document.title = "Vine - " + env.data.vineQueueAbbr;
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
		//a.href = chrome.runtime.getURL("page/notifications.html");
		if (Settings.get("notification.monitor.blockNonEssentialListeners")) {
			a.href = "/vine/vine-items?queue=encore#monitor";
		} else {
			a.href = "/vine/vine-items?queue=encore#monitorLoadAllListeners";
		}
		a.target = "_blank";
		a.innerHTML = `<div class="vh-icon-16 vh-icon-vh"></div> Notifications Monitor`;
		li.appendChild(a);
	}
}

async function loadPinnedList() {
	if (env.data.gridDOM.container == null) {
		//There is no listing on this page
		return;
	}

	//Populate the Pinned tab
	if (Settings.get("pinnedTab.active") && (!Settings.get("pinnedTab.remote") || !Settings.isPremiumUser(1))) {
		logger.add("GRID: Loading locally stored pinned list");
		let mapPin = new Map();
		mapPin = await PinnedList.getList();
		//Sort the map by date_added descending
		mapPin = new Map([...mapPin].sort((a, b) => a[1].date_added - b[1].date_added));
		mapPin.forEach(async (value, key) => {
			const tile = getTileByAsin(key);
			if (tile) {
				tile.setPinned(true);
			}
			const item = new Item({
				asin: key,
				queue: value.queue,
				title: value.title,
				img_url: value.thumbnail,
				is_parent_asin: value.is_parent_asin,
				enrollment_guid: value.enrollment_guid,
				unavailable: value.unavailable,
				is_pre_release: value.is_pre_release ? true : false,
			});
			addPinnedTile(item);
		});
	}
}

async function initCreateTabs() {
	//Create the Discard grid
	logger.add("BOOT: Creating tabs system");

	document.querySelector("body").classList.add("vh-listing-view");

	env.data.gridDOM.container = document.getElementById("vvp-items-grid-container");
	env.data.gridDOM.container = document.getElementById("vvp-items-grid-container");
	env.data.gridDOM.regular = document.getElementById("vvp-items-grid");

	var tabSystem = Settings.get("unavailableTab.active") || Settings.get("hiddenTab.active");
	if (tabSystem) {
		await createGridInterface();
	}

	//Assign the DOM elements to the gridDOM object
	env.data.gridDOM.unavailable = document.getElementById("tab-unavailable");
	env.data.gridDOM.hidden = document.getElementById("tab-hidden");
	env.data.gridDOM.pinned = document.getElementById("tab-pinned");

	//Create the grid instances
	env.data.grid.gridRegular = new Grid(env.data.gridDOM.regular);

	if (Settings.get("hiddenTab.active")) {
		env.data.grid.gridHidden = new Grid(env.data.gridDOM.hidden);
	}

	if (Settings.get("unavailableTab.active")) {
		env.data.grid.gridUnavailable = new Grid(env.data.gridDOM.unavailable);
	}

	if (Settings.get("pinnedTab.active")) {
		env.data.grid.gridPinned = new Grid(env.data.gridDOM.pinned);
	}

	logger.add("BOOT: Grid system completed");
}

function initInsertTopPagination() {
	//Top pagination
	if (Settings.get("general.topPagination")) {
		if (env.data.gridDOM.container == null) {
			//There is no listing on this page
			return;
		}
		env.data.gridDOM.container.querySelector(".topPagination")?.remove();
		env.data.gridDOM.container.querySelector(".topPaginationVerbose")?.remove();

		let currentPageDOM = document.querySelector("ul.a-pagination li.a-selected"); //If Null there is no pagination on the page
		if (
			Settings.isPremiumUser() &&
			Settings.get("general.verbosePagination") &&
			env.data.vineQueueAbbr == "AI" &&
			currentPageDOM != undefined
		) {
			//Fetch total items from the page
			const TOTAL_ITEMS = parseInt(
				env.data.gridDOM.container.querySelector("p strong:last-child").innerText.replace(/,/g, "")
			);
			const ITEM_PER_PAGE = 36;
			const CURRENT_PAGE = parseInt(currentPageDOM.innerText.replace(/,/g, ""));

			const URL = window.location.pathname + window.location.search; //Sample URL to be modified
			pagination.setStartPagePadding(parseInt(Settings.get("general.verbosePaginationStartPadding")));
			let paginationObj = pagination.generatePagination(URL, TOTAL_ITEMS, ITEM_PER_PAGE, CURRENT_PAGE);

			env.data.gridDOM.container.querySelector("p").appendChild(paginationObj);
		} else {
			// Clone the bottom pagination to the top of the listing
			let paginationElement = document.querySelector(".a-pagination");
			if (paginationElement != null) {
				let parentElement = paginationElement.parentNode;
				parentElement.style.marginTop = "10px";

				// Clone the parent element
				let clonedElement = parentElement.cloneNode(true);
				clonedElement.classList.add("topPagination");
				env.data.gridDOM.container.querySelector("p").appendChild(clonedElement);
			}
		}
	}
}

async function setBookmarkDate(timeOffset) {
	//Fetch the current date/time from the server
	const data = {
		api_version: 5,
		app_version: env.data.appVersion,
		country: i13n.getCountryCode(),
		uuid: await Settings.get("general.uuid", false),
		fid: await Settings.get("general.fingerprint.id", false),
		action: "date",
	};
	const s = await cryptoKeys.signData(data);
	data.s = s;
	data.pk = await cryptoKeys.getExportedPublicKey();

	const options = {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	};
	fetch(env.getAPIUrl(), options)
		.then((response) => response.json())
		.then(async function (response) {
			await Settings.set(
				"general.bookmarkDate",

				new Date(YMDHiStoISODate(response.date).getTime() - timeOffset).toString()
			);

			//Update the tooltip
			document.querySelectorAll("#bookmark button").forEach((button) => {
				button.title = "Currently set to: " + Settings.get("general.bookmarkDate");
			});

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
		const prom = await Tpl.loadFile("view/bookmark.html");
		Tpl.setVar("date", Settings.get("general.bookmarkDate"));
		let bookmarkContent = Tpl.render(prom);
		document
			.querySelector(".vvp-items-button-and-search-container")
			.insertAdjacentHTML("afterend", bookmarkContent);
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
	const arrObj = document.querySelectorAll(".vvp-item-tile:not(.pinned)");
	let tile = null;
	let a = null;
	for (let i = 0; i < arrObj.length; i++) {
		try {
			tile = await generateTile(arrObj[i]);
			let t = new Toolbar(tile);

			//Add tool tip to the truncated item title link
			if (Settings.get("general.displayFullTitleTooltip")) {
				const titleDOM = arrObj[i].querySelector(".a-link-normal");
				tooltip.addTooltip(titleDOM, unescapeHTML(unescapeHTML(tile.getTitle())));
			}

			//Wrap the See Details button in a span with the class vh-see-details-container
			const seeDetails = arrObj[i].querySelector(".vvp-details-btn");
			const span = document.createElement("span");
			span.classList.add("vh-btn-container");
			span.style.display = "flex";
			seeDetails.insertAdjacentElement("beforebegin", span);

			//Move the seeDetails button as a child span
			span.appendChild(seeDetails);

			//Generate the toolbar
			await t.createProductToolbar();
		} catch (e) {
			logger.add("Error processing tile: " + e.message);
			continue; // Skip this tile and continue with others
		}
	}
	logger.add("done creating toolbars.");

	// Scoll to the RFY/AFA/AI header
	if (Settings.get("general.scrollToRFY")) {
		var scrollTarget = document.getElementById("vvp-items-button-container");
		scrollTarget.scrollIntoView({ behavior: "smooth" });
	}

	toolbarsDrawn = true;
	hookMgr.hookExecute("tilesUpdated", null);
}

//This function will return an array of all the product on the page, with their description and thumbnail url
async function getAllProductsData() {
	let arrUrl = []; //Will be use to store the URL identifier of the listed products.
	const arrObj = document.querySelectorAll(".vvp-item-tile:not(.pinned)");

	if (arrObj.length == 0) {
		return { arr: [], s: await cryptoKeys.signData([]) };
	}

	for (let i = 0; i < arrObj.length; i++) {
		let tile = getTileFromDom(arrObj[i]);
		tile.initiateTile(); //Do not await this.

		const asin = tile.getAsin();
		const btn = arrObj[i].querySelector(`input[data-asin="${asin}"]`);
		const isParent = btn.dataset.isParentAsin == "true";
		const isPreRelease = btn.dataset.isPreRelease == "true";
		const enrollmentGUID = btn.dataset.recommendationId.match(/#vine\.enrollment\.([a-f0-9-]+)/i)[1];
		const title = tile.getTitle();
		const thumbnail = tile.getThumbnail();

		//Do not query product info for product without a title or a thumbnail.
		if (title && thumbnail) {
			arrUrl.push({
				asin: asin,
				title: title,
				thumbnail: thumbnail,
				is_parent_asin: isParent,
				enrollment_guid: enrollmentGUID,
				is_pre_release: isPreRelease,
			});
		}
	}
	return { arr: arrUrl, s: await cryptoKeys.signData(arrUrl) };
}

//Convert the regular tile to the Vine Helper version.
async function generateTile(obj) {
	let tile;
	tile = new Tile(obj, env.data.grid.gridRegular);

	//Add a container for the image and place the image in it.
	let img = obj.querySelector(".vvp-item-tile-content img"); // Get the img element
	let imgContainer = document.createElement("div"); // Create a new div element
	imgContainer.classList.add("vh-img-container"); // Add the 'vh-img-container' class to the div
	img.parentNode.insertBefore(imgContainer, img); // Insert the imgContainer before the img element

	// Remove (detach) the img from its parent node
	//img.parentNode.removeChild(img); //No need to detach the img.
	imgContainer.appendChild(img); // Move the img into the imgContainer

	//If the listing are set to listview, move the image container before its parent item.
	if (Settings.get("general.listView")) {
		//imgContainer.parentNode.removeChild(imgContainer);
		//obj.insertBefore(imgContainer, obj.firstChild);
		obj.prepend(imgContainer);
		obj.classList.add("vh-listview");

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
	} else {
		obj.classList.add("vh-gridview");
	}

	//If small items stylesheet are used, add a class to resize-down the thumnails.
	if (Settings.get("thorvarium.smallItems")) {
		document.querySelector("#vh-tabs").classList.add("smallitems");
	}
	if (
		(Settings.get("thorvarium.mobileios") || Settings.get("thorvarium.mobileandroid")) &&
		!Settings.get("general.tileSize.enabled")
	) {
		document.querySelector("#vh-tabs").classList.add("smallitems");
	}

	//Move the hidden item to the hidden tab
	if (Settings.get("hiddenTab.active") && (await tile.isHidden())) {
		logger.add("BOOT: The item is locally hidden, move it to the hidden grid.");
		await tile.moveToGrid(env.data.grid.gridHidden, false); //This is the main sort, do not animate it
	}

	//Add the variant icon to the tile
	if (Settings.isPremiumUser(2) && Settings.get("general.displayVariantIcon")) {
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
			alink.style.cursor = "default";
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
async function fetchProductsDatav5() {
	const { arr: arrProductsData, s } = await getAllProductsData();
	if (arrProductsData.length == 0) {
		const gridContainer = document.querySelector("#vvp-items-grid-container");
		if (gridContainer) {
			gridContainer.style.display = "block";
		}
		return false; //No product on this page
	}

	while (Settings.get("general.uuid", false) == null) {
		await new Promise((r) => setTimeout(r, 100));
	}

	logger.add("FETCH: Fetching data from VineHelper's server...");
	const requestVariants = Settings.isPremiumUser(2) && Settings.get("general.displayVariantButton");
	const content = {
		api_version: 5,
		app_version: env.data.appVersion,
		country: i13n.getCountryCode(),
		uuid: await Settings.get("general.uuid", false),
		fid: await Settings.get("general.fingerprint.id", false),
		action: "get_info",
		tier: env.getTierLevel(),
		queue: env.data.vineQueue,
		items: arrProductsData,
		request_variants: requestVariants,
		s2: s,
		p: env.data.vinePageNumber,
	};
	content.s = await cryptoKeys.signData(content);
	content.pk = await cryptoKeys.getExportedPublicKey();

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 5000); // timeout in ms.

	fetch(env.getAPIUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
		signal: controller.signal,
	})
		.then((response) => response.json())
		.then(serverProductsResponse)
		.catch(function (err) {
			if (err.name === "AbortError") {
				logger.add("FETCH: Server request timed out after 5 seconds");
			} else {
				logger.add("FETCH: Server request failed");
			}
			document.querySelector("#vvp-items-grid-container").style.display = "block";
		})
		.finally(() => {
			clearTimeout(timeoutId);

			//If the page URL ends with #AR, send a message to the service worker to close the page
			if (window.location.href.endsWith("#AR")) {
				channel.postMessage({ type: "closeARTab" });
			}
		});
}

//Process the results obtained from the server
//Update each tile with the data pertaining to it.
async function serverProductsResponse(data) {
	logger.add("FETCH: Response received from VineHelper's server...");
	if (data["invalid_uuid"] == true) {
		console.error("Invalid UUID");
		document.querySelector("#vvp-items-grid-container").style.display = "block";
		Settings.set("general.uuid", null); //Cancel the UUID, so the next load can regenerate a new one.
		//Do no complete this execution
		return false;
	}

	if (Settings.get("hiddenTab.active")) {
		logger.add("FETCH: Waiting on hidden items list to be loaded...");
		while (!HiddenList.listLoaded) {
			await new Promise((r) => setTimeout(r, 10));
		}
		logger.add("FETCH: Hidden items list loaded...");
	}

	const timenow = data["current_time"];

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

	//Display news
	logger.add("FETCH: Displaying news...");
	if (data["news"] !== undefined) {
		const newsHandler = new News(data["news"]);
	}

	logger.add("FETCH: Waiting toolbars to be drawn...");
	while (toolbarsDrawn == false) {
		await new Promise((r) => setTimeout(r, 10));
	}
	logger.add("FETCH: Interface loaded, processing fetch data...");

	//For each product provided by the server, modify the local listings
	for (const [key, values] of Object.entries(data["products"])) {
		logger.add("DRAW: Processing ASIN #" + key);
		let tile = getTileByAsin(key);

		if (tile == null) {
			logger.add("No tile matching " + key);
			return; //Continue the loop with the next item
		}

		//Load the ETV value
		if (values.etv_min != null) {
			logger.add("DRAW: Setting ETV");
			tile.getToolbar().setETV(values.etv_min, values.etv_max);
		} else {
			logger.add("DRAW: No ETV value found");
			tile.getToolbar().unknownETV();
		}

		if (values.date_added != null) {
			logger.add("DRAW: Setting Date");
			tile.setDateAdded(timenow, values.date_added);
		}

		if (values.discovered) {
			logger.add("DRAW: Marking as discovered");
			tile.markAsDiscovered();
		}

		//If there is a remote value for the hidden item, ensure it is sync'ed up with the local list
		if (Settings.isPremiumUser(1) && Settings.get("hiddenTab.remote") && values.hidden != null) {
			if (values.hidden == true && !(await tile.isHidden())) {
				logger.add("DRAW: Remote is ordering to hide item");
				await tile.hideTile(false); //Will update the placement and list
			} else if (values.hidden == false && (await tile.isHidden())) {
				logger.add("DRAW: Remote is ordering to show item");
				await tile.showTile(false); //Will update the placement and list
			}
		}

		if (Settings.get("unavailableTab.active")) {
			logger.add("DRAW: Setting orders");
			tile.setOrders(values.order_success, values.order_failed);
			tile.setUnavailable(values.order_unavailable);

			//Assign the tiles to the proper grid
			if (Settings.get("hiddenTab.active") && (await tile.isHidden())) {
				//The hidden tiles were already moved, keep the there.
			} else if (tile.getUnavailable()) {
				logger.add("DRAW: moving the tile to Unavailable (failed order(s))");
				await tile.moveToGrid(env.data.grid.gridUnavailable, false); //This is the main sort, do not animate it
			}

			logger.add("DRAW: Updating the toolbar");
			tile.getToolbar().updateVisibilityIcon();
			logger.add("DRAW: Done updating the toolbar");
		}

		//Process variants
		if (Settings.isPremiumUser(2) && Settings.get("general.displayVariantButton")) {
			if (values.variants && values.variants.length > 0) {
				logger.add("DRAW: Processing variants");

				//Add variants to the tile
				for (const [k, val] of Object.entries(values.variants)) {
					await tile.addVariant(val.asin, val.title, val.etv);
				}
				tile.updateVariantCount();
			}
		}
	}

	//Loading remote stored pinned items
	if (Settings.isPremiumUser(1) && Settings.get("pinnedTab.active") && Settings.get("pinnedTab.remote")) {
		if (data["pinned_products"] != undefined) {
			logger.add("DRAW: Loading remote pinned products");
			for (let i = 0; i < data["pinned_products"].length; i++) {
				//Get the tile
				const tile = getTileByAsin(data["pinned_products"][i]["asin"]);
				if (tile) {
					tile.setPinned(true);
				}

				const item = new Item({
					asin: data["pinned_products"][i]["asin"],
					queue: data["pinned_products"][i]["queue"],
					title: data["pinned_products"][i]["title"],
					img_url: data["pinned_products"][i]["img_url"],
					is_parent_asin: data["pinned_products"][i]["is_parent_asin"],
					is_pre_release: data["pinned_products"][i]["is_pre_release"] ? true : false,
					enrollment_guid: data["pinned_products"][i]["enrollment_guid"],
					unavailable: data["pinned_products"][i]["unavailable"],
				});
				await addPinnedTile(item); //grid.js
			}
		}
	}

	//Update Patreon tier
	if (Settings.get("general.patreon.tier") != data["patreon_membership_tier"]) {
		Settings.set("general.patreon.tier", data["patreon_membership_tier"]);
	}

	updateTileCounts(); //Grid.js
	logger.add("Done updating products");
	productUpdated = true;
	hookMgr.hookExecute("productsUpdated", null);

	document.querySelector("#vvp-items-grid-container").style.display = "block";
}

//#########################
//## Triggered functions (from clicks or whatever)

//Messaging from accross tabs and context
//Messages sent via window.postMessage({}, "*");
//Most requests comes from the inj.js file, which is in a different scope/context.
var arrVariations = null;
window.addEventListener("message", async function (event) {
	//Do not run the extension if ultraviner is running
	if (ultraviner) {
		return false;
	}

	// We only accept messages from ourselves
	if (event.source != window || event.data.type == undefined) {
		return false;
	}

	//Sometime, mostly for debugging purpose, the Service worker can try to display notifications.
	if (event.data.type == "rawNotification") {
		let note = new ScreenNotification();
		note.title = "System";
		note.lifespan = 10;
		note.content = event.data.content;
		await Notifications.pushNotification(note);
	}

	//If we got back a message after we fixed an infinite wheel spin.
	if (event.data.type == "infiniteWheelFixed") {
		//console.log("Content script received message: " + event.data.text);

		//Show a notification
		let note = new ScreenNotification();
		note.title = "Infinite spinner fixed!";
		note.lifespan = 10;
		note.content = "Vine Helper fixed an item bugged an infinite spinner: " + event.data.text;
		await Notifications.pushNotification(note);
	}

	//If we got back a message after we found variations
	if (event.data.type == "variations") {
		//Make an array of all the asin values
		arrVariations = event.data.data.map((variation) => {
			return {
				asin: variation.asin,
				dimensions: encodeURIComponent(JSON.stringify(variation.dimensions)),
			};
		});
		//Get the tile from the ASINd
		const tile = getTileByAsin(event.data.asin);
		if (tile) {
			for (const variation of arrVariations) {
				await tile.addVariant(variation.asin, decodeURIComponent(variation.dimensions), null);
			}
			tile.updateVariantCount();
		}
	}

	//If we got back a message after we found an ETV.
	if (event.data.type == "etv") {
		//Send the ETV info to the server
		let tileASIN = event.data.data.parent_asin;
		if (tileASIN === null) {
			tileASIN = event.data.data.asin;
		}

		//Update the tile with the new ETV
		const tile = getTileByAsin(tileASIN);
		if (tile) {
			tile.getToolbar().setETV(event.data.data.etv, event.data.data.etv);
		}

		//Update the server with the new ETV
		const content = {
			api_version: 5,
			app_version: env.data.appVersion,
			action: "record_etv",
			country: i13n.getCountryCode(),
			uuid: await Settings.get("general.uuid", false),
			fid: await Settings.get("general.fingerprint.id", false),
			asin: event.data.data.asin,
			parent_asin: event.data.data.parent_asin,
			queue: env.data.vineQueue,
			etv: event.data.data.etv,
			variations: arrVariations,
		};
		const s = await cryptoKeys.signData(content);
		content.s = s;
		content.pk = await cryptoKeys.getExportedPublicKey();

		arrVariations = null;

		await fetch(env.getAPIUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		});

		//The notification monitor does not instanciate a grid as there is no tabs.
		//But the ETV will be received from the server
		if (!notificationMonitor) {
			//Update the product tile ETV in the Toolbar
			const tile = getTileByAsin(tileASIN);
			if (tile) {
				tile.getToolbar().setETV(event.data.data.etv, event.data.data.etv, true);
			} else {
				//This can happen when we force an open modal for an item that is not present on the page
				//console.error("Unable to find the tile for ASIN " + tileASIN);
			}
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

		if (Settings.get("general.displayModalETV")) {
			document.getElementById("vvp-product-details-modal--tax-value").style.display = "block";
			document.getElementById("vvp-product-details-modal--tax-spinner").style.display = "none";
			document.getElementById("vvp-product-details-modal--tax-value-string").innerText = event.data.data.etv;
		}
	}

	//If we got back a message after an order was attempted or placed.
	if (event.data.type == "order") {
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
				app_version: env.data.appVersion,
				action: "record_order",
				country: i13n.getCountryCode(),
				uuid: await Settings.get("general.uuid", false),
				fid: await Settings.get("general.fingerprint.id", false),
				asin: event.data.data.asin,
				parent_asin: event.data.data.parent_asin,
				order_status: event.data.data.status,
				order_error: event.data.data.error,
			};

			const s = await cryptoKeys.signData(content);
			content.s = s;
			content.pk = await cryptoKeys.getExportedPublicKey();

			//Form the full URL
			await fetch(env.getAPIUrl(), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(content),
			});

			//The notification monitor does not implement the regularGrid
			if (!notificationMonitor) {
				//Update the product tile ETV in the Toolbar
				let tile = getTileByAsin(tileASIN);
				if (tile) {
					tile.getToolbar().createOrderWidget(event.data.data.status == "success");
				} else {
					//This can happen when we force an open modal for an item that is not present on the page
					//console.error("Unable to find the tile for ASIN " + tileASIN);
				}
			}
		}

		const note = new ScreenNotification();
		if (event.data.data.status == "success") {
			//Show a notification
			note.title = "Successful order detected!";
			note.lifespan = 15;
			note.content = "Item " + event.data.data.asin + " ordered.";
		} else {
			//Show a notification

			note.title = "Failed order detected.";
			note.lifespan = 15;
			note.content =
				"Item " + event.data.data.asin + " failed to order with error " + event.data.data.error + ".";
		}
		await Notifications.pushNotification(note);
	}

	if (event.data.type == "error") {
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

		if (event.data.data.errorType == "ITEM_NOT_IN_ENROLLMENT") {
			recordUnavailableProduct(event.data.data.asin, "ITEM_NOT_IN_ENROLLMENT");
		}
	}

	if (event.data.type == "websiteOpts") {
		const websiteOpts = event.data.data;
		if (!env.data.marketplaceId) {
			env.data.marketplaceId = websiteOpts.obfuscatedMarketId;
		}
		if (!env.data.customerId) {
			env.data.customerId = websiteOpts.customerId;
		}
		logger.add("BOOT: Opts data obtained from inj.js.");

		//Check the current URL for the following pattern:
		///vine/vine-items#openModal;${asin};${is_parent_asin};${enrollment_guid}
		const currentUrl = window.location.href;
		let regex = /^[^#]+#openModal;(.+?)$/;
		let arrMatches = currentUrl.match(regex);
		if (arrMatches != null) {
			logger.add("BOOT: Open modal URL detected.");
			//We have an open modal URL
			const options = JSON.parse(decodeURIComponent(arrMatches[1]));
			openDynamicModal(options);
		}
	}
});

async function recordUnavailableProduct(asin, reason) {
	const content = {
		api_version: 5,
		app_version: env.data.appVersion,
		action: "record_unavailable",
		country: i13n.getCountryCode(),
		uuid: await Settings.get("general.uuid", false),
		fid: await Settings.get("general.fingerprint.id", false),
		asin: asin,
		reason: reason,
	};
	const s = await cryptoKeys.signData(content);
	content.s = s;
	content.pk = await cryptoKeys.getExportedPublicKey();

	//Form the full URL
	await fetch(env.getAPIUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	});
}

//#####################################################
//## MESSAGES LISTENERS
//#####################################################
//Message from within the context of the extension
//Messages sent via: chrome.tabs.sendMessage(tab.id, data);
//In this case, all messages are coming from the service_worker or notification_monitor files.
channel.addEventListener("message", (event) => {
	processMessage(event.data);
});
chrome.runtime.onMessage.addListener(async (data, sender, sendResponse) => {
	processMessage(data, sender, sendResponse);
});
window.addEventListener("message", (event) => {
	processMessage(event.data);
});

async function processMessage(data, sender = null, sendResponse = null) {
	if (data.type == undefined && data.action == undefined) {
		return false;
	}

	//If we received a request for a hook execution
	if (data.type == "hookExecute") {
		if (sendResponse) {
			sendResponse({ success: true });
		}
		hookMgr.hookExecute(data.hookname, data);
	}

	if (data.type == "newItem") {
		if (sendResponse) {
			sendResponse({ success: true });
		}
		if (
			!notificationMonitor &&
			data.index < 10 && //Limit the notification to the top 10 most recents
			env.data.vineBrowsingListing && //Only show notification on listing pages
			!env.data.monitorActive && //Do not display on screen notification in the notification monitor
			Settings.get("notification.screen.active")
		) {
			let {
				date,
				asin,
				queue,
				title,
				search,
				img_url,
				domain,
				etv,
				is_parent_asin,
				is_pre_release,
				enrollment_guid,
			} = data.item.data;

			//Generate the content to be displayed in the notification
			const prom = await Tpl.loadFile("/view/notification_new_item.html");

			if (
				Settings.isPremiumUser() &&
				Settings.get("general.searchOpenModal") &&
				is_parent_asin != null &&
				enrollment_guid != null
			) {
				const options = data.item.getCoreInfo();
				Tpl.setVar(
					"url",
					`https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${encodeURIComponent(JSON.stringify(options))}`
				);
			} else {
				Tpl.setVar("url", `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?search=${search}`);
			}
			Tpl.setIf("show_image", Settings.get("notification.screen.thumbnail"));
			Tpl.setVar("date", date);
			Tpl.setVar("search", search);
			Tpl.setVar("asin", asin);
			Tpl.setVar("description", title);
			Tpl.setVar("img_url", img_url);
			Tpl.setVar("queue", queue);
			Tpl.setVar("is_parent_asin", is_parent_asin);
			Tpl.setVar("is_pre_release", is_pre_release);
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

	if (data.action === "showPrompt" && data.word) {
		showCustomPrompt(data.word, data.list).then((result) => {
			// Send the word to the background script
			channel.postMessage({ action: "addWord", word: result.word, list: data.list });
		});
		return true; // Keep the message channel open for the async response
	}

	if (data.action === "copyASIN") {
		//if (sendResponse) {
		//sendResponse({ success: true });
		//}
		if (selectedASIN) {
			navigator.clipboard.writeText(selectedASIN);
			alert("ASIN " + selectedASIN + " copied to clipboard");
		} else {
			alert("No ASIN detected. :(");
		}
	}
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
		logger.add("Arrow key detected.");
		handleModalNavigation(e);
	}

	//Debug: secret keybind to generate dummy hidden items
	/*
	//Don't forget to comment this.updateArrChange({ in the addItem function in HiddenListMgr.js
	if (e.key == "g") {
		if (this.confirm("Generate 20,000 dummy items in local storage? (Will take ~1min)")) {
			for (let i = 0; i < 20000; i++) {
				const fakeAsin = (() => {
					let result = "";
					const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
					const charactersLength = characters.length;
					for (let i = 0; i < 10; i++) {
						result += characters.charAt(Math.floor(Math.random() * charactersLength));
					}

					return result;
				})();
				if (i % 1000 == 0) {
					console.log("Generated " + i + " items");
				}
				await HiddenList.addItem(fakeAsin, false, false);
			}
			HiddenList.saveList(false);
			this.alert("20,000 items generated");
		}
	}
	*/

	const keybindingMap = {
		[Settings.get("keyBindings.pauseFeed")]: () => {
			const pauseFeedBtn = document.getElementById("pauseFeed-fixed");
			if (pauseFeedBtn) {
				pauseFeedBtn.click();
			}
		},
		[Settings.get("keyBindings.hideAll")]: hideAllItems,
		[Settings.get("keyBindings.showAll")]: showAllItems,
		[Settings.get("keyBindings.hideAllNext")]: hideAllItemsNext,
		[Settings.get("keyBindings.nextPage")]: () =>
			document.querySelector("#vvp-items-grid-container nav ul li:last-child a")?.click(),
		[Settings.get("keyBindings.previousPage")]: () =>
			document.querySelector("#vvp-items-grid-container nav ul li:first-child a")?.click(),
		[Settings.get("keyBindings.debug")]: async () => {
			let content = await logger.getContent();
			let regex = /\s*{<br\/>\n\s*"time": ([0-9]+),<br\/>\n\s*"event": "(.+?)"<br\/>\n\s*}(?:,<br\/>\n)?/gm;
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
		[Settings.get("keyBindings.firstPage")]: () => {
			const currentUrl = window.location.href;
			const regex = /&page=\d+$/;
			const match = currentUrl.match(regex);
			if (match) {
				const newUrl = currentUrl.replace(regex, "&page=1");
				window.location.href = newUrl;
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

	if (oldVer == null || oldVer == undefined || oldVer === 0 || oldVer === true) {
		return VERSION_MAJOR_CHANGE;
	}
	if (oldVer == false || oldVer == newVer) return VERSION_NO_CHANGE;

	const regex = /^([0-9]+)\.([0-9]+)(?:\.([0-9]+))?$/;
	const arrOldVer = oldVer.match(regex);
	const arrNewVer = newVer.match(regex);

	if (arrOldVer[1] != arrNewVer[1]) return VERSION_MAJOR_CHANGE;
	if (arrOldVer[2] != arrNewVer[2]) return VERSION_MINOR_CHANGE;
	if (arrOldVer.length == 4 && arrNewVer.length == 4) {
		if (arrOldVer[3] != arrNewVer[3]) {
			return VERSION_REVISION_CHANGE;
		} else {
			return VERSION_NO_CHANGE;
		}
	} else {
		return VERSION_REVISION_CHANGE;
	}
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
	logger.add("[DEBUG] Tile clicked, current index: " + modalNavigatorCurrentIndex + " with ASIN: " + asin);
}

/**
 * Closes popup modal and returns the Promise when it's finished
 *
 * @param {HTMLElement} modal - The modal that we need to close
 * @returns {Promise<void>} - A promise that resolves after it's closed
 */
function modalNavigatorCloseModal(modal) {
	return new Promise((resolve) => {
		logger.add("[DEBUG] Closing modal...");
		modal.querySelector('button[data-action="a-popover-close"]').click();
		setTimeout(() => {
			logger.add("[DEBUG] Modal closed!");
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
	env.data.gridDOM.regular.querySelectorAll(".vvp-item-tile").forEach((tile, index) => {
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
	const itemCount = env.data.gridDOM.regular.querySelectorAll(".vvp-item-tile").length;
	if (!modalNavigatorModal) {
		logger.add("[DEBUG] Modal not open, nothing to navigate through; ignoring!");
		return;
	}

	if (modalNavigatorCurrentIndex === -1) {
		logger.add("[DEBUG] There is no active tile; exiting");
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
		logger.add("[DEBUG] No left/right arrowkey pressed; exiting");
		return;
	}

	logger.add("[DEBUG] Next index in the grid: " + modalNavigatorNextIndex);

	// Close the modalNavigatorModal, await it, then continue
	await modalNavigatorCloseModal(modalNavigatorModal);

	/**
	 * Target the button with the correct {data-asin} and click it, baby!
	 * HOWEVER, we require a delay of 600ms right now, perhaps fixable in a later release
	 */
	setTimeout(() => {
		const modalNavigatorNextTile =
			env.data.gridDOM.regular.querySelectorAll(".vvp-item-tile")[modalNavigatorNextIndex];
		const modalNavigatorNextButton = modalNavigatorNextTile.querySelector(".vvp-details-btn input");
		const modalNavigatorNextAsin = modalNavigatorNextButton.getAttribute("data-asin");

		if (modalNavigatorNextButton) {
			logger.add("[DEBUG] Trying to open modal with ASIN: " + modalNavigatorNextAsin);
			modalNavigatorNextButton.click();
		} else {
			logger.add("[DEBUG] There is no such button, broken? ASIN: " + modalNavigatorNextAsin);
		}
	}, 600);

	// Finally update the current index
	modalNavigatorCurrentIndex = modalNavigatorNextIndex;
	logger.add("[DEBUG] Updated the current index to: " + modalNavigatorCurrentIndex);
}

//#####################################################
//## STYLESHEETS
//#####################################################

async function loadStyleSheet(path, injected = true) {
	if (injected) {
		const prom = await Tpl.loadFile(path);
		let content = Tpl.render(prom);

		loadStyleSheetContent(content, path); //Put content between <style></style>
	} else {
		loadStyleSheetExternal(path); //Insert as an external stylesheet.
	}
}
function loadStyleSheetContent(content, path = "injected") {
	if (content != "") {
		const style = document.createElement("style");
		style.innerHTML = "/*" + path + "*/\n" + content;
		document.head.appendChild(style);
	}
}

//#####################################################
//## CONTEXT MENU
//#####################################################

let selectedASIN = null;
document.addEventListener("contextmenu", async (event) => {
	// Try to obtain the word that was right clicked on
	const range = getCaretPositionFromPoint(event.clientX, event.clientY);
	let word = null;

	const tileContent = range.startContainer.parentElement?.closest(".vvp-item-tile");
	if (tileContent) {
		const asin = tileContent.dataset.asin;
		selectedASIN = asin;
	} else {
		selectedASIN = null;
	}

	if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
		const textNode = range.startContainer;
		const offset = range.startOffset;
		const text = textNode.textContent;

		// Extract the word around the cursor
		const before = text.slice(0, offset).match(/\b\w+$/) || [""];
		const after = text.slice(offset).match(/^\w+/) || [""];
		word = (before[0] + after[0]).toLowerCase();
	}

	if (word) {
		// Send the word to the background script
		chrome.runtime.sendMessage({ action: "setWord", word: word });
	}
});

function getCaretPositionFromPoint(x, y) {
	if (document.caretRangeFromPoint) {
		// Chrome or browsers supporting caretRangeFromPoint
		return document.caretRangeFromPoint(x, y);
	} else {
		// Firefox
		const position = document.caretPositionFromPoint(x, y);
		if (position) {
			const range = document.createRange();
			range.setStart(position.offsetNode, position.offset);
			range.setEnd(position.offsetNode, position.offset);
			return range;
		}
	}

	// Fallback for other browsers
	const range = document.createRange();
	const selection = window.getSelection();

	if (selection.rangeCount > 0) {
		return selection.getRangeAt(0);
	}

	return range;
}

// Custom dialog implementation
function showCustomPrompt(word, list, callback) {
	return new Promise((resolve) => {
		// Remove existing prompt
		const existingPrompt = document.querySelector("#custom-prompt");
		if (existingPrompt) existingPrompt.remove();

		// Create the dialog elements
		const promptOverlay = document.createElement("div");
		promptOverlay.id = "custom-prompt";
		promptOverlay.style.position = "fixed";
		promptOverlay.style.top = "0";
		promptOverlay.style.left = "0";
		promptOverlay.style.width = "100%";
		promptOverlay.style.height = "100%";
		promptOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
		promptOverlay.style.zIndex = "9999";
		promptOverlay.style.display = "flex";
		promptOverlay.style.alignItems = "center";
		promptOverlay.style.justifyContent = "center";

		const promptBox = document.createElement("div");
		promptBox.style.backgroundColor = "#fff";
		promptBox.style.padding = "20px";
		promptBox.style.borderRadius = "8px";
		promptBox.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
		promptBox.style.textAlign = "center";
		promptBox.innerHTML = `
            <p style="margin-bottom: 20px;">Add the following word to the <strong>${list}</strong> list:</p>
            <input id="word-input" type="text" value="${word}" style="width: 100%; padding: 8px; margin-bottom: 20px;" />
            <button id="confirm-button" style="margin-right: 10px;">Confirm</button>
            <button id="cancel-button">Cancel</button>
        `;

		promptOverlay.appendChild(promptBox);
		document.body.appendChild(promptOverlay);

		// Handle confirm and cancel buttons
		document.getElementById("confirm-button").addEventListener("click", () => {
			const editedWord = document.getElementById("word-input").value;
			promptOverlay.remove();
			resolve({ confirmed: true, word: editedWord });
		});

		document.getElementById("cancel-button").addEventListener("click", () => {
			promptOverlay.remove();
			resolve({ confirmed: false, word: null });
		});
	});
}
