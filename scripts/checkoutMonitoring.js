/**
 * Todo:
 * - Pass along the product ASIN (temporary setting entry?) to be able to confirm when it has been ordered.
 * - Update VH server when a product is ordered successfully or get a failure error.
 */

console.log("Checkout monitoring loaded.");

//Auto decline prime membership is prompted.
const skipPrimeLink = document.querySelector("#prime-decline-button");
if (skipPrimeLink) {
	skipPrimeLink.click();
}

//###########################
//Order confirmation page
if (getTotal() === 0) {
	console.log("Total is zero, assuming this order is a vine order");
	console.log("Item ASIN: " + getItemASIN());
	console.log("Country: " + getCountry());
	if (getQuantity() == 0 && checkForOutOfStockError() && checkForVineOrderCannotBeProcessedError()) {
		console.log("Quantity is zero, vine error and stock error found");
		console.log("Assume ITEM_NOT_IN_ENROLLMENT error");
	}
}

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

function getItemASIN() {
	const itemASIN = document.querySelector("span[data-testid='Item_asin_0_0_0']");
	if (!itemASIN) {
		return false;
	}
	return itemASIN.textContent;
}

function getCountry() {
	//Get the URL's domain TLD
	const url = new URL(window.location.href);
	const domain = url.hostname;
	return domain.split(".").pop();
}

//###########################
//Order placed page

if (isPageOrderPlace()) {
	console.log("Order placed page found");
}

function isPageOrderPlace() {
	//https://www.amazon.ca/checkout/p/p-733-7492584-9889813/spc/place-order?pipelineType=Chewbacca&referrer=spc&ref_=chk_spc_chw_placeOrder
	//If the URL match that of an order placed
	const url = new URL(window.location.href);
	const pathname = url.pathname;
	return pathname.includes("/place-order");
}

//###########################
//Thank you page

if (isPageThankYou()) {
	console.log("Thank you page, order sucessful: " + isOrderIdIssued());
}

function isPageThankYou() {
	//If the URL match that of a thank you page
	const url = new URL(window.location.href);
	if (url.includes("/buy/thankyou")) {
		return true;
	}
	return false;
}

function isOrderIdIssued() {
	const orderId = new URL(window.location.href).searchParams.get("purchaseId");
	return !!orderId;
}
