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
		this._resizeHandler = null;
		this._resizeTimer = null;
		this.#setupEventListener();
		this.#calculateGridWidth();
	}

	updateGridContainer(gridContainer) {
		this._monitor._gridContainer = gridContainer;
		this.#calculateGridWidth();
	}

	#setupEventListener() {
		// Debounce resize events to avoid calculation during resize animation
		this._resizeHandler = () => {
			clearTimeout(this._resizeTimer);
			this._resizeTimer = setTimeout(() => {
				this.#calculateGridWidth();
				// Emit event instead of direct call to ensure proper batching
				if (this._monitor && this._monitor._hookMgr) {
					this._monitor._hookMgr.hookExecute("grid:resized");
				}
			}, 150); // Wait for resize animation to complete
		};

		window.addEventListener("resize", this._resizeHandler);
	}

	#calculateGridWidth() {
		this._gridWidth = this._monitor._gridContainer.offsetWidth;
	}

	resetEndPlaceholdersCount() {
		this._endPlaceholdersCount = 0;
		this._endPlaceholdersCountBuffer = 0;
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

		// Ensure we have the current grid width
		this.#calculateGridWidth();

		// Don't proceed if grid has no width
		if (this._gridWidth <= 0) {
			return;
		}

		// Use VisibilityStateManager count if available for consistency
		let visibleItemsCount;
		const allTiles = this._monitor._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
		const hiddenTiles = this._monitor._gridContainer.querySelectorAll(
			'.vvp-item-tile:not(.vh-placeholder-tile)[style*="display: none"]'
		);

		if (this._visibilityStateManager) {
			visibleItemsCount = this._visibilityStateManager.getCount();
		} else {
			// Fallback to DOM count
			const visibleTiles = this._monitor._gridContainer.querySelectorAll(
				'.vvp-item-tile:not(.vh-placeholder-tile):not([style*="display: none"])'
			);
			visibleItemsCount = visibleTiles.length;
		}

		// Debug logging
		const debugPlaceholders = this._monitor._settings.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			console.log("[NoShiftGrid] Starting placeholder calculation", {
				visibleItemsCount,
				visibilityStateCount: this._visibilityStateManager?.getCount(),
				allTilesCount: allTiles.length,
				hiddenTilesCount: hiddenTiles.length,
				domVisibleCount: allTiles.length - hiddenTiles.length,
				endPlaceholdersCount: this._endPlaceholdersCount,
				gridWidth: this._gridWidth,
			});
		}

		//Re-calculate the total number of items in the grid
		const theoricalItemsCount = visibleItemsCount + this._endPlaceholdersCount;

		//ToDo: Find a better way to precisely calculate the actual tile width (with 2 decimal places)
		const tileWidth = this._monitor._settings.get("notification.monitor.tileSize.width") + 1;

		//Calculate the number of tiles per row
		const tilesPerRow = Math.floor(this._gridWidth / tileWidth);

		//Caculate the number of placeholder tiles we need to insert
		const numPlaceholderTiles = (tilesPerRow - (theoricalItemsCount % tilesPerRow)) % tilesPerRow;

		// Debug logging
		if (debugPlaceholders) {
			console.log("[NoShiftGrid] Placeholder calculation result", {
				theoricalItemsCount,
				tilesPerRow,
				numPlaceholderTiles,
				calculation: `(${tilesPerRow} - (${theoricalItemsCount} % ${tilesPerRow})) % ${tilesPerRow} = (${tilesPerRow} - ${theoricalItemsCount % tilesPerRow}) % ${tilesPerRow} = ${numPlaceholderTiles}`,
			});
		}

		// Only modify DOM if placeholder count changed
		const currentPlaceholders = this._monitor._gridContainer.querySelectorAll(".vh-placeholder-tile");
		if (currentPlaceholders.length === numPlaceholderTiles) {
			return; // No change needed
		}

		// Use DocumentFragment to batch DOM operations and prevent flickering
		const fragment = document.createDocumentFragment();

		// Remove existing placeholders - use for...of to avoid function allocation
		for (const p of currentPlaceholders) {
			p.remove();
		}

		// Create new placeholders
		for (let i = 0; i < numPlaceholderTiles; i++) {
			const placeholderTile = document.createElement("div");
			placeholderTile.classList.add("vh-placeholder-tile");
			placeholderTile.classList.add("vvp-item-tile");
			placeholderTile.classList.add("vh-logo-vh");
			fragment.appendChild(placeholderTile);
		}

		// Insert all placeholders at once at the beginning
		if (fragment.childNodes.length > 0) {
			this._monitor._gridContainer.insertBefore(fragment, this._monitor._gridContainer.firstChild);
		}
	}

	insertEndPlaceholderTiles(tilesToInsert) {
		if (this._monitor._sortType !== TYPE_DATE_DESC || this._monitor._fetchingRecentItems) {
			return;
		}

		// Ensure grid width is current
		this.#calculateGridWidth();

		// Don't proceed if grid has no width
		if (this._gridWidth <= 0) {
			return;
		}

		//Calculate the number of tiles per row (consistent with insertPlaceholderTiles)
		const tileWidth = this._monitor._settings.get("notification.monitor.tileSize.width") + 1;
		const tilesPerRow = Math.floor(this._gridWidth / tileWidth);

		// Guard against division by zero
		if (tilesPerRow <= 0) {
			return;
		}

		// Always update the actual count, not just the buffer
		// This ensures consistency regardless of pause state
		this._endPlaceholdersCount = (this._endPlaceholdersCount + tilesToInsert) % tilesPerRow;
		this._endPlaceholdersCountBuffer = this._endPlaceholdersCount;

		//console.log("Adding ", this._endPlaceholdersCount, " imaginary placeholders tiles at the end of the grid");
	}

	/**
	 * Clean up resources and remove event listeners
	 */
	destroy() {
		// Remove resize event listener
		if (this._resizeHandler) {
			window.removeEventListener("resize", this._resizeHandler);
			this._resizeHandler = null;
		}

		// Clear resize timer if active
		if (this._resizeTimer) {
			clearTimeout(this._resizeTimer);
			this._resizeTimer = null;
		}

		// Clear references
		this._monitor = null;
		this._visibilityStateManager = null;
	}
}

export { NoShiftGrid };
