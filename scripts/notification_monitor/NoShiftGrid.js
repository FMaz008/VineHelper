const TYPE_DATE_DESC = "date_desc";

class NoShiftGrid {
	_monitor = null;
	_gridWidth = 0;
	_endPlaceholdersCount = 0;

	constructor(monitorInstance) {
		this._monitor = monitorInstance;
		this.#setupEventListener();
		this.calculateGridWidth();
	}

	updateGridContainer(gridContainer) {
		this._monitor._gridContainer = gridContainer;
		this.calculateGridWidth();
	}

	#setupEventListener() {
		window.addEventListener("resize", () => {
			this.calculateGridWidth();
			this.insertPlaceholderTiles();
		});
	}

	calculateGridWidth() {
		this._gridWidth = this._monitor._gridContainer.offsetWidth;
	}

	/**
	 * Delete all placeholder tiles from the grid
	 */
	#deletePlaceholderTiles() {
		//Delete all placeholder tiles
		const placeholderTiles = this._monitor._gridContainer.querySelectorAll(".vh-placeholder-tile");
		for (const placeholderTile of placeholderTiles) {
			placeholderTile.remove();
		}
	}

	/**
	 * Insert placeholder tiles to the grid to keep the grid elements fixed to their column with in sort TYPE_DATE_DESC
	 * @param {boolean} countVisibleItems - If true, do a fresh count of the visible items in the grid
	 */
	insertPlaceholderTiles(countVisibleItems = false) {
		//If the sort is not by date DESC or the feed is paused, we don't need to do anything
		if (this._monitor._sortType != TYPE_DATE_DESC || this._monitor._feedPaused) {
			return;
		}

		//Delete all placeholder tiles
		this.#deletePlaceholderTiles();

		//Re-calculate the total number of items in the grid
		let theoricalItemsCount = 0;
		if (countVisibleItems) {
			theoricalItemsCount = this._monitor._countVisibleItems() + this._endPlaceholdersCount;
		} else {
			theoricalItemsCount = this._monitor._visibleItemsCount + this._endPlaceholdersCount;
		}

		//ToDo: Find a better way to precisely calculate the actual tile width (with 2 decimal places)
		const tileWidth = this._monitor._settings.get("notification.monitor.tileSize.width") + 1;

		//Calculate the number of tiles per row
		const tilesPerRow = Math.floor(this._gridWidth / tileWidth);

		//Caculate the number of placeholder tiles we need to insert
		const numPlaceholderTiles = (tilesPerRow - (theoricalItemsCount % tilesPerRow)) % tilesPerRow;

		console.log(
			`gridWidth: ${this._gridWidth}, tileWidth: ${tileWidth}, tilesPerRow: ${tilesPerRow}, theoricalItemsCount: ${theoricalItemsCount}, numPlaceholderTiles: ${numPlaceholderTiles}`
		);

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

	insertEndPlaceholderTiles(tilesToInsert, clearExisting = true) {
		if (this._monitor._sortType !== TYPE_DATE_DESC || this._monitor._feedPaused) {
			return;
		}

		//Calculate the number of tiles per row
		const tilesPerRow = Math.floor(
			this._gridWidth / this._monitor._settings.get("notification.monitor.tileSize.width")
		);

		this._endPlaceholdersCount = (this._endPlaceholdersCount + tilesToInsert) % tilesPerRow;

		console.log("Adding ", this._endPlaceholdersCount, " imaginary placeholders tiles at the end of the grid");
	}
}

export { NoShiftGrid };
