const TYPE_DATE_DESC = "date_desc";

class NoShiftGrid {
	_monitor = null;
	_visibilityStateManager = null;
	_gridWidth = 0;
	_endPlaceholdersCount = 0;
	_endPlaceholdersCountBuffer = 0;

	constructor(monitorInstance, visibilityStateManager) {
		this._monitor = monitorInstance;
		this._visibilityStateManager = visibilityStateManager;
		this.#setupEventListener();
		this.#calculateGridWidth();
	}

	updateGridContainer(gridContainer) {
		this._monitor._gridContainer = gridContainer;
		this.#calculateGridWidth();
	}

	#setupEventListener() {
		window.addEventListener("resize", () => {
			this.#calculateGridWidth();
			this.insertPlaceholderTiles(false);
		});
	}

	#calculateGridWidth() {
		this._gridWidth = this._monitor._gridContainer.offsetWidth;
	}

	resetEndPlaceholdersCount() {
		this._endPlaceholdersCount = 0;
	}

	/**
	 * Delete all placeholder tiles from the grid
	 */
	deletePlaceholderTiles() {
		//Delete all placeholder tiles
		const placeholderTiles = this._monitor._gridContainer.querySelectorAll(".vh-placeholder-tile");
		for (const placeholderTile of placeholderTiles) {
			placeholderTile.remove();
		}
	}

	/**
	 * Insert placeholder tiles to the grid to keep the grid elements fixed to their column with in sort TYPE_DATE_DESC
	 */
	insertPlaceholderTiles() {
		//If the sort is not by date DESC or the feed is paused, we don't need to do anything
		if (this._monitor._sortType != TYPE_DATE_DESC || this._monitor._fetchingRecentItems) {
			return;
		}

		//Delete all placeholder tiles
		this.deletePlaceholderTiles();

		//Get the current visible items count
		const visibleItemsCount =
			!this._monitor._feedPaused && this._visibilityStateManager ? this._visibilityStateManager.getCount() : 0;

		//Re-calculate the total number of items in the grid
		const theoricalItemsCount = visibleItemsCount + this._endPlaceholdersCount;

		//ToDo: Find a better way to precisely calculate the actual tile width (with 2 decimal places)
		const tileWidth = this._monitor._settings.get("notification.monitor.tileSize.width") + 1;

		//Calculate the number of tiles per row
		const tilesPerRow = Math.floor(this._gridWidth / tileWidth);

		//Caculate the number of placeholder tiles we need to insert
		const numPlaceholderTiles = (tilesPerRow - (theoricalItemsCount % tilesPerRow)) % tilesPerRow;

		//console.log(
		//	`gridWidth: ${this._gridWidth}, tileWidth: ${tileWidth}, tilesPerRow: ${tilesPerRow}, theoricalItemsCount: ${theoricalItemsCount}, numPlaceholderTiles: ${numPlaceholderTiles}`
		//);
		//console.trace();

		//Insert the placeholder tiles
		for (let i = 0; i < numPlaceholderTiles; i++) {
			const placeholderTile = document.createElement("div");
			placeholderTile.classList.add("vh-placeholder-tile");
			placeholderTile.classList.add("vvp-item-tile");
			placeholderTile.classList.add("vh-logo-vh");

			//Add the tile to the beginning of the grid
			this._monitor._gridContainer.insertBefore(
				placeholderTile.cloneNode(true),
				this._monitor._gridContainer.firstChild
			);
		}
	}

	insertEndPlaceholderTiles(tilesToInsert) {
		if (this._monitor._sortType !== TYPE_DATE_DESC || this._monitor._fetchingRecentItems) {
			return;
		}

		//Calculate the number of tiles per row
		const tilesPerRow = Math.floor(
			this._gridWidth / this._monitor._settings.get("notification.monitor.tileSize.width")
		);

		this._endPlaceholdersCountBuffer = (this._endPlaceholdersCountBuffer + tilesToInsert) % tilesPerRow;

		if (!this._monitor._feedPaused) {
			this._endPlaceholdersCount = this._endPlaceholdersCountBuffer;
		}

		//console.log("Adding ", this._endPlaceholdersCount, " imaginary placeholders tiles at the end of the grid");
	}
}

export { NoShiftGrid };
