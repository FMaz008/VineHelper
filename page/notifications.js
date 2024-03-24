var lastSoundPlayedAt = 0; //Date.now();
var appSettings = [];
var arrDebug = [];
if (typeof browser === "undefined") {
	var browser = chrome;
}

var Tpl = new Template();
var TplMgr = new TemplateMgr();

const vineLocales = {
	ca: { locale: "en-CA", currency: "CAD" },
	com: { locale: "en-US", currency: "USD" },
	uk: { locale: "en-GB", currency: "GBP" },
	jp: { locale: "ja-JP", currency: "JPY" },
	de: { locale: "de-DE", currency: "EUR" },
	fr: { locale: "fr-FR", currency: "EUR" },
	es: { locale: "es-ES", currency: "EUR" },
};
const vineDomains = {
	ca: "ca",
	com: "com",
	uk: "co.uk",
	jp: "co.jp",
	de: "de",
	fr: "fr",
	es: "es",
};

var vineLocale = null;
var vineCurrency = null;
var vineDomain = null;
var Notifications = new ScreenNotifier();

window.onload = function () {
	browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
		//console.log(data);
		if (data.type == undefined) return;

		if (data.type == "newItem") {
			sendResponse({ success: true });
			addItem(data);
		}
		if (data.type == "newItemCheck") {
			sendResponse({ success: true });

			//Display a notification that we have checked for items.
			let note = new ScreenNotification();
			note.template = "view/notification_loading.html";
			note.lifespan = 3;
			Notifications.pushNotification(note);
		}
		if (data.type == "vineCountry") {
			sendResponse({ success: true });
			setLocale(data.domain);
		}
	});

	setInterval(async () => {
		browser.runtime.sendMessage({
			type: "keepAlive",
		});
	}, 25000);

	init();
};

async function init() {
	const data = await chrome.storage.local.get("settings");

	if (data == null || Object.keys(data).length === 0) {
		console.log("Settings not available yet. Waiting 10 sec...");
		setTimeout(function () {
			init();
		}, 10000);
		return; //Settings have not been initialized yet.
	} else {
		Object.assign(appSettings, data.settings);
	}

	if (!appSettings.general.newItemNotification) {
		document.getElementById("status").innerHTML =
			"<strong>Notifications disabled</strong> You need to enable the notifications for this window to work.";
	}
}

//Set the locale and currency based on the domain.
//As this is an internal page from the extension, we can only know what
//country/domain is being used when we first receive data.
function setLocale(country) {
	if (vineLocales.hasOwnProperty(country)) {
		vineLocale = vineLocales[country].locale;
		vineCurrency = vineLocales[country].currency;
		vineDomain = vineDomains[country];

		if (appSettings != undefined && appSettings.general.newItemNotification) {
			document.getElementById("status").innerHTML = "<strong>Active</strong> Listening for notifications...";
		}
	}
}

async function addItem(data) {
	const prom = await Tpl.loadFile("/view/notification_monitor.html");

	let { date, asin, title, search, img_url, domain, etv } = data;

	//If the local is not define, set it.
	if (vineLocale == null) setLocale(domain);

	//Prepare the ETV to be displayed
	let formattedETV;
	if (etv == null) {
		formattedETV = "";
	} else {
		formattedETV = new Intl.NumberFormat(vineLocale, {
			style: "currency",
			currency: vineCurrency,
		}).format(etv);
	}
let formattedDate = new Date(date).toLocaleString(vineLocale);

	Tpl.setVar("id", asin);
	Tpl.setVar("domain", vineDomain);
	Tpl.setVar("title", "New item");
	Tpl.setVar("date", formattedDate);
	Tpl.setVar("search", search);
	Tpl.setVar("asin", asin);
	Tpl.setVar("description", title);
	Tpl.setVar("img_url", img_url);
	Tpl.setVar("etv", formattedETV);

	let content = Tpl.render(prom);

	//Play a sound
	if (appSettings.general.newItemMonitorNotificationSound) {
		if (Date.now() - lastSoundPlayedAt > 30000) {
			// Don't play the notification sound again within 30 sec.
			lastSoundPlayedAt = Date.now();
			const audioElement = new Audio(chrome.runtime.getURL("resource/sound/notification.mp3"));
			audioElement.play();
		}
	}

	insertMessageIfAsinIsUnique(content, asin, etv, title);
}

function insertMessageIfAsinIsUnique(content, asin, etv,title) {
	var newID = `vh-notification-${asin}`;
	const newBody = document.getElementById("vh-items-container");

	if (!document.getElementById(newID)) {
		newBody.insertAdjacentHTML("afterbegin", content);
	}

	//Highlight for ETV
	
	if (etv == "0.00") {
		const etvClass = document.getElementById(newID);
		etvClass.classList.add("zeroETV");
	}

	//Remove ETV Value if it does not exist
	if (etv == null) {
		etvElement = document.getElementById("etv_value");
		etvElement.style.display = "none";
	}

	//Highlight if matches a keyword
	let highligthed = false;
	const newTile = document.getElementById(newID);
	
	if (appSettings.general.highlightKeywords.length > 0) {
		match = appSettings.general.highlightKeywords.find((word) => {
			const regex = new RegExp(`\\b${word}\\b`, "i");
			return word && regex.test(title);
		});
		if (match != undefined) {
			highligthed = true;
			showRuntime("TILE: The item match the keyword '" + match + "', highlight it");
			newTile.classList.add("keyword-highlight");
		}
	}


}

function showRuntime(eventName) {
	// arrDebug.push({ time: Date.now() - startTime, event: eventName });
}