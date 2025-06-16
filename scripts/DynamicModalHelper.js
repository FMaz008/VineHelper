import { Environment } from "./Environment.js";
var env = new Environment();

async function openDynamicModal(
	asin,
	queue,
	isParent,
	isPreRelease,
	enrollmentGUID,
	variantAsin = null,
	autoClick = true
) {
	if (!env.data.marketplaceId || !env.data.customerId) {
		console.error("Failed to fetch opts/vvp-context data");
	}

	const recommendationTypes = {
		potluck: "VENDOR_TARGETED",
		last_chance: "VENDOR_VINE_FOR_ALL",
		encore: "VINE_FOR_ALL",
	};

	const recommendationType = recommendationTypes[queue] || null;

	let recommendationId = null;
	if (recommendationType == "VENDOR_TARGETED") {
		recommendationId =
			env.data.marketplaceId + "#" + asin + "#" + env.data.customerId + "#vine.enrollment." + enrollmentGUID;
	} else {
		recommendationId = env.data.marketplaceId + "#" + asin + "#vine.enrollment." + enrollmentGUID;
	}

	const btn = drawButton(asin, isParent, isPreRelease, recommendationType, recommendationId, variantAsin);

	//Dispatch a click event on the button
	if (autoClick) {
		clickDynamicSeeDetailsButton(asin);
	}

	return btn;
}

function drawButton(asin, isParent, isPreRelease, recommendationType, recommendationId, variantAsin = null) {
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
	btn.dataset.asin = variantAsin ? variantAsin : asin;
	btn.dataset.isParentAsin = variantAsin ? false : isParent;
	btn.dataset.isPreRelease = isPreRelease ? true : false;
	btn.dataset.recommendationType = recommendationType;
	btn.dataset.recommendationId = recommendationId;

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
