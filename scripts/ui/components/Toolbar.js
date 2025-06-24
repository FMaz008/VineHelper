import { Logger } from "/scripts/core/utils/Logger.js";
var logger = new Logger();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();

import { Environment } from "/scripts/core/services/Environment.js";
var env = new Environment();

import { ModalMgr } from "/scripts/ui/controllers/ModalMgr.js";
var dialogMgr = new ModalMgr();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
var i13n = new Internationalization();

import { Item } from "/scripts/core/models/Item.js";

import { PinnedListMgr } from "/scripts/core/services/PinnedListMgr.js";
var PinnedList = new PinnedListMgr();

import { getTileByAsin, addPinnedTile, removePinnedTile, updateTileCounts } from "/scripts/ui/components/Grid.js";

import { Template } from "/scripts/core/utils/Template.js";
var Tpl = new Template();

import { sharedKeywordMatcher } from "/scripts/core/utils/SharedKeywordMatcher.js";
import { escapeHTML } from "/scripts/core/utils/StringHelper.js";
import { BrendaAnnounceQueue } from "/scripts/core/services/BrendaAnnounce.js";
var brendaAnnounceQueue = new BrendaAnnounceQueue();

import { ScreenNotifier, ScreenNotification } from "/scripts/ui/components/ScreenNotifier.js";
var Notifications = new ScreenNotifier();

class Toolbar {
	#tile;
	#toolbarDOM;

	#pinDebounceTimer = null;
	#pinDebounceClickable = true;

	constructor(tileInstance) {
		this.#tile = tileInstance;
		this.#tile.setToolbar(this);
	}

