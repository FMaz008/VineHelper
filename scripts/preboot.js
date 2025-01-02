const startTime = Date.now();
var timeMarker = []; //Array to store important performance data point.
timeMarker["document_start"] = startTime;

const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";

if (typeof browser === "undefined") {
	var browser = chrome;
}

//Extension settings
var arrHidden = [];
var arrDebug = [];
var mapHook = new Map();

let debugMessage = "";

var vineQueue = null;
var vineQueueAbbr = null;
var vineSearch = false;
var vineBrowsingListing = false;
var uuid = null;

var appVersion = null;
var prebootCompleted = false;
var ultraviner = false; //If Ultravine is detected, Vine Helper will deactivate itself to avoid conflicts.

var I13n = null;
var Settings = null;
var NotificationMonitor = null;
var Tile = null;
var Grid = null;
var Toolbar = null;
var HiddenList = null;
var PinnedList = null;

// Factory function to load a module
(async () => {
	try {
		let module = null;

		//Load the Internationalization.
		module = await import(chrome.runtime.getURL("../scripts/Internationalization.js"));
		I13n = new module.Internationalization();

		//Load the Notification Monitor
		module = await import(chrome.runtime.getURL("../scripts/NotificationMonitor.js"));
		NotificationMonitor = module.NotificationMonitor;

		//Tile
		module = await import(chrome.runtime.getURL("../scripts/Tile.js"));
		Tile = module.Tile;
		window.getTileByAsin = module.getTileByAsin;
		window.getAsinFromDom = module.getAsinFromDom;
		window.getTitleFromDom = module.getTitleFromDom;
		window.getThumbnailURLFromDom = module.getThumbnailURLFromDom;

		//Grid
		module = await import(chrome.runtime.getURL("../scripts/Grid.js"));
		Grid = module.Grid;
		window.updateTileCounts = module.updateTileCounts;
		window.createGridInterface = module.createGridInterface;
		window.addPinnedTile = module.addPinnedTile;
		window.getRecommendationTypeFromQueue = module.getRecommendationTypeFromQueue;
		window.generateRecommendationString = module.generateRecommendationString;
		window.hideAllItems = module.hideAllItems;
		window.hideAllItemsNext = module.hideAllItemsNext;
		window.showAllItems = module.showAllItems;
		window.selectCurrentTab = module.selectCurrentTab;

		//Toolbar
		module = await import(chrome.runtime.getURL("../scripts/Toolbar.js"));
		Toolbar = module.Toolbar;

		//Pagination
		module = await import(chrome.runtime.getURL("../scripts/Pagination.js"));
		window.generatePagination = module.generatePagination;

		//Load HiddenListMgr
		module = await import(chrome.runtime.getURL("../scripts/HiddenListMgr.js"));
		window.HiddenList = new module.HiddenListMgr();

		//Load PinnedListMgr
		module = await import(chrome.runtime.getURL("../scripts/PinnedListMgr.js"));
		window.PinnedList = new module.PinnedListMgr();

		//Load the SettingMgr.
		module = await import(chrome.runtime.getURL("../scripts/SettingsMgr.js"));
		Settings = new module.SettingsMgr();
	} catch (error) {
		console.error("Error loading module:", error);
	}
})();

var Tpl = new Template();
var TplMgr = new TemplateMgr();
var DialogMgr = new ModalMgr();
var Notifications = new ScreenNotifier();

//Do not run the extension if ultraviner is running
regex = /^.+?amazon\..+\/vine\/.*ultraviner.*?$/;
if (!regex.test(window.location.href)) {
	getSettings(); //First call to launch the extension.
} else {
	ultraviner = true;
	console.log("VineHelper detected UltraViner. Disabling VineHelper on this page.");
}

