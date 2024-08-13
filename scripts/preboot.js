const startTime = Date.now();
const VINE_HELPER_API_URL = "https://vinehelper.ovh/vinehelper.php?data=";

if (typeof browser === "undefined") {
	var browser = chrome;
}

//Extension settings
var appSettings = {};
var arrHidden = [];
var arrDebug = [];
var mapHook = new Map();

let debugMessage = "";

var vineDomain = null;
var vineCountry = null;
var vineLocale = null;
var vineCurrency = null;
var vineQueue = null;
var vineQueueAbbr = null;
var vineSearch = false;
var vineBrowsingListing = false;
var uuid = null;

var appVersion = 0;
var ultraviner = false; //If Ultravine is detected, Vine Helper will deactivate itself to avoid conflicts.

var Tpl = new Template();
var TplMgr = new TemplateMgr();
var DialogMgr = new ModalMgr();
var Notifications = new ScreenNotifier();
var HiddenList = new HiddenListMgr();
var PinnedList = new PinnedListMgr();

function showRuntime(eventName) {
	arrDebug.push({ time: Date.now() - startTime, event: eventName });
}

//#########################
//### Load settings

//This method will initiate the settings for the first time,
function getDefaultSettings() {
	//Craft the new settings in JSON
	settings = {
		unavailableTab: {
			active: true,
			compactToolbar: false,
		},

		general: {
			country: null,
			uuid: null,
			topPagination: true,
			displayFirstSeen: true,
			bookmark: false,
			bookmarkDate: 0,
			hideKeywords: [],
			highlightKeywords: [],
			displayVariantIcon: false,
			versionInfoPopup: 0,
			GDPRPopup: true,
			newItemNotification: false,
			displayNewItemNotifications: false,
			newItemNotificationImage: true,
			hiddenItemsCacheSize: 9,
			newItemNotificationVolume: 0,
			newItemMonitorNotificationVolume: 0,
			newItemMonitorNotificationSoundCondition: 0,
			newItemMonitorNotificationHiding: false,
			newItemMonitorDuplicateImageHiding: false,
		},

		keyBindings: {
			active: true,
			nextPage: "n",
			previousPage: "p",
			RFYPage: "r",
			AFAPage: "a",
			AIPage: "i",
			hideAll: "h",
			showAll: "s",
			debug: "d",
		},

		hiddenTab: {
			active: true,
			remote: false,
		},

		PinnedTab: {
			active: true,
		},

		discord: {
			active: false,
			guid: null,
		},

		thorvarium: {
			mobileios: false,
			mobileandroid: false,
			smallItems: false,
			removeHeader: false,
			removeFooter: false,
			removeAssociateHeader: false,
			moreDescriptionText: false,
			ETVModalOnTop: false,
			categoriesWithEmojis: false,
			paginationOnTop: false,
			collapsableCategories: false,
			stripedCategories: false,
			limitedQuantityIcon: false,
			RFYAFAAITabs: false,
		},
	};

	return settings;
}

async function loadStyleSheet(path) {
	prom = await Tpl.loadFile(path);
	let content = Tpl.render(prom);
	$("head").append("<style type='text/css'>" + content + "</style>");
}

