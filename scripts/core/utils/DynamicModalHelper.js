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

function drawButton(item, variant_asin = null) {
	const { asin, is_parent_asin, is_pre_release } = item.data;

	//Generate the dynamic modal button
	const container1 = document.createElement("span");
	document.querySelector("#vvp-items-grid").parentNode.appendChild(container1);
	container1.id = "dynamicModalBtnSpan-" + (variant_asin ? variant_asin : asin);
	container1.classList.add("vvp-details-btn");
	const container2 = document.createElement("span");
	container1.appendChild(container2);
	const btn = document.createElement("input");
	container2.appendChild(btn);
	btn.type = "submit";
	btn.id = "dynamicModalBtn-" + (variant_asin ? variant_asin : asin);
	btn.dataset.asin = variant_asin ? variant_asin : asin;
	btn.dataset.isParentAsin = variant_asin ? false : is_parent_asin;
	btn.dataset.recommendationType = item.getRecommendationType();
	btn.dataset.recommendationId = item.getRecommendationString(env);
	btn.dataset.isPreRelease = is_pre_release ? true : false;

	return btn;
}

async function clickDynamicSeeDetailsButton(asin) {
	//If the click happens too fast, it won't work.
	let attempts = 1;
	while (
		(document.readyState !== "complete" || !document.querySelector("#dynamicModalBtn-" + asin)) &&
		attempts <= 20
	) {
		console.log("Waiting for DOM to load and button to be available");
		await new Promise((r) => setTimeout(r, 100));
		attempts++;
	}
	if (attempts > 20) {
		console.error("Failed to find button after 20 attempts");
		return;
	}

	//If DOM is loaded and ready
	const btn = document.querySelector("#dynamicModalBtn-" + asin);
	attempts = 1;
	while ((!document.querySelector(".a-popover-modal") && attempts <= 5) || attempts === 1) {
		console.log(`Attempt #${attempts} to open the modal window`);
		btn.click();
		await new Promise((r) => setTimeout(r, 200 * attempts));
		attempts++;
	}

	if (attempts == 6) {
		console.error("Failed to open modal or succeeded on last attempt");
	}

	setTimeout(function () {
		const container1 = document.querySelector("#dynamicModalBtnSpan-" + asin);
		if (container1) {
			//container1.remove(); // Removes container1 from the DOM
		}
	}, 500);
}

export { openDynamicModal, clickDynamicSeeDetailsButton, drawButton };
