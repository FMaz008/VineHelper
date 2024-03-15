if (typeof browser === "undefined") {
	var browser = chrome;
}

var Tpl = new Template();
var TplMgr = new TemplateMgr();

window.onload = function () {
	browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
		if (data.type == undefined) return;

		if (data.type == "newItem") {
			addItem(data);
		}
	});
};

async function addItem(data) {
	
	const prom = await Tpl.loadFile("/view/notification_monitor.html");

	const {date, asin, title, img_url, domain} = data;

	let search = title.replace(/^([a-zA-Z0-9\s']{0,40})[^\s]*.*/, "$1");

	Tpl.setVar("id", asin);
	Tpl.setVar("base_url", "https://" + domain);
	Tpl.setVar("title", "New item");
	Tpl.setVar("date", date);
	Tpl.setVar("search", search);
	Tpl.setVar("asin", asin);
	Tpl.setVar("description", title);
	Tpl.setVar("img_url", img_url);
	let content = Tpl.render(prom);

	const newBody = document.getElementById('ext-helper-notifications-container')
	newBody.insertAdjacentHTML('afterbegin', content);	
}

function showRuntime() {
//Not needed 
}
