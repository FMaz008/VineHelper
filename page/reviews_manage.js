if (typeof browser === "undefined") {
	var browser = chrome;
}

var arrReview = [];

async function loadSettings() {
	var data;
	//If no template exist already, create an empty array
	data = await browser.storage.local.get("reviews");
	if (data == null || Object.keys(data).length === 0) {
		await browser.storage.local.set({ reviews: [] });
	} else {
		Object.assign(arrReview, data.reviews);
	}

	if (arrReview.length > 0) {
		arrReview.forEach((review) => {
			let { date, asin, title } = review;
			let formattedDate = new Date(date);
			const tableBody = document.getElementById("reviews_list").querySelector("tbody");
			const row = tableBody.insertRow();
			const actionCell = row.insertCell();
			const titleCell = row.insertCell();
			const asinCell = row.insertCell();
			const dateCell = row.insertCell();

			actionCell.innerHTML = `
			<button id="${asin}" class='view vh'>View</button>
			<button id="${asin}" class='delete vh'>Delete</button>
			`;
			dateCell.textContent = `${formattedDate.toLocaleDateString()}`;
			asinCell.textContent = `${asin}`;
			try {
				titleCell.textContent = `${JSON.parse(title)}`;
			} catch (e) {}
		});
	}

	//Add listener for view
	const deleteElements = document.querySelectorAll("button.view");
	deleteElements.forEach((element) => {
		element.addEventListener("click", function () {
			let review = getReview(element.id);
			try {
				document.getElementById("title").innerText = JSON.parse(review.title);
				document.getElementById("content").innerText = JSON.parse(review.content);
			} catch (e) {}
		});
	});
	//Add listener for delete
	const deleteElements2 = document.querySelectorAll("button.delete");
	deleteElements2.forEach((element) => {
		element.addEventListener("click", function () {
			if (confirm("Delete this review?")) {
				deleteReview(element.id);
			}
		});
	});

	//Calculate the storage size
	document.getElementById("storage-used").innerText =
		"Currently using: " + bytesToSize(await getStorageKeySizeinBytes("reviews"));
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
				resolve(storageSize);
			}
		});
	});
}

window.addEventListener("DOMContentLoaded", function () {
	loadSettings();
});

function getReview(asin) {
	for (let i = 0; i < arrReview.length; i++) {
		if (arrReview[i].asin == asin) {
			return arrReview[i];
		}
	}
	return null;
}

async function deleteReview(asin) {
	for (let i = 0; i < arrReview.length; i++) {
		if (arrReview[i].asin == asin) {
			arrReview.splice(i, 1);
			await browser.storage.local.set({ reviews: arrReview });
			location.reload();
			return;
		}
	}
}
