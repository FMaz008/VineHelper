var arrReview = [];

async function loadSettings() {
	var data;
	//If no template exist already, create an empty array
	data = await chrome.storage.local.get("reviews");
	if (data == null || Object.keys(data).length === 0) {
		await chrome.storage.local.set({ reviews: [] });
	} else {
		Object.assign(arrReview, data.reviews);
	}

	console.log(arrReview);
	if (arrReview.length > 0) {
		arrReview.forEach((review) => {
			document
				.getElementById("reviews_list")
				.insertAdjacentHTML(
					"beforeEnd",
					"<tr>" +
						"<td>" +
						review.date +
						"</td>" +
						"<td>" +
						review.asin +
						"</td>" +
						"<td>" +
						review.title +
						"</td>" +
						"<td><button id='" +
						review.asin +
						"'  class='view'>View</button><button id='" +
						review.asin +
						"'  class='delete'>Delete</button></td></tr>"
				);
		});
	}

	//Add listener for view
	const deleteElements = document.querySelectorAll("button.view");
	deleteElements.forEach((element) => {
		element.addEventListener("click", function () {
			let review = getReview(element.id);
			document.getElementById("title").innerText = review.title;
			document.getElementById("content").innerText = review.content;
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

loadSettings();

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
			await chrome.storage.local.set({ reviews: arrReview });
			location.reload();
			return;
		}
	}
}
