import { Logger } from "./Logger.js";
var logger = new Logger();

window.VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//window.VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";

window.vineQueue = null;
window.vineQueueAbbr = null;
window.vineSearch = false;
window.vineBrowsingListing = false;
window.appVersion = null;
window.prebootCompleted = false;
window.ultraviner = false; //If Ultravine is detected, Vine Helper will deactivate itself to avoid conflicts.

import { Internationalization } from "./Internationalization.js";
window.I13n = new Internationalization();

import { NotificationMonitor } from "./NotificationMonitor.js";
window.NotificationMonitor = NotificationMonitor;

import { Tile, getTileByAsin, getAsinFromDom, getTitleFromDom, getThumbnailURLFromDom } from "./Tile.js";
window.Tile = Tile;
window.getTileByAsin = getTileByAsin;
window.getAsinFromDom = getAsinFromDom;
window.getTitleFromDom = getTitleFromDom;
window.getThumbnailURLFromDom = getThumbnailURLFromDom;

//Grid
import {
	Grid,
	updateTileCounts,
	createGridInterface,
	addPinnedTile,
	getRecommendationTypeFromQueue,
	generateRecommendationString,
	hideAllItems,
	hideAllItemsNext,
	showAllItems,
	selectCurrentTab,
} from "./Grid.js";
window.Grid = Grid;
window.updateTileCounts = updateTileCounts;
window.createGridInterface = createGridInterface;
window.addPinnedTile = addPinnedTile;
window.getRecommendationTypeFromQueue = getRecommendationTypeFromQueue;
window.generateRecommendationString = generateRecommendationString;
window.hideAllItems = hideAllItems;
window.hideAllItemsNext = hideAllItemsNext;
window.showAllItems = showAllItems;
window.selectCurrentTab = selectCurrentTab;

import { Toolbar } from "./Toolbar.js";
window.Toolbar = Toolbar;

import { generatePagination } from "./Pagination.js";
window.generatePagination = generatePagination;

import { HiddenListMgr } from "./HiddenListMgr.js";
window.HiddenList = new HiddenListMgr();

import { PinnedListMgr } from "./PinnedListMgr.js";
window.PinnedList = new PinnedListMgr();

import { SettingsMgr } from "./SettingsMgr.js";
window.Settings = new SettingsMgr();

const Tpl = new Template();
window.DialogMgr = new ModalMgr();
window.Notifications = new ScreenNotifier();

//###############################################33
//Code start

//Do not run the extension if ultraviner is running
let regex = /^.+?amazon\..+\/vine\/.*ultraviner.*?$/;
if (!regex.test(window.location.href)) {
	getSettings(); //First call to launch the extension.
} else {
	window.ultraviner = true;
	console.log("VineHelper detected UltraViner. Disabling VineHelper on this page.");
}