//Loading the settings from the local storage
async function getSettings() {
	const data = await chrome.storage.local.get("settings");

	showRuntime("PRE: Done reading settings");

	//If no settings exist already, create the default ones
	if (data == null || Object.keys(data).length === 0) {
		showRuntime("Settings not found, generating default configuration...");
		//Will generate default settings
		await chrome.storage.local.clear(); //Delete all local storage
		appSettings = getDefaultSettings();
		saveSettings();
	} else {
		Object.assign(appSettings, data.settings);
	}

	//V2.2.0: Move the keybinding settings
	if (appSettings.general.keyBindings !== undefined) {
		appSettings.keyBindings = {};
		appSettings.keyBindings.active = appSettings.general.keyBindings;
		appSettings.keyBindings.nextPage = "n";
		appSettings.keyBindings.previousPage = "p";
		appSettings.keyBindings.RFYPage = "r";
		appSettings.keyBindings.AFAPage = "a";
		appSettings.keyBindings.AIPage = "i";
		appSettings.keyBindings.hideAll = "h";
		appSettings.keyBindings.showAll = "s";
		appSettings.keyBindings.debug = "d";
		appSettings.general.keyBindings = undefined;
		saveSettings();
	}

	//V2.2.3: Configure garbage collector for hidden items
	if (appSettings.general.hiddenItemsCacheSize == undefined) {
		appSettings.general.hiddenItemsCacheSize = 9;
		saveSettings();
	}
	if (appSettings.general.newItemNotificationImage == undefined) {
		appSettings.general.newItemNotificationImage = true;
		saveSettings();
	}

	//v2.2.7
	if (appSettings.general.displayNewItemNotifications == undefined) {
		appSettings.general.displayNewItemNotifications = appSettings.general.newItemNotification;
		saveSettings();
	}

	//v2.3.3
	if (appSettings.general.hideKeywords == undefined) {
		appSettings.general.hideKeywords = [];
		saveSettings();
	}
	if (appSettings.general.highlightKeywords == undefined) {
		appSettings.general.highlightKeywords = [];
		saveSettings();
	}

	//v2.7.6
	if (
		appSettings.general.newItemMonitorNotificationVolume == undefined ||
		appSettings.general.newItemNotificationVolume == undefined
	) {
		appSettings.general.newItemMonitorNotificationVolume =
			appSettings.general.newItemMonitorNotificationSound == 0 ? 0 : 1;

		appSettings.general.newItemMonitorNotificationSoundCondition =
			appSettings.general.newItemMonitorNotificationSound == 2 ? 1 : 0;

		appSettings.general.newItemMonitorNotificationSound = null; //No longer used.

		appSettings.general.newItemNotificationVolume = Number(appSettings.general.newItemNotificationSound);
		appSettings.general.newItemNotificationSound = null; //No longer used.
		saveSettings();
	}

	//Load Thorvarium stylesheets
	if (appSettings.thorvarium.mobileios) loadStyleSheet("node_modules/vine-styling/mobile/ios-with-bugfix.css");

	if (appSettings.thorvarium.mobileandroid) loadStyleSheet("node_modules/vine-styling/mobile/mobile.css");

	if (appSettings.thorvarium.smallItems) loadStyleSheet("node_modules/vine-styling/desktop/small-items.css");

	if (appSettings.thorvarium.removeHeader) loadStyleSheet("node_modules/vine-styling/desktop/remove-header.css");

	if (appSettings.thorvarium.removeFooter) loadStyleSheet("node_modules/vine-styling/desktop/remove-footer.css");

	if (appSettings.thorvarium.removeAssociateHeader)
		loadStyleSheet("node_modules/vine-styling/desktop/remove-associate-header.css");

	if (appSettings.thorvarium.moreDescriptionText)
		loadStyleSheet("node_modules/vine-styling/desktop/more-description-text.css");

	if (appSettings.thorvarium.darktheme) loadStyleSheet("node_modules/vine-styling/desktop/dark-theme.css");

	if (appSettings.thorvarium.ETVModalOnTop) loadStyleSheet("node_modules/vine-styling/desktop/etv-modal-on-top.css");

	if (appSettings.thorvarium.paginationOnTop)
		loadStyleSheet("node_modules/vine-styling/desktop/pagination-on-top.css");

	if (appSettings.thorvarium.collapsableCategories)
		loadStyleSheet("node_modules/vine-styling/desktop/collapsable-categories.css");

	if (appSettings.thorvarium.stripedCategories)
		loadStyleSheet("node_modules/vine-styling/desktop/striped-categories.css");

	if (appSettings.thorvarium.limitedQuantityIcon)
		loadStyleSheet("node_modules/vine-styling/desktop/limited-quantity-icon.css");

	if (appSettings.thorvarium.RFYAFAAITabs) loadStyleSheet("node_modules/vine-styling/desktop/rfy-afa-ai-tabs.css");

	showRuntime("BOOT: Thorvarium stylesheets injected");

	//Figure out what domain the extension is working on
	let currentUrl = window.location.href;
	regex = /^.+?amazon\.([a-z.]+).*\/vine\/.*$/;
	arrMatches = currentUrl.match(regex);
	vineDomain = arrMatches[1];
	vineCountry = vineDomain.split(".").pop();

	// Load the country specific stylesheet
	if (appSettings.thorvarium.categoriesWithEmojis) {
		// The default stylesheet is for the US
		var emojiList = "categories-with-emojis";
		// For all other countries, append the country code to the stylesheet
		if (vineCountry != "com") emojiList += "-" + vineCountry.toUpperCase();

		loadStyleSheet("node_modules/vine-styling/desktop/" + emojiList + ".css");
	}

	showRuntime("BOOT: Thorvarium country-specific stylesheets injected");

	//Send the country code to the Service Worker
	if (appSettings.general.country == null || appSettings.general.country != vineCountry) {
		//or undefined
		appSettings.general.country = vineCountry;
		saveSettings();
	}
	browser.runtime.sendMessage({
		type: "vineCountry",
		vineCountry: vineCountry,
	});
	setInterval(async () => {
		browser.runtime.sendMessage({
			type: "keepAlive",
		});
	}, 25000);

	let manifest = chrome.runtime.getManifest();
	appVersion = manifest.version;

	//If the domain if not from outside the countries supported by the discord API, disable discord
	if (["ca", "com", "co.uk"].indexOf(vineDomain) == -1) {
		appSettings.discord.active = false;
	}

	switch (vineDomain) {
		case "ca":
			vineLocale = "en-CA";
			vineCurrency = "CAD";
			break;
		case "com":
			vineLocale = "en-US";
			vineCurrency = "USD";
			break;
		case "co.uk":
			vineLocale = "en-GB";
			vineCurrency = "GBP";
			break;
		case "co.jp":
			vineLocale = "ja-JP";
			vineCurrency = "JPY";
			break;
		case "de":
			vineLocale = "de-DE";
			vineCurrency = "EUR";
			break;
		case "fr":
			vineLocale = "fr-FR";
			vineCurrency = "EUR";
			break;
		case "es":
			vineLocale = "es-ES";
			vineCurrency = "EUR";
			break;
		case "it":
			vineLocale = "it-IT";
			vineCurrency = "EUR";
			break;
	}

	//Determine if we are browsing a queue
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
	if (appSettings.general?.uuid == undefined || appSettings.general?.uuid == null) {
		uuid = await obtainNewUUID();
	} else {
		uuid = appSettings.general.uuid;
	}
	// Request the background script to inject the additional script
	browser.runtime.sendMessage({ action: "injectPluginsContentScripts" });

	showRuntime("PRE: Settings loaded");
}
showRuntime("PRE: Begining to load settings");

