if (typeof browser === "undefined") {
	var browser = chrome;
}

var Tpl = new Template();
var TplMgr = new TemplateMgr();

const vineLocales = {
	ca: { locale: "en-CA", currency: "CAD" },
	com: { locale: "en-US", currency: "USD" },
	"co.uk": { locale: "en-GB", currency: "GBP" },
	"co.jp": { locale: "ja-JP", currency: "JPY" },
	de: { locale: "de-DE", currency: "EUR" },
	fr: { locale: "fr-FR", currency: "EUR" },
	es: { locale: "es-ES", currency: "EUR" },
};
var vineLocale = null;
var vineCurrency = null;

window.onload = function () {
	browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
		if (data.type == undefined) return;

		if (data.type == "newItem") {
			addItem(data);
		}
	});
};

//Set the locale and currency based on the domain.
//As this is an internal page from the extension, we can only know what
//country/domain is being used when we first receive data.
function setLocale(domain) {
	if (vineLocales.hasOwnProperty(domain)) {
		vineLocale = vineLocales[domain].locale;
		vineCurrency = vineLocales[domain].currency;
	}
}

async function addItem(data) {
	const prom = await Tpl.loadFile("/view/notification_monitor.html");

	let { date, asin, title, img_url, domain, etv } = data;

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

	let search = title.replace(/^([a-zA-Z0-9\s']{0,40})[^\s]*.*/, "$1");

	Tpl.setVar("id", asin);
	Tpl.setVar("domain", domain);
	Tpl.setVar("title", "New item");
	Tpl.setVar("date", date);
	Tpl.setVar("search", search);
	Tpl.setVar("asin", asin);
	Tpl.setVar("description", title);
	Tpl.setVar("img_url", img_url);
	Tpl.setVar("etv", formattedETV);

	let content = Tpl.render(prom);

	insertMessageIfAsinIsUnique(content, asin, etv);
}

function insertMessageIfAsinIsUnique(content, asin, etv) {
	var newID = `ext-helper-notification-${asin}`;
	const newBody = document.getElementById(
		"ext-helper-notifications-container"
	);

	if (!document.getElementById(newID)) {
		newBody.insertAdjacentHTML("afterbegin", content);
	}

	if (etv == "0.00") {
		const etvClass = document.getElementById(newID);
		etvClass.classList.add("zeroETV");
	}

	if (etv == null) {
		etvElement = document.getElementById("etv_value");
		etvElement.style.display = "none";
	}
}

function showRuntime() {
	//Functionn must exist for the Template system, but not needed for this page
}
