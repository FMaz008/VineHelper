import { Logger } from "./Logger.js";
var logger = new Logger();

class Toolbar {
	#tile;

	constructor(tileInstance) {
		this.#tile = tileInstance;
		this.#tile.setToolbar(this);
	}

	//Create the bare bone structure of the toolbar
	async createProductToolbar() {
		let toolbarId = "vh-toolbar-" + this.#tile.getAsin();
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
				vineQueue != null &&
				vineSearch == false
		);
		Tpl.setIf("pinned", Settings.get("pinnedTab.active"));
		Tpl.setIf("toggleview", Settings.get("hiddenTab.active"));
		let pToolbar = Tpl.render(prom, true);

		//Attach the toolbar to the tile's .vvp-item-tile-content container.
		anchorTo.insertAdjacentElement("afterbegin", pToolbar);

		let container = document.querySelector(`#${toolbarId} .vh-status-container2`);
		document.querySelector(`#${toolbarId} .vh-toolbar-etv`).style.visibility = "hidden";

		// Activate the announce button when the ETV is set (changed)
		const etvElements = container.querySelectorAll(".etv");
		etvElements.forEach((etv) => {
			etv.addEventListener("change", (event) => {
				if (event.currentTarget.textContent === "") return false;
				if (vineSearch) return false;

				let tile = getTileByAsin(this.#tile.getAsin());
				let tileDOM = tile.getDOM();
				let announcementIcon = tileDOM.querySelector(".vh-icon-announcement");

				if (announcementIcon) {
					announcementIcon.style.opacity = "1";
					let parentAnchor = announcementIcon.parentElement;
					const announceClickHandler = async (e) => {
						e.preventDefault();

						if (vineQueue == null) throw new Exception("Cannot announce an item in an unknown queue.");

						let tile = getTileByAsin(this.#tile.getAsin());
						let etv = tile.getDOM().querySelector(".etv").textContent;

						// In case of price range, only send the highest value
						etv = etv.split("-").pop();
						etv = Number(etv.replace(/[^0-9-.]+/g, ""));

						window.BrendaAnnounceQueue.announce(this.#tile.getAsin(), etv, vineQueue, I13n.getDomainTLD());

						if (!Settings.get("notification.reduce")) {
							let note = new ScreenNotification();
							note.title = "Announce to Brenda";
							note.lifespan = 10;
							note.content = `Sending this product ${this.#tile.getAsin()} from the ${vineQueueAbbr} queue to Brenda over on discord`;
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

		if (Settings.get("unavailableTab.active")) {
			let loadingDiv = document.createElement("div");
			loadingDiv.classList.add("vh-icon", "vh-icon-loading");

			// Prepend the div to the specified container
			let container = document.querySelector(`#${toolbarId} .vh-status-container`);
			if (container) {
				container.insertBefore(loadingDiv, container.firstChild);
			}
		}

		//If the ordering system is off, only the icons have to be shown
		if (!Settings.get("unavailableTab.active")) {
			pToolbar.classList.add("vh-background-neutral");
		}

		//Display the hide link
		if (Settings.get("hiddenTab.active")) {
			let h = document.getElementById(`vh-hide-link-${this.#tile.getAsin()}`);
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

						PinnedList.addItem(asin, vineQueue, title, thumbnail, isParentAsin, enrollmentGUID);
						await addPinnedTile(asin, vineQueue, title, thumbnail, isParentAsin, enrollmentGUID); // grid.js

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

		let icon = document.querySelector(`#vh-hide-link-${this.#tile.getAsin()} div.vh-toolbar-icon`);
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
		let context = document.getElementById(`vh-toolbar-${this.#tile.getAsin()}`);
		let span = context.querySelector(".vh-toolbar-etv .etv");
		this.#tile.setETV(etv2);

		if (onlyIfEmpty && span.textContent !== "") return false;

		etv1 = new Intl.NumberFormat(I13n.getLocale(), {
			style: "currency",
			currency: I13n.getCurrency(),
		}).format(etv1);
		etv2 = new Intl.NumberFormat(I13n.getLocale(), {
			style: "currency",
			currency: I13n.getCurrency(),
		}).format(etv2);

		span.textContent = etv1 === etv2 ? etv2 : `${etv1}-${etv2}`;

		// Trigger change event manually
		let changeEvent = new Event("change", { bubbles: true });
		span.dispatchEvent(changeEvent);

		if (Settings.get("general.displayETV")) {
			context.querySelector(".vh-toolbar-etv").style.visibility = "visible";
		}
	}

	//This method is called from bootloader.js, serverResponse() when the data has been received, after the tile was moved.
	async updateToolbar() {
		logger.add(`DRAW-UPDATE-TOOLBAR: Updating #vh-toolbar-${this.#tile.getAsin()}`);
		let context = document.getElementById(`vh-toolbar-${this.#tile.getAsin()}`);

		if (!context) {
			logger.add(`! Could not find #vh-toolbar-${this.#tile.getAsin()}`);
			return;
		}

		let statusColor;

		// If the hidden tab system is activated, update the visibility icon
		if (Settings.get("hiddenTab.active")) {
			this.updateVisibilityIcon();
		}

		// Set the icons
		logger.add("DRAW-UPDATE-TOOLBAR: Setting icon status");
		switch (this.#tile.getStatus()) {
			case DISCARDED_ORDER_FAILED:
				statusColor = "vh-background-fees";
				break;
			case NOT_DISCARDED_ORDER_SUCCESS:
				statusColor = "vh-background-nofees";
				break;
			case NOT_DISCARDED:
				statusColor = "vh-background-neutral";
				break;
		}

		context.classList.add(statusColor);

		// Display voting system if active
		if (Settings.get("unavailableTab.active")) {
			logger.add("DRAW-UPDATE-TOOLBAR: Create order widget");
			await this.createOrderWidget();
		}
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

		let context = document.getElementById(`vh-toolbar-${this.#tile.getAsin()}`);
		let container = context.querySelector("div.vh-status-container");

		// Remove any previous order widget
		container.querySelectorAll(".vh-order-widget").forEach((widget) => widget.remove());

		// Generate the HTML for the widget
		let prom = await Tpl.loadFile("view/widget_order.html");
		Tpl.setVar("order_success", this.#tile.getOrderSuccess());
		Tpl.setVar("order_failed", this.#tile.getOrderFailed());
		let content = Tpl.render(prom, true);
		container.appendChild(content);

		if (Settings.get("thorvarium.smallItems")) {
			document.querySelectorAll(".vh-status div.vh-order-widget").forEach((widget) => {
				widget.style.clear = "both";
			});
		}
	}
}

export { Toolbar };
