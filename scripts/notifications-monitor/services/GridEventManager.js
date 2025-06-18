/**
 * GridEventManager - Manages grid modification events and automatically handles placeholder tiles
 *
 * This service implements an event-driven architecture to eliminate the need for manual
 * insertPlaceholderTiles() calls scattered throughout the codebase.
 *
 * Events emitted:
 * - 'grid:items-added' - When items are added to the grid
 * - 'grid:items-removed' - When items are removed from the grid
 * - 'grid:items-cleared' - When items are cleared from the grid
 * - 'grid:items-filtered' - When items are filtered (search, type, queue)
 * - 'grid:truncated' - When the grid is auto-truncated
 * - 'grid:sorted' - When the grid sort order changes
 * - 'grid:paused' - When the feed is paused/unpaused
 */
class GridEventManager {
	#hookMgr;
	#noShiftGrid;
	#monitor;
	#isEnabled = true;

	constructor(hookMgr, noShiftGrid, monitor) {
		this.#hookMgr = hookMgr;
		this.#noShiftGrid = noShiftGrid;
		this.#monitor = monitor;

		this.#setupEventListeners();
	}

	/**
	 * Set up event listeners for grid modifications
	 */
	#setupEventListeners() {
		// Listen for grid modification events
		this.#hookMgr.hookBind("grid:items-added", () => this.#handleGridModification("add"));
		this.#hookMgr.hookBind("grid:items-removed", () => this.#handleGridModification("remove"));
		this.#hookMgr.hookBind("grid:items-cleared", () => this.#handleGridClear());
		this.#hookMgr.hookBind("grid:items-filtered", () => this.#handleGridFiltered());
		this.#hookMgr.hookBind("grid:truncated", (data) => this.#handleTruncation(data));
		this.#hookMgr.hookBind("grid:sorted", (data) => this.#handleGridSorted(data));
		this.#hookMgr.hookBind("grid:unpaused", () => this.#handleGridUnpaused());
	}

	/**
	 * Handle grid modification events
	 * @param {string} operation - The type of operation performed
	 */
	#handleGridModification(operation) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		// Only update placeholders for operations that affect grid layout
		if (this.#shouldUpdatePlaceholders(operation)) {
			this.#noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Handle truncation events with special logic
	 * @param {Object} data - Truncation event data
	 */
	#handleTruncation(data) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		const { fetchingRecentItems, visibleItemsRemovedCount } = data || {};

		if (fetchingRecentItems) {
			this.#noShiftGrid.resetEndPlaceholdersCount();
			this.#noShiftGrid.insertPlaceholderTiles();
		} else if (visibleItemsRemovedCount > 0) {
			this.#noShiftGrid.insertEndPlaceholderTiles(visibleItemsRemovedCount);
			this.#noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Handle grid clear event
	 */
	#handleGridClear() {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		// Reset end placeholders count and update placeholders
		this.#noShiftGrid.resetEndPlaceholdersCount();
		if (this.#shouldUpdatePlaceholders("clear")) {
			this.#noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Handle grid filtered event
	 */
	#handleGridFiltered() {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		// Reset end placeholders count and update placeholders
		this.#noShiftGrid.resetEndPlaceholdersCount();
		if (this.#shouldUpdatePlaceholders("filter")) {
			this.#noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Handle grid sorted event
	 * @param {Object} data - Sort event data containing sortType
	 */
	#handleGridSorted(data) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		const { sortType } = data || {};

		// Delete placeholder tiles if not in date descending sort
		if (sortType && sortType !== "date_desc") {
			this.#noShiftGrid.deletePlaceholderTiles();
		} else if (this.#shouldUpdatePlaceholders("sort")) {
			this.#noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Handle grid unpaused event
	 */
	#handleGridUnpaused() {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		// Insert end placeholder tiles when unpaused
		this.#noShiftGrid.insertEndPlaceholderTiles(0);
		if (this.#shouldUpdatePlaceholders("unpause")) {
			this.#noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Determine if placeholders should be updated for the given operation
	 * @param {string} operation - The operation type
	 * @returns {boolean}
	 */
	#shouldUpdatePlaceholders(operation) {
		// Only update placeholders if we're in date descending sort
		// and the operation affects grid layout
		return (
			this.#monitor._sortType === "date_desc" &&
			["add", "remove", "clear", "filter", "sort", "unpause"].includes(operation)
		);
	}

	/**
	 * Emit a grid event
	 * @param {string} eventName - The event name
	 * @param {Object} data - Optional event data
	 */
	emitGridEvent(eventName, data = null) {
		this.#hookMgr.hookExecute(eventName, data);
	}

	/**
	 * Enable or disable automatic placeholder management
	 * @param {boolean} enabled
	 */
	setEnabled(enabled) {
		this.#isEnabled = enabled;
	}

	/**
	 * Check if automatic placeholder management is enabled
	 * @returns {boolean}
	 */
	isEnabled() {
		return this.#isEnabled;
	}
}

export { GridEventManager };
