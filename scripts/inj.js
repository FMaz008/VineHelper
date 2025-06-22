const origFetch = window.fetch;
var extHelper_LastParentVariant = null;
var extHelper_responseData = {};
var extHelper_postData = {};
var forceTango = false;

const scriptTag = document.currentScript;
const countryCode = scriptTag.getAttribute("data-country-code");

window.fetch = async (...args) => {
	let response = await origFetch(...args);
	let lastParent = extHelper_LastParentVariant;

	let regex = null;

	const url = args[0] || "";

	if (lastParent != null) {
		regex = /^.+?#(.+?)#.+$/;
		lastParent = extHelper_LastParentVariant.recommendationId.match(regex)[1];
	}

	//Voice Orders API
	if (url.startsWith("api/voiceOrders")) {
		extHelper_postData = JSON.parse(args[1].body);
		const asin = extHelper_postData.itemAsin;

		try {
			extHelper_responseData = await response.clone().json();
		} catch (e) {
			console.error(e);
		}

		let data = {};
		if (extHelper_responseData.error !== null) {
			window.postMessage(
				{
					type: "order",
					data: {
						status: "failed",
						error: extHelper_responseData.error, //CROSS_BORDER_SHIPMENT, SCHEDULED_DELIVERY_REQUIRED, ITEM_NOT_IN_ENROLLMENT, ITEM_ALREADY_ORDERED
						parent_asin: lastParent,
						asin: asin,
					},
				},
				"/" //message should be sent to the same origin as the current document.
			);
		} else if (
			extHelper_responseData.result?.offerListingId !== undefined &&
			extHelper_responseData.result?.offerListingId !== null
		) {
			//Amazon checkout process
			window.postMessage(
				{
					type: "offerListingId",
					offerListingId: extHelper_responseData.result.offerListingId,
				},
				"/" //message should be sent to the same origin as the current document.
			);
		} else {
			//Old vine checkout process
			if (extHelper_responseData.result?.orderId) {
				data = {
					status: "success",
					error: null,
					//orderId: extHelper_responseData.result.orderId,
					parent_asin: lastParent,
					asin: asin,
				};
			} else {
				data = {
					status: "failed",
					error: "No orderId received back",
					parent_asin: lastParent,
					asin: asin,
				};
			}
			window.postMessage(
				{
					type: "order",
					data,
				},
				"/" //message should be sent to the same origin as the current document.
			);
		}

		//Wait 500ms following an order to allow for the order report query to go through before the redirect happens.
		await new Promise((r) => setTimeout(r, 500));
		return response;
	}

	//See Details modal window
	regex = /^api\/recommendations\/.*$/;
	if (url.startsWith("api/recommendations")) {
		try {
			extHelper_responseData = await response.clone().json();
		} catch (e) {
			console.error(e);
		}

		let { result, error } = extHelper_responseData;

		if (result === null) {
			let regex;
			let arrMatch;
			let asin = null;

			regex = new RegExp(`.*/item/([^?]+)`);
			arrMatch = url.match(regex);

			if (arrMatch) {
				asin = arrMatch[1];
			} else {
				//Alternative method when the asin is not in the url
				regex = new RegExp(`.+#([^#]+)#.+`);
				arrMatch = error.message.match(regex);
				if (arrMatch) {
					asin = arrMatch[1];
				}
			}
			if (asin) {
				window.postMessage(
					{
						type: "error",
						data: {
							errorType: error.exceptionType,
							error: error.message,
							asin: asin,
						},
					},
					"/" //message should be sent to the same origin as the current document.
				);
			}
			return response;
		}

		// Find if the item is a parent
		if (result.variations !== undefined) {
			//The item has variations and so is a parent, store it for later interceptions
			extHelper_LastParentVariant = result;
			regex = /^.+?#(.+?)#.+$/;
			let arrMatchesP = result.recommendationId.match(regex);
			result.parent_asin = arrMatchesP[1];
			window.postMessage(
				{
					type: "variations",
					asin: result.parent_asin,
					data: result.variations,
				},
				"/" //message should be sent to the same origin as the current document.
			);
		} else if (result.taxValue !== undefined) {
			// The item has an ETV value, let's find out if it's a child or a parent
			const isChild = !!lastParent?.variations?.some((v) => v.asin == result.asin);
			let data = {
				parent_asin: null,
				asin: result.asin,
				etv: result.taxValue,
			};
			if (isChild) {
				regex = /^.+?#(.+?)#.+$/;
				let arrMatchesP = lastParent.recommendationId.match(regex);
				data.parent_asin = arrMatchesP[1];
			} else {
				extHelper_LastParentVariant = null;
			}
			window.postMessage(
				{
					type: "etv",
					data,
				},
				"/" //message should be sent to the same origin as the current document.
			);
		}

		//isTangoEligible workaround
		if (forceTango && result.asinTangoEligible !== undefined) {
			extHelper_responseData.result.asinTangoEligible = false; //Forcing to false use the classic checkout process.
		}

		//Amazon checkout process
		if (result.promotionId !== undefined) {
			window.postMessage(
				{
					type: "promotionId",
					promotionId: result.promotionId,
					asin: result.asin,
					parent_asin: lastParent,
				},
				"/" //message should be sent to the same origin as the current document.
			);
		}

		//Fix broken variants causing infinite loop
		let fixed = 0;
		result.variations = result.variations?.map((variation) => {
			if (Object.keys(variation.dimensions || {}).length === 0) {
				variation.dimensions = {
					asin_no: variation.asin,
				};
				fixed++;
				return variation;
			}

			for (const key in variation.dimensions) {
				//If the country code is not jp or si:
				if (countryCode !== "jp" && countryCode !== "sg") {
					//Replace all non-standard characters
					newValue = variation.dimensions[key].replace(/[^a-zA-Z0-9\][(){}/.,\-"'¼½¾+&%# ]/g, "_");
					if (newValue !== variation.dimensions[key]) {
						variation.dimensions[key] = newValue;
						fixed++;
					}
				}

				//& without a space after it will crash, add a space after it.
				newValue = variation.dimensions[key].replace(/[&]([^\s])/g, "& $1");
				if (newValue !== variation.dimensions[key]) {
					variation.dimensions[key] = newValue;
					fixed++;
				}

				//Escape the special characters
				newValue = variation.dimensions[key].replace(/[/\\()[\]{}]/g, "\\$&");
				if (newValue !== variation.dimensions[key]) {
					variation.dimensions[key] = newValue;
					fixed++;
				}

				// Any variation ending with a space will crash, ensure there is no space at the end.
				newValue = variation.dimensions[key].replace(/\s+$/g, "");
				if (newValue !== variation.dimensions[key]) {
					variation.dimensions[key] = newValue;
					fixed++;
				}

				// The core of the issue is when a special character is at the end of a variation, the jQuery UI which amazon uses will attempt to evaluate it and fail since it attempts to utilize it as part of an html attribute.
				// In order to resolve this, we make the string safe for an html attribute by escaping the special characters.
				if (!variation.dimensions[key].match(/[a-z0-9)\]]$/i)) {
					variation.dimensions[key] = variation.dimensions[key] + ` VH${fixed}`;
					fixed++;
				}

				// Any variation with a : or ) without a space after will crash, ensure : always has a space after.
				newValue = variation.dimensions[key].replace(/([:)])([^\s])/g, "$1 $2");
				if (newValue !== variation.dimensions[key]) {
					variation.dimensions[key] = newValue;
					fixed++;
				}

				// Any variation with a ( with a space after will crash, ensure never has a space after.
				newValue = variation.dimensions[key].replace(/([(])\s/g, "$1");
				if (newValue !== variation.dimensions[key]) {
					variation.dimensions[key] = newValue;
					fixed++;
				}

				// Any variation with a / with a space before it will crash, remove the space before.
				newValue = variation.dimensions[key].replace(/(\s[/])/g, "/");
				if (newValue !== variation.dimensions[key]) {
					variation.dimensions[key] = newValue;
					fixed++;
				}

				// Any variation with a | by ;.
				newValue = variation.dimensions[key].replace(/([|])/g, "-");
				if (newValue !== variation.dimensions[key]) {
					variation.dimensions[key] = newValue;
					fixed++;
				}

				//variation.dimensions[key] = fixed++ + "test | test| test |test#";
			}

			return variation;
		});

		if (fixed > 0) {
			window.postMessage(
				{
					type: "infiniteWheelFixed",
					text: fixed + " variation(s) fixed.",
				},
				"/" //message should be sent to the same origin as the current document.
			);
		}

		return new Response(JSON.stringify(extHelper_responseData));
	}

	return response;
};

//Send the opts options containing the customerId and obfuscatedMarketId
if (typeof opts !== "undefined") {
	window.postMessage({ type: "websiteOpts", data: opts }, "/");
} else if (typeof fwcimData === "object" && typeof ue_mid === "string") {
	//Mobile often doesn't have opts, but will have fwcimData and ue_mid
	let opts = { obfuscatedMarketId: ue_mid, customerId: fwcimData.customerId };
	window.postMessage({ type: "websiteOpts", data: opts }, "/");
}

//Listen for a message from the content script
window.addEventListener("message", (event) => {
	if (event.data.type == "forceTango") {
		forceTango = true;
	}
});
