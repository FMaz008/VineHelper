var currentTab = "vvp-items-grid";

class Grid {
	constructor(obj) {
		this.pGrid = null;
		this.pArrTile = [];
		this.pGrid = obj;
	}

	getId() {
		return $(this.pGrid).attr("id");
	}

	getDOM() {
		return this.pGrid;
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
			return $(this.pGrid).children().length;
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
	if (appSettings.unavailableTab?.active || appSettings.hiddenTab.active)
		$("#vh-available-count").text(gridRegular.getTileCount(true));

	if (appSettings.unavailableTab?.active) $("#vh-unavailable-count").text(gridUnavailable.getTileCount(true));

	if (appSettings.hiddenTab?.active) $("#vh-hidden-count").text(gridHidden.getTileCount(true));

	if (appSettings.pinnedTab?.active) $("#vh-pinned-count").text(gridPinned.getTileCount(true));
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
	if (appSettings.thorvarium.mobileandroid || appSettings.thorvarium.mobileios) {
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
	Tpl.setIf("unavailable", appSettings.unavailableTab.active);

	//If the hidden tab system is activated
	Tpl.setIf("hidden", appSettings.hiddenTab.active);

	//If the hidden tab system is activated
	Tpl.setIf("pinned", appSettings.pinnedTab?.active);

	let tabsHtml = Tpl.render(tplTabs, false);
	tabs.insertAdjacentHTML("afterbegin", tabsHtml);

	if (appSettings.hiddenTab.active) {
		//Add the toolbar for Hide All & Show All
		//Delete the previous one if any exist:
		removeElements("#vh-tabs .hidden-toolbar"); //bootloader.js

		//Generate the html for the hide all and show all widget
		let prom = await Tpl.loadFile("view/widget_hideall.html");
		Tpl.setVar("class", appSettings.thorvarium.darktheme ? "invert" : "");
		if (appSettings.thorvarium.mobileandroid || appSettings.thorvarium.mobileios) {
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
	if (appSettings.pinnedTab?.active) {
		let mapPin = new Map();
		mapPin = PinnedList.getList();
		mapPin.forEach(async (value, key) => {
			addPinnedTile(key, value.title, value.thumbnail);
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

async function addPinnedTile(asin, title, thumbnail) {
	//Check if the pin already exist:
	if (document.getElementById("vh-pin-" + asin) != undefined) return false;

	let prom2 = await Tpl.loadFile("view/pinned_tile.html");
	let search = title.replace(/^([a-zA-Z0-9\s',]{0,40})[\s]+.*$/, "$1");
	Tpl.setVar("id", asin);
	Tpl.setVar("domain", vineDomain); //preboot.js
	Tpl.setVar("search", search);
	Tpl.setVar("img_url", thumbnail);
	Tpl.setVar("asin", asin);
	Tpl.setVar("description", title);
	let content = Tpl.render(prom2, true);
	document.getElementById("tab-pinned").appendChild(content);

	//Bind the click event for the unpin button
	document.querySelector("#vh-pin-" + asin + " .unpin-link").onclick = () => {
		PinnedList.removeItem(asin);
		document.getElementById("vh-pin-" + asin).remove();

		updateTileCounts();
	};
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
	if (appSettings.hiddenTab.scrollToRFY) {
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
	if (appSettings.hiddenTab.scrollToRFY) {
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
