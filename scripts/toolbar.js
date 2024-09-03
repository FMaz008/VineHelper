class Toolbar {
	constructor(tileInstance) {
		this.pTile = tileInstance;
		this.pTile.setToolbar(this);
	}

	//Create the bare bone structure of the toolbar
	async createProductToolbar() {
		let toolbarId = "vh-toolbar-" + this.pTile.getAsin();
		let anchorTo = this.pTile.getDOM().querySelector(".vvp-item-tile-content"); //.vvp-item-tile-content should be the first child

		//Load the toolbar template
		showRuntime("DRAW: Creating #" + toolbarId);
		const prom = await Tpl.loadFile("view/toolbar.html");
		Tpl.setVar("toolbarId", toolbarId);
		Tpl.setVar("asin", this.pTile.getAsin());
		Tpl.setIf(
			"announce",
			appSettings.discord.active && appSettings.discord.guid != null && vineQueue != null && vineSearch == false
		);
		Tpl.setIf("pinned", appSettings.pinnedTab?.active);
		Tpl.setIf("toggleview", appSettings.hiddenTab.active);
		let pToolbar = Tpl.render(prom, true);

		//Attach the toolbar to the tile's .vvp-item-tile-content container.
		anchorTo.insertAdjacentElement("afterbegin", pToolbar);

		let container = $("#" + toolbarId + " .vh-status-container2");
		$("#" + toolbarId + " .vh-toolbar-etv").hide();

		//Activate the announce button when the ETV is set (changed)
		container.find(".etv").on("change", { asin: this.pTile.getAsin() }, (event) => {
			if (event.currentTarget.innerText == "") return false;
			if (vineSearch == true) return false;

			let tile = getTileByAsin(event.data.asin);
			$(tile.getDOM())
				.find(".vh-icon-announcement")
				.css("opacity", "1")
				.parent("a")
				.off("click")
				.on("click", { asin: this.pTile.getAsin() }, announceItem);
		});

		//It the small tiles will be shown, hide the ETV icon to gain space
		if (
			appSettings.thorvarium.smallItems ||
			appSettings.thorvarium.mobileios ||
			appSettings.thorvarium.mobileandroid
		) {
			$(".vh-icon-etv").hide();
		}

		if (appSettings.unavailableTab.compactToolbar) {
			pToolbar.classList.add("compact");
		}

		if (appSettings.unavailableTab.active) {
			$("<div />")
				.addClass("vh-icon vh-icon-loading")
				.prependTo("#" + toolbarId + " .vh-status-container");
		}

		//If the ordering system is off, only the icons have to be shown
		if (!appSettings.unavailableTab.active) {
			pToolbar.classList.add("vh-background-neutral");
		}

		//Display the hide link
		if (appSettings.hiddenTab.active) {
			let h = $("#vh-hide-link-" + this.pTile.getAsin());
			h.on("click", { asin: this.pTile.getAsin() }, async function (event) {
				//A hide/display item button was pressed
				let asin = event.data.asin;
				let tile = getTileByAsin(asin);
				let gridId = tile.getGridId();

				switch (
					gridId //Current Grid
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

			this.updateVisibilityIcon();
		}

		//Pinned items event handler
		if (appSettings.pinnedTab?.active) {
			let h = $("#vh-pin-link-" + this.pTile.getAsin());
			h.on("click", { asin: this.pTile.getAsin() }, async function (event) {
				this.style.opacity = 0.3;

				//A hide/display item button was pressed
				let asin = event.data.asin;
				let tile = getTileByAsin(asin);

				//Get the item title, thumbnail
				let title = tile.getTitle();
				let thumbnail = tile.getThumbnail();
				const btn = document.querySelector(`input[data-asin="${asin}"]`);
				const isParentAsin = btn.dataset.isParentAsin;
				const enrollmentGUID = btn.dataset.recommendationId.match(/#vine\.enrollment\.([a-f0-9-]+)/i)[1];

				PinnedList.addItem(asin, title, thumbnail, isParentAsin, enrollmentGUID);
				await addPinnedTile(asin, title, thumbnail, isParentAsin, enrollmentGUID); //grid.js

				updateTileCounts();
			});
		}
	}

	updateVisibilityIcon() {
		if (!appSettings.hiddenTab.active) return false;

		let icon = $("#vh-hide-link-" + this.pTile.getAsin() + " div.vh-toolbar-icon");
		let gridId = this.pTile.getGridId();

		icon.removeClass("vh-icon-hide");
		icon.removeClass("vh-icon-show");
		switch (gridId) {
			case "vvp-items-grid":
			case "tab-unavailable":
				icon.addClass("vh-icon-hide");
				break;
			case "tab-hidden":
				icon.addClass("vh-icon-show");
				break;
		}
	}

	setStatusIcon(iconClass) {
		let context = $("#vh-toolbar-" + this.pTile.getAsin());
		let icon = $(context).find(".vh-icon");

		//Remove all images for the icon
		icon.removeClass("vh-icon-info");
		icon.removeClass("vh-icon-loading");
		icon.removeClass("vh-icon-order-success");
		icon.removeClass("vh-icon-order-failed");

		icon.addClass(iconClass);
	}

	setETV(etv1, etv2, onlyIfEmpty = false) {
		let context = $("#vh-toolbar-" + this.pTile.getAsin());
		let span = $(context).find(".vh-toolbar-etv .etv");

		this.pTile.setETV(etv2);

		if (onlyIfEmpty && span.text() != "") return false;

		etv1 = new Intl.NumberFormat(vineLocale, {
			style: "currency",
			currency: vineCurrency,
		}).format(etv1);
		etv2 = new Intl.NumberFormat(vineLocale, {
			style: "currency",
			currency: vineCurrency,
		}).format(etv2);
		if (etv1 == etv2) {
			span.text(etv2);
		} else {
			span.text(etv1 + "-" + etv2);
		}
		span.trigger("change");

		if (appSettings.general.displayETV) context.find(".vh-toolbar-etv").show();
	}

	//This method is called from bootloader.js, serverResponse() when the data has been received, after the tile was moved.
	async updateToolbar() {
		showRuntime("DRAW-UPDATE-TOOLBAR: Updating #vh-toolbar-" + this.pTile.getAsin());
		let context = $("#vh-toolbar-" + this.pTile.getAsin());

		if (context.length == 0) {
			showRuntime("! Could not find #vh-toolbar-" + this.pTile.getAsin());
			return;
		}
		let statusColor;

		//If the hidden tab system is activated, update the visibility icon
		if (appSettings.hiddenTab.active) this.updateVisibilityIcon();

		//Set the icons
		showRuntime("DRAW-UPDATE-TOOLBAR: Setting icon status");
		switch (this.pTile.getStatus()) {
			case DISCARDED_ORDER_FAILED:
				this.setStatusIcon("vh-icon-order-failed");
				statusColor = "vh-background-fees";
				break;
			case NOT_DISCARDED_ORDER_SUCCESS:
				this.setStatusIcon("vh-icon-order-success");
				statusColor = "vh-background-nofees";
				//tileOpacity = 1.0;
				break;

			case NOT_DISCARDED:
				//The item is not registered
				this.setStatusIcon("vh-icon-info");
				statusColor = "vh-background-neutral";
				//tileOpacity = 1.0;
				break;
		}

		if (appSettings.unavailableTab.compactToolbar) {
			//No icon, no text
			this.setStatusIcon("");
			context.addClass("compact");
			context.addClass(statusColor);
		}

		//$(this.pTile.getDOM()).css("opacity", tileOpacity);

		//Display voting system if active.
		if (appSettings.unavailableTab.active) {
			showRuntime("DRAW-UPDATE-TOOLBAR: Create order widget");
			await this.createOrderWidget();
		}
	}

	//Create the order widget part of the toolbar
	//Can ben called by bootloader when receiving order messages
	async createOrderWidget(status = null) {
		if (status != null) {
			//Get the current order info
			let success = status ? this.pTile.getOrderSuccess() + 1 : this.pTile.getOrderSuccess();
			let failed = !status ? this.pTile.getOrderFailed() + 1 : this.pTile.getOrderFailed();
			this.pTile.setOrders(success, failed);
		}

		let context = $("#vh-toolbar-" + this.pTile.getAsin());
		let container = $(context).find("div.vh-status-container2");

		//Remove any previous order widget, we will create a new one.
		$(container).children(".vh-order-widget").remove();

		//Generate the HTML for the widget
		let prom = await Tpl.loadFile("view/widget_order.html");
		Tpl.setVar("order_success", this.pTile.getOrderSuccess());
		Tpl.setVar("order_failed", this.pTile.getOrderFailed());
		Tpl.setIf("not-compact", !appSettings.unavailableTab.compactToolbar);
		let content = Tpl.render(prom);
		$(content).appendTo(container);

		if (appSettings.thorvarium.smallItems) {
			$(".compact div.vh-order-widget").css("clear", "both");
		}
	}
}

async function announceItem(event) {
	if (vineQueue == null) throw new Exception("Cannot announce an item in an unknown queue.");

	let tile = getTileByAsin(event.data.asin);
	let etv = $(tile.getDOM()).find(".etv").text();

	//In case of price range, only send the highest value.
	etv = etv.split("-").pop();
	etv = Number(etv.replace(/[^0-9-.]+/g, ""));

	window.BrendaAnnounceQueue.announce(event.data.asin, etv, vineQueue);

	if (!appSettings.notification.reduce) {
		let note = new ScreenNotification();
		note.title = "Announce to Brenda";
		note.lifespan = 10;
		note.content =
			"Sending this product " +
			event.data.asin +
			" from the " +
			vineQueueAbbr +
			" queue to Brenda over on discord";
		await Notifications.pushNotification(note);
	}

	//Visually deactivate this item, will be reset on the next page load, but it's just to help navigation and avoid double-clicking
	$(this).off("click");
	$(this).css("opacity", "0.3");
}
