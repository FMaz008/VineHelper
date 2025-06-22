/**
 * Todo:
 * - Find a way to associate the ASIN with the p-number, and store that temporarily in memory as an ongoing checkout.
 * - When we getto be able to confirm when it has been ordered.
 * - Update VH server when a product is ordered successfully or get a failure error.
 */

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
	let currentASIN = await Settings.get("checkout.currentASIN");
	let arrCurrentCheckouts = await Settings.get("checkout.arrCurrentCheckouts");
	//await Settings.set("checkout.arrCurrentCheckouts", [
	//	{ asin: "B0F6NDJXWZ", expires: 1750619417031, productId: "703-6232317-0987410" },
	//]);
	if (!arrCurrentCheckouts) {
		arrCurrentCheckouts = [];
	}

	//If the current checkout does not exist, create it.
	console.log("currentASIN: " + currentASIN);
	console.log(await getCurrentCheckout(currentASIN));
	if (!(await getCurrentCheckout(currentASIN)) && currentASIN) {
		//Add the current checkout to the array
		arrCurrentCheckouts.push({
			asin: currentASIN,
			productId: getProductId(),
			expires: Date.now() + 1000 * 60 * 60 * 1, // 1 hour
		});
		await Settings.set("checkout.arrCurrentCheckouts", arrCurrentCheckouts);
		await Settings.set("checkout.currentASIN", null);
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

async function checkForError() {
	const currentASIN = await getCurrentASIN();
	if (currentASIN) {
		console.log("Item ASIN: " + currentASIN);
		console.log("Country: " + getCountry());
		if (checkForVineOrderCannotBeProcessedError()) {
			console.log("vine error stock not available");
			console.log("Assume ITEM_NOT_IN_ENROLLMENT error");
			contactVHServer(false);
		}
	}
}
init();

async function getCurrentCheckout(currentASIN) {
	const arrCurrentCheckouts = await Settings.get("checkout.arrCurrentCheckouts");
	return arrCurrentCheckouts.find((checkout) => checkout.asin === currentASIN);
}

async function getCurrentASIN() {
	const arrCurrentCheckouts = await Settings.get("checkout.arrCurrentCheckouts");
	return arrCurrentCheckouts.find((checkout) => getProductId() === checkout.productId)?.asin;
}

console.log("Checkout monitoring loaded.");

//Auto decline prime membership is prompted.
const skipPrimeLink = document.querySelector("#prime-decline-button");
if (skipPrimeLink) {
	skipPrimeLink.click();
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

async function contactVHServer(status) {
	const asin = await getCurrentASIN();
	if (!asin) {
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
		asin: asin,
		parent_asin: null, //Todo: add parent_asin or deal with it server side.
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

function checkForOutOfStockError() {
	const outOfStockError = document.querySelector(`div[data-messageid="OfferListingUnavailableCvMessage"]`);
	if (outOfStockError) {
		console.log("Out of stock error found");
		return true;
	}
}

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

/* unreliable, only on initial page, looks like a debug value */
function getItemASIN() {
	const itemASIN = document.querySelector("span[data-testid='Item_asin_0_0_0']");
	if (!itemASIN) {
		return false;
	}
	return itemASIN.textContent;
}

//###########################
//Order placed page (this page seems to get redirected and never trigger this part of the script)

if (isPageOrderPlace()) {
	console.log("Order placed page found");
	console.log(document.body.innerHTML);
}

function isPageOrderPlace() {
	//https://www.amazon.ca/checkout/p/p-733-7492584-9889813/spc/place-order?pipelineType=Chewbacca&referrer=spc&ref_=chk_spc_chw_placeOrder
	//If the URL match that of an order placed
	const url = new URL(window.location.href);
	const pathname = url.pathname;
	return pathname.includes("/place-order");
}

//###########################
//Order placed but error bring back the confirmation page with continue buttons and a vine error
// redundant.

if (isErrorPage()) {
	//redundant
	console.log("Error page found"); //redundant
	if (checkForVineOrderCannotBeProcessedError()) {
		console.log("Vine error found"); //redundant
	}
}

function isErrorPage() {
	//https://www.amazon.ca/checkout/p/p-733-6161774-7652204/itemselect?pipelineType=Chewbacca&referrer=itemselect
	const url = window.location.href;
	return url.includes("/itemselect?pipelineType=Chewbacca&referrer=itemselect");
}

//###########################
//Thank you page

async function checkForSuccess() {
	if (isPageThankYou() && isOrderIdIssued()) {
		console.log("Thank you page, order sucessful: " + isOrderIdIssued());

		const currentASIN = await getCurrentASIN();
		if (currentASIN) {
			console.log("Current ASIN: " + currentASIN);
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
