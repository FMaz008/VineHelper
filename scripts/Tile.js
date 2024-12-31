var timeoutHandle;

import { keywordMatch } from "./service_worker/keywordMatch.js";

class Tile {
	#tileDOM;
	#grid;
	#toolbar;

	#asin;
	#etv;
	#orderSuccess;
	#orderFailed;

	constructor(obj, gridInstance) {
		this.#tileDOM = obj;
		this.#grid = gridInstance;
		this.#toolbar = null;
		this.#asin = this.#findasin();
		this.#etv = null;
		this.#orderSuccess = 0;
		this.#orderFailed = 0;

		//Add the tile to the grid
		if (gridInstance !== null) {
			this.#grid.addTile(this);
		}
	}

	//#################
	//## Private method
	#findasin() {
		return getAsinFromDom(this.#tileDOM);
	}

	//#################
	//## Public methods

	async animateVanish() {
		const defaultOpacity = window.getComputedStyle(this.#tileDOM).opacity;

		// Animate opacity to 0 (hide)
		await animateOpacity(this.#tileDOM, 0, 150);

		// Reset styles
		this.#tileDOM.style.opacity = defaultOpacity;
		this.#tileDOM.style.height = "100%";
	}

	setToolbar = function (toolbarInstance) {
		this.#toolbar = toolbarInstance;
	};
	getToolbar() {
		return this.#toolbar;
	}

	//Generally called by Toolbar().setETV(min, max)
	setETV(etv) {
		this.#etv = etv;
		if (parseFloat(etv) == 0 && Settings.get("general.zeroETVHighlight.active")) {
			this.#tileDOM.style.backgroundColor = Settings.get("general.zeroETVHighlight.color");
		}
	}

	getETV() {
		return this.#etv;
	}

	setOrders(success, failed) {
		this.#orderSuccess = success;
		this.#orderFailed = failed;
	}

	getOrderSuccess() {
		return this.#orderSuccess;
	}
	getOrderFailed() {
		return this.#orderFailed;
	}

	wasOrdered() {
		return this.#orderSuccess > 0 || this.#orderFailed > 0;
	}

	getStatus() {
		if (Settings.get("unavailableTab.active")) {
			if (this.#orderSuccess > 0 && this.#orderSuccess > this.#orderFailed) return NOT_DISCARDED_ORDER_SUCCESS;

			if (this.#orderFailed > 0 && this.#orderFailed > this.#orderSuccess) return DISCARDED_ORDER_FAILED;
		}
		return NOT_DISCARDED;
	}

	getAsin() {
		return this.#asin;
	}

	getDOM() {
		return this.#tileDOM;
	}

	getGrid() {
		return this.#grid;
	}

	getGridId() {
		return this.#grid.getId();
	}
	getTitle() {
		return getTitleFromDom(this.#tileDOM);
	}

	getThumbnail() {
		return getThumbnailURLFromDom(this.#tileDOM);
	}

	setDateAdded(timenow, mysqlDate) {
		if (mysqlDate == undefined || !Settings.get("general.displayFirstSeen")) {
			return false;
		}

		let serverCurrentDate = YMDHiStoISODate(timenow);
		let itemDateAdded = YMDHiStoISODate(mysqlDate);
		let bookmarkDate = new Date(Settings.get("general.bookmarkDate"));
		if (isNaN(serverCurrentDate.getTime()) || isNaN(itemDateAdded.getTime())) {
			showRuntime(
				"! Time firstseen wrong: serverCurrentDate:" +
					serverCurrentDate +
					" itemDateAdded:" +
					itemDateAdded +
					"preformated current time: " +
					timenow +
					"preformatted item time" +
					mysqlDate
			);
			return;
		}

		let textDate = timeSince(serverCurrentDate, itemDateAdded);
		const dateAddedMessage = `${textDate} ago`;

		let dateAddedDiv = document.createElement("div");
		dateAddedDiv.classList.add("vh-date-added"); // Add the class
		dateAddedDiv.textContent = dateAddedMessage;

		// Find the container and append the new div
		const container = this.#tileDOM.querySelector(".vh-img-container");
		container.appendChild(dateAddedDiv);

		//Highlight the tile background if the bookmark date is in the past
		if (
			Settings.get("general.bookmark") &&
			itemDateAdded > bookmarkDate &&
			Settings.get("general.bookmarkDate") != 0
		) {
			showRuntime("TILE: The item is more recent than the time marker, highlight it.");
			this.#tileDOM.style.backgroundColor = Settings.get("general.bookmarkColor");
		}
	}

	async initiateTile() {
		//Highlight the tile border if the title match highlight keywords
		let highligthed = false;
		let match;
		if (Settings.get("general.highlightKeywords")?.length > 0) {
			match = keywordMatch(
				Settings.get("general.highlightKeywords"),
				this.getTitle(),
				this.getETV(),
				this.getETV()
			);

			if (match) {
				highligthed = true;
				showRuntime("TILE: The item match the keyword '" + match + "', highlight it");
				this.#tileDOM.style.backgroundColor = Settings.get("general.keywordHighlightColor");

				//Move the highlighted item to the top of the grid
				this.#grid.getDOM().insertBefore(this.#tileDOM, this.#grid.getDOM().firstChild);
			}
		}

		//Match with hide keywords. Only hide if not highlighed.
		if (!highligthed && Settings.get("hiddenTab.active") && Settings.get("general.hideKeywords")?.length > 0) {
			match = keywordMatch(Settings.get("general.hideKeywords"), this.getTitle(), this.getETV(), this.getETV());
			if (match) {
				showRuntime("TILE: The item match the keyword '" + match + "', hide it");
				this.hideTile(false, false, true); //Do not save, skip the hidden manager: just move the tile.
				document.getElementById("vh-hide-link-" + this.getAsin()).style.display = "none";
			}
		}

		//Match with blur keywords.
		if (Settings.isPremiumUser() && Settings.get("general.blurKeywords")?.length > 0) {
			match = keywordMatch(Settings.get("general.blurKeywords"), this.getTitle(), this.getETV(), this.getETV());
			if (match) {
				showRuntime("TILE: The item match the keyword '" + match + "', blur it");
				this.#tileDOM.querySelector("img")?.classList.add("blur");
				this.#tileDOM.querySelector(".vvp-item-product-title-container")?.classList.add("dynamic-blur");
			}
		}

		//Unescape titles
		const fullText = this.getDOM().querySelector(".a-truncate-full").innerText;
		this.getDOM().querySelector(".a-truncate-full").innerText = unescapeHTML(unescapeHTML(fullText));
		showRuntime("Done initializing tile");
	}

	async moveToGrid(g, animate = false) {
		if (g === null) {
			return false;
		}

		//If we are asking to move the tile to the same grid, don't do anything
		if (g.getId() == this.#grid.getId()) return false;

		if (animate) {
			await this.#grid.removeTileAnimate(this);
		} else {
			await this.#grid.removeTile(this); //Avoiding the await keep the method synchronous
		}

		this.#grid = g; //Update the new grid as the current one
		await this.#grid.addTile(this);

		return true;
	}

	isHidden() {
		if (!Settings.get("hiddenTab.active")) return false;

		return HiddenList.isHidden(this.#asin);
	}

	async hideTile(animate = true, updateLocalStorage = true, skipHiddenListMgr = false) {
		//Add the item to the list of hidden items

		if (!skipHiddenListMgr) {
			HiddenList.addItem(this.#asin, updateLocalStorage);
		}

		//Move the tile
		await this.moveToGrid(gridHidden, animate);

		this.#toolbar.updateVisibilityIcon();

		//Refresh grid counts
		updateTileCounts();
	}

	async showTile(animate = true, updateLocalStorage = true) {
		//Remove the item from the array of hidden items
		HiddenList.removeItem(this.#asin, updateLocalStorage);

		//Move the tile
		await this.moveToGrid(gridRegular, animate);

		this.#toolbar.updateVisibilityIcon();

		//Refresh grid counts
		updateTileCounts();
	}
}

function timeSince(timenow, date) {
	const units = [
		{ value: 31536000, unit: "year" },
		{ value: 2592000, unit: "month" },
		{ value: 86400, unit: "day" },
		{ value: 3600, unit: "hr" },
		{ value: 60, unit: "min" },
		{ value: 1, unit: "sec" },
	];

	var seconds = Math.floor((timenow - date) / 1000);
	for (const { value, unit } of units) {
		const interval = seconds / value;
		if (interval >= 1) {
			const plural = Math.floor(interval) > 1 ? "s" : "";
			return Math.floor(interval) + ` ${unit}${plural}`;
		}
	}
	return `${Math.floor(seconds)} secs`;
}

function getTileByAsin(asin) {
	let tile = null;
	tile = gridRegular.getTileByASIN(asin);
	if (tile != null) return tile;

	if (gridUnavailable != null) {
		tile = gridUnavailable.getTileByASIN(asin);
		if (tile != null) return tile;
	}

	tile = gridHidden.getTileByASIN(asin);
	return tile;
}

function getAsinFromDom(tileDom) {
	let regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.
	let urlElement = tileDom.querySelector(".a-link-normal");
	let url = urlElement ? urlElement.getAttribute("href") : null;
	if (url == null) {
		throw new Error("The provided DOM content does not contain an .a-link-normal element.");
	}
	let arrasin = url.match(regex);
	return arrasin[1];
}

function getTitleFromDom(tileDom) {
	let textElement = tileDom.querySelector(".a-truncate-full");
	return textElement ? textElement.textContent : "";
}

function getThumbnailURLFromDom(tileDom) {
	//Preload.
	let imgElement = tileDom.querySelector(".vvp-item-tile-content > img");
	let url = imgElement ? imgElement.getAttribute("src") : null;

	if (url == undefined) {
		//Post load of VH added an image container.
		imgElement = tileDom.querySelector(".vh-img-container > img");
		url = imgElement ? imgElement.getAttribute("src") : null;
	}

	return url == undefined ? null : url;
}

// Function to animate opacity
function animateOpacity(element, targetOpacity, duration) {
	return new Promise((resolve) => {
		const startOpacity = parseFloat(getComputedStyle(element).opacity);
		const opacityChange = targetOpacity - startOpacity;
		const startTime = performance.now();

		function animate(time) {
			const elapsed = time - startTime;
			const progress = Math.min(elapsed / duration, 1);
			element.style.opacity = startOpacity + opacityChange * progress;

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				element.style.display = "none"; // Optionally hide the element
				resolve();
			}
		}

		requestAnimationFrame(animate);
	});
}

export { Tile, getTileByAsin, getAsinFromDom, getTitleFromDom, getThumbnailURLFromDom };
