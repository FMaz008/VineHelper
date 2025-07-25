import { Internationalization } from "/scripts/core/services/Internationalization.js";
const i13n = new Internationalization();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
const Settings = new SettingsMgr();

import { Environment } from "/scripts/core/services/Environment.js";
const env = new Environment();

var scriptName = "reviews_manages.js";

//Insert the icon stylesheet based on the browser being used
//If browser is firefox, load icon_firefox.css
if (navigator.userAgent.includes("Firefox")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="/resource/css/icon_firefox.css" />`;
}
//If the browser is chrome, load icon_chrome.css
if (navigator.userAgent.includes("Chrome") || navigator.userAgent.includes("Chromium")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="/resource/css/icon_chrome.css" />`;
}
if (navigator.userAgent.includes("Safari")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="/resource/css/icon_ios.css" />`;
}

function logError(errorArray) {
	const [functionName, scriptName, error] = errorArray;
	console.error(`${scriptName}-${functionName} generated the following error: ${error.message}`);
} // testing

var arrReview = [];

async function loadSettings() {
	try {
		//Set the country
		await Settings.waitForLoad();
		const countryCode = Settings.get("general.country");

		if (countryCode != null) {
			i13n.setCountryCode(countryCode);
		}

		let reviewSet = await chrome.storage.local.get("reviews");
		let reviews = reviewSet?.reviews ?? []; //Nullish coalescing & Optional chaining prevents undefined without extra code
		if (Object.keys(reviews).length === 0) {
			await chrome.storage.local.set({ reviews: [] });
		}
		arrReview = reviews;
		if (arrReview.length) {
			updateReviewTable();
			displayReviewsSize();
		} else {
			const templateTable = document.getElementById("reviews_list");
			templateTable.style.display = "none";
		}
	} catch (e) {
		logError([scriptName, "loadSettings", e.message]);
	}
}
async function displayReviewsSize() {
	document.getElementById("storage-used").innerText = `Currently using: ${await getStorageKeySizeinBytes("reviews")}`;
}

async function handleSaveClick() {
	const asin = document.getElementById("asin").value;
	if (asin == "") {
		return false;
	}

	const index = arrReview.findIndex((review) => review.asin === asin);
	arrReview[index].title = JSON.stringify(document.getElementById("title").value);
	arrReview[index].content = JSON.stringify(document.getElementById("content").value);
	await chrome.storage.local.set({ reviews: arrReview });
}

function updateReviewTable() {
	try {
		const tableBody = document.getElementById("reviews_list").querySelector("tbody");
		for (let i = arrReview.length - 1; i >= 0; i--) {
			let { date, asin, title } = arrReview[i];
			let formattedDate = new Date(date).toLocaleDateString();
			const row = tableBody.insertRow();
			const actionCell = row.insertCell();
			const titleCell = row.insertCell();
			const asinCell = row.insertCell();
			const dateCell = row.insertCell();
			actionCell.innerHTML = `
			<button id="view" data-asin="${asin}" class='vh-button'>View</button>
			<button id="delete" data-asin="${asin}" class='vh-button'>Delete</button>
			`;
			dateCell.textContent = formattedDate;
			asinCell.innerHTML = `${asin} <a href='https://www.amazon.${i13n.getDomainTLD()}/dp/${asin}' target='_blank'><div class='vh-icon-16 vh-icon-newtab' style='margin-left: 5px;filter: invert(1);'></div></a>`;
			titleCell.textContent = `${JSON.parse(title)}`;
		}
	} catch (e) {
		logError([scriptName, "updateReviewTable", e.message]);
	}
}

document.addEventListener("click", (event) => {
	const { target } = event;
	if (target.tagName !== "BUTTON") return;

	if (target.matches("#view")) {
		handleViewClick(target.dataset.asin);
	} else if (target.matches("#delete")) {
		handleDeleteClick(target.dataset.asin);
	} else if (target.matches("#save")) {
		handleSaveClick();
	}
});

function getReview(asin) {
	try {
		return arrReview.find((review) => review.asin === asin);
	} catch (e) {
		logError([scriptName, "getReview", e.message]);
	}
}

async function handleViewClick(asin) {
	try {
		const review = getReview(asin);
		if (review) {
			let { title, content } = review;
			document.getElementById("asin").value = asin;
			document.getElementById("title").value = JSON.parse(title);
			document.getElementById("content").textContent = JSON.parse(content);
		}
	} catch (e) {
		logError([scriptName, "handleViewClick", e.message]);
	}
}

async function handleDeleteClick(asin) {
	try {
		if (confirm("Delete this review?")) {
			await deleteReview(asin);
		}
	} catch (error) {
		logError([scriptName, "handleDeleteClick", e.message]);
	}
}

async function deleteReview(asin) {
	try {
		const index = arrReview.findIndex((review) => review.asin === asin);
		const filteredReviews = arrReview.filter((review, i) => i !== index);
		await chrome.storage.local.set({ reviews: filteredReviews });
		location.reload();
	} catch (e) {
		logError([scriptName, "deleteReview", e.message]);
	}
}

function bytesToSize(bytes, decimals = 2) {
	if (!Number(bytes)) {
		return "0 Bytes";
	}

	const kbToBytes = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

	const index = Math.floor(Math.log(bytes) / Math.log(kbToBytes));

	return `${parseFloat((bytes / Math.pow(kbToBytes, index)).toFixed(dm))} ${sizes[index]}`;
}
function getStorageKeySizeinBytes(key) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(key, function (items) {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
			} else {
				const storageSize = JSON.stringify(items[key]).length;
				resolve(bytesToSize(storageSize));
			}
		});
	});
}

window.addEventListener("DOMContentLoaded", function () {
	loadSettings();
});
