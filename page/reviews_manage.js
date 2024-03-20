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
