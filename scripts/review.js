if (typeof browser === "undefined") {
	var browser = chrome;
}

var Settings = null;
var Tpl = null;
// Factory function to load a module
(async () => {
	try {
		let module = null;
		//Load the SettingMgr.
		module = await import(chrome.runtime.getURL("/scripts/core/services/SettingsMgrCompat.js"));
		Settings = new module.SettingsMgr();

		//Load the Template manager
		module = await import(chrome.runtime.getURL("/scripts/core/utils/Template.js"));
		Tpl = new module.Template();
	} catch (error) {
		console.error("Error loading module:", error);
	}
})();

var arrReview = [];
var arrTemplate = [];
var asin = null;

async function loadSettings() {
	while (!Settings || !Settings.isLoaded()) {
		await new Promise((r) => setTimeout(r, 10));
	}
	if (!Settings.get("general.reviewToolbar")) {
		//System deactivated
		console.log("Review toolbar disabled.");
		return false;
	}

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
		const data = await chrome.storage.local.get(key);
		if (loadOnly || Object.keys(data).length > 0) {
			Object.assign(object, data[key]);
		} else {
			await chrome.storage.local.set({ [key]: value });
		}
	} catch (e) {
		showRuntime("Error in initializeLocalStorageKeys" + e.message);
	}
}

function init_review() {
	const currentUrl = window.location.href;
	const arrRegex = [
		/^(?:.+?).amazon\.(?:.+?)\/review\/create-review.*[?&]asin=([^&]+).*?$/,
		/^(?:.+?).amazon\.(?:.+?)\/review\/review-your-purchases.*[?&]asin=([^&]+).*$/,
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
	const prom = await Tpl.loadFile("/scripts/ui/templates/review_toolbar.html");
	Tpl.setVar("tpl_manage_url", chrome.runtime.getURL("/page/reviews_templates.html"));
	Tpl.setVar("review_manage_url", chrome.runtime.getURL("/page/reviews_manage.html"));
	Tpl.setVar("asin", asin);

	//Firefox seems to execute this script before the content (presumably loaded from a fetch request)
	//is available. Waiting 500ms seems to give time to the elements to exist.

	let content = null;
	let attempts = 0;
	while (attempts >= 0) {
		const submitContainer = document.querySelector(".in-context-ryp__submit-button-frame-desktop");
		if (submitContainer) {
			content = Tpl.render(prom, true);
			submitContainer.parentElement.insertBefore(content, submitContainer);
			break;
		} else {
			content = Tpl.render(prom);
			arrZone = document.querySelectorAll("form.ryp__review-form__form .ryp__card-frame");
			container = arrZone[arrZone.length - 1];
			if (container !== undefined) {
				container.insertAdjacentHTML("afterend", content);
				break;
			}
		}

		if (attempts > 20) {
			break; //Something is wrong, don't loop infinitely.
		} else {
			//Wait 100ms and try again
			await new Promise((r) => setTimeout(r, 100));
			attempts++;
		}
	}

	//Resize the review box
	const reviewTextarea = getReviewContentObject();
	if (reviewTextarea) {
		// Use ResizeObserver to detect textarea size changes
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (entry.target === reviewTextarea) {
					if (reviewTextarea.style.height.includes("em")) {
						if (Settings.get("general.reviewTextareaHeight", false)) {
							reviewTextarea.style.height = Settings.get("general.reviewTextareaHeight");
						}
					} else {
						Settings.set("general.reviewTextareaHeight", reviewTextarea.style.height);
					}
				}
			}
		});

		// Start observing the textarea
		resizeObserver.observe(reviewTextarea);
	}

	//Add the template titles in the select box
	let selectBox = document.getElementById("template_name");
	let title = "";
	if (arrTemplate.length > 0) {
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
				let title = getReviewTitleObject();
				let review = getReviewContentObject();
				try {
					title.value += JSON.parse(arrTemplate[i].title);
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

		//Check if the review title is empt
		let reviewTitle = getReviewTitleObject().value;

		let reviewContent = getReviewContentObject().value;

		if (!reviewTitle || !reviewContent) {
			alert("Please fill in the review title and content in order to save the review.");
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
				title: JSON.stringify(getReviewTitleObject().value),
				content: JSON.stringify(getReviewContentObject().value),
			});

			//Limit the saved array to 100. Delete older ones.
			if (arrReview.length > 100) {
				arrReview.splice(0, arrReview.length - 100);
			}
		}
		try {
			await chrome.storage.local.set({ reviews: arrReview });
			const messageDiv = document.getElementById("save-message");
			messageDiv.style.display = "block";
			setTimeout(() => {
				messageDiv.style.display = "none";
			}, 3000);
		} catch (e) {
			showRuntime("Error saving review: " + e.message);
		}
	});

	//Insert div after the review title (reviewTitle)
	const reviewTitleInput = document.getElementById("reviewTitle");
	if (reviewTitleInput) {
		const div = document.createElement("div");
		div.id = "reviewTitleDiv";
		div.style.float = "right";
		div.style.marginBottom = "20px";
		div.innerText = "0 / 100";
		reviewTitleInput.insertAdjacentElement("afterend", div);
		reviewTitleInput.addEventListener("keyup", (e) => {
			const chrCount = reviewTitleInput.value.length;
			const reviewTitleDiv = document.getElementById("reviewTitleDiv");
			reviewTitleDiv.innerText = chrCount + " / 100";
		});
	}

	function getReviewTitleObject() {
		let reviewTitle;
		reviewTitle = document.getElementById("reviewTitle");
		if (reviewTitle == undefined) {
			return document.getElementById("scarface-review-title-label");
		}
		return reviewTitle;
	}

	function getReviewContentObject() {
		let reviewContent;
		reviewContent = document.querySelector("#reviewText textarea");
		if (reviewContent) {
			return reviewContent;
		}

		reviewContent = document.getElementById("reviewText");
		if (reviewContent == undefined) {
			return document.getElementById("scarface-review-text-card-title");
		}
		return reviewContent;
	}
}
