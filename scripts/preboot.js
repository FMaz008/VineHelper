const startTime = Date.now();

//Extension settings
var appSettings = {};
var arrHidden = [];

var vineDomain = null;
var vineCountry = null;
var vineLocale = null;
var vineCurrency = null;
var vineQueue = null;
var vineQueueAbbr = null;
var uuid = null;

var appVersion = 0;

var Tpl = new Template();
var TplMgr = new TemplateMgr();
var Notifications = new ScreenNotifier();
var HiddenList = new HiddenListMgr();

//#########################
//### Load settings

//This method will initiate the settings for the first time,
function getDefaultSettings() {
	//Craft the new settings in JSON
	settings = {
		unavailableTab: {
			active: true,
			votingToolbar: true,
			shareOrder: true,
			consensusThreshold: 2,
			unavailableOpacity: 100,
			selfDiscard: true,
			consensusDiscard: true,
			compactToolbar: false,
		},

		general: {
			uuid: null,
			topPagination: true,
			allowInjection: true,
			shareETV: false,
			displayETV: false,
			displayFirstSeen: true,
			bookmark: true,
			bookmarkDate: 0,
			displayVariantIcon: false,
			versionInfoPopup: 0,
			firstVotePopup: true,
			newItemNotification: false,
		},

		hiddenTab: {
			active: true,
			remote: false,
			arrItems: [], //deprecated
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
			collapsableCategories: false,
			stripedCategories: false,
			limitedQuantityIcon: false,
			RFYAFAAITabs: false,
		},
	};

	return settings;
}

//Loading the settings from the local storage
async function getSettings() {
	showRuntime("PRE: Reading settings from local storage");

	const data = await chrome.storage.local.get("settings");

	showRuntime("PRE: Done reading settings");

	//If no settings exist already, create the default ones
	if ($.isEmptyObject(data)) {
		showRuntime("Settings not found, generating default configuration...");
		//Will generate default settings
		await chrome.storage.local.clear(); //Delete all local storage
		appSettings = getDefaultSettings();
		saveSettings();
	} else {
		Object.assign(appSettings, data.settings);
	}

	//V0.17: Move the hidden item to a separate local storage
	if (appSettings.hiddenTab.hasOwnProperty("arrItems")) {
		await chrome.storage.local.set({
			hiddenItems: appSettings.hiddenTab.arrItems,
		});
		delete appSettings.hiddenTab["arrItems"];
		saveSettings();
	}

	//Load Thorvarium stylesheets
	if (appSettings.thorvarium.mobileios)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/mobile/ios-with-bugfix.css">'
		);

	if (appSettings.thorvarium.mobileandroid)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/mobile/mobile.css">'
		);

	if (appSettings.thorvarium.smallItems)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/small-items.css">'
		);

	if (appSettings.thorvarium.removeHeader)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-header.css">'
		);

	if (appSettings.thorvarium.removeFooter)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-footer.css">'
		);

	if (appSettings.thorvarium.removeAssociateHeader)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-associate-header.css">'
		);

	if (appSettings.thorvarium.moreDescriptionText)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/more-description-text.css">'
		);

	if (appSettings.thorvarium.darktheme)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/dark-theme.css">'
		);

	if (appSettings.thorvarium.ETVModalOnTop)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/etv-modal-on-top.css">'
		);

	if (appSettings.thorvarium.categoriesWithEmojis)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/categories-with-emojis.css">'
		);

	if (appSettings.thorvarium.paginationOnTop)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/pagination-on-top.css">'
		);

	if (appSettings.thorvarium.collapsableCategories)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/collapsable-categories.css">'
		);

	if (appSettings.thorvarium.stripedCategories)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/striped-categories.css">'
		);

	if (appSettings.thorvarium.limitedQuantityIcon)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/limited-quantity-icon.css">'
		);

	if (appSettings.thorvarium.RFYAFAAITabs)
		$("head").append(
			'<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/rfy-afa-ai-tabs.css">'
		);

	showRuntime("BOOT: Thorvarium stylesheets injected");

	//V1.20 New setting update default value
	if (appSettings.unavailableTab.votingToolbar == undefined) {
		appSettings.unavailableTab.votingToolbar =
			appSettings.unavailableTab.active;
		saveSettings();
	}

	//Figure out what domain the extension is working on
	//De-activate the unavailableTab (and the voting system) for all non-.ca domains.
	let currentUrl = window.location.href;
	regex = /^.+?amazon\.(.+)\/vine\/.*$/;
	arrMatches = currentUrl.match(regex);
	vineDomain = arrMatches[1];
	vineCountry = vineDomain.split(".").pop();

	let manifest = chrome.runtime.getManifest();
	appVersion = manifest.version;

	//If the domain is not Canada, UK or France, de-activate the voting system/unavailable tab
	if (["ca", "co.uk", "fr"].indexOf(vineDomain) == -1) {
		appSettings.unavailableTab.votingToolbar = false;
		appSettings.unavailableTab.consensusDiscard = false;
		appSettings.unavailableTab.selfDiscard = false;
	}

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
			vineLocale = "en_GB";
			vineCurrency = "GBP";
			break;
		case "fr":
			vineLocale = "fr-FR";
			vineCurrency = "EUR";
			break;
		case "es":
			vineLocale = "es-ES";
			vineCurrency = "EUR";
			break;
	}

	//Determine if we are browsing a queue
	regex = /^.+?amazon\..+\/vine\/vine-items(?:\?queue=(.+?))?(?:[#&].*)?$/;
	arrMatches = currentUrl.match(regex);
	vineQueue = null;
	if (arrMatches != null) {
		if (arrMatches[1] == undefined) {
			vineQueue = null; //Could be the default AFA or a search.
		} else {
			vineQueue = arrMatches[1];
		}
	}

	let arrQueues = { potluck: "RFY", last_chance: "AFA", encore: "AI" };
	if (vineQueue != null) vineQueueAbbr = arrQueues[vineQueue];

	//Generate a UUID for the user
	if (
		appSettings.general.uuid == undefined ||
		appSettings.general.uuid == null
	) {
		//Request a new UUID from the server
		let arrJSON = {
			api_version: 4,
			action: "get_uuid",
			country: vineCountry,
		};
		let jsonArrURL = JSON.stringify(arrJSON);

		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		let url =
			"https://www.francoismazerolle.ca/vinehelper.php" +
			"?data=" +
			jsonArrURL;
		fetch(url)
			.then((response) => response.json())
			.then(function (serverResponse) {
				if (serverResponse["ok"] == "ok") {
					appSettings.general.uuid = serverResponse["uuid"];
					uuid = appSettings.general.uuid;
					saveSettings();
				}
			})
			.catch(function () {
				(error) => console.log(error);
			});
	}
	uuid = appSettings.general.uuid;

	showRuntime("PRE: Settings loaded");
}
showRuntime("PRE: Begining to load settings");
getSettings(); //First call to launch the extension.

//#################################################3
//### UTILITY FUNCTIONS
function isEmptyObj(obj) {
	for (i in obj) return false;
	return true;
}

function getRunTime() {
	return Date.now() - startTime;
}
function showRuntime(eventName) {
	//console.log(eventName+": "+ (Date.now() - startTime) + "ms");
}

function saveSettings() {
	chrome.storage.local.set({ settings: appSettings });
}
