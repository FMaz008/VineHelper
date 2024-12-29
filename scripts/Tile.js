var timeoutHandle;

function Tile(obj, gridInstance) {
	//private properties
	var pTile = obj;
	var pAsin = findasin();
	var pGrid = gridInstance;
	pGrid.addTile(this);
	var pToolbar = null;

	var pETV = null;

	var pOrderSuccess = 0;
	var pOrderFailed = 0;

	//#################
	//## Private method
	function findasin() {
		return getAsinFromDom(pTile);
	}

	this.animateVanish = async function () {
		const defaultOpacity = window.getComputedStyle(pTile).opacity;

		// Animate opacity to 0 (hide)
		await animateOpacity(pTile, 0, 150);

		// Reset styles
		pTile.style.opacity = defaultOpacity;
		pTile.style.height = "100%";
	};

	//#################
	//## Public methods
	this.setToolbar = function (toolbarInstance) {
		pToolbar = toolbarInstance;
	};
	this.getToolbar = function () {
		return pToolbar;
	};

	this.setETV = function (etv) {
		pETV = etv;
		if (parseFloat(etv) == 0) {
			pTile.style.backgroundColor = Settings.get("general.zeroETVHighlightColor");
		}
	};

	this.getETV = function () {
		return pETV;
	};

	this.setOrders = function (success, failed) {
		pOrderSuccess = success;
		pOrderFailed = failed;
	};

	this.getOrderSuccess = function () {
		return pOrderSuccess;
	};
	this.getOrderFailed = function () {
		return pOrderFailed;
	};

	this.wasOrdered = function () {
		return pOrderSuccess > 0 || pOrderFailed > 0;
	};

	this.getStatus = function () {
		if (Settings.get("unavailableTab.active")) {
			if (pOrderSuccess > 0 && pOrderSuccess > pOrderFailed) return NOT_DISCARDED_ORDER_SUCCESS;

			if (pOrderFailed > 0 && pOrderFailed > pOrderSuccess) return DISCARDED_ORDER_FAILED;
		}
		return NOT_DISCARDED;
	};

	this.getAsin = function () {
		return pAsin;
	};

	this.getDOM = function () {
		return pTile;
	};

	this.getGrid = function () {
		return pGrid;
	};

	this.getGridId = function () {
		return pGrid.getId();
	};
	this.getTitle = function () {
		return getTitleFromDom(pTile);
	};

	this.getThumbnail = function () {
		return getThumbnailURLFromDom(pTile);
	};

	this.setDateAdded = function (timenow, mysqlDate) {
		if (mysqlDate == undefined || !Settings.get("general.displayFirstSeen")) return false;

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
		dateAddedMessage = Settings.get("unavailableTab.compactToolbar")
			? `${textDate} ago`
			: `First seen: ${textDate} ago`;

		let dateAddedDiv = document.createElement("div");
		dateAddedDiv.classList.add("vh-date-added"); // Add the class
		dateAddedDiv.textContent = dateAddedMessage;

		// Find the container and append the new div
		const container = pTile.querySelector(".vh-img-container");
		container.appendChild(dateAddedDiv);

		//Highlight the tile background if the bookmark date is in the past
		if (
			Settings.get("general.bookmark") &&
			itemDateAdded > bookmarkDate &&
			Settings.get("general.bookmarkDate") != 0
		) {
			showRuntime("TILE: The item is more recent than the time marker, highlight it.");
			pTile.style.backgroundColor = Settings.get("general.bookmarkColor");
		}
	};

	this.initiateTile = async function () {
		//Highlight the tile border if the title match highlight keywords
		let highligthed = false;
		let match;
		if (Settings.get("general.highlightKeywords")?.length > 0) {
			match = this.matchKeywords(Settings.get("general.highlightKeywords"));
			if (match) {
				highligthed = true;
				showRuntime("TILE: The item match the keyword '" + match + "', highlight it");
				pTile.style.backgroundColor = Settings.get("general.keywordHighlightColor");

				//Move the highlighted item to the top of the grid
				pGrid.getDOM().insertBefore(obj, pGrid.getDOM().firstChild);
			}
		}

		//Match with hide keywords. Only hide if not highlighed.
		if (!highligthed && Settings.get("hiddenTab.active") && Settings.get("general.hideKeywords")?.length > 0) {
			match = this.matchKeywords(Settings.get("general.hideKeywords"));
			if (match) {
				showRuntime("TILE: The item match the keyword '" + match + "', hide it");
				this.hideTile(false, false, true); //Do not save, skip the hidden manager: just move the tile.
				document.getElementById("vh-hide-link-" + this.getAsin()).style.display = "none";
			}
		}

		//Match with blur keywords.
		if (Settings.isPremiumUser() && Settings.get("general.blurKeywords")?.length > 0) {
			match = this.matchKeywords(Settings.get("general.blurKeywords"));
			if (match != undefined) {
				showRuntime("TILE: The item match the keyword '" + match + "', blur it");
				pTile.querySelector("img")?.classList.add("blur");
				pTile.querySelector(".vvp-item-product-title-container")?.classList.add("dynamic-blur");
			}
		}

		//Unescape titles
		const fullText = this.getDOM().querySelector(".a-truncate-full").innerText;
		this.getDOM().querySelector(".a-truncate-full").innerText = unescapeHTML(fullText);
	};

	this.matchKeywords = function (arrWords) {
		const match = arrWords.find((word) => {
			let regex;
			let regex2;
			if (typeof word == "string") {
				try {
					regex = new RegExp(`\\b${word}\\b`, "i");
				} catch (error) {
					if (error instanceof SyntaxError) {
						showRuntime(
							"TILE: The highlight keyword '" + word + "' is not a valid regular expression, skipping it."
						);
					}
					return false;
				}
				return word && regex.test(this.getTitle()); //This seems odd as a return value
			} else if (typeof word == "object") {
				try {
					regex = new RegExp(`\\b${word.contains}\\b`, "i");
					regex2 = new RegExp(`\\b${word.without}\\b`, "i");
				} catch (error) {
					if (error instanceof SyntaxError) {
						showRuntime(
							"TILE: The highlight keyword '" +
								word.contains +
								"' is not a valid regular expression, skipping it."
						);
					}
					return false;
				}
				if (regex.test(this.getTitle())) {
					if (word.without == "" || !regex2.test(this.getTitle())) {
						if (
							word.etv_min == "" ||
							this.getETV() === null ||
							parseFloat(this.getETV()) >= parseFloat(word.etv_min)
						) {
							if (
								word.etv_max == "" ||
								this.getETV() === null ||
								parseFloat(this.getETV()) <= parseFloat(word.etv_max)
							) {
								return word.contains;
							}
						}
					}
				}
			}
		});
		return match;
	};

	this.moveToGrid = async function (g, animate = false) {
		if (g === null) {
			return false;
		}

		//If we are asking to move the tile to the same grid, don't do anything
		if (g.getId() == pGrid.getId()) return false;

		if (animate) {
			await pGrid.removeTileAnimate(this);
		} else {
			await pGrid.removeTile(this); //Avoiding the await keep the method synchronous
		}

		pGrid = g; //Update the new grid as the current one
		await pGrid.addTile(this);

		return true;
	};

	this.isHidden = function () {
		if (!Settings.get("hiddenTab.active")) return false;

		return HiddenList.isHidden(pAsin);
	};

	this.hideTile = async function (animate = true, updateLocalStorage = true, skipHiddenListMgr = false) {
		//Add the item to the list of hidden items

		if (!skipHiddenListMgr) {
			HiddenList.addItem(pAsin, updateLocalStorage);
		}

		//Move the tile
		await this.moveToGrid(gridHidden, animate);

		pToolbar.updateVisibilityIcon();

		//Refresh grid counts
		updateTileCounts();
	};

	this.showTile = async function (animate = true, updateLocalStorage = true) {
		//Remove the item from the array of hidden items
		HiddenList.removeItem(pAsin, updateLocalStorage);

		//Move the tile
		await this.moveToGrid(gridRegular, animate);

		pToolbar.updateVisibilityIcon();

		//Refresh grid counts
		updateTileCounts();
	};
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
