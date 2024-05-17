class BrendaAnnounceQueue {
	constructor() {
		this.MAX_QUEUE_LENGTH = 5;
		this.DEFAULT_RATE_LIMIT_SECS = 10;

		this.queue = [];
		this.url = "https://api.llamastories.com/brenda/product";
		this.responseStatusTemplates = {
			200: "{asin} has been successfully announced to Brenda.",
			401: "API Token invalid, please go in the extension settings to correct it.",
			422: "Unprocessable entity. The request was malformed and rejected.",
			429: "Hit rate limit, backing off, will retry.",
			default: "The announce has failed for an unknown reason.",
		};
		this.rateLimitSecs = this.DEFAULT_RATE_LIMIT_SECS;
		this.lastProcessTime = 0;
		this.queueTimer = null;
		this.isProcessing = false;
	}

	async announce(asin, etv, queue) {
		if (this.queue.length >= this.MAX_QUEUE_LENGTH) {
			await Notifications.pushNotification(
				new ScreenNotification({
					title: "Announce to Brenda",
					lifespan: 10,
					content: "The announcement queue is full, not everything should be shared. Please be selective.",
				})
			);
			return;
		}

		this.queue.push({ asin, etv, queue });

		if (this.queueTimer !== null || this.isProcessing) {
			return;
		}

		const queueTimeout =
			this.lastProcessTime && this.lastProcessTime + this.rateLimitSecs * 1000 > Date.now()
				? Date.now() - this.lastProcessTime + this.rateLimitSecs * 1000
				: 0;
		this.queueTimer = setTimeout(this.process.bind(this), queueTimeout);
	}

	async process() {
		if (this.queue.length == 0) {
			this.queueTimer = null;
			return;
		}
		this.isProcessing = true;

		const item = this.queue.shift();
		let message = this.responseStatusTemplates.default;
		try {
			const { status } = await fetch(this.url, {
				method: "PUT",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					version: 1,
					token: appSettings.discord.guid,
					domain: "amazon." + vineDomain,
					tab: item.queue,
					asin: item.asin,
					etv: item.etv,
				}),
			});

			if (status === 429) {
				this.queue.unshift(item);
				this.rateLimitCount++;
			} else {
				this.rateLimitCount = this.rateLimitCount > 0 ? this.rateLimitCount - 1 : 0;
			}
			this.rateLimitSecs = (this.rateLimitCount + 1) * this.DEFAULT_RATE_LIMIT_SECS;
			message = this.responseStatusTemplates[status] || this.responseStatusTemplates.default;
		} catch (error) {
			console.error(error);
			this.queue.unshift(item);
		}

		this.queueTimer = setTimeout(this.process.bind(this), this.rateLimitSecs * 1000);
		this.isProcessing = false;
		this.lastProcessTime = Date.now();

		// Replace placeholders in the message
		message = message.replace("{asin}", item.asin);
		await Notifications.pushNotification(
			new ScreenNotification({
				title: "Announce to Brenda",
				lifespan: 10,
				content: message,
			})
		);
	}
}

if (typeof window.BrendaAnnounceQueue === "undefined") {
	window.BrendaAnnounceQueue = new BrendaAnnounceQueue();
}

class Toolbar {
	constructor(tileInstance) {
		this.pTile = tileInstance;
		this.pTile.setToolbar(this);
	}

