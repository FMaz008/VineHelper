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

	console.log(`[VH DEBUG] drawButton called:`, {
		asin: asin,
		variant_asin: variant_asin,
		is_parent_asin: is_parent_asin,
		is_pre_release: is_pre_release,
		hasVariants: !!item.data.variants,
		variantsCount: item.data.variants ? item.data.variants.length : 0
	});

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

	// Log what we're setting on the button
	console.log(`[VH DEBUG] Button created with dataset:`, {
		id: btn.id,
		asin: btn.dataset.asin,
		isParentAsin: btn.dataset.isParentAsin,
		recommendationType: btn.dataset.recommendationType,
		recommendationId: btn.dataset.recommendationId,
		isPreRelease: btn.dataset.isPreRelease
	});

	return btn;
}

async function clickDynamicSeeDetailsButton(asin) {
	console.log(`[VH DEBUG] clickDynamicSeeDetailsButton called for ASIN: ${asin}`);
	
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
	
	// Log button data attributes for debugging
	console.log(`[VH DEBUG] Dynamic button data attributes:`, {
		asin: btn.dataset.asin,
		isParentAsin: btn.dataset.isParentAsin,
		recommendationType: btn.dataset.recommendationType,
		recommendationId: btn.dataset.recommendationId,
		isPreRelease: btn.dataset.isPreRelease,
		allDataAttributes: {...btn.dataset}
	});
	
	// Check for existing Amazon buttons to see their attributes
	const amazonButtons = document.querySelectorAll('.vvp-details-btn input[type="submit"]');
	amazonButtons.forEach((amazonBtn, index) => {
		if (amazonBtn.id && !amazonBtn.id.startsWith('dynamicModalBtn')) {
			console.log(`[VH DEBUG] Amazon button #${index} data attributes:`, {...amazonBtn.dataset});
		}
	});
	
	attempts = 1;
	while ((!document.querySelector(".a-popover-modal") && attempts <= 5) || attempts === 1) {
		console.log(`Attempt #${attempts} to open the modal window`);
		
		// Add error listener before clicking
		const errorHandler = (e) => {
			if (e.message && e.message.includes('variations')) {
				console.error(`[VH DEBUG] Variations error caught during click:`, {
					error: e.message,
					filename: e.filename,
					lineno: e.lineno,
					colno: e.colno,
					asin: asin,
					buttonDataset: {...btn.dataset}
				});
			}
		};
		window.addEventListener('error', errorHandler);
		
		btn.click();
		
		// Remove error listener after a delay
		setTimeout(() => window.removeEventListener('error', errorHandler), 1000);
		
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
