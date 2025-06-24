import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
var Settings = new SettingsMgr();

import { Environment } from "./Environment.js";
var env = new Environment();

import { CryptoKeys } from "./CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

import { Internationalization } from "./Internationalization.js";
var i13n = new Internationalization();

import { PinnedListMgr } from "./PinnedListMgr.js";
var PinnedList = new PinnedListMgr();

import { HiddenListMgr } from "./HiddenListMgr.js";
var HiddenList = new HiddenListMgr();

import { getAsinFromDom } from "./Tile.js";

import { unescapeHTML } from "./StringHelper.js";
import { TileSizer } from "./TileSizer.js";
var tileSizer = new TileSizer();

import { Template } from "./Template.js";
var Tpl = new Template();

var currentTab = "vvp-items-grid";
var arrTile = [];
class Grid {
	gridDOM;
	pArrTile;

	constructor(obj) {
		this.pArrTile = [];
		this.gridDOM = obj;
	}

	getId() {
		return this.gridDOM.id;
	}

	getDOM() {
		return this.gridDOM;
	}

	async addTile(t) {
		return new Promise((resolve) => {
			try {
				arrTile.push(t);
				this.pArrTile.push(t);

				if (Object.keys(t).length !== 0) {
					const domElement = t.getDOM();
					//Detach the element from the current parent
					if (domElement && domElement.parentNode) {
						domElement.parentNode.removeChild(domElement);
					}
					//Append the element to the grid
					const gridElement = document.getElementById(this.getId());
					if (gridElement) {
						gridElement.appendChild(domElement);
						domElement.style.display = "";
					}
				}
			} catch (e) {
				logger.add("Error in addTile: " + e.message);
			}
			resolve();
		});
	}

	async removeTile(t) {
		return new Promise((resolve) => {
			// Iterate over the array in reverse order to safely remove items
			for (let i = this.pArrTile.length - 1; i >= 0; i--) {
				const value = this.pArrTile[i];
				if (value !== undefined && value.getAsin() === t.getAsin()) {
					this.pArrTile.splice(i, 1);
				}
			}

			resolve();
		});
	}

	async removeTileAnimate(t) {
		this.removeTile(t);

		await t.animateVanish(); //Will hide the tile
	}

	getTileCount(trueCount = false) {
		if (trueCount) {
			return this.gridDOM?.children.length;
		} else {
			return this.pArrTile.length;
		}
	}

	getTileByASIN(asin) {
		for (let i = 0; i < this.pArrTile.length; i++) {
			if (this.pArrTile[i].getAsin() == asin) {
				return this.pArrTile[i];
			}
		}
		return null;
	}

	getArrTile() {
		return this.pArrTile;
	}
}

function updateTileCounts() {
	//Calculate how many tiles within each grids
	if (Settings.get("unavailableTab.active") || Settings.get("hiddenTab.active")) {
		const tab1 = document.getElementById("vh-available-count");
		if (tab1) {
			tab1.innerText = env.data.grid.gridRegular.getTileCount(true);
		}
	}
	if (Settings.get("unavailableTab.active")) {
		const tab2 = document.getElementById("vh-unavailable-count");
		if (tab2) {
			tab2.innerText = env.data.grid.gridUnavailable.getTileCount(true);
		}
	}
	if (Settings.get("hiddenTab.active")) {
		const tab3 = document.getElementById("vh-hidden-count");
		if (tab3) {
			tab3.innerText = env.data.grid.gridHidden.getTileCount(true);
		}
	}
	if (Settings.get("pinnedTab.active")) {
		const tab4 = document.getElementById("vh-pinned-count");
		if (tab4) {
			tab4.innerText = env.data.grid.gridPinned.getTileCount(true);
		}
	}
}

