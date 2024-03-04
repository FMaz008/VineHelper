var timeoutHandle;

function Tile(obj, gridInstance) {
	//private properties
	var pTile = obj;
	var pAsin = findasin();
	var pGrid = gridInstance;
	pGrid.addTile(this);
	var pToolbar = null;

	var pVoteFees = 0;
	var pVoteNoFees = 0;
	var pVoteOwn = null;

	var pOrderSuccess = 0;
	var pOrderFailed = 0;

	//#################
	//## Private method
	function findasin() {
		return getAsinFromDom(pTile);
	}

	function getFees() {
		if (
			pVoteFees - pVoteNoFees >=
			appSettings.unavailableTab.consensusThreshold
		)
			return CONSENSUS_FEES;
		else if (
			pVoteNoFees - pVoteFees >=
			appSettings.unavailableTab.consensusThreshold
		)
			return CONSENSUS_NO_FEES;
		else return NO_CONSENSUS;
	}

	this.animateVanish = async function () {
		let defaultOpacity = $(pTile).css("opacity");

		$(pTile).animate(
			{
				height: ["20%", "swing"],
			},
			{
				duration: 300,
				queue: false,
			}
		);

		await $(pTile)
			.delay(150)
			.animate(
				{
					opacity: "hide",
				},
				{
					duration: 150,
					complete: function () {
						$(pTile).css({
							opacity: defaultOpacity,
							height: "100%",
						});
					},
				}
			)
			.promise(); //Converting the animation to a promise allow for the await clause to work.
		$(pTile).css("height", "100%");
	};

	//#################
	//## Public methods
	this.setToolbar = function (toolbarInstance) {
		pToolbar = toolbarInstance;
	};
	this.getToolbar = function () {
		return pToolbar;
	};

	this.setVotes = function (no, yes, own) {
		pVoteFees = yes;
		pVoteNoFees = no;
		pVoteOwn = own;
	};

	this.setOrders = function (success, failed) {
		pOrderSuccess = success;
		pOrderFailed = failed;
	};

	this.getVoteFees = function () {
		return pVoteFees;
	};
	this.getVoteNoFees = function () {
		return pVoteNoFees;
	};
	this.getVoteOwn = function () {
		return pVoteOwn;
	};
	this.getOrderSuccess = function () {
		return pOrderSuccess;
	};
	this.getOrderFailed = function () {
		return pOrderFailed;
	};

	this.getFees = function () {
		return getFees();
	};

	this.wasOrdered = function () {
		return pOrderSuccess > 0 || pOrderFailed > 0;
	};

	this.getStatus = function () {
		if (appSettings.unavailableTab.active) {
			if (pOrderSuccess > 0 && pOrderSuccess > pOrderFailed)
				return NOT_DISCARDED_ORDER_SUCCESS;

			if (pOrderFailed > 0 && pOrderFailed > pOrderSuccess)
				return DISCARDED_ORDER_FAILED;
		}
		if (appSettings.unavailableTab.votingToolbar) {
			if (pVoteOwn == 1 && appSettings.unavailableTab.selfDiscard)
				return DISCARDED_OWN_VOTE;

			if (getFees() == CONSENSUS_FEES) return DISCARDED_WITH_FEES;

			if (pVoteOwn == 0) return NOT_DISCARDED_OWN_VOTE;

			if (getFees() == CONSENSUS_NO_FEES) return NOT_DISCARDED_NO_FEES;
		}
		return NOT_DISCARDED_NO_STATUS;
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

	this.setDateAdded = function (timenow, mysqlDate) {
		if (mysqlDate == undefined) return false;

		if (!appSettings.general.displayFirstSeen) return false;

		let currentTime = new Date(timenow + " GMT");
		let jsDate = new Date(mysqlDate + " GMT");
		let bookmarkDate = new Date(appSettings.general.bookmarkDate);
		let textDate = timeSince(currentTime, jsDate);
		if (textDate == NaN) {
			showRuntime(
				"! Time firstseen wrong: currenttime:" +
					currentTime +
					" jstime:" +
					jsDate +
					"preformated current time: " +
					timenow +
					"preformatted item time" +
					mysqlDate
			);
		}
		if (appSettings.unavailableTab.compactToolbar) {
			$("<div>")
				.addClass("ext-helper-date-added")
				.text(textDate + " ago")
				.appendTo($(pTile).find(".ext-helper-img-container"));
		} else {
			$("<div>")
				.addClass("ext-helper-date-added")
				.text("First seen: " + textDate + " ago")
				.appendTo($(pTile).find(".ext-helper-img-container"));
		}
		if (
			appSettings.general.bookmark &&
			jsDate > bookmarkDate &&
			bookmarkDate != 0
		) {
			$(pTile).addClass("bookmark-highlight");
		}
	};

	this.moveToGrid = async function (g, animate = false) {
		//If we are asking to move the tile to the same grid, don't do anything
		if (g.getId() == pGrid.getId()) return false;

		if (animate) await pGrid.removeTileAnimate(this);
		else pGrid.removeTile(this); //Avoiding the await keep the method synchronous

		pGrid = g; //Update the new grid as the current one
		pGrid.addTile(this);

		return true;
	};

	this.isHidden = function () {
		if (!appSettings.hiddenTab.active) return false;

		return HiddenList.isHidden(pAsin);
	};

	this.hideTile = async function (animate = true, updateLocalStorage = true) {
		//Add the item to the list of hidden items

		HiddenList.addItem(pAsin, updateLocalStorage);

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
		let moveToGrid = gridRegular;
		if (
			(appSettings.unavailableTab.consensusDiscard &&
				this.getStatus() >= NOT_DISCARDED) ||
			(appSettings.unavailableTab.selfDiscard &&
				this.getStatus() == DISCARDED_OWN_VOTE)
		) {
			moveToGrid = gridUnavailable;
		}
		await this.moveToGrid(moveToGrid, animate);

		pToolbar.updateVisibilityIcon();

		//Refresh grid counts
		updateTileCounts();
	};
}

function timeSince(timenow, date) {
	var seconds = Math.floor((timenow - date) / 1000);
	var interval = seconds / 31536000;

	if (interval > 1) return Math.floor(interval) + " years";

	interval = seconds / 2592000;
	if (interval > 1) return Math.floor(interval) + " months";

	interval = seconds / 86400;
	if (interval > 1) return Math.floor(interval) + " days";

	interval = seconds / 3600;
	if (interval > 1) return Math.floor(interval) + " hrs";

	interval = seconds / 60;
	if (interval > 1) return Math.floor(interval) + " mins";

	return Math.floor(seconds) + " secs";
}

function getTileByAsin(asin) {
	let tile = null;
	tile = gridRegular.getTileId(asin);
	if (tile != null) return tile;

	if (gridUnavailable != null) {
		tile = gridUnavailable.getTileId(asin);
		if (tile != null) return tile;
	}

	tile = gridHidden.getTileId(asin);
	return tile;
}

function getAsinFromDom(tileDom) {
	let regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.
	let url = $(tileDom).find(".a-link-normal").attr("href");
	let arrasin = url.match(regex);
	return arrasin[1];
}

function getTitleFromDom(tileDom) {
	return $(tileDom).find(".a-truncate-full").text();
}

function getThumbnailURLFromDom(tileDom) {
	let url = $(tileDom).find(".vvp-item-tile-content > img").attr("src");
	if (url == undefined) return null;
	else return url;
}