//Loading the settings from the local storage
async function getSettings() {
	showRuntime("PREBOOT: Waiting on config to be loaded...");
	while (!Settings || !Settings.isLoaded()) {
		await new Promise((r) => setTimeout(r, 10));
	}
	showRuntime("PREBOOT: config loaded!");

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

	showRuntime("PREBOOT: Thorvarium stylesheets injected");

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

	showRuntime("PREBOOT: Thorvarium country-specific stylesheets injected");

	//Send the country code to the Service Worker
	if (Settings.get("general.country") != I13n.getCountryCode()) {
		Settings.set("general.country", I13n.getCountryCode());

		browser.runtime.sendMessage(
			{
				type: "setCountryCode",
				countryCode: I13n.getCountryCode(),
			},
			function (response) {
				if (browser.runtime.lastError) {
					console.error("Error sending message:", browser.runtime.lastError.message);
				}
			}
		);
	}

	let manifest = chrome.runtime.getManifest();
	appVersion = manifest.version;

	//If the domain if not from outside the countries supported by the discord API, disable discord
	if (["ca", "com", "co.uk"].indexOf(I13n.getDomainTLD()) == -1) {
		Settings.set("discord.active", false);
	}

	//Determine if we are browsing a queue
	const currentUrl = window.location.href;
	regex = /^.+?amazon\..+\/vine\/vine-items(?:\?(queue|search)=(.+?))?(?:[#&].*)?$/;
	arrMatches = currentUrl.match(regex);
	vineQueue = null;
	if (arrMatches != null) {
		vineBrowsingListing = true;
		if (arrMatches[1] == "queue" && arrMatches[2] != undefined) {
			vineQueue = arrMatches[2];
		} else if (arrMatches[1] == undefined) {
			vineQueue = "last_chance"; //Default AFA
		} else {
			vineQueue = null; //Could be a ?search, (but not a &search).
		}
	}

	//Determine if we are currently searching for an item
	regex = /^.+?amazon\..+\/vine\/vine-items(?:.*?)(?:[?&]search=(.+?))(?:[#&].*?)?$/;
	arrMatches = currentUrl.match(regex);
	if (arrMatches != null) {
		if (arrMatches[1] == undefined) {
			vineSearch = false;
		} else {
			vineSearch = true;
			vineQueue = null;
		}
	}

	let arrQueues = { potluck: "RFY", last_chance: "AFA", encore: "AI" };
	if (vineQueue != null) vineQueueAbbr = arrQueues[vineQueue];

	//Generate a UUID for the user
	uuid = Settings.get("general.uuid", false);
	if (!uuid) {
		uuid = await requestNewUUID();
		Settings.set("general.uuid", uuid);
	}

	prebootCompleted = true;

	showRuntime("PREBOOT: Preboot routine completed.");

	// Request the background script to inject the additional script
	browser.runtime.sendMessage({ action: "injectPluginsContentScripts" });
}

/** Request a new UUID from the server.
 * @return string UUID
 */
async function requestNewUUID() {
	showRuntime("PREBOOT: Generating new UUID.");

	//Request a new UUID from the server
	const content = {
		api_version: 5,
		app_version: appVersion,
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

function showRuntime(eventName) {
	arrDebug.push({ time: Date.now() - startTime, event: eventName });
}

async function loadStyleSheet(path, injected = true) {
	if (injected) {
		prom = await Tpl.loadFile(path);
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
	link.href = browser.runtime.getURL(path); // Set the path to the CSS file
	document.head.appendChild(link);
}

function hookBind(hookname, func) {
	let arrBinding = mapHook.get(hookname);
	if (arrBinding == undefined) arrBinding = [];
	arrBinding.push(func);
	mapHook.set(hookname, arrBinding);
}
function hookExecute(hookname, variables) {
	let arrBinding = mapHook.get(hookname);
	if (arrBinding == undefined) return false;
	arrBinding.forEach(function (func) {
		//console.log("Calling function for hook " + hookname);
		func(variables); // Call each function for the hook
	});
}

function getRunTime() {
	return Date.now() - startTime;
}

async function getRunTimeJSON() {
	try {
		await generateStorageUsageForDebug();
	} catch (error) {
		console.error("Error generating runtime json");
	} finally {
		return JSON.stringify(arrDebug, null, 2).replaceAll("\n", "<br/>\n");
	}
}

/** Convert the format "2024-10-03 17:00:45" to
 * a new Date object constructed with "2024-10-04T17:00:45Z"
 * */
function YMDHiStoISODate(datetime) {
	return new Date(datetime.replace(" ", "T") + "Z");
}

function bytesToSize(bytes, decimals = 2) {
	if (!Number(bytes)) {
		return "0 Bytes";
	}

	const kbToBytes = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

	const index = Math.floor(Math.log(bytes) / Math.log(kbToBytes));

	return `${parseFloat((bytes / Math.pow(kbToBytes, index)).toFixed(dm))} ${sizes[index]}`;
}

async function generateStorageUsageForDebug() {
	try {
		const items = await getStorageItems();
		for (let key in items) {
			try {
				let itemCount = "";
				const keyLength = await getStorageKeyLength(key);
				const bytesUsed = await getStorageKeySizeinBytes(key);

				if (key != "settings") {
					itemCount = `representing ${keyLength} items`;
				}
				showRuntime(`Storage used by ${key}: ${bytesToSize(bytesUsed)} ${itemCount}`);
			} catch (error) {
				console.error(`Error retrieving storage data for ${key}: ${error.message}`);
			}
		}
	} catch (error) {
		console.error("Error fetching storage items:", error.message);
	}
}

// Helper function to get storage items as a promise
function getStorageItems() {
	return new Promise((resolve, reject) => {
		browser.storage.local.get(null, (items) => {
			if (browser.runtime.lastError) {
				reject(new Error(browser.runtime.lastError.message));
			} else {
				resolve(items);
			}
		});
	});
}

function getStorageKeySizeinBytes(key) {
	return new Promise((resolve, reject) => {
		browser.storage.local.get(key, function (items) {
			if (browser.runtime.lastError) {
				reject(new Error(browser.runtime.lastError.message));
			} else {
				const storageSize = JSON.stringify(items[key]).length;
				resolve(storageSize);
			}
		});
	});
}

function getStorageKeyLength(key) {
	return new Promise((resolve, reject) => {
		browser.storage.local.get(key, function (items) {
			if (browser.runtime.lastError) {
				reject(new Error(browser.runtime.lastError.message));
			} else {
				let itemSize;
				if (key == "hiddenItems" || key == "pinnedItems") {
					itemSize = HiddenList.deserialize(items[key]).size;
				} else if (Array.isArray(items[key])) {
					itemSize = items[key].length;
				} else {
					itemSize = "n/a";
				}

				resolve(itemSize);
			}
		});
	});
}

function getStorageSizeFull() {
	return new Promise((resolve, reject) => {
		browser.storage.local.get(function (items) {
			if (browser.runtime.lastError) {
				reject(new Error(browser.runtime.lastError.message));
			} else {
				const storageSize = JSON.stringify(items).length;
				resolve(storageSize);
			}
		});
	});
}

function generateString(length) {
	let result = "";
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}

	return result;
}