async function createGridInterface() {
	//Clean up interface (in case of the extension being reloaded)
	let tab0 = document.querySelector("ul#vh-tabs");
	if (tab0) tab0.remove();
	let tab2 = document.querySelector("div#tab-unavailable");
	if (tab2) tab2.remove();
	let tab3 = document.querySelector("div#tab-hidden");
	if (tab3) tab3.remove();
	let tab4 = document.querySelector("div#tab-pinned");
	if (tab4) tab4.remove();
	let tbs = document.querySelectorAll(".vh-status");
	tbs.forEach(function (toolbar) {
		toolbar.remove();
	});

	if (env.data.gridDOM.regular == undefined) {
		console.log("No listing on this page, not drawing tabs.");
		return false; // No listing on this page
	}

	//Implement the tab system.
	let tabs = document.createElement("div");
	tabs.setAttribute("id", "vh-tabs");
	tabs.classList.add("theme-default");

	let itemsGrid = env.data.gridDOM.regular;
	itemsGrid.parentNode.insertBefore(tabs, itemsGrid);
	itemsGrid.parentNode.removeChild(itemsGrid);
	itemsGrid.classList.add("tab-grid");
	tabs.appendChild(itemsGrid);

	let tplTabs = await Tpl.loadFile("view/tabs.html");

	Tpl.setIf("not_mobile", true);
	if (Settings.get("thorvarium.mobileandroid") || Settings.get("thorvarium.mobileios")) {
		Tpl.setVar("available", "A");
		Tpl.setVar("unavailable", "U");
		Tpl.setVar("hidden", "H");
		Tpl.setVar("pinned", "P");
	} else {
		Tpl.setVar("available", "Available");
		Tpl.setVar("unavailable", "Unavailable");
		Tpl.setVar("hidden", "Hidden");
		Tpl.setVar("pinned", "Pinned");
	}
	//If ordering system enabled
	Tpl.setIf("unavailable", Settings.get("unavailableTab.active"));

	//If the hidden tab system is activated
	Tpl.setIf("hidden", Settings.get("hiddenTab.active"));

	//If the hidden tab system is activated
	Tpl.setIf("pinned", Settings.get("pinnedTab.active"));

	let tabsHtml = Tpl.render(tplTabs, false);
	tabs.insertAdjacentHTML("afterbegin", tabsHtml);

	if (Settings.get("hiddenTab.active")) {
		//Add the toolbar for Hide All & Show All
		//Delete the previous one if any exist:
		removeElements("#vh-tabs .hidden-toolbar");

		//Generate the html for the hide all and show all widget
		let prom = await Tpl.loadFile("view/widget_hideall.html");
		Tpl.setVar("class", Settings.get("thorvarium.darktheme") ? "invert" : "");
		if (Settings.get("thorvarium.mobileandroid") || Settings.get("thorvarium.mobileios")) {
			Tpl.setIf("not_mobile", false);
			Tpl.setIf("mobile", true);
		} else {
			Tpl.setIf("not_mobile", true);
			Tpl.setIf("mobile", false);
		}
		let content = Tpl.render(prom, true);
		if (content == null) {
			logger.add("!!ERROR: Unable to fetch view/widget_hideall.html. Skipping.");
		} else {
			let clonedContent = content.cloneNode(true);

			// Prepend content to #vh-tabs
			let vtabs = document.querySelector("#vh-tabs");
			vtabs.insertBefore(content, vtabs.firstChild);
			vtabs.appendChild(clonedContent);
			clonedContent.style.marginTop = "5px";

			// Add event listeners to .vh-hideall and .vh-showall elements AND vh-hideallnext
			document.querySelectorAll(".vh-hideall").forEach((element) => {
				element.addEventListener("click", () => hideAllItems());
			});

			document.querySelectorAll(".vh-hideallnext").forEach((element) => {
				element.addEventListener("click", () => hideAllItemsNext());
			});

			document.querySelectorAll(".vh-showall").forEach((element) => {
				element.addEventListener("click", () => showAllItems());
			});
		}
	}

	//Actiate the tab system
	//Bind the click event for the tabs
	document.querySelectorAll("#tabs > ul li").forEach(function (item) {
		item.onclick = function (event) {
			currentTab = this.querySelector("a").href.split("#").pop();
			selectCurrentTab();
			this.classList.add("active");
		};
	});
	//Prevent links from being clickable
	document.querySelectorAll("#tabs > ul li a").forEach(function (item) {
		item.onclick = function (event) {
			event.preventDefault();
		};
	});
	selectCurrentTab(true);
}

