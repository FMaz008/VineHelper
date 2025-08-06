/*global chrome*/

import { Logger } from "/scripts/core/utils/Logger.js";
var logger = new Logger();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
var i13n = new Internationalization();

import { Template } from "/scripts/core/utils/Template.js";
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
	await Settings.waitForLoad();
	logger.add("PREBOOT: config loaded!");

	// Apply blind loading CSS immediately to prevent flicker
	if (Settings.get("general.blindLoading")) {
		logger.add("PREBOOT: Applying blind loading CSS to hide grid early");
		loadStyleSheetContent(
			`
			/* Hide the grid container immediately to prevent flicker during page loads and pagination */
			/* Using visibility instead of display to avoid layout issues */
			/* Using a specific attribute selector that we can remove later */
			body:not([data-vh-ready]) #vvp-items-grid-container {
				visibility: hidden !important;
				opacity: 0 !important;
			}
			
			/* Also hide the items grid itself as a fallback */
			body:not([data-vh-ready]) #vvp-items-grid {
				visibility: hidden !important;
				opacity: 0 !important;
			}
			
			/* Hide the entire items container to be extra sure */
			body:not([data-vh-ready]) .vvp-items-container {
				visibility: hidden !important;
				opacity: 0 !important;
			}
			
			/* Smooth transition when showing */
			body[data-vh-ready] #vvp-items-grid-container,
			body[data-vh-ready] #vvp-items-grid,
			body[data-vh-ready] .vvp-items-container {
				visibility: visible !important;
				opacity: 1 !important;
				transition: opacity 0.2s ease-in-out;
			}
		`,
			"blind-loading-early"
		);
	}

	//Load Thorvarium stylesheets
	if (Settings.get("thorvarium.mobileios")) loadStyleSheet("scripts/vendor/vine-styling/mobile/ios-with-bugfix.css");

	if (Settings.get("thorvarium.mobileandroid")) loadStyleSheet("scripts/vendor/vine-styling/mobile/mobile.css");

	if (Settings.get("thorvarium.smallItems")) loadStyleSheet("scripts/vendor/vine-styling/desktop/small-items.css");

	if (Settings.get("thorvarium.removeHeader"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/remove-header.css");

	if (Settings.get("thorvarium.removeFooter"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/remove-footer.css");

	if (Settings.get("thorvarium.removeAssociateHeader"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/remove-associate-header.css");

	if (Settings.get("thorvarium.darktheme")) loadStyleSheet("scripts/vendor/vine-styling/desktop/dark-theme.css");

	if (Settings.get("thorvarium.ETVModalOnTop"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/etv-modal-on-top.css");

	if (Settings.get("thorvarium.paginationOnTop"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/pagination-on-top.css");

	if (Settings.get("thorvarium.collapsableCategories"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/collapsable-categories.css");

	if (Settings.get("thorvarium.stripedCategories"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/striped-categories.css");

	if (Settings.get("thorvarium.limitedQuantityIcon"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/limited-quantity-icon.css");

	if (Settings.get("thorvarium.RFYAFAAITabs"))
		loadStyleSheet("scripts/vendor/vine-styling/desktop/rfy-afa-ai-tabs.css");

	logger.add("PREBOOT: Thorvarium stylesheets injected");

	if (Settings.isPremiumUser(2) && Settings.get("general.customCSS")) {
		loadStyleSheetContent(Settings.get("general.customCSS"));
	}

	// Load the country specific stylesheet
	if (Settings.get("thorvarium.categoriesWithEmojis")) {
		// The default stylesheet is for the US
		var emojiList = "categories-with-emojis";
		// For all other countries, append the country code to the stylesheet
		if (i13n.getCountryCode() != "com") emojiList += "-" + i13n.getCountryCode().toUpperCase();

		loadStyleSheet("scripts/vendor/vine-styling/desktop/" + emojiList + ".css");
	}

	logger.add("PREBOOT: Thorvarium country-specific stylesheets injected");
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