	//Create the bare bone structure of the toolbar
	async createProductToolbar() {
		let toolbarId = "vh-toolbar-" + this.pTile.getAsin();
		let anchorTo = this.pTile.getDOM().children[0]; //.vvp-item-tile-content should be the first child

		//Load the toolbar template
		showRuntime("DRAW: Creating #" + toolbarId);
		const prom = await Tpl.loadFile("view/toolbar.html");
		Tpl.setVar("toolbarId", toolbarId);
		Tpl.setVar("asin", this.pTile.getAsin());
		Tpl.setIf(
			"announce",
			appSettings.discord.active && appSettings.discord.guid != null && vineQueue != null && vineSearch == false
		);
		Tpl.setIf("favourite", appSettings.favouriteTab?.active);
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

		if (appSettings.unavailableTab.active || appSettings.unavailableTab.votingToolbar) {
			$("<div />")
				.addClass("vh-icon vh-icon-loading")
				.prependTo("#" + toolbarId + " .vh-status-container");
		}

		//If the voting system is off, only the icons have to be shown
		if (!appSettings.unavailableTab.active && !appSettings.unavailableTab.votingToolbar) {
			pToolbar.classList.add("toolbar-icon-only");
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

		//Favourite event handler
		if (appSettings.favouriteTab?.active) {
			let h = $("#vh-favourite-link-" + this.pTile.getAsin());
			h.on("click", { asin: this.pTile.getAsin() }, async function (event) {
				//A hide/display item button was pressed
				let asin = event.data.asin;
				let tile = getTileByAsin(asin);

				//Get the item title, thumbnail
				let title = tile.getTitle();
				let thumbnail = tile.getThumbnail();

				FavouriteList.addItem(asin, title, thumbnail);
				addFavouriteTile(asin, title, thumbnail); //grid.js
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
		icon.removeClass("vh-icon-sad");
		icon.removeClass("vh-icon-happy");
		icon.removeClass("vh-icon-loading");
		icon.removeClass("vh-icon-order-success");
		icon.removeClass("vh-icon-order-failed");

		icon.addClass(iconClass);
	}

	setETV(etv1, etv2, onlyIfEmpty = false) {
		let context = $("#vh-toolbar-" + this.pTile.getAsin());
		let span = $(context).find(".vh-toolbar-etv .etv");

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

	//This method is called from bootloader.js, serverResponse() when the voting data has been received, after the tile was moved.
	async updateToolbar() {
		showRuntime("DRAW-UPDATE-TOOLBAR: Updating #vh-toolbar-" + this.pTile.getAsin());
		let context = $("#vh-toolbar-" + this.pTile.getAsin());

		if (context.length == 0) {
			showRuntime("! Could not find #vh-toolbar-" + this.pTile.getAsin());
			return;
		}
		let tileOpacity;
		let statusColor;

		//If the hidden tab system is activated, update the visibility icon
		if (appSettings.hiddenTab.active) this.updateVisibilityIcon();

		//Set the icons
		showRuntime("DRAW-UPDATE-TOOLBAR: Setting icon status");
		switch (this.pTile.getStatus()) {
			case DISCARDED_ORDER_FAILED:
				this.setStatusIcon("vh-icon-order-failed");
				break;
			case DISCARDED_WITH_FEES:
			case DISCARDED_OWN_VOTE:
				this.setStatusIcon("vh-icon-sad");
				break;
			case NOT_DISCARDED_ORDER_SUCCESS:
				this.setStatusIcon("vh-icon-order-success");
				break;
			case NOT_DISCARDED_NO_FEES:
			case NOT_DISCARDED_OWN_VOTE:
				this.setStatusIcon("vh-icon-happy");
				break;
			case NOT_DISCARDED_NO_STATUS:
				//The item is not registered or needs more votes
				this.setStatusIcon("vh-icon-info");
				break;
		}

		//Set other properties
		showRuntime("DRAW-UPDATE-TOOLBAR: Setting status related properties");
		switch (this.pTile.getStatus()) {
			case DISCARDED_ORDER_FAILED:
			case DISCARDED_WITH_FEES:
			case DISCARDED_OWN_VOTE:
				statusColor = "vh-background-fees";
				tileOpacity = appSettings.unavailableTab.unavailableOpacity / 100;

				if (appSettings.discord.active) $("#vh-announce-link-" + this.pTile.getAsin()).hide();
				break;
			case NOT_DISCARDED_ORDER_SUCCESS:
			case NOT_DISCARDED_NO_FEES:
			case NOT_DISCARDED_OWN_VOTE:
				statusColor = "vh-background-nofees";
				tileOpacity = 1.0;
				break;
			case NOT_DISCARDED_NO_STATUS:
				//The item is not registered or needs more votes
				statusColor = "vh-background-neutral";
				tileOpacity = 1.0;
				break;
		}

		if (appSettings.unavailableTab.compactToolbar) {
			//No icon, no text
			this.setStatusIcon("");
			context.addClass("compact");
			context.addClass(statusColor);
		}

		$(this.pTile.getDOM()).css("opacity", tileOpacity);

		//Display voting system if active.
		if (appSettings.unavailableTab.active || appSettings.unavailableTab.votingToolbar) {
			if (this.pTile.wasOrdered()) {
				showRuntime("DRAW-UPDATE-TOOLBAR: Create order widget");
				await this.createOrderWidget();
			} else if (appSettings.unavailableTab.votingToolbar) {
				showRuntime("DRAW-UPDATE-TOOLBAR: Create voting widget");
				await this.createVotingWidget();
			} else {
				showRuntime("DRAW-UPDATE-TOOLBAR: Create order widget (#2)");
				await this.createOrderWidget();
			}
		}
	}

	//Create the voting widget part of the toolbar
	async createVotingWidget() {
		let context = $("#vh-toolbar-" + this.pTile.getAsin());
		let container = $(context).find("div.vh-status-container2");

		//Remove any previous voting widget, we will create a new one.
		$(container).children(".vh-order-widget").remove();
		$(container).children(".vh-voting-widget").remove();

		//Generate the html for the voting widget
		let prom = await Tpl.loadFile("view/widget_voting.html");
		Tpl.setVar("asin", this.pTile.getAsin());
		Tpl.setVar("vote_no_fees", this.pTile.getVoteNoFees());
		Tpl.setVar("vote_with_fees", this.pTile.getVoteFees());
		Tpl.setIf("selected_yes", this.pTile.getVoteOwn() == 0);
		Tpl.setIf("selected_no", this.pTile.getVoteOwn() == 1);
		Tpl.setIf("not_compact", !appSettings.unavailableTab.compactToolbar);
		let content = Tpl.render(prom);
		$(content).appendTo(container);

		if (appSettings.thorvarium.smallItems) {
			$(".compact div.vh-voting-widget").css("clear", "both");
		}

		//Bind the click events
		context.find(".vh-reportlink-bad").on("click", { asin: this.pTile.getAsin(), fees: 1 }, reportfees);
		context.find(".vh-reportlink-good").on("click", { asin: this.pTile.getAsin(), fees: 0 }, reportfees);

		//Make the widget transparent if the user voted "no fees"
		//Note: If we voted "fees", the entire card will be transparent.
		//      If we have not voted, we want the option to remain visible.
		context.find(".vh-voting-widget").css("opacity", this.pTile.getVoteOwn() != null ? 0.4 : 1.0);
	}

	//Create the order widget part of the toolbar
	//Can ben called by bootloader when receiving order messages
	async createOrderWidget(status = null) {
		if (status != null) {
			//Get the current order info
			let success = status ? this.pTile.getOrderSuccess() + 1 : this.pTile.getOrderSuccess();
			let failed = !status ? this.pTile.getOrderFailed() + 1 : this.pTile.getOrderFailed();
			pTile.setOrders(success, failed);
		}

		let context = $("#vh-toolbar-" + this.pTile.getAsin());
		let container = $(context).find("div.vh-status-container2");

		//Remove any previous order widget, we will create a new one.
		$(container).children(".vh-order-widget").remove();
		$(container).children(".vh-voting-widget").remove();

		//Generate the HTML for the widget
		prom = await Tpl.loadFile("view/widget_order.html");
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

	let note = new ScreenNotification();
	note.title = "Announce to Brenda";
	note.lifespan = 10;
	note.content =
		"Sending this product " + event.data.asin + " from the " + vineQueueAbbr + " queue to Brenda over on discord";
	await Notifications.pushNotification(note);

	//Visually deactivate this item, will be reset on the next page load, but it's just to help navigation and avoid double-clicking
	$(this).off("click");
	$(this).css("opacity", "0.3");
}
