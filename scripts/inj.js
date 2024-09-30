const origFetch = window.fetch;
var extHelper_LastParentVariant = null;
var extHelper_responseData = {};
var extHelper_postData = {};

window.fetch = async (...args) => {
	let response = await origFetch(...args);
	let lastParent = extHelper_LastParentVariant;
	let regex = null;

	const url = args[0] || "";
	if (url.startsWith("api/voiceOrders")) {
		extHelper_postData = JSON.parse(args[1].body);
		const asin = extHelper_postData.itemAsin;

		try {
			extHelper_responseData = await response.clone().json();
		} catch (e) {
			console.error(e);
		}

		if (lastParent != null) {
			regex = /^.+?#(.+?)#.+$/;
			lastParent = extHelper_LastParentVariant.recommendationId.match(regex)[1];
		}

		let data = {
			status: "success",
			error: null,
			parent_asin: lastParent,
			asin: asin,
		};
		if (extHelper_responseData.error !== null) {
			data = {
				status: "failed",
				error: extHelper_responseData.error, //CROSS_BORDER_SHIPMENT, SCHEDULED_DELIVERY_REQUIRED, ITEM_NOT_IN_ENROLLMENT
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

		//Wait 500ms following an order to allow for the order report query to go through before the redirect happens.
		await new Promise((r) => setTimeout(r, 500));
		return response;
	}

	regex = /^api\/recommendations\/.*$/;
	if (url.startsWith("api/recommendations")) {
		try {
			extHelper_responseData = await response.clone().json();
		} catch (e) {
			console.error(e);
		}

		let { result, error } = extHelper_responseData;

		if (result === null) {
			if (error?.exceptionType) {
				window.postMessage(
					{
						type: "error",
						data: {
							error: error.exceptionType,
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
				// The core of the issue is when a special character is at the end of a variation, the jQuery UI which amazon uses will attempt to evaluate it and fail since it attempts to utilize it as part of an html attribute.
				// In order to resolve this, we make the string safe for an html attribute by escaping the special characters.
				if (!variation.dimensions[key].match(/[a-z0-9]$/i)) {
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

		//All variation have supposedly been fixed to the best we could. Now send them all to Vine Helper
		//For a final test if they pass as JQuery selectors.
		if (result.variations !== undefined) {
			//result.variations[0] = { asin: "abc", dimensions: { size: "n|n |n" } };
			result.variations = await testVariants(result.variations);
		}

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

//This function submit a request to Vine Helper's side to have it process the variants
//To test if they are valid JQuery selectors
async function testVariants(content) {
	return new Promise((resolve, reject) => {
		//Event listener to capture the incoming response
		window.addEventListener("message", function handleResponse(event) {
			if (event.data.type == "variantValidationResponse") {
				window.removeEventListener("message", handleResponse);
				resolve(event.data.result);
			}
		});

		//Send the message to Vine Helper for processing as JQuery is not available in this context
		window.postMessage(
			{
				type: "variantValidationRequest",
				variant: content,
			},
			"/" //message should be sent to the same origin as the current document.
		);
	});
}

//Send the opts options containing the customerId and obfuscatedMarketId
if (opts !== undefined) {
	window.postMessage({ type: "websiteOpts", data: opts }, "/");
}
