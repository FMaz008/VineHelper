/**
 * Todo:
 * - Find a way to associate the ASIN with the p-number, and store that temporarily in memory as an ongoing checkout.
 * - When we getto be able to confirm when it has been ordered.
 * - Update VH server when a product is ordered successfully or get a failure error.
 */
console.log("Checkout monitoring loaded.");
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();

import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

import { Environment } from "/scripts/core/services/Environment.js";
var env = new Environment();

//###########################
//If the productId was not registered: Register the current checkout and link it to an ASIN.
//If the productId was registered, the ASIN will be available for the process.

async function init() {
	await Settings.waitForLoad();

	//Auto decline prime membership is prompted.
	if (Settings.isPremiumUser(2) && Settings.get("general.skipPrimeAd")) {
		const skipPrimeLink = document.querySelector("#prime-decline-button");
		if (skipPrimeLink) {
			skipPrimeLink.click();
			return;
		}
	}

	let currentASIN = await Settings.get("checkout.currentASIN", false);
	let currentParentASIN = await Settings.get("checkout.currentParentASIN", false);
	let arrCurrentCheckouts = await Settings.get("checkout.arrCurrentCheckouts", false);

	if (!arrCurrentCheckouts) {
		arrCurrentCheckouts = [];
	}

	//If the current checkout does not exist, create it.
	if (!(await getCurrentCheckout(currentASIN)) && currentASIN) {
		//Add the current checkout to the array
		arrCurrentCheckouts.push({
			asin: currentASIN,
			parent_asin: currentParentASIN,
			productId: getProductId(),
			expires: Date.now() + 1000 * 60 * 60 * 1, // 1 hour
		});
		await Settings.set("checkout.arrCurrentCheckouts", arrCurrentCheckouts);
		await Settings.set("checkout.currentASIN", null);
		await Settings.set("checkout.currentParentASIN", null);
	}

	//Garbage collect expired checkouts
	arrCurrentCheckouts = arrCurrentCheckouts.filter((checkout) => checkout.expires > Date.now());
	await Settings.set("checkout.arrCurrentCheckouts", arrCurrentCheckouts);

	//###########################
	//Order confirmation page
	checkForError();

	//###########################
	//Thank you page
	checkForSuccess();
}
init();

async function getCurrentCheckout(currentASIN) {
	const arrCurrentCheckouts = await Settings.get("checkout.arrCurrentCheckouts");
	return arrCurrentCheckouts.find((checkout) => checkout.asin === currentASIN);
}

/**
 * @returns {Object} {asin: string, parent_asin: string, productId: string, expires: number}
 */
async function getCurrentInfo() {
	const arrCurrentCheckouts = await Settings.get("checkout.arrCurrentCheckouts");
	if (arrCurrentCheckouts.length > 0) {
		return arrCurrentCheckouts.find((checkout) => getProductId() === checkout.productId);
	}
	return null;
}

function getProductId() {
	//Parse the URL to get the product id
	// https://www.amazon.ca/checkout/p/p-733-6232317-0987411/whatever
	// product id: 733-6232317-0987411
	const url = new URL(window.location.href);
	const pNumber = url.pathname
		.split("/")
		.find((segment) => segment.startsWith("p-"))
		?.substring(2);
	return pNumber; // Returns "733-6232317-0987411"
}

function getCountry() {
	//Get the URL's domain TLD
	const url = new URL(window.location.href);
	const domain = url.hostname;
	return domain.split(".").pop();
}

//###########################
//Order confirmation page

function getTotal() {
	const rawTotal = document.querySelector(
		"ul#subtotals-marketplace-table li:last-child .order-summary-line-definition"
	);
	if (!rawTotal) {
		return false;
	}
	const total = parseFloat(rawTotal.textContent.replace(/[^\d.]/g, ""));
	return total;
}

/**
 * This error is not specific to vine, but is displayed when there is no stock available for the quantity requested.
 * @returns boolean
 */
function checkForOutOfStockError() {
	const outOfStockError = document.querySelector(`div[data-messageid="OfferListingUnavailableCvMessage"]`);
	if (outOfStockError) {
		console.log("Out of stock error found");
		return true;
	}
}

/**
 * This error is specific to vine, but can happen when we take too long (>10 minutes?) to complete the checkout.
 * @returns boolean
 */
function checkForVineOrderCannotBeProcessedError() {
	const orderCannotBeProcessedError = document.querySelector(`div[data-messageid="VineCVMessage"]`);
	if (orderCannotBeProcessedError) {
		console.log("Vine order cannot be processed error found");
		return true;
	}
}

function getQuantity() {
	const quantity = document.querySelector(".quantity-display");
	if (!quantity) {
		return false;
	}
	return parseInt(quantity.textContent);
}

//###########################
//Error(s) on the page

async function checkForError() {
	const currentInfo = await getCurrentInfo();
	if (currentInfo) {
		console.log("Item ASIN: " + currentInfo.asin);
		console.log("Parent ASIN: " + currentInfo.parent_asin);
		console.log("Country: " + getCountry());
		//We want the error confirming this is a vine listing AND the error confirming there is no stock available.
		if (checkForVineOrderCannotBeProcessedError() && checkForOutOfStockError()) {
			console.log("vine error stock not available");
			console.log("Assume ITEM_NOT_IN_ENROLLMENT error");
			contactVHServer(false);
		}
	}
}

//###########################
//Thank you page

async function checkForSuccess() {
	if (isPageThankYou() && isOrderIdIssued()) {
		console.log("Thank you page, order sucessful: " + isOrderIdIssued());

		const currentInfo = await getCurrentInfo();
		if (currentInfo) {
			console.log("Current ASIN: " + currentInfo.asin);
			console.log("Current parent ASIN: " + currentInfo.parent_asin);
			console.log("Current country: " + getCountry());
			contactVHServer(true);
		} else {
			console.log(
				"No ASIN found in the current checkouts, could not establish this to be a vine order. Not updating VH server."
			);
		}
	}
}

function isPageThankYou() {
	//If the URL match that of a thank you page
	const url = window.location.href;
	if (url.includes("/buy/thankyou")) {
		return true;
	}
	return false;
}

function isOrderIdIssued() {
	const orderId = new URL(window.location.href).searchParams.get("purchaseId");
	return !!orderId;
}

//###########################
//VH server

async function contactVHServer(status) {
	const currentInfo = await getCurrentInfo();
	if (!currentInfo) {
		console.log("No ASIN found, not contacting VH server");
		return;
	}

	const content = {
		api_version: 5,
		app_version: env.data.appVersion,
		action: "record_order",
		country: getCountry(),
		uuid: await Settings.get("general.uuid", false),
		fid: await Settings.get("general.fingerprint.id", false),
		asin: currentInfo.asin,
		parent_asin: currentInfo.parent_asin,
		order_status: status ? "success" : "failed",
		order_error: status ? null : "ITEM_NOT_IN_ENROLLMENT",
	};

	const s = await cryptoKeys.signData(content);
	content.s = s;
	content.pk = await cryptoKeys.getExportedPublicKey();

	//Form the full URL
	await fetch(env.getAPIUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	});
}
