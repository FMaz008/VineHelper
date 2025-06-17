import { Environment } from "/scripts/core/services/Environment.js";
var env = new Environment();

import { Item } from "/scripts/core/models/Item.js";

async function openDynamicModal(options, autoClick = true) {
	if (!env.data.marketplaceId || !env.data.customerId) {
		console.error("Failed to fetch opts/vvp-context data");
	}

	const item = new Item(options);

	const btn = drawButton(item);

	//Dispatch a click event on the button
	if (autoClick) {
		clickDynamicSeeDetailsButton(item.data.asin);
	}

	return btn;
}

function drawButton(item) {
	const { asin, queue, is_parent_asin, is_pre_release, enrollment_guid, variant_asin } = item.data;

	//Generate the dynamic modal button
	const container1 = document.createElement("span");
	env.data.gridDOM.regular.appendChild(container1);
	container1.id = "dynamicModalBtnSpan-" + asin;
	container1.classList.add("vvp-details-btn");
	const container2 = document.createElement("span");
	container1.appendChild(container2);
	const btn = document.createElement("input");
	container2.appendChild(btn);
	btn.type = "submit";
	btn.id = "dynamicModalBtn-" + asin;
	btn.dataset.asin = variant_asin ? variant_asin : asin;
	btn.dataset.isParentAsin = variant_asin ? false : is_parent_asin;
	btn.dataset.recommendationType = item.getRecommendationType();
	btn.dataset.recommendationId = item.getRecommendationString(env);
	btn.dataset.isPreRelease = is_pre_release ? true : false;

	return btn;
}

async function clickDynamicSeeDetailsButton(asin) {
	//If the click happens too fast, it won't work.
	while (document.readyState !== "complete" || !document.querySelector("#dynamicModalBtn-" + asin)) {
		await new Promise((r) => setTimeout(r, 100));
	}

	//If DOM is loaded and ready
	const btn = document.querySelector("#dynamicModalBtn-" + asin);
	let attempt = 1;
	while ((!document.querySelector(".a-popover-modal") && attempt <= 5) || attempt === 1) {
		console.log(`Attempt #${attempt} to open the modal window`);
		btn.click();
		await new Promise((r) => setTimeout(r, 200 * attempt));
		attempt++;
	}

	if (attempt == 6) {
		console.error("Failed to open modal or succeeded on last attempt");
	}

	setTimeout(function () {
		const container1 = document.querySelector("#dynamicModalBtnSpan-" + asin);
		if (container1) {
			container1.remove(); // Removes container1 from the DOM
		}
	}, 500);
}

export { openDynamicModal, clickDynamicSeeDetailsButton, drawButton };
