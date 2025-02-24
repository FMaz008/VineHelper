import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
var Settings = new SettingsMgr();

import { Environment } from "./Environment.js";
var env = new Environment();

import { Internationalization } from "./Internationalization.js";
var i13n = new Internationalization();

import { PinnedListMgr } from "./PinnedListMgr.js";
var PinnedList = new PinnedListMgr();

import { getTileByAsin, addPinnedTile, updateTileCounts } from "./Grid.js";

import { Template } from "./Template.js";
var Tpl = new Template();

import { keywordMatch } from "./service_worker/keywordMatch.js";

import { BrendaAnnounceQueue } from "./BrendaAnnounce.js";
var brendaAnnounceQueue = new BrendaAnnounceQueue();

import { ScreenNotifier, ScreenNotification } from "./ScreenNotifier.js";
var Notifications = new ScreenNotifier();

class Toolbar {
	#tile;
	#toolbarDOM;

	constructor(tileInstance) {
		this.#tile = tileInstance;
		this.#tile.setToolbar(this);
	}

	//Create the bare bone structure of the toolbar
	async createProductToolbar() {
		const toolbarId = "vh-toolbar-" + this.#tile.getAsin();
		let anchorTo = this.#tile.getDOM().querySelector(".vvp-item-tile-content"); //.vvp-item-tile-content should be the first child

		//Load the toolbar template
		logger.add("DRAW: Creating #" + toolbarId);
		const prom = await Tpl.loadFile("view/toolbar.html");
		Tpl.setVar("toolbarId", toolbarId);
		Tpl.setVar("asin", this.#tile.getAsin());
		Tpl.setIf(
			"announce",
			Settings.get("discord.active") &&
				Settings.get("discord.guid", false) != null &&
				env.data.vineQueue != null &&
				env.data.vineSearch == false
		);
		if (Settings.get("unavailableTab.active")) {
			logger.add("DRAW-UPDATE-TOOLBAR: Create order widget");
			Tpl.setVar("orderWidget", await this.createOrderWidget());
		} else {
			Tpl.setVar("orderWidget", "");
		}

		if (Settings.get("general.listView")) {
			Tpl.setVar("flexDirection", "row");
		} else {
			Tpl.setVar("flexDirection", "column");
		}

		Tpl.setIf("pinned", Settings.get("pinnedTab.active"));
		Tpl.setIf("toggleview", Settings.get("hiddenTab.active"));
		this.#toolbarDOM = Tpl.render(prom, true);

		//Attach the toolbar to the tile's .vvp-item-tile-content container.
		anchorTo.insertAdjacentElement("afterbegin", this.#toolbarDOM);
		const container = this.#toolbarDOM.querySelector(`.vh-status-container`);
		container.style.backgroundColor = Settings.get("general.toolbarBackgroundColor");

		const container2 = this.#toolbarDOM.querySelector(`.vh-status-container2`);

		this.#toolbarDOM.querySelector(`.vh-toolbar-etv`).style.display = "none";

		// Activate the announce button when the ETV is set (changed)
		const etvElements = container2.querySelectorAll(".etv");
		etvElements.forEach((etv) => {
			etv.addEventListener("change", (event) => {
				if (event.currentTarget.textContent === "") return false;
				if (env.data.vineSearch) return false;

				let tileDOM = this.#tile.getDOM();
				let announcementIcon = tileDOM.querySelector(".vh-icon-announcement");

				if (announcementIcon) {
					announcementIcon.style.opacity = "1";
					let parentAnchor = announcementIcon.parentElement;
					const announceClickHandler = async (e) => {
						e.preventDefault();

						if (env.data.vineQueue == null)
							throw new Exception("Cannot announce an item in an unknown queue.");

						let etv = this.#tile.getDOM().querySelector(".etv").textContent;

						// In case of price range, only send the highest value
						etv = etv.split("-").pop();
						etv = Number(etv.replace(/[^0-9-.]+/g, ""));

						brendaAnnounceQueue.announce(
							this.#tile.getAsin(),
							etv,
							env.data.vineQueue,
							i13n.getDomainTLD()
						);

						if (!Settings.get("notification.reduce")) {
							let note = new ScreenNotification();
							note.title = "Announce to Brenda";
							note.lifespan = 10;
							note.content = `Sending this product ${this.#tile.getAsin()} from the ${env.data.vineQueueAbbr} queue to Brenda over on discord`;
							await Notifications.pushNotification(note);
						}

						// Visually deactivate this item
						parentAnchor.removeEventListener("click", announceClickHandler);
						parentAnchor.style.opacity = "0.3";
					};
					if (parentAnchor && parentAnchor.tagName === "A") {
						parentAnchor.removeEventListener("click", announceClickHandler); // Remove any previous click handlers
						parentAnchor.addEventListener("click", announceClickHandler);
					}
				}
			});
		});

		// If the small tiles will be shown, hide the ETV icon to gain space
		if (
			Settings.get("thorvarium.smallItems") ||
			Settings.get("thorvarium.mobileios") ||
			Settings.get("thorvarium.mobileandroid")
		) {
			let etvIcons = document.querySelectorAll(".vh-icon-etv");
			etvIcons.forEach((icon) => {
				icon.style.display = "none";
			});
		}

		//Display the hide link
		if (Settings.get("hiddenTab.active")) {
			let h = this.#toolbarDOM.querySelector(`#vh-hide-link-${this.#tile.getAsin()}`);
			if (h) {
				h.addEventListener("click", async (event) => {
					// A hide/display item button was pressed
					let asin = this.#tile.getAsin(); // Directly access ASIN from the context
					let tile = getTileByAsin(asin);
					let gridId = tile.getGridId();

					switch (
						gridId // Current Grid
					) {
						case "vvp-items-grid":
						case "tab-unavailable":
							tile.hideTile();
							break;
						case "tab-hidden":
							tile.showTile();
							break;
					}

					updateTileCounts();
				});
			}

			this.updateVisibilityIcon();
		}

		//Pinned items event handler
		if (Settings.get("pinnedTab.active")) {
			let h2 = document.getElementById(`vh-pin-link-${this.#tile.getAsin()}`);

			if (h2) {
				h2.addEventListener("click", async (event) => {
					h2.style.opacity = 0.3;

					// A hide/display item button was pressed
					let asin = this.#tile.getAsin(); // Directly access ASIN
					let tile = getTileByAsin(asin);

					// Get the item title and thumbnail
					let title = tile.getTitle();
					let thumbnail = tile.getThumbnail();

					const btn = document.querySelector(`input[data-asin="${asin}"]`);

					if (btn) {
						const isParentAsin = btn.dataset.isParentAsin;
						const enrollmentGUID = btn.dataset.recommendationId.match(
							/#vine\.enrollment\.([a-f0-9-]+)/i
						)[1];

						PinnedList.addItem(asin, env.data.vineQueue, title, thumbnail, isParentAsin, enrollmentGUID);
						await addPinnedTile(asin, env.data.vineQueue, title, thumbnail, isParentAsin, enrollmentGUID); // grid.js

						updateTileCounts();
					}
				});
			}
		}
	}

	updateVisibilityIcon() {
		if (!Settings.get("hiddenTab.active")) {
			return false;
		}

		let icon = this.#toolbarDOM.querySelector(`#vh-hide-link-${this.#tile.getAsin()} div.vh-toolbar-icon`);
		let gridId = this.#tile.getGridId();

		if (icon) {
			// Remove classes
			icon.classList.remove("vh-icon-hide", "vh-icon-show");

			// Add classes based on gridId
			switch (gridId) {
				case "vvp-items-grid":
				case "tab-unavailable":
					icon.classList.add("vh-icon-hide");
					break;
				case "tab-hidden":
					icon.classList.add("vh-icon-show");
					break;
			}
		}
	}

	setETV(etv1, etv2, onlyIfEmpty = false) {
		let span = this.#toolbarDOM.querySelector(".vh-toolbar-etv .etv");

		if (onlyIfEmpty && span.textContent !== "") {
			return false;
		}

		this.processHighlight(etv1, etv2);

		etv1 = new Intl.NumberFormat(i13n.getLocale(), {
			style: "currency",
			currency: i13n.getCurrency(),
		}).format(etv1);
		etv2 = new Intl.NumberFormat(i13n.getLocale(), {
			style: "currency",
			currency: i13n.getCurrency(),
		}).format(etv2);

		span.textContent = etv1 === etv2 ? etv2 : `${etv1}-${etv2}`;

		// Trigger change event manually
		let changeEvent = new Event("change", { bubbles: true });
		span.dispatchEvent(changeEvent);

		if (Settings.get("general.displayETV")) {
			this.#toolbarDOM.querySelector(".vh-toolbar-etv").style.display = "flex";
		}
	}

	unknownETV() {
		this.processHighlight(null, null);
	}

	processHighlight(etv1, etv2) {
		logger.add("Toolbar: processHighlight");

		let checkHideList = false;
		let match;
		if (Settings.get("general.highlightKeywords")?.length > 0) {
			match = keywordMatch(Settings.get("general.highlightKeywords"), this.#tile.getTitle(), etv1, etv2);
			if (!match) {
				logger.add("Toolbar: processHighlight: no match");
				//No match now, remove the highlight
				this.#tile.getDOM().dataset.keywordHighlight = false;

				checkHideList = true;
			} else {
				logger.add("Toolbar: processHighlight: match");
				//Match found, keep the highlight
				this.#tile.getDOM().dataset.keywordHighlight = true;

				if (Settings.get("general.highlightKWFirst")) {
					logger.add("Toolbar: processHighlight: highlightKWFirst");
					//Move the highlighted item to the top of the grid
					this.#tile
						.getGrid()
						.getDOM()
						.insertBefore(this.#tile.getDOM(), this.#tile.getGrid().getDOM().firstChild);
				}
			}
		} else {
			this.#tile.getDOM().dataset.keywordHighlight = false;
			checkHideList = true;
		}

		if (checkHideList) {
			//Check if the item should be hidden
			if (Settings.get("hiddenTab.active") && Settings.get("general.hideKeywords")?.length > 0) {
				match = keywordMatch(Settings.get("general.hideKeywords"), this.#tile.getTitle(), etv1, etv2);
				if (match) {
					logger.add("Toolbar: processHide: hide match");
					this.#tile.hideTile(false, false, true); //Do not save, skip the hidden manager: just move the tile.

					document.getElementById("vh-hide-link-" + this.#tile.getAsin()).style.display = "none";
				}
			}
		}

		if (etv1 === null && etv2 === null) {
			logger.add("Toolbar: processHighlight: unknownETV");
			this.#tile.getDOM().dataset.unknownETV = true;
			this.#tile.getDOM().dataset.zeroETV = false;
		} else if (parseFloat(etv1) == 0 || parseFloat(etv2) == 0) {
			logger.add("Toolbar: processHighlight: zeroETV");
			this.#tile.getDOM().dataset.zeroETV = true;
			this.#tile.getDOM().dataset.unknownETV = false;
		} else {
			this.#tile.getDOM().dataset.zeroETV = false;
			this.#tile.getDOM().dataset.unknownETV = false;
		}

		logger.add("Toolbar: processHighlight: colorize");
		this.#tile.colorizeHighlight();
	}

	//Create the order widget part of the toolbar
	//Can ben called by bootloader when receiving order messages
	async createOrderWidget(status = null) {
		if (status !== null) {
			// Get the current order info
			let success = status ? this.#tile.getOrderSuccess() + 1 : this.#tile.getOrderSuccess();
			let failed = !status ? this.#tile.getOrderFailed() + 1 : this.#tile.getOrderFailed();
			this.#tile.setOrders(success, failed);
		}

		// Generate the HTML for the widget
		let prom = await Tpl.loadFile("view/widget_order.html");
		Tpl.setVar("order_success", "-");
		Tpl.setVar("order_failed", "-");
		let content = Tpl.render(prom, false);
		return content;
	}
}

export { Toolbar };
