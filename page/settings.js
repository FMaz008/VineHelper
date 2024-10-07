import { initiateSettings } from "../page/settings_loadsave.js";

var Tpl = new Template();
var TplMgr = new TemplateMgr();
window.Tpl = Tpl;
window.TplMgr = TplMgr;

//Render the main layout
(async () => {
	await TplMgr.flushLocalStorage(); //Delete all template from cache

	const promMainTpl = await Tpl.loadFile("/page/settings_main.tpl.html");
	const promTab1 = await Tpl.loadFile("/page/settings_general.tpl.html");
	const promTab2 = await Tpl.loadFile("/page/settings_notifications.tpl.html");
	const promTab3 = await Tpl.loadFile("/page/settings_system.tpl.html");
	const promTab4 = await Tpl.loadFile("/page/settings_brenda.tpl.html");
	const promTab5 = await Tpl.loadFile("/page/settings_keywords.tpl.html");
	const promTab6 = await Tpl.loadFile("/page/settings_keybindings.tpl.html");
	const promTab7 = await Tpl.loadFile("/page/settings_styles.tpl.html");
	const promTab8 = await Tpl.loadFile("/page/settings_about.tpl.html");

	Tpl.setVar("APP_VERSION", getAppVersion());
	Tpl.setVar("TAB1", Tpl.render(promTab1));
	Tpl.setVar("TAB2", Tpl.render(promTab2));
	Tpl.setVar("TAB3", Tpl.render(promTab3));
	Tpl.setVar("TAB4", Tpl.render(promTab4));
	Tpl.setVar("TAB5", Tpl.render(promTab5));
	Tpl.setVar("TAB6", Tpl.render(promTab6));
	Tpl.setVar("TAB7", Tpl.render(promTab7));
	Tpl.setVar("TAB8", Tpl.render(promTab8));

	document.body.innerHTML = Tpl.render(promMainTpl);

	initTabs();

	initiateSettings(); //page/settings_loadsave.js, initialize the loading and saving code for the page
})();

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
