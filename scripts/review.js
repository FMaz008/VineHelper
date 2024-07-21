if (typeof browser === "undefined") {
	var browser = chrome;
}

var appSettings = {};
var arrReview = [];
var arrTemplate = [];
var asin = null;
var Tpl = new Template();
var TplMgr = new TemplateMgr();

function showRuntime() {
	//Function must exist for the Template system, but not needed for this page
}

async function loadSettings() {
	const localStorageSettings = await browser.storage.local.get("settings");

	if (Object.keys(localStorageSettings).length === 0) {
		return; //Can't display this page before settings are initiated
	}
	await initializeLocalStorageKeys("settings", appSettings, [], true);
	await initializeLocalStorageKeys("reviews", arrReview, []);
	await initializeLocalStorageKeys("reviews_templates", arrTemplate, []);

	init_review(); //We want to wait for the settings to be loaded before continuing
}

//Wait for the DOM+remote content to be loaded to begin the script
window.addEventListener("load", function () {
	console.log("Loading review system...");
	loadSettings();
});

async function initializeLocalStorageKeys(key, object, value, loadOnly) {
	try {
		const data = await browser.storage.local.get(key);
		if (loadOnly || Object.keys(data).length > 0) {
			Object.assign(object, data[key]);
		} else {
			await browser.storage.local.set({ [key]: value });
		}
	} catch (e) {
		showRuntime("Error in initializeLocalStorageKeys" + e.message);
	}
}

function init_review() {
	const currentUrl = window.location.href;
	const arrRegex = [
		/^(?:.+?).amazon\.(?:.+?)\/review\/create-review.*[?&]asin=([^&]+).*?$/,
		/^(?:.+?).amazon\.(?:.+?)\/reviews\/edit-review\/edit.*[?&]asin=([^&]+).*$/,
	];
	for (let i = 0; i < arrRegex.length; i++) {
		arrMatches = currentUrl.match(arrRegex[i]);
		if (arrMatches != null) {
			asin = arrMatches[1];
			console.log("URL Match confirmed for ASIN " + asin + ". Booting review toolbar...");
			boot_review();
			break;
		}
	}
}

async function boot_review() {
	//Load the toolbar template
	const prom = await Tpl.loadFile("/view/review_toolbar.html");
	Tpl.setVar("tpl_manage_url", browser.runtime.getURL("page/reviews_templates.html"));
	Tpl.setVar("review_manage_url", browser.runtime.getURL("page/reviews_manage.html"));
	Tpl.setVar("asin", asin);
	let content = Tpl.render(prom);

	//Firefox seems to execute this script before the content (presumably loaded from a fetch request)
	//is available. Waiting 500ms seems to give time to the elements to exist.

	let attempts = 0;
	while (attempts >= 0) {
		arrZone = document.querySelectorAll("form.ryp__review-form__form .ryp__card-frame");
		container = arrZone[arrZone.length - 1];

		if (container !== undefined) {
			attempts = -1;
			container.insertAdjacentHTML("afterend", content);
			break;
		} else if (attempts > 20) {
			break; //Something is wrong, don't loop infinitely.
		} else {
			//Wait 100ms and try again
			await new Promise((r) => setTimeout(r, 100));
			attempts++;
		}
	}

	//Add the template titles in the select box
	let selectBox = document.getElementById("template_name");
	let title = "";
	if (arrTemplate.length > 0) {
		console.log(arrTemplate.length);
		for (let i = 0; i < arrTemplate.length; i++) {
			try {
				title = JSON.parse(arrTemplate[i].title);
				selectBox.insertAdjacentHTML(
					"beforeend",
					"<option value='" + arrTemplate[i].id + "'>" + title + "</option>"
				);
			} catch (e) {
				console.log("some error in adding template error: " + e.message);
			}
		}
	} else {
		selectBox.insertAdjacentHTML("beforeend", "<option value='no_saved_templates'>No Saved Templates</option>");
	}

	//If the Insert button is clicked, insert the content of the selected
	//template into the review box.
	document.getElementById("insertTemplate").addEventListener("click", function () {
		let id = document.getElementById("template_name").value;
		for (let i = 0; i < arrTemplate.length; i++) {
			if (arrTemplate[i].id == id) {
				let review = document.getElementById("scarface-review-text-card-title");
				try {
					review.value += JSON.parse(arrTemplate[i].content);
				} catch (e) {
					showRuntime("Error with insertTemplate listener: " + e.message);
				}

				return;
			}
		}
	});

	//Save review button
	document.getElementById("saveReview").addEventListener("click", async function () {
		let found = false;
		let reviewTitle = document.getElementById("scarface-review-title-label").value;

		let reviewContent = document.getElementById("scarface-review-text-card-title").value;

		if (!reviewTitle || !reviewContent) {
			return;
		}

		let index = arrReview.findIndex((review) => review.asin === asin);
		if (index > -1) {
			arrReview[index].date = new Date().toString();
			arrReview[index].title = JSON.stringify(reviewTitle);
			arrReview[index].content = JSON.stringify(reviewContent);
			found = true;
		}
		if (!found) {
			arrReview.push({
				asin: asin,
				date: new Date().toString(),
				title: JSON.stringify(document.getElementById("scarface-review-title-label").value),
				content: JSON.stringify(document.getElementById("scarface-review-text-card-title").value),
			});

			//Limit the saved array to 100. Delete older ones.
			if (arrReview.length > 100) {
				arrReview.splice(0, arrReview.length - 100);
			}
		}
		try {
			await browser.storage.local.set({ reviews: arrReview });
			const messageDiv = document.getElementById("save-message");
			messageDiv.style.display = "block";
			setTimeout(() => {
				messageDiv.style.display = "none";
			}, 3000);
		} catch (e) {
			showRuntime("Error saving review: " + e.message);
		}
	});
}
