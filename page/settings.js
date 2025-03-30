import { SettingsMgr } from "../scripts/SettingsMgr.js";
const Settings = new SettingsMgr();

import { Internationalization } from "../scripts/Internationalization.js";
const i13n = new Internationalization();

import { initiateSettings } from "../page/settings_loadsave.js";

import { Template } from "../scripts/Template.js";
var Tpl = new Template();

Tpl.flushLocalStorage();

(async () => {
	const nonVineUrlTpl = await Tpl.loadFile("/page/settings_nonvineurl.tpl.html");	
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const activeTab = tabs[0];
		const isVinePage = activeTab?.url?.match(/https:\/\/www\.amazon\.[^\/]+\/vine/i);
		if (!isVinePage) {
			document.body.innerHTML = Tpl.render(nonVineUrlTpl);
		} else {
			initializeAndRenderMain();
		}
	});
})();

async function initializeAndRenderMain() {
	// Load all templates
	const promMainTpl = await Tpl.loadFile("/page/settings_main.tpl.html");
	const promTab1 = await Tpl.loadFile("/page/settings_general.tpl.html");
	const promTab2 = await Tpl.loadFile("/page/settings_notifications.tpl.html");
	const promTab3 = await Tpl.loadFile("/page/settings_system.tpl.html");
	const promTab4 = await Tpl.loadFile("/page/settings_brenda.tpl.html");
	const promTab5 = await Tpl.loadFile("/page/settings_keywords.tpl.html");
	const promTab6 = await Tpl.loadFile("/page/settings_keybindings.tpl.html");
	const promTab7 = await Tpl.loadFile("/page/settings_styles.tpl.html");
	const promTab8 = await Tpl.loadFile("/page/settings_premium.tpl.html");
	const promTab9 = await Tpl.loadFile("/page/settings_about.tpl.html");

	Tpl.setVar("APP_VERSION", getAppVersion());
	Tpl.setVar("TAB1", Tpl.render(promTab1));
	Tpl.setVar("TAB2", Tpl.render(promTab2));
	Tpl.setVar("TAB3", Tpl.render(promTab3));
	Tpl.setVar("TAB4", Tpl.render(promTab4));
	Tpl.setVar("TAB5", Tpl.render(promTab5));
	Tpl.setVar("TAB6", Tpl.render(promTab6));
	Tpl.setVar("TAB7", Tpl.render(promTab7));
	Tpl.setVar("TAB8", Tpl.render(promTab8));
	Tpl.setVar("TAB9", Tpl.render(promTab9));

	let domainTLD = "";
	const countryCode = Settings.get("general.country");
	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
		domainTLD = i13n.getDomainTLD();
	}
	Tpl.setIf("country_known", countryCode != null);
	if (Settings.get("notification.monitor.blockNonEssentialListeners")) {
		Tpl.setVar("monitor_link", "https://www.amazon." + domainTLD + "/vine/vine-items?queue=encore#monitor");
	} else {
		Tpl.setVar(
			"monitor_link",
			"https://www.amazon." + domainTLD + "/vine/vine-items?queue=encore#monitorLoadAllListerners"
		);
	}

	Tpl.setVar("light_monitor_link", chrome.runtime.getURL("page/notification_monitor_light.html"));
	Tpl.setVar("item_explorer_link", chrome.runtime.getURL("page/item_explorer.html"));
	Tpl.setIf("tier_3", Settings.isPremiumUser(3));

	document.body.innerHTML = Tpl.render(promMainTpl);
	initTabs();	
	initiateSettings(); //page/settings_loadsave.js, initialize the loading and saving code for the page
}

function getAppVersion() {
	const manifest = chrome.runtime.getManifest();
	return manifest.version;
}

//Tab management
function initTabs() {
	//Bind the click event for the tabs
	document.querySelectorAll("#tabs-index > ul li").forEach(function (item) {
		item.onclick = function (event) {
			const currentTab = this.querySelector("a").href.split("#").pop();
			selectTab(currentTab);
			this.classList.add("active");
			return false;
		};
	});
	//Set the first tab as active
	document.querySelector("#tabs-index > ul li:first-child").click();
}

function selectTab(tab) {
	//Hide all tabs
	document.querySelectorAll("#tabs-content .tab").forEach(function (item) {
		item.style.display = "none";
	});

	document.querySelectorAll("#tabs-index > ul li").forEach(function (item) {
		item.classList.remove("active");
	});

	//Display the current tab
	document.querySelector("#" + tab).style.display = "flex";
}