async function addPinnedTile(
	asin,
	queue,
	title,
	thumbnail,
	is_parent_asin,
	is_pre_release,
	enrollment_guid,
	unavailable
) {
	if (!asin) {
		return false;
	}

	//Check if the pin already exist:
	if (document.getElementById("vh-pin-" + asin) != undefined) return false;

	let templateFile;
	if (Settings.get("general.listView")) {
		templateFile = "pinned_tile_listview.html";
	} else {
		templateFile = "pinned_tile_gridview.html";
	}
	let prom2 = await Tpl.loadFile("view/" + templateFile);

	let truncatedTitle = title.length > 40 ? title.substr(0, 40).split(" ").slice(0, -1).join(" ") : title;

	// These characters were breaking search, resulting in zero results
	truncatedTitle = unescapeHTML(unescapeHTML(truncatedTitle)).replace(/[&,±]/g, " ");

	const search_url_slug = encodeURIComponent(truncatedTitle);

	const recommendationType = getRecommendationTypeFromQueue(queue);
	const recommendationId = generateRecommendationString(recommendationType, asin, enrollment_guid);

	Tpl.setVar("id", asin);
	Tpl.setVar("domain", i13n.getDomainTLD());
	Tpl.setVar("search_url_slug", search_url_slug);
	Tpl.setVar("img_url", thumbnail);
	Tpl.setVar("asin", asin);
	Tpl.setVar("description", title);
	Tpl.setVar("is_parent_asin", is_parent_asin);
	Tpl.setVar("is_pre_release", is_pre_release);
	Tpl.setVar("enrollment_guid", enrollment_guid);
	Tpl.setVar("recommendationType", recommendationType);
	Tpl.setIf("PINNEDTAB_REMOTE", Settings.isPremiumUser(1) && Settings.get("pinnedTab.remote"));
	Tpl.setVar("recommendationId", recommendationId);

	let content = Tpl.render(prom2, true);
	document.getElementById("tab-pinned").appendChild(content);

	tileSizer.adjustAll(content);

	if (unavailable) {
		disableItem(content);
	}

	//Bind the click event for the unpin button
	document.querySelector("#vh-pin-" + asin + " .unpin-link").onclick = (e) => {
		e.preventDefault();

		removePinnedTile(asin);

		updateTileCounts();
	};

	//Bind the click event the the reload button
	const pinnedReloadLink = document.querySelector("#vh-pin-" + asin + " .pinned-reload-link");
	if (pinnedReloadLink) {
		pinnedReloadLink.onclick = (e) => {
			e.preventDefault();

			if (!Settings.isPremiumUser(1) || !Settings.get("pinnedTab.remote")) {
				return false;
			}

			//Reload all pinned tiles
			reloadAllPinnedTile();
		};
	}
}

async function reloadAllPinnedTile() {
	//Reload all pinned tiles
	const content = {
		api_version: 5,
		app_version: env.data.appVersion,
		action: "reload_pinned_items",
		country: i13n.getCountryCode(),
		uuid: await Settings.get("general.uuid", false),
		fid: await Settings.get("general.fingerprint.id", false),
	};
	const s = await cryptoKeys.signData(content);
	content.s = s;
	content.pk = await cryptoKeys.getExportedPublicKey();

	await fetch(env.getAPIUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	})
		.then((response) => response.json())
		.then(async (response) => {
			console.log("Reloading all pinned tiles", response);
			//Reload all pinned tiles
			document.querySelectorAll(`#tab-pinned .pinned`).forEach((element) => {
				console.log("Removing pinned tile", element);
				element.remove();
			});

			//Add all pinned items
			for (let i = 0; i < response["pinned_products"].length; i++) {
				console.log("Adding pinned tile", response["pinned_products"][i]);
				await addPinnedTile(
					response["pinned_products"][i]["asin"],
					response["pinned_products"][i]["queue"],
					response["pinned_products"][i]["title"],
					response["pinned_products"][i]["img_url"],
					response["pinned_products"][i]["is_parent_asin"],
					response["pinned_products"][i]["is_pre_release"],
					response["pinned_products"][i]["enrollment_guid"],
					response["pinned_products"][i]["unavailable"]
				); //grid.js
			}
		});
}

async function disableItem(notif) {
	if (!notif) {
		return false;
	}

	//Remove the banner if it already existed
	notif.querySelector(".unavailable-banner")?.remove();

	//Add a new banner
	const banner = document.createElement("div");
	banner.classList.add("unavailable-banner");
	banner.innerText = "Unavailable";
	banner.style.isolation = "isolate"; // This prevents the banner from inheriting the filter effects
	const imgContainer = notif.querySelector(".vh-img-container");
	imgContainer.insertBefore(banner, imgContainer.firstChild);

	notif.style.opacity = "0.5";
	notif.style.filter = "brightness(0.7)";
}

async function removePinnedTile(asin) {
	PinnedList.removeItem(asin);
	const pinnedTile = document.getElementById("vh-pin-" + asin);
	if (pinnedTile) {
		pinnedTile.remove();
	}

	//If it exists, mark the tile in the available grid as unpinned
	const tile = getTileByAsin(asin);
	if (tile) {
		tile.setPinned(false);
	}
}

