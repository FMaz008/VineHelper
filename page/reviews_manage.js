if (typeof browser === "undefined") {
	var browser = chrome;
}
var scriptName = "reviews_manages.js";

function logError(errorArray) {
	const [functionName, scriptName, error] = errorArray;
	console.error(`${scriptName}-${functionName} generated the following error: ${error.message}`);
} // testing

var arrReview = [];

async function loadSettings() {
	try {
		let reviewSet = await browser.storage.local.get("reviews");
		let reviews = reviewSet?.reviews ?? []; //Nullish coalescing & Optional chaining prevents undefined without extra code
		if (Object.keys(reviews).length === 0) {
			await browser.storage.local.set({ reviews: [] });
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

function updateReviewTable() {
	try {
		const tableBody = document.getElementById("reviews_list").querySelector("tbody");
		arrReview.forEach((review) => {
			let { date, asin, title } = review;
			let formattedDate = new Date(date + " GMT").toLocaleDateString();
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
			asinCell.textContent = asin;
			titleCell.textContent = `${JSON.parse(title)}`;
		});
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
			document.getElementById("title").value = JSON.parse(title);
			document.getElementById("content").innerText = JSON.parse(content);
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
		await browser.storage.local.set({ reviews: filteredReviews });
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
		browser.storage.local.get(key, function (items) {
			if (browser.runtime.lastError) {
				reject(new Error(browser.runtime.lastError.message));
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