	//Create the bare bone structure of the toolbar
	async createProductToolbar() {
		// Use a fallback ID if ASIN is not available
		const asin = this.#tile.getAsin() || `no-asin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const toolbarId = "vh-toolbar-" + asin;
		let anchorTo = this.#tile.getDOM().querySelector(".vvp-item-tile-content"); //.vvp-item-tile-content should be the first child
		
		if (!anchorTo) {
			throw new Error("Cannot find .vvp-item-tile-content to attach toolbar");
		}

		//Load the toolbar template
		logger.add("DRAW: Creating #" + toolbarId);
		const prom = await Tpl.loadFile("scripts/ui/templates/toolbar.html");
		Tpl.setVar("toolbarId", toolbarId);
		Tpl.setVar("asin", asin);
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
		Tpl.setIf("details", Settings.get("general.detailsIcon"));
		Tpl.setIf("pinned", Settings.get("pinnedTab.active"));
		Tpl.setVar("pinnedClass", this.#tile.isPinned() ? "vh-icon-unpin" : "vh-icon-pin");
		Tpl.setIf("toggleview", Settings.get("hiddenTab.active"));
		this.#toolbarDOM = Tpl.render(prom, true);

		//Attach the toolbar to the tile's .vvp-item-tile-content container.
		anchorTo.insertAdjacentElement("afterbegin", this.#toolbarDOM);
		const container = this.#toolbarDOM.querySelector(`.vh-status-container`);
		if (container) {
			container.style.backgroundColor = Settings.get("general.toolbarBackgroundColor");
		}

		const container2 = this.#toolbarDOM.querySelector(`.vh-status-container2`);

		const etvToolbar = this.#toolbarDOM.querySelector(`.vh-toolbar-etv`);
		if (etvToolbar) {
			etvToolbar.style.display = "none";
		}

		// Activate the announce button when the ETV is set (changed)
		const etvElements = container2.querySelectorAll(".etv");
		etvElements.forEach((etv) => {
			// Create the click handler outside the change event
			const announceClickHandler = async (e) => {
				e.preventDefault();

				if (env.data.vineQueue == null) throw new Exception("Cannot announce an item in an unknown queue.");

				const etvElement = this.#tile.getDOM().querySelector(".etv");
				if (!etvElement) {
					logger.add(`TOOLBAR: Cannot find .etv element for announcement - ASIN: ${this.#tile.getAsin()}`);
					return;
				}
				let etv = etvElement.textContent;

				// In case of price range, only send the highest value
				etv = etv.split("-").pop();
				etv = Number(etv.replace(/[^0-9-.]+/g, ""));

				brendaAnnounceQueue.announce(this.#tile.getAsin(), etv, env.data.vineQueue, i13n.getDomainTLD());

				if (!Settings.get("notification.reduce")) {
					let note = new ScreenNotification();
					note.title = "Announce to Brenda";
					note.lifespan = 10;
					note.content = `Sending this product ${this.#tile.getAsin()} from the ${env.data.vineQueueAbbr} queue to Brenda over on discord`;
					await Notifications.pushNotification(note);
				}

				// Visually deactivate this item
				let tileDOM = this.#tile.getDOM();
				let announcementIcon = tileDOM.querySelector(".vh-icon-announcement");
				if (announcementIcon) {
					let parentAnchor = announcementIcon.parentElement;
					if (parentAnchor && parentAnchor.tagName === "A") {
						parentAnchor.removeEventListener("click", announceClickHandler);
						parentAnchor.style.opacity = "0.3";
					}
				}
			};

			etv.addEventListener("change", (event) => {
				if (event.currentTarget.textContent === "") return false;
				if (env.data.vineSearch) return false;

				let tileDOM = this.#tile.getDOM();
				let announcementIcon = tileDOM.querySelector(".vh-icon-announcement");

				if (announcementIcon) {
					announcementIcon.style.opacity = "1";
					let parentAnchor = announcementIcon.parentElement;
					if (parentAnchor && parentAnchor.tagName === "A") {
						// Only add the click handler once
						parentAnchor.removeEventListener("click", announceClickHandler);
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

		//Details icon
		if (Settings.get("general.detailsIcon")) {
			let detailsIcon = this.#toolbarDOM.querySelector(`#vh-details-link-${this.#tile.getAsin()}`);
			if (detailsIcon) {
				detailsIcon.addEventListener("click", async (event) => {
					//Get the details from the parent dom element matching .vvp-item-tile
					let tileDOM = this.#tile.getDOM();
					let details = tileDOM.closest(".vvp-item-tile").dataset;

					//Display modal windows with the details.
					let m = dialogMgr.newModal("item-details-" + this.#tile.getAsin());
					m.title = "Item " + this.#tile.getAsin();
					m.content = `
			<ul style="margin-bottom: 10px;">
				<li>First Seen: ${details.date}</li>
				<li>Highlight Keyword matching: ${details.highlightedKeyword}</li>
				<li>Hide Keyword matching: ${details.hideKeyword}</li>
				<li>Blur Keyword matching: ${details.blurredKeyword}</li>
			</ul>
		`;
					m.show();
				});
			}
		}

		//Pinned items event handler
		if (Settings.get("pinnedTab.active")) {
			let h2 = document.getElementById(`vh-pin-link-${this.#tile.getAsin()}`);

			if (h2) {
				h2.addEventListener("click", async (event) => {
					const target = event.target;
					//Debounce the pin click event
					if (!this.#pinDebounceClickable) {
						return false;
					}
					this.#pinDebounceClickable = false;
					target.classList.add("vh-disabled"); //Visually disable the pin click
					this.#pinDebounceTimer = setTimeout(async () => {
						this.#pinDebounceClickable = true;
						target.classList.remove("vh-disabled");
						clearTimeout(this.#pinDebounceTimer);
					}, 1000);
					//End of debounce

					// A hide/display item button was pressed
					let asin = this.#tile.getAsin(); // Directly access ASIN
					let tile = getTileByAsin(asin);

					// Get the item title and thumbnail
					let title = tile.getTitle();
					let thumbnail = tile.getThumbnail();

					const btn = document.querySelector(`input[data-asin="${asin}"]`);

					if (btn) {
						//Check if the item is already pinned
						if (tile.isPinned()) {
							//Unpin the item
							tile.setPinned(false);
							await removePinnedTile(asin); //grid.js
						} else {
							//Pin the item
							tile.setPinned(true);
							const is_parent_asin = btn.dataset.isParentAsin;
							const enrollment_guid = btn.dataset.recommendationId.match(
								/#vine\.enrollment\.([a-f0-9-]+)/i
							)[1];

							try {
								const item = new Item({
									asin: asin,
									queue: env.data.vineQueue,
									title: title,
									img_url: thumbnail,
									is_parent_asin: is_parent_asin,
									enrollment_guid: enrollment_guid,
								});
								PinnedList.addItem(item);
								await addPinnedTile(item); // grid.js
							} catch (error) {
								console.error("[Toolbar] Cannot create item for pinning -", error.message, {
									source: "pin button click",
									asin: asin,
									queue: env.data.vineQueue,
									is_parent_asin: is_parent_asin,
									enrollment_guid: enrollment_guid,
								});
							}
						}

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

		if (!this.#toolbarDOM) {
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
		// Check if toolbar DOM exists
		if (!this.#toolbarDOM) {
			logger.add(`TOOLBAR: Cannot set ETV - toolbar DOM is null for ASIN: ${this.#tile.getAsin()}`);
			return false;
		}
		
		let span = this.#toolbarDOM.querySelector(".vh-toolbar-etv .etv");
		
		// Check if the ETV span exists
		if (!span) {
			logger.add(`TOOLBAR: Cannot set ETV - .vh-toolbar-etv .etv not found for ASIN: ${this.#tile.getAsin()}`);
			return false;
		}

		if (onlyIfEmpty && span.textContent !== "") {
			return false;
		}

		const formattedETV1 = new Intl.NumberFormat(i13n.getLocale(), {
			style: "currency",
			currency: i13n.getCurrency(),
		}).format(etv1);
		const formattedETV2 = new Intl.NumberFormat(i13n.getLocale(), {
			style: "currency",
			currency: i13n.getCurrency(),
		}).format(etv2);

		const oldETV = span.textContent;
		const newETV = etv1 === etv2 ? formattedETV2 : `${formattedETV1}-${formattedETV2}`;
		span.textContent = newETV;

		this.processHighlight(etv1, etv2);

		// Trigger change event manually
		let changeEvent = new Event("change", { bubbles: true });
		span.dispatchEvent(changeEvent);

		if (Settings.get("general.displayETV")) {
			const etvToolbar = this.#toolbarDOM.querySelector(".vh-toolbar-etv");
			if (etvToolbar) {
				etvToolbar.style.display = "flex";
			}
		}
	}

	unknownETV() {
		this.processHighlight(null, null);
	}

	//Why is this method in the toolbar class and not the tile class? Who coded this?!
	processHighlight(etv1, etv2) {
		logger.add("Toolbar: processHighlight");

		let checkHideList = false;
		let match;
		const oldHighlight = this.#tile.getDOM().dataset.highlightedKeyword;
		this.#tile.getDOM().dataset.highlightedKeyword = "";
		const highlightKeywords = Settings.get("general.highlightKeywords");
		if (highlightKeywords?.length > 0) {
			// Debug logging
			const title = this.#tile.getTitle();
			const asin = this.#tile.getAsin();
			if (Settings.get("general.debugKeywords")) {
				console.log("[Toolbar] Processing highlight for item:", {
					asin: asin,
					title: title.substring(0, 100) + (title.length > 100 ? "..." : ""),
					keywordsCount: highlightKeywords.length,
				});
			}

			// SharedKeywordMatcher handles compilation internally
			match = sharedKeywordMatcher.match(highlightKeywords, title, etv1, etv2, "highlight", Settings);
			if (!match) {
				logger.add("Toolbar: processHighlight: no match");
				//No match now, remove the highlight
				this.#tile.getDOM().dataset.keywordHighlight = false;
				this.#tile.getDOM().dataset.typeHighlight = "0";

				checkHideList = true;
			} else {
				logger.add("Toolbar: processHighlight: match");
				//Match found, keep the highlight
				const matchString = typeof match === "object" ? match.contains || match.word || "" : match;

				if (Settings.get("general.debugKeywords")) {
					console.log("[Toolbar] Highlight match found:", {
						asin: this.#tile.getAsin(),
						title: this.#tile.getTitle().substring(0, 100),
						matchedKeyword: matchString,
						matchObject: match,
					});
				}

				this.#tile.getDOM().dataset.highlightedKeyword = escapeHTML(matchString);
				this.#tile.getDOM().dataset.keywordHighlight = true;
				this.#tile.getDOM().dataset.typeHighlight = "1";

				if (Settings.get("general.highlightKWFirst") && !oldHighlight) {
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
			this.#tile.getDOM().dataset.typeHighlight = "0";
			checkHideList = true;
		}

		this.#tile.getDOM().dataset.hideKeyword = "";
		if (checkHideList) {
			//Check if the item should be hidden
			const hideKeywords = Settings.get("general.hideKeywords");
			if (Settings.get("hiddenTab.active") && hideKeywords?.length > 0) {
				// SharedKeywordMatcher handles compilation internally
				match = sharedKeywordMatcher.match(hideKeywords, this.#tile.getTitle(), etv1, etv2, "hide", Settings);
				if (match) {
					logger.add("Toolbar: processHide: hide match");
					this.#tile.hideTile(false, false, true); //Do not save, skip the hidden manager: just move the tile.

					document.getElementById("vh-hide-link-" + this.#tile.getAsin()).style.display = "none";

					//Add a data-hide-keyword attribute to the tile
					const hideMatchString = typeof match === "object" ? match.contains || match.word || "" : match;
					this.#tile.getDOM().dataset.hideKeyword = escapeHTML(hideMatchString);
				}
			}
		}

		if (etv1 === null && etv2 === null) {
			logger.add("Toolbar: processHighlight: unknownETV");
			this.#tile.getDOM().dataset.unknownETV = true;
			this.#tile.getDOM().dataset.zeroETV = false;
			this.#tile.getDOM().dataset.typeUnknownETV = "1";
			this.#tile.getDOM().dataset.typeZeroETV = "0";
		} else if (parseFloat(etv1) == 0 || parseFloat(etv2) == 0) {
			logger.add("Toolbar: processHighlight: zeroETV");
			this.#tile.getDOM().dataset.zeroETV = true;
			this.#tile.getDOM().dataset.unknownETV = false;
			this.#tile.getDOM().dataset.typeZeroETV = "1";
			this.#tile.getDOM().dataset.typeUnknownETV = "0";
		} else {
			this.#tile.getDOM().dataset.zeroETV = false;
			this.#tile.getDOM().dataset.unknownETV = false;
			this.#tile.getDOM().dataset.typeZeroETV = "0";
			this.#tile.getDOM().dataset.typeUnknownETV = "0";
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
		let prom = await Tpl.loadFile("scripts/ui/templates/widget_order.html");
		Tpl.setVar("order_success", "-");
		Tpl.setVar("order_failed", "-");
		let content = Tpl.render(prom, false);
		return content;
	}
}

export { Toolbar };
