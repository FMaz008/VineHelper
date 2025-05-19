import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
var Settings = new SettingsMgr();

import { Environment } from "./Environment.js";
var env = new Environment();

import { HiddenListMgr } from "./HiddenListMgr.js";
var HiddenList = new HiddenListMgr();

import { ModalMgr } from "./ModalMgr.js";
var modalMgr = new ModalMgr();

import { Template } from "./Template.js";
var Tpl = new Template();

import { keywordMatch } from "./service_worker/keywordMatch.js";
import { YMDHiStoISODate } from "./DateHelper.js";
import { getTileByAsin, updateTileCounts } from "./Grid.js";
import { unescapeHTML, escapeHTML } from "./StringHelper.js";
import { clickDynamicSeeDetailsButton, drawButton } from "./DynamicModalHelper.js";

import "../node_modules/canvas-confetti/dist/confetti.browser.js";

class Tile {
	#tileDOM;
	#grid;
	#toolbar;

	#asin;
	#isPinned = false;
	#orderSuccess = 0;
	#orderFailed = 0;
	#orderUnavailable = false;
	#title = null;
	#thumbnailUrl = null;
	#variants = [];
	constructor(obj, gridInstance) {
		this.#tileDOM = obj;
		this.#grid = gridInstance;
		this.#toolbar = null;
		this.#asin = this.#findasin();
		this.#orderSuccess = 0;
		this.#orderFailed = 0;

		logger.add("Creating Tile: " + this.#asin + " to grid: " + gridInstance?.getId());

		//Add the tile to the grid
		if (gridInstance !== null) {
			this.#grid.addTile(this);
		}
	}

	//#################
	//## Private method
	#findasin() {
		try {
			return getAsinFromDom(this.#tileDOM);
		} catch (e) {
			logger.add("Error finding ASIN: " + e.message);
			return null;
		}
	}

	//#################
	//## Public methods

	async addVariant(asin, title, etv) {
		if (this.#variants.length === 0) {
			await this.#addVariantButton();
		}
		//Check if the variant already exists
		if (this.#variants.find((variant) => variant.asin === asin)) {
			return;
		}
		this.#variants.push({ asin, title, etv });
	}

	getVariants() {
		return this.#variants;
	}

	getVariant(asin) {
		return this.#variants.find((variant) => variant.asin === asin);
	}

	updateVariantCount() {
		const span = this.getDOM().querySelector(".vh-btn-variants-count");
		if (span) {
			span.textContent = this.#variants.length;
		}
	}

	async #addVariantButton() {
		//Create the drop down button
		let prom = await Tpl.loadFile("view/btn_show_variants.html");
		let content = Tpl.render(prom, true);

		//Insert a span to contain both buttons
		const span = this.getDOM().querySelector(".vh-btn-container");

		//Insert the content into the span
		span.appendChild(content);

		//Add data-recommendation-id to the buy now button
		const btnShowVariants = span.querySelector(".vh-btn-variants");
		btnShowVariants.dataset.asin = this.#asin;

		//If using darktheme, invert the icon's color
		if (Settings.get("thorvarium.darktheme")) {
			btnShowVariants.querySelector(".vh-indicator-icon").style.filter = "invert(1)";
		}

		//Add event listener to the buy now button
		btnShowVariants.addEventListener("click", this.btnShowVariantsClick.bind(this));
	}

	async btnShowVariantsClick(event) {
		event.preventDefault();

		//Find the asin from the data-asin attribute
		const asin = this.#asin;

		//Display a modal listing all the variants
		let m = modalMgr.newModal("item-variants-" + asin);
		m.title = "Variants for item #" + asin;
		m.style = "min-width: 600px;";
		m.content = `<img src="${this.getThumbnail()}" alt="Thumbnail" style="width: 100px; height: 100px;float: left;margin-right: 10px;margin-bottom: 10px;" />`;
		m.content += `<br />${this.getTitle()}<br /><br /><table class="vh-table-variants">`;
		m.content += `<tr><th>Variant info</th><th>Action</th></tr>`;
		for (let variant of this.#variants) {
			m.content += `<tr><td>`;
			try {
				const json = JSON.parse(variant.title);
				for (let key in json) {
					m.content += `<strong>${key}:</strong> ${json[key]}<br />`;
				}
			} catch (e) {
				m.content += `(No info available)<br />`;
			}
			m.content += `</td><td width="150px">`;
			m.content += `<a href="#" class="vh-link-variant" data-asin="${variant.asin}">View ${variant.asin}</a>`;
			m.content += `</td></tr>`;
		}
		m.content += `</table>`;
		await m.show();

		//Add event listener to the links
		const links = document.querySelectorAll(`#modal-item-variants-${asin} .vh-link-variant`);
		for (let link of links) {
			link.addEventListener("click", () => {
				//Close the modal
				m.close();

				const variantAsin = link.dataset.asin;

				//Find the main See Details button
				const seeDetails = this.#tileDOM.querySelector(".vvp-details-btn input");
				//Generate a See Details button

				const recommendationId = seeDetails.dataset.recommendationId;
				const recommendationType = seeDetails.dataset.recommendationType;
				drawButton(variantAsin, false, recommendationType, recommendationId);
				clickDynamicSeeDetailsButton(variantAsin);
			});
		}
	}

