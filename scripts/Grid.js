var currentTab = "vvp-items-grid";

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
			this.pArrTile.push(t);

			if (Object.keys(t).length !== 0) {
				const domElement = t.getDOM();
				domElement.parentNode?.removeChild(domElement); // Detach from the current parent
				document.getElementById(this.getId()).appendChild(domElement); // Append to the new parent
				domElement.style.display = ""; // Show the element
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
			tab1.innerText = gridRegular.getTileCount(true);
		}
	}
	if (Settings.get("unavailableTab.active")) {
		const tab2 = document.getElementById("vh-unavailable-count");
		if (tab2) {
			tab2.innerText = gridUnavailable.getTileCount(true);
		}
	}
	if (Settings.get("hiddenTab.active")) {
		const tab3 = document.getElementById("vh-hidden-count");
		if (tab3) {
			tab3.innerText = gridHidden.getTileCount(true);
		}
	}
	if (Settings.get("pinnedTab.active")) {
		const tab4 = document.getElementById("vh-pinned-count");
		if (tab4) {
			tab4.innerText = gridPinned.getTileCount(true);
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

	if (document.getElementById("vvp-items-grid") == undefined) {
		console.log("No listing on this page, not drawing tabs.");
		return false; // No listing on this page
	}

	//Implement the tab system.
	let tabs = document.createElement("div");
	tabs.setAttribute("id", "vh-tabs");
	tabs.classList.add("theme-default");

	let itemsGrid = document.querySelector("#vvp-items-grid");
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
		removeElements("#vh-tabs .hidden-toolbar"); //bootloader.js

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
			showRuntime("!!ERROR: Unable to fetch view/widget_hideall.html. Skipping.");
		} else {
			let clonedContent = content.cloneNode(true);

			// Prepend content to #vh-tabs
			let vtabs = document.querySelector("#vh-tabs");
			vtabs.insertBefore(content, vtabs.firstChild);
			vtabs.appendChild(clonedContent);
			clonedContent.style.marginTop = "5px";

			// Add event listeners to .vh-hideall and .vh-showall elements AND vh-hideallnext
			document.querySelectorAll(".vh-hideall").forEach((element) => {
				element.addEventListener("click", () => this.hideAllItems());
			});

			document.querySelectorAll(".vh-hideallnext").forEach((element) => {
				element.addEventListener("click", () => this.hideAllItemsNext());
			});

			document.querySelectorAll(".vh-showall").forEach((element) => {
				element.addEventListener("click", () => this.showAllItems());
			});
		}
	}

	//Populate the Pinned tab
	if (Settings.get("pinnedTab.active")) {
		let mapPin = new Map();
		mapPin = PinnedList.getList();
		mapPin.forEach(async (value, key) => {
			addPinnedTile(key, value.queue, value.title, value.thumbnail, value.is_parent_asin, value.enrollment_guid);
		});
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

async function addPinnedTile(asin, queue, title, thumbnail, is_parent_asin, enrollment_guid) {
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
	let search = title.replace(/^([a-zA-Z0-9\s',]{0,40})[\s]+.*$/, "$1");

	const recommendationType = getRecommendationTypeFromQueue(queue);
	const recommendationId = generateRecommendationString(recommendationType, asin, enrollment_guid);

	if (
		Settings.isPremiumUser() &&
		Settings.get("general.searchOpenModal") &&
		is_parent_asin != null &&
		enrollment_guid != null
	) {
		Tpl.setVar(
			"url",
			`https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?queue=last_chance#openModal;${asin};${queue};${is_parent_asin};${enrollment_guid}`
		);
	} else {
		Tpl.setVar("url", `https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?search=${search}`);
	}
	Tpl.setVar("id", asin);
	Tpl.setVar("domain", I13n.getDomainTLD());
	Tpl.setVar("search", search);
	Tpl.setVar("img_url", thumbnail);
	Tpl.setVar("asin", asin);
	Tpl.setVar("description", title);
	Tpl.setVar("is_parent_asin", is_parent_asin);
	Tpl.setVar("enrollment_guid", enrollment_guid);
	Tpl.setVar("recommendationType", recommendationType);
	Tpl.setVar("recommendationId", recommendationId);

	let content = Tpl.render(prom2, true);
	document.getElementById("tab-pinned").appendChild(content);

	//Bind the click event for the unpin button
	document.querySelector("#vh-pin-" + asin + " .unpin-link").onclick = (e) => {
		e.preventDefault();
		PinnedList.removeItem(asin);
		document.getElementById("vh-pin-" + asin).remove();

		updateTileCounts();
	};
}

function getRecommendationTypeFromQueue(queue) {
	const recommendationTypes = {
		potluck: "VENDOR_TARGETED",
		last_chance: "VENDOR_VINE_FOR_ALL",
		encore: "VINE_FOR_ALL",
	};

	return recommendationTypes[queue] || null;
}

function generateRecommendationString(recommendationType, asin, enrollment_guid) {
	//marketplaceId is global from bootload.js
	//customerId is global from bootloader.js

	if (recommendationType == "VENDOR_TARGETED") {
		return marketplaceId + "#" + asin + "#" + customerId + "#vine.enrollment." + enrollment_guid;
	}
	return marketplaceId + "#" + asin + "#vine.enrollment." + enrollment_guid;
}

async function hideAllItems() {
	let arrTile = [];
	HiddenList.loadFromLocalStorage(); //Refresh the list in case it was altered in a different tab

	//Find out what the current active tab is
	let currentTab = "#vvp-items-grid";
	if (
		document.querySelector("#tab-unavailable") &&
		document.querySelector("#tab-unavailable").style.display !== "none"
	) {
		currentTab = "#tab-unavailable";
	}

	const vvpItemTiles = document.querySelectorAll(currentTab + " .vvp-item-tile");
	for (const vvpItemTile of vvpItemTiles) {
		let asin = getAsinFromDom(vvpItemTile);
		arrTile.push({ asin: asin, hidden: true });
		let tile = getTileByAsin(asin); // Obtain the real tile
		await tile.hideTile(false, false); // Do not update local storage
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
		const pagination = document.querySelector("ul.a-pagination");
		const currentLi = pagination.querySelector("li.a-selected");
		const nextLi = currentLi.nextElementSibling;
		if (nextLi) {
			const nextPage = nextLi.querySelector("a").getAttribute("href");
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

export {
	Grid,
	updateTileCounts,
	createGridInterface,
	addPinnedTile,
	getRecommendationTypeFromQueue,
	generateRecommendationString,
	hideAllItems,
	hideAllItemsNext,
	showAllItems,
	selectCurrentTab,
};
