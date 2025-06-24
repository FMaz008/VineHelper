import { Logger } from "/scripts/core/utils/Logger.js";
var logger = new Logger();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();

import { Environment } from "/scripts/core/services/Environment.js";
var env = new Environment();

import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
var i13n = new Internationalization();

import { PinnedListMgr } from "/scripts/core/services/PinnedListMgr.js";
var PinnedList = new PinnedListMgr();

import { HiddenListMgr } from "/scripts/core/services/HiddenListMgr.js";
var HiddenList = new HiddenListMgr();

import { getAsinFromDom } from "/scripts/ui/components/Tile.js";

import { unescapeHTML } from "/scripts/core/utils/StringHelper.js";
import { TileSizer } from "/scripts/ui/controllers/TileSizer.js";
var tileSizer = new TileSizer();

import { Template } from "/scripts/core/utils/Template.js";
var Tpl = new Template();

import { Item } from "/scripts/core/models/Item.js";

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
				const debugTabTitle = Settings.get("general.debugTabTitle");
				const asin = t.getAsin ? t.getAsin() : "unknown";

				if (debugTabTitle) {
					console.log(`➕ Grid.addTile: Adding tile ${asin} to ${this.getId()}`);
				}

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

						if (debugTabTitle) {
							console.log(
								`➕ Grid.addTile: Successfully added tile ${asin}. Array length now: ${this.pArrTile.length}`
							);
						}
					}
				}
			} catch (e) {
				logger.add("Error in addTile: " + e.message);
				if (Settings.get("general.debugTabTitle")) {
					console.error(`❌ Grid.addTile: Error adding tile:`, e);
				}
			}
			resolve();
		});
	}

	async removeTile(t) {
		return new Promise((resolve) => {
			const debugTabTitle = Settings.get("general.debugTabTitle");
			const asin = t.getAsin();

			if (debugTabTitle) {
				console.log(`🗑️ Grid.removeTile: Removing tile ${asin} from array`);
			}

			// Iterate over the array in reverse order to safely remove items
			let removed = false;
			for (let i = this.pArrTile.length - 1; i >= 0; i--) {
				const value = this.pArrTile[i];
				if (value !== undefined && value.getAsin() === asin) {
					this.pArrTile.splice(i, 1);
					removed = true;
				}
			}

			if (debugTabTitle) {
				console.log(
					`🗑️ Grid.removeTile: ${removed ? "Successfully removed" : "Failed to remove"} tile ${asin}. Array length now: ${this.pArrTile.length}`
				);
			}

			resolve();
		});
	}

	async removeTileAnimate(t) {
		this.removeTile(t);

		await t.animateVanish(); //Will hide the tile
	}

	getTileCount(trueCount = false) {
		const debugTabTitle = Settings.get("general.debugTabTitle");

		if (trueCount) {
			// Count only actual tiles, excluding placeholders
			if (!this.gridDOM) return 0;

			let count = 0;
			let placeholderCount = 0;
			for (const child of this.gridDOM.children) {
				// Skip placeholder tiles
				if (!child.classList.contains("vh-placeholder-tile")) {
					count++;
				} else {
					placeholderCount++;
				}
			}

			if (debugTabTitle && placeholderCount > 0) {
				console.log(`🔢 Grid ${this.gridDOM.id}: ${count} real tiles, ${placeholderCount} placeholders`);
			}

			return count;
		} else {
			if (debugTabTitle) {
				console.log(`🔢 Grid tile array length: ${this.pArrTile.length}`);
			}
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
	const debugTabTitle = Settings.get("general.debugTabTitle");
	
	//Calculate how many tiles within each grids
	if (Settings.get("unavailableTab.active") || Settings.get("hiddenTab.active")) {
		const tab1 = document.getElementById("vh-available-count");
		if (tab1) {
			const count = env.data.grid.gridRegular.getTileCount(true);
			tab1.innerText = count;
		}
	}
	if (Settings.get("unavailableTab.active")) {
		const tab2 = document.getElementById("vh-unavailable-count");
		if (tab2) {
			const count = env.data.grid.gridUnavailable.getTileCount(true);
			tab2.innerText = count;
		}
	}
	if (Settings.get("hiddenTab.active")) {
		const tab3 = document.getElementById("vh-hidden-count");
		if (tab3) {
			const count = env.data.grid.gridHidden.getTileCount(true);
			tab3.innerText = count;
		}
	}
	if (Settings.get("pinnedTab.active")) {
		const tab4 = document.getElementById("vh-pinned-count");
		if (tab4) {
			const count = env.data.grid.gridPinned.getTileCount(true);
			tab4.innerText = count;
		}
	}

	if (debugTabTitle) {
		// Also log the actual DOM element counts for comparison
		const regularTiles = document.querySelectorAll("#vh-grid-regular .vvp-item-tile").length;
		const unavailableTiles = document.querySelectorAll("#vh-grid-unavailable .vvp-item-tile").length;
		const hiddenTiles = document.querySelectorAll("#vh-grid-hidden .vvp-item-tile").length;
		const pinnedTiles = document.querySelectorAll("#vh-grid-pinned .vvp-item-tile").length;

		console.log("📊 Actual DOM tile counts:");
		console.log(`  ✅ Regular grid DOM tiles: ${regularTiles}`);
		console.log(`  ❌ Unavailable grid DOM tiles: ${unavailableTiles}`);
		console.log(`  👻 Hidden grid DOM tiles: ${hiddenTiles}`);
		console.log(`  📌 Pinned grid DOM tiles: ${pinnedTiles}`);
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

	let tplTabs = await Tpl.loadFile("scripts/ui/templates/tabs.html");

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
		let prom = await Tpl.loadFile("scripts/ui/templates/widget_hideall.html");
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

async function addPinnedTile(item) {
	if (!(item instanceof Item)) {
		throw new Error("item is not an instance of Item");
	}

	const { asin, title, img_url, is_parent_asin, is_pre_release, enrollment_guid, unavailable } = item.data;

	//Check if the pin already exist:
	if (document.getElementById("vh-pin-" + asin) != undefined) return false;

	let templateFile;
	if (Settings.get("general.listView")) {
		templateFile = "pinned_tile_listview.html";
	} else {
		templateFile = "pinned_tile_gridview.html";
	}
	let prom2 = await Tpl.loadFile("scripts/ui/templates/" + templateFile);

	let truncatedTitle = title.length > 40 ? title.substr(0, 40).split(" ").slice(0, -1).join(" ") : title;

	// These characters were breaking search, resulting in zero results
	truncatedTitle = unescapeHTML(unescapeHTML(truncatedTitle)).replace(/[&,±]/g, " ");

	const search_url_slug = encodeURIComponent(truncatedTitle);

	const recommendationType = item.getRecommendationType();
	const recommendationId = item.getRecommendationString(env);

	Tpl.setVar("id", asin);
	Tpl.setVar("domain", i13n.getDomainTLD());
	Tpl.setVar("search_url_slug", search_url_slug);
	Tpl.setVar("img_url", img_url);
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

				const productData = response["pinned_products"][i];
				try {
					const item = new Item(productData);
					await addPinnedTile(item); //grid.js
				} catch (error) {
					console.error("[Grid] Cannot create item for pinned tile -", error.message, {
						source: "pinned products from server response",
						index: i,
						total_pinned_items: response["pinned_products"].length,
						product_data: productData,
						has_asin: productData?.asin !== undefined,
						has_enrollment_guid: productData?.enrollment_guid !== undefined,
					});
				}
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
		if (!asin) {
			console.warn("VineHelper: Skipping tile without ASIN in hideAllItems");
			continue; // Skip this tile if no ASIN found
		}
		arrTile.push({ asin: asin, hidden: true });
		let tile = getTileByAsin(asin); // Obtain the real tile
		if (tile && !tile.isPinned()) {
			await tile.hideTile(false, false); // Do not update local storage
		}
	}
	HiddenList.saveList();

	// Scoll to the RFY/AFA/AI header
	if (Settings.get("hiddenTab.scrollToRFY")) {
		var scrollTarget = document.getElementById("vvp-items-button-container");
		if (scrollTarget) {
			scrollTarget.scrollIntoView({ behavior: "instant", block: "start" });
		}
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
		if (!asin) {
			console.warn("VineHelper: Skipping tile without ASIN in showAllItems");
			continue; // Skip this tile if no ASIN found
		}
		arrTile.push({ asin: asin, hidden: false });
		let tile = getTileByAsin(asin); //Obtain the real tile
		if (tile) {
			await tile.showTile(false, false); //Do not update local storage
		}
	}
	HiddenList.saveList();

	// Scoll to the RFY/AFA/AI header
	if (Settings.get("hiddenTab.scrollToRFY")) {
		var scrollTarget = document.getElementById("vvp-items-button-container");
		if (scrollTarget) {
			scrollTarget.scrollIntoView({ behavior: "instant", block: "start" });
		}
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
	if (!asin) {
		return null;
	}
	const tile = arrTile.find((t) => t.getAsin() === asin);
	if (!tile) {
		}
	return tile;
}

export {
	Grid,
	updateTileCounts,
	createGridInterface,
	addPinnedTile,
	removePinnedTile,
	hideAllItems,
	hideAllItemsNext,
	showAllItems,
	selectCurrentTab,
	getTileByAsin,
};