	isPinned() {
		return this.#isPinned;
	}

	setPinned(isPinned) {
		this.#isPinned = isPinned;

		this.#tileDOM.querySelector("#vh-pin-icon-" + this.#asin).classList.toggle("vh-icon-pin", !isPinned);
		this.#tileDOM.querySelector("#vh-pin-icon-" + this.#asin).classList.toggle("vh-icon-unpin", isPinned);
	}

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

	setOrders(success, failed) {
		this.#tileDOM.querySelector(".vh-order-success").textContent = success;
		this.#tileDOM.querySelector(".vh-order-failed").textContent = failed;
		this.#orderSuccess = success;
		this.#orderFailed = failed;
	}

	setUnavailable(orderUnavailable) {
		this.#orderUnavailable = orderUnavailable;
	}

	getUnavailable() {
		return this.#orderUnavailable;
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
			if (this.#orderSuccess > 0 && this.#orderSuccess > this.#orderFailed)
				return env.data.NOT_DISCARDED_ORDER_SUCCESS;

			if (this.#orderFailed > 0 && this.#orderFailed > this.#orderSuccess) return env.data.DISCARDED_ORDER_FAILED;
		}
		return env.data.NOT_DISCARDED;
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
		if (this.#title == null) {
			this.#title = getTitleFromDom(this.#tileDOM);
		}
		return this.#title;
	}

	getThumbnail() {
		if (this.#thumbnailUrl == null) {
			this.#thumbnailUrl = getThumbnailURLFromDom(this.#tileDOM);
		}
		return this.#thumbnailUrl;
	}

	markAsDiscovered() {
		const container = this.#tileDOM.querySelector(".vh-img-container");

		const newCorner = document.createElement("div");
		newCorner.classList.add("vh-new-corner-discovered");
		//Add a span into the div
		const span = document.createElement("span");
		span.innerHTML = "FIRST<br>DISCOVERY";
		newCorner.appendChild(span);

		//Insert newCorner as the first child of the container
		container.insertBefore(newCorner, container.firstChild);

		if (Settings.get("general.discoveryFirst")) {
			logger.add("Tile: markAsDiscovered: discoveryFirst");
			//Move the highlighted item to the top of the grid
			this.getGrid().getDOM().insertBefore(this.getDOM(), this.getGrid().getDOM().firstChild);
		}

		//Confetti animation
		//Wait 1 seconds for the item to take their final position
		setTimeout(() => {
			this.explodeConfettiFromDiv(this.getDOM());
		}, 1000);
	}

	explodeConfettiFromDiv(div) {
		if (!div) return;

		const rect = div.getBoundingClientRect();

		if (rect.top == 0 && rect.left == 0) {
			return; //div not visible.
		}

		// Create confetti from three sides
		const positions = [
			// Left side
			{ x: rect.left / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: rect.left / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
			{ x: rect.left / window.innerWidth, y: rect.bottom / window.innerHeight },
			// Top side
			{ x: (rect.left + rect.width / 4) / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: (rect.left + rect.width / 2) / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: (rect.left + (rect.width * 3) / 4) / window.innerWidth, y: rect.top / window.innerHeight },
			// Right side
			{ x: rect.right / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: rect.right / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
			{ x: rect.right / window.innerWidth, y: rect.bottom / window.innerHeight },
		];

		positions.forEach((pos) => {
			confetti({
				particleCount: 15, // Reduced particle count per origin point
				spread: 45,
				startVelocity: 15, // Reduced velocity for shorter distance
				decay: 0.9, // Faster decay
				gravity: 0.8, // Reduced gravity
				ticks: 100, // Controls animation duration (~500ms)
				origin: pos,
				colors: ["#ff0", "#ff4500", "#ff1493", "#00ffff", "#00ff00"],
				scalar: 0.8, // Smaller particles
				drift: 0, // No sideways drift
				disableForReducedMotion: true,
			});
		});
	}

	setDateAdded(timenow, mysqlDate) {
		if (mysqlDate == undefined || !Settings.get("general.displayFirstSeen")) {
			return false;
		}

		let serverCurrentDate = YMDHiStoISODate(timenow);
		let itemDateAdded = YMDHiStoISODate(mysqlDate);
		let bookmarkDate = new Date(Settings.get("general.bookmarkDate"));
		if (isNaN(serverCurrentDate.getTime()) || isNaN(itemDateAdded.getTime())) {
			logger.add(
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
		//Add the data-date attribute to the tile
		// Convert to local time and store in dataset
		this.#tileDOM.dataset.date = new Date(itemDateAdded).toLocaleString();

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
			logger.add("TILE: The item is more recent than the time marker, highlight its toolbar.");
			this.#tileDOM.querySelector(".vh-status-container").style.backgroundColor =
				Settings.get("general.bookmarkColor");
			this.#tileDOM.classList.add("vh-new-item-highlight");
		}
	}

	async initiateTile() {
		//Match with blur keywords.
		this.#tileDOM.dataset.blurredKeyword = "";
		if (Settings.isPremiumUser() && Settings.get("general.blurKeywords")?.length > 0) {
			let match = keywordMatch(Settings.get("general.blurKeywords"), this.getTitle(), null, null);
			if (match) {
				logger.add("TILE: The item match the keyword '" + match + "', blur it");
				this.#tileDOM.querySelector("img")?.classList.add("blur");
				this.#tileDOM.querySelector(".vvp-item-product-title-container")?.classList.add("dynamic-blur");
				this.#tileDOM.dataset.blurredKeyword = escapeHTML(match);
			}
		}

		//Unescape titles
		const fullText = this.getDOM().querySelector(".a-truncate-full").innerText;
		this.getDOM().querySelector(".a-truncate-full").innerText = unescapeHTML(unescapeHTML(fullText));
		if (fullText) {
			this.getDOM().querySelector(".a-truncate-cut").innerText = unescapeHTML(unescapeHTML(fullText));
		}
		//Assign the ASIN to the tile content
		this.getDOM().closest(".vvp-item-tile").dataset.asin = this.#asin;
	}

	colorizeHighlight() {
		const zeroETV = this.#tileDOM.dataset.zeroETV === "true" && Settings.get("general.zeroETVHighlight.active");
		const highlight =
			this.#tileDOM.dataset.keywordHighlight === "true" && Settings.get("general.highlightColor.active");
		const unknownETV =
			this.#tileDOM.dataset.unknownETV === "true" && Settings.get("general.unknownETVHighlight.active");

		this.#tileDOM.style.backgroundColor = "unset";
		this.#tileDOM.style.background = "unset";

		if (zeroETV && highlight) {
			const color1 = Settings.get("general.zeroETVHighlight.color");
			const color2 = Settings.get("general.highlightColor.color");
			this.#tileDOM.style.background = `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
		} else if (unknownETV && highlight) {
			const color1 = Settings.get("general.unknownETVHighlight.color");
			const color2 = Settings.get("general.highlightColor.color");
			this.#tileDOM.style.background = `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
		} else if (highlight) {
			this.#tileDOM.style.backgroundColor = Settings.get("general.highlightColor.color");
		} else if (zeroETV) {
			this.#tileDOM.style.backgroundColor = Settings.get("general.zeroETVHighlight.color");
		} else if (unknownETV) {
			this.#tileDOM.style.backgroundColor = Settings.get("general.unknownETVHighlight.color");
		}
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

	async isHidden() {
		if (!Settings.get("hiddenTab.active")) {
			return false;
		}
		return await HiddenList.isHidden(this.#asin);
	}

	async hideTile(animate = true, updateLocalStorage = true, skipHiddenListMgr = false) {
		//Add the item to the list of hidden items

		if (!skipHiddenListMgr) {
			HiddenList.addItem(this.#asin, updateLocalStorage);
		}

		//Move the tile
		await this.moveToGrid(env.data.grid.gridHidden, animate);

		this.#toolbar.updateVisibilityIcon();

		//Refresh grid counts
		updateTileCounts();
	}

	async showTile(animate = true, updateLocalStorage = true) {
		//Remove the item from the array of hidden items
		HiddenList.removeItem(this.#asin, updateLocalStorage);

		//Move the tile
		await this.moveToGrid(env.data.grid.gridRegular, animate);

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

function getTileFromDom(tileDom) {
	const asin = getAsinFromDom(tileDom);
	return getTileByAsin(asin);
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

export { Tile, getTileFromDom, getAsinFromDom };