/** Obtain (and store) a new UUID
 */
async function obtainNewUUID() {
	let uuid = await requestNewUUID();
	appSettings.general.uuid = uuid;
	saveSettings();
	return uuid;
}

/** Request a new UUID from the server.
 * @return string UUID
 */
async function requestNewUUID() {
	showRuntime("PRE: Generating new UUID.");

	//Request a new UUID from the server
	let arrJSON = {
		api_version: 4,
		action: "get_uuid",
		country: vineCountry,
	};

	//Build the URL request
	let jsonArrURL = JSON.stringify(arrJSON);
	let url = VINE_HELPER_API_URL + jsonArrURL;

	let response = await fetch(url);

	if (!response.ok) {
		throw new Error("Network response was not ok PRE:obtainNewUUID");
	}

	// Parse the JSON response
	let serverResponse = await response.json();

	if (serverResponse["ok"] !== "ok") {
		throw new Error("Content response was not ok PRE:obtainNewUUID");
	}

	// Return the obtained UUID
	return serverResponse["uuid"];
}

//Do not run the extension if ultraviner is running
regex = /^.+?amazon\..+\/vine\/.*ultraviner.*?$/;
if (!regex.test(window.location.href)) {
	getSettings(); //First call to launch the extension.
} else {
	ultraviner = true;
	console.log("VineHelper detected UltraViner. Disabling VineHelper on this page.");
}

//#################################################3
//### UTILITY FUNCTIONS

function hookBind(hookname, func) {
	let arrBinding = mapHook.get(hookname);
	if (arrBinding == undefined) arrBinding = [];
	arrBinding.push(func);
	mapHook.set(hookname, arrBinding);
	console.log(mapHook);
}
function hookExecute(hookname, variables) {
	let arrBinding = mapHook.get(hookname);
	if (arrBinding == undefined) return false;
	arrBinding.forEach(function (func) {
		console.log("Calling function for hook " + hookname);
		func(variables); // Call each function for the hook
	});
}

async function saveSettings() {
	try {
		chrome.storage.local.set({ settings: appSettings });
	} catch (e) {
		if (e.name === "QuotaExceededError") {
			// The local storage space has been exceeded
			alert("Local storage quota exceeded! Hidden items will be cleared to make space.");
			await chrome.storage.local.set({ hiddenItems: [] });
			saveSettings();
		} else {
			// Some other error occurred
			alert("Error:", e.name, e.message);
			return false;
		}
	}

	if (!appSettings.general?.reduceNotifications) {
		let note = new ScreenNotification();
		note.title = "Settings saved.";
		note.lifespan = 3;
		note.content = "";
		note.title_only = true;
		Notifications.pushNotification(note);
	}
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