//Loading the settings from the local storage
async function getSettings() {
	logger.add("PREBOOT: Waiting on config to be loaded...");
	while (!Settings || !Settings.isLoaded()) {
		await new Promise((r) => setTimeout(r, 10));
	}
	logger.add("PREBOOT: config loaded!");

	//Load Thorvarium stylesheets
	if (Settings.get("thorvarium.mobileios")) loadStyleSheet("node_modules/vine-styling/mobile/ios-with-bugfix.css");

	if (Settings.get("thorvarium.mobileandroid")) loadStyleSheet("node_modules/vine-styling/mobile/mobile.css");

	if (Settings.get("thorvarium.smallItems")) loadStyleSheet("node_modules/vine-styling/desktop/small-items.css");

	if (Settings.get("thorvarium.removeHeader")) loadStyleSheet("node_modules/vine-styling/desktop/remove-header.css");

	if (Settings.get("thorvarium.removeFooter")) loadStyleSheet("node_modules/vine-styling/desktop/remove-footer.css");

	if (Settings.get("thorvarium.removeAssociateHeader"))
		loadStyleSheet("node_modules/vine-styling/desktop/remove-associate-header.css");

	if (Settings.get("thorvarium.moreDescriptionText"))
		loadStyleSheet("node_modules/vine-styling/desktop/more-description-text.css");

	if (Settings.get("thorvarium.darktheme")) loadStyleSheet("node_modules/vine-styling/desktop/dark-theme.css");

	if (Settings.get("thorvarium.ETVModalOnTop"))
		loadStyleSheet("node_modules/vine-styling/desktop/etv-modal-on-top.css");

	if (Settings.get("thorvarium.paginationOnTop"))
		loadStyleSheet("node_modules/vine-styling/desktop/pagination-on-top.css");

	if (Settings.get("thorvarium.collapsableCategories"))
		loadStyleSheet("node_modules/vine-styling/desktop/collapsable-categories.css");

	if (Settings.get("thorvarium.stripedCategories"))
		loadStyleSheet("node_modules/vine-styling/desktop/striped-categories.css");

	if (Settings.get("thorvarium.limitedQuantityIcon"))
		loadStyleSheet("node_modules/vine-styling/desktop/limited-quantity-icon.css");

	if (Settings.get("thorvarium.RFYAFAAITabs"))
		loadStyleSheet("node_modules/vine-styling/desktop/rfy-afa-ai-tabs.css");

	logger.add("PREBOOT: Thorvarium stylesheets injected");

	if (Settings.get("general.listView")) loadStyleSheet("resource/css/listView.css");

	if (Settings.isPremiumUser() && Settings.get("general.customCSS")) {
		loadStyleSheetContent(Settings.get("general.customCSS"));
	}

	// Load the country specific stylesheet
	if (Settings.get("thorvarium.categoriesWithEmojis")) {
		// The default stylesheet is for the US
		var emojiList = "categories-with-emojis";
		// For all other countries, append the country code to the stylesheet
		if (I13n.getCountryCode() != "com") emojiList += "-" + I13n.getCountryCode().toUpperCase();

		loadStyleSheet("node_modules/vine-styling/desktop/" + emojiList + ".css");
	}

	logger.add("PREBOOT: Thorvarium country-specific stylesheets injected");

	//Send the country code to the Service Worker
	if (Settings.get("general.country") != I13n.getCountryCode()) {
		Settings.set("general.country", I13n.getCountryCode());

		chrome.runtime.sendMessage(
			{
				type: "setCountryCode",
				countryCode: I13n.getCountryCode(),
			},
			function (response) {
				if (chrome.runtime.lastError) {
					console.error("Error sending message:", chrome.runtime.lastError.message);
				}
			}
		);
	}

	let manifest = chrome.runtime.getManifest();
	window.appVersion = manifest.version;

	//If the domain if not from outside the countries supported by the discord API, disable discord
	if (["ca", "com", "co.uk"].indexOf(I13n.getDomainTLD()) == -1) {
		Settings.set("discord.active", false);
	}

	//Determine if we are browsing a queue
	const currentUrl = window.location.href;
	regex = /^.+?amazon\..+\/vine\/vine-items(?:\?(queue|search)=(.+?))?(?:[#&].*)?$/;
	let arrMatches = currentUrl.match(regex);
	window.vineQueue = null;
	if (arrMatches != null) {
		window.vineBrowsingListing = true;
		if (arrMatches[1] == "queue" && arrMatches[2] != undefined) {
			window.vineQueue = arrMatches[2];
		} else if (arrMatches[1] == undefined) {
			window.vineQueue = "last_chance"; //Default AFA
		} else {
			window.vineQueue = null; //Could be a ?search, (but not a &search).
		}
	}

	//Determine if we are currently searching for an item
	regex = /^.+?amazon\..+\/vine\/vine-items(?:.*?)(?:[?&]search=(.+?))(?:[#&].*?)?$/;
	arrMatches = currentUrl.match(regex);
	if (arrMatches != null) {
		if (arrMatches[1] == undefined) {
			window.vineSearch = false;
		} else {
			window.vineSearch = true;
			window.vineQueue = null;
		}
	}

	let arrQueues = { potluck: "RFY", last_chance: "AFA", encore: "AI" };
	if (window.vineQueue != null) {
		window.vineQueueAbbr = arrQueues[window.vineQueue];
	}

	//Generate a UUID for the user
	let uuid = Settings.get("general.uuid", false);
	if (!uuid) {
		uuid = await requestNewUUID();
		Settings.set("general.uuid", uuid);
	}

	window.prebootCompleted = true;

	logger.add("PREBOOT: Preboot routine completed.");

	// Request the background script to inject the additional script
	chrome.runtime.sendMessage({ action: "injectPluginsContentScripts" });
}

/** Request a new UUID from the server.
 * @return string UUID
 */
async function requestNewUUID() {
	logger.add("PREBOOT: Generating new UUID.");

	//Request a new UUID from the server
	const content = {
		api_version: 5,
		app_version: window.appVersion,
		action: "get_uuid",
		country: I13n.getCountryCode(),
	};
	const options = {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	};

	let response = await fetch(VINE_HELPER_API_V5_URL, options);

	if (!response.ok) {
		throw new Error("Network response was not ok PREBOOT:requestNewUUID");
	}

	// Parse the JSON response
	let serverResponse = await response.json();

	if (serverResponse["ok"] !== "ok") {
		throw new Error("Content response was not ok PREBOOT:requestNewUUID");
	}

	// Return the obtained UUID
	return serverResponse["uuid"];
}

//#################################################3
//### UTILITY FUNCTIONS

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

function loadStyleSheetExternal(path) {
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = chrome.runtime.getURL(path); // Set the path to the CSS file
	document.head.appendChild(link);
}

/** Convert the format "2024-10-03 17:00:45" to
 * a new Date object constructed with "2024-10-04T17:00:45Z"
 * */
window.YMDHiStoISODate = function (datetime) {
	//Used by Tile.js
	return new Date(datetime.replace(" ", "T") + "Z");
};
