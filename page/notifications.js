var notificationCount = 0;
var Tpl = new Template();
var TplMgr = new TemplateMgr();

window.onload = function () {
	chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
		if (data.type == undefined) return;

		if (data.type == "newItem") {
			addItem(data);
		}
	});
};

async function addItem(data) {
	/*
	type: "newItem",
	date: response.products[i].date,
	asin: response.products[i].asin,
	title: response.products[i].title,
	img_url: response.products[i].img_url,
	*/
	const prom = await Tpl.loadFile("/view/notification_monitor.html");

	let search = data.title.replace(/^([a-zA-Z0-9\s']{0,40})[^\s]*.*/, "$1");

	Tpl.setVar("id", notificationCount++);
	Tpl.setVar("base_url", "https://" + data.domain);
	Tpl.setVar("title", "New item");
	Tpl.setVar("date", data.date);
	Tpl.setVar("search", search);
	Tpl.setVar("asin", data.asin);
	Tpl.setVar("description", data.title);
	Tpl.setVar("img_url", data.img_url);
	let content = Tpl.render(prom);

	let div = document.createElement("div");
	div.innerHTML = content;

	document.getElementById("ext-helper-notifications-container").append(div);
}

//#################################################
//### UTILITY FUNCTIONS required by the template system
function isEmptyObj(obj) {
	for (i in obj) return false;
	return true;
}

function showRuntime() {
	//Not needed
}
