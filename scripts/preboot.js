import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
var Settings = new SettingsMgr();

import { Internationalization } from "./Internationalization.js";
var i13n = new Internationalization();

import { Template } from "./Template.js";
const Tpl = new Template();

//###############################################33
//Code start

//Do not run the extension if ultraviner is running
let regex = /^.+?amazon\..+\/vine\/.*ultraviner.*?$/;
if (!regex.test(window.location.href)) {
	loadStyleSheets(); //First call to launch the extension.
} else {
	console.log("VineHelper detected UltraViner. Disabling VineHelper on this page.");
}

//Loading the settings from the local storage
async function loadStyleSheets() {
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
		if (i13n.getCountryCode() != "com") emojiList += "-" + i13n.getCountryCode().toUpperCase();

		loadStyleSheet("node_modules/vine-styling/desktop/" + emojiList + ".css");
	}

	logger.add("PREBOOT: Thorvarium country-specific stylesheets injected");
}

//Send the country code to the Service Worker
if (Settings.get("general.country") != i13n.getCountryCode()) {
	Settings.set("general.country", i13n.getCountryCode());

	chrome.runtime.sendMessage(
		{
			type: "setCountryCode",
			countryCode: i13n.getCountryCode(),
		},
		function (response) {
			if (chrome.runtime.lastError) {
				console.error("Error sending message:", chrome.runtime.lastError.message);
			}
		}
	);
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