function getRecommendationTypeFromQueue(queue) {
	const recommendationTypes = {
		potluck: "VENDOR_TARGETED",
		last_chance: "VENDOR_VINE_FOR_ALL",
		encore: "VINE_FOR_ALL",
		all_items: "ALL_ITEMS",
	};

	return recommendationTypes[queue] || null;
}

function generateRecommendationString(recommendationType, asin, enrollment_guid) {
	//marketplaceId is global from bootload.js
	//customerId is global from bootloader.js

	if (recommendationType == "VENDOR_TARGETED") {
		return env.data.marketplaceId + "#" + asin + "#" + env.data.customerId + "#vine.enrollment." + enrollment_guid;
	}
	return env.data.marketplaceId + "#" + asin + "#vine.enrollment." + enrollment_guid;
}

async function hideAllItems() {
	let arrTile = [];
	HiddenList.loadFromLocalStorage(); //Refresh the list in case it was altered in a different tab

	//Find out what the current active tab is
	let currentTab2 = "#vvp-items-grid";
	if (
		document.querySelector("#tab-unavailable") &&
		document.querySelector("#tab-unavailable").style.display !== "none"
	) {
		currentTab2 = "#tab-unavailable";
	}

	const vvpItemTiles = document.querySelectorAll(currentTab2 + " .vvp-item-tile");
	for (const vvpItemTile of vvpItemTiles) {
		let asin = getAsinFromDom(vvpItemTile);
		arrTile.push({ asin: asin, hidden: true });
		let tile = getTileByAsin(asin); // Obtain the real tile
		if (!tile.isPinned()) {
			await tile.hideTile(false, false); // Do not update local storage
		}
	}
	HiddenList.saveList();

	// Scoll to the RFY/AFA/AI header
	if (Settings.get("hiddenTab.scrollToRFY")) {
		var scrollTarget = document.getElementById("vvp-items-button-container");
		scrollTarget.scrollIntoView({ behavior: "smooth" });
	}
}

async function hideAllItemsNext() {
	hideAllItems();

	try {
		const nextLi = document.querySelector("#vvp-items-grid-container nav ul li:last-child a");
		if (nextLi) {
			const nextPage = nextLi.getAttribute("href");
			window.location = nextPage;
		}
	} catch (e) {
		//Do nothing
	}
}

async function showAllItems() {
	let arrTile = [];
	HiddenList.loadFromLocalStorage(); //Refresh the list in case it was altered in a different tab

	const vvpItemTiles = document.querySelectorAll("#tab-hidden .vvp-item-tile");
	for (const vvpItemTile of vvpItemTiles) {
		let asin = getAsinFromDom(vvpItemTile);
		arrTile.push({ asin: asin, hidden: false });
		let tile = getTileByAsin(asin); //Obtain the real tile
		await tile.showTile(false, false); //Do not update local storage
	}
	HiddenList.saveList();

	// Scoll to the RFY/AFA/AI header
	if (Settings.get("hiddenTab.scrollToRFY")) {
		var scrollTarget = document.getElementById("vvp-items-button-container");
		scrollTarget.scrollIntoView({ behavior: "smooth" });
	}
}

function selectCurrentTab(firstRun = false) {
	//Hide all tabs
	document.querySelectorAll(".tab-grid").forEach(function (item) {
		item.style.display = "none";
	});

	if (!firstRun) {
		document.querySelectorAll("#tabs > ul li").forEach(function (item) {
			item.classList.remove("active");
		});
	} else {
		document.querySelector("#tabs > ul li:first-child").classList.add("active");
	}

	//Display the current tab
	document.querySelector("#" + currentTab).style.display = "grid";
}

/** Remove an element from the DOM, ignore if it does not exist
 * @param selector CSS style selector of the element to remove
 */
function removeElements(selector) {
	let elementsToRemove = document.querySelectorAll(selector);

	elementsToRemove.forEach(function (element) {
		element.remove();
	});
}

function getTileByAsin(asin) {
	return arrTile.find((t) => t.getAsin() === asin);
}

export {
	Grid,
	updateTileCounts,
	createGridInterface,
	addPinnedTile,
	removePinnedTile,
	getRecommendationTypeFromQueue,
	generateRecommendationString,
	hideAllItems,
	hideAllItemsNext,
	showAllItems,
	selectCurrentTab,
	getTileByAsin,
};
