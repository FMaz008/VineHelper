/**
 * GridEventManager - Listens to grid modification events and automatically handles placeholder tiles
 *
 * This service implements an event-driven architecture to eliminate the need for manual
 * insertPlaceholderTiles() calls scattered throughout the codebase.
 *
 * IMPORTANT: This service is a LISTENER ONLY - it does not emit events.
 * Events are emitted by NotificationMonitor through HookMgr.
 *
 * Events listened to (emitted by NotificationMonitor):
 * - 'grid:items-removed' - When items are removed from the grid
 * - 'grid:truncated' - When the grid is auto-truncated
 * - 'grid:sorted' - When the grid sort order changes
 * - 'grid:unpaused' - When the feed is unpaused
 * - 'grid:sort-needed' - When a sort is requested
 * - 'grid:fetch-complete' - When fetching items completes
 * - 'visibility:count-changed' - When visible item count changes
 *
 * Events also listened to (emitted by other services):
 * - 'grid:resized' - When grid resizes (from NoShiftGrid)
 * - 'grid:initialized' - When grid initializes (from NotificationMonitorV3)
 *
 * Events listened to but never emitted in the codebase:
 * - 'grid:items-added' - Would be when items are added
 * - 'grid:items-cleared' - Would be when all items are cleared
 * - 'grid:items-filtered' - Would be when filters change
 */
export class GridEventManager {
	#hookMgr;
	#noShiftGrid;
	#monitor;
	#isEnabled = true;

	// Visibility count change debouncing
	//#visibilityDebounceTimer = null;
	//#visibilityDebounceDelay = 100; // milliseconds

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
		// Listen for actually emitted grid events
		this.#hookMgr.hookBind("grid:items-removed", (data) => this.#handleItemsRemoved(data));
		this.#hookMgr.hookBind("grid:truncated", (data) => this.#handleTruncation(data));
		this.#hookMgr.hookBind("grid:sorted", (data) => this.#handleSort(data));
		this.#hookMgr.hookBind("grid:unpaused", () => this.#handleUnpause());
		this.#hookMgr.hookBind("grid:sort-needed", () => this.#handleSortNeeded());
		this.#hookMgr.hookBind("grid:fetch-complete", (data) => this.#handleFetchComplete(data));

		// Note: grid:items-added, grid:items-cleared, and grid:items-filtered events
		// are never emitted in the codebase, so we don't listen for them
		this.#hookMgr.hookBind("grid:resized", () => this.#handleGridResized());
		this.#hookMgr.hookBind("grid:initialized", () => this.#handleGridInitialized());
		//this.#hookMgr.hookBind("visibility:count-changed", (data) => this.#handleVisibilityCountChanged(data));
	}

	/**
	 * Helper method to check if event can be handled
	 * @param {string} eventType - Type of event
	 * @returns {boolean} True if event can be handled
	 */
	#canHandleEvent(eventType) {
		if (!this.#isEnabled) {
			this.#logDebug(false, `${eventType} event ignored - manager disabled`);
			return false;
		}
		return true;
	}

	/**
	 * Helper method for debug logging
	 * @param {boolean} debugFlag - Debug flag to check
	 * @param {string} message - Log message
	 * @param {Object} data - Optional data to log
	 */
	#logDebug(debugFlag, message, data) {
		if (debugFlag) {
			console.log(`[GridEventManager] ${message}`, data || "");
		}
	}

	/**
	 * Handle truncation events
	 * @param {Object} data - Event data
	 */
	#handleTruncation(data) {
		if (!this.#canHandleEvent("Truncation")) return;

		const { fetchingRecentItems, visibleItemsRemovedCount } = data || {};
		const debugPlaceholders = this.#getDebugSetting();

		this.#logDebug(debugPlaceholders, "DIAGNOSTIC - handleTruncation", {
			fetchingRecentItems,
			visibleItemsRemovedCount,
			hasNoShiftGrid: !!this.#noShiftGrid,
		});

		// Reset end placeholders count when truncating
		this.#noShiftGrid.resetEndPlaceholdersCount();

		// If we removed visible items, we need to add end placeholders
		if (visibleItemsRemovedCount > 0 && !fetchingRecentItems) {
			this.#noShiftGrid.insertEndPlaceholderTiles(visibleItemsRemovedCount);

			this.#logDebug(debugPlaceholders, "DIAGNOSTIC - After insertEndPlaceholderTiles", {
				visibleItemsRemovedCount,
			});
		}

		// Always update placeholders after truncation
		this.#updatePlaceholders();
	}

	/**
	 * Handle items removed event
	 * @param {Object} data - Event data containing count
	 */
	#handleItemsRemoved(data) {
		if (!this.#canHandleEvent("Items removed")) return;

		// When items are removed, update placeholders immediately
		this.#updatePlaceholders();
	}

	/**
	 * Handle sort events
	 * @param {Object} data - Event data
	 */
	#handleSort(data) {
		if (!this.#canHandleEvent("Sort")) return;

		const debugPlaceholders = this.#getDebugSetting();

		// Get existing placeholders before sort
		const existingPlaceholders = this.#monitor._gridContainer.querySelectorAll(".vh-placeholder-tile");

		this.#logDebug(debugPlaceholders, "Starting sort", {
			placeholderCount: existingPlaceholders.length,
		});

		if (existingPlaceholders.length === 0) {
			// No placeholders to worry about
			return;
		}

		// Store placeholder references
		const placeholderRefs = Array.from(existingPlaceholders);

		// Wait for sort to complete
		requestAnimationFrame(() => {
			// Check if placeholders are still in DOM and in correct position
			const container = this.#monitor._gridContainer;
			const allTiles = Array.from(container.children);
			const lastRealTileIndex = this.#findLastRealTileIndex(allTiles);

			// Check if placeholders are after the last real tile
			let needsReposition = false;
			for (const placeholder of placeholderRefs) {
				if (!placeholder.parentNode) {
					// Placeholder was removed from DOM
					needsReposition = true;
					break;
				}

				const placeholderIndex = allTiles.indexOf(placeholder);
				if (placeholderIndex !== -1 && placeholderIndex <= lastRealTileIndex) {
					// Placeholder is before a real tile
					needsReposition = true;
					break;
				}
			}

			if (needsReposition) {
				// Remove all placeholders
				placeholderRefs.forEach((p) => p.remove());

				// Re-add them at the end
				const fragment = document.createDocumentFragment();
				placeholderRefs.forEach((p) => fragment.appendChild(p));
				container.appendChild(fragment);
			}
		});
	}

	/**
	 * Find the index of the last real tile (non-placeholder)
	 * @param {Array} tiles - Array of tile elements
	 * @returns {number} Index of last real tile, or -1 if none found
	 */
	#findLastRealTileIndex(tiles) {
		for (let i = tiles.length - 1; i >= 0; i--) {
			if (!tiles[i].classList.contains("vh-placeholder-tile")) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * Handle unpause events
	 */
	#handleUnpause() {
		if (!this.#canHandleEvent("Unpause")) return;

		// When unpausing, we need to insert end placeholder tiles
		// to indicate that more items may be coming
		this.#noShiftGrid.insertEndPlaceholderTiles(0);

		// Update placeholders
		this.#updatePlaceholders();
	}

	/**
	 * Handle sort needed events
	 */
	#handleSortNeeded() {
		if (!this.#canHandleEvent("Sort needed")) return;

		// Update placeholders after sort
		this.#updatePlaceholders();
	}

	/**
	 * Handle fetch complete events
	 * @param {Object} data - Event data containing visibleCount
	 */
	#handleFetchComplete(data) {
		if (!this.#canHandleEvent("Fetch complete")) return;

		const debugPlaceholders = this.#getDebugSetting();

		this.#logDebug(debugPlaceholders, "Handling fetch complete", {
			visibleCount: data.visibleCount,
		});

		// Reset end placeholders count after fetch
		const endPlaceholdersCountBefore = this.#noShiftGrid._endPlaceholdersCount;
		this.#noShiftGrid.resetEndPlaceholdersCount();

		this.#logDebug(debugPlaceholders, "DIAGNOSTIC - Reset endPlaceholdersCount", {
			before: endPlaceholdersCountBefore,
			after: this.#noShiftGrid._endPlaceholdersCount,
		});

		// Update placeholders after fetch completes
		this.#logDebug(debugPlaceholders, "Updating placeholders after fetch");
		this.#updatePlaceholders();
	}

	/**
	 * Handle grid resized events
	 * @param {Object} data - Event data
	 */
	#handleGridResized() {
		const debugPlaceholders = this.#getDebugSetting();

		this.#logDebug(debugPlaceholders, "Grid resized event received", {
			isEnabled: this.#isEnabled,
		});

		if (!this.#canHandleEvent("Grid resized")) return;

		// Grid was resized, update placeholders
		this.#logDebug(debugPlaceholders, "Updating placeholders after resize");
		this.#updatePlaceholders(); // Use default (not immediate)
	}

	/**
	 * Handle grid initialized events
	 */
	#handleGridInitialized() {
		const debugPlaceholders = this.#getDebugSetting();

		this.#logDebug(debugPlaceholders, "Grid initialized event received", {
			isEnabled: this.#isEnabled,
			hasNoShiftGrid: !!this.#noShiftGrid,
			hasMonitor: !!this.#monitor,
			hasGridContainer: !!this.#monitor?._gridContainer,
		});

		if (!this.#canHandleEvent("Grid initialized")) return;

		// Initialize NoShiftGrid with the grid container
		this.#ensureNoShiftGridInitialized(debugPlaceholders);

		// Initial placeholder setup
		this.#updatePlaceholders();
	}

	/**
	 * Update placeholders using NoShiftGrid
	 * @param {boolean} skipBatch - Skip batching for immediate update
	 * @param {boolean} forceForFilter - Force update for filter changes
	 */
	#updatePlaceholders(skipBatch = false, forceForFilter = false) {
		if (!this.#noShiftGrid || !this.#isEnabled) {
			return;
		}

		// Ensure NoShiftGrid is properly initialized
		if (!this.#noShiftGrid._gridContainer) {
			const gridContainer = this.#monitor._gridContainer;
			if (gridContainer) {
				this.#noShiftGrid.initialize(gridContainer);
			} else {
				console.warn("[GridEventManager] Cannot update placeholders - no grid container");
				return;
			}
		}

		// Update placeholders
		this.#noShiftGrid.insertPlaceholderTiles();
	}

	/**
	 * Enable the event manager
	 */
	enable() {
		this.#isEnabled = true;
		// Initial update when enabled
		this.#updatePlaceholders();
	}

	/**
	 * Disable the event manager
	 */
	disable() {
		this.#isEnabled = false;
		// Clear visibility debounce timer
		/*
		if (this.#visibilityDebounceTimer) {
			clearTimeout(this.#visibilityDebounceTimer);
			this.#visibilityDebounceTimer = null;
		}
		*/
	}

	/**
	 * Check if the event manager is enabled
	 * @returns {boolean} True if enabled
	 */
	isEnabled() {
		return this.#isEnabled;
	}

	/**
	 * Set the enabled state
	 * @param {boolean} enabled - Whether to enable or disable
	 */
	setEnabled(enabled) {
		this.#isEnabled = enabled;
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	/**
	 * Clean up resources
	 */
	destroy() {
		this.disable();
		// Clear any references
		this.#hookMgr = null;
		this.#noShiftGrid = null;
		this.#monitor = null;
	}

	/**
	 * Handle visibility count changed events
	 * @param {Object} data - Event data containing count and source
	 */
	/*
	#handleVisibilityCountChanged(data) {
		if (!this.#canHandleEvent("Visibility count changed")) return;

		const debugPlaceholders = this.#getDebugSetting();
		const now = Date.now();

		// Ignore visibility changes during atomic updates unless it's a filter change
		if (this.#noShiftGrid?._atomicUpdateInProgress && data.source !== "filter-change") {
			this.#logDebug(debugPlaceholders, "Ignoring visibility change during atomic update", {
				count: data.count,
				source: data.source,
				atomicInProgress: true,
			});
			return;
		}

		// Skip feed-unpause events if we're fetching items (fetch-complete will handle it)
		if (data.source === "feed-unpause" && this.#monitor?._fetchingRecentItems) {
			this.#logDebug(debugPlaceholders, "Skipping feed-unpause during fetch operation", {
				count: data.count,
				source: data.source,
				fetchingRecentItems: true,
			});
			return;
		}

		// Visibility count changed event received
		if (debugPlaceholders) {
			const logData = {
				count: data.count,
				source: data.source,
				timestamp: now,
			};

			// Only include expensive stack trace if specifically enabled
			const debugStackTraces = this.#monitor?._settings?.get("general.debugStackTraces");
			if (debugStackTraces) {
				logData.stack = new Error().stack.split("\n").slice(2, 7).join("\n");
			}

			this.#logDebug(debugPlaceholders, "Visibility count changed", logData);
		}

		// Handle filter changes and bulk operations immediately
		if (data.source === "filter-change" || data.source === "bulk-remove") {
			this.#handleFilterChangeImmediate(now, debugPlaceholders);
			return;
		}

		// Debounce other visibility changes
		this.#debounceVisibilityUpdate(data, debugPlaceholders);
	}
	*/

	/**
	 * Get debug setting value
	 * @returns {boolean} Debug setting value
	 */
	#getDebugSetting() {
		return this.#monitor?._settings?.get("general.debugPlaceholders") || false;
	}

	/**
	 * Ensure NoShiftGrid is properly initialized
	 * @param {boolean} debugPlaceholders - Debug flag
	 */
	#ensureNoShiftGridInitialized(debugPlaceholders) {
		const gridContainer = this.#monitor._gridContainer;
		if (!gridContainer) {
			console.warn("[GridEventManager] No grid container available for NoShiftGrid initialization");
			return;
		}

		if (!this.#noShiftGrid._gridContainer) {
			this.#logDebug(debugPlaceholders, "Initializing NoShiftGrid with grid container");
			this.#noShiftGrid.initialize(gridContainer);
		}

		// Ensure NoShiftGrid is enabled
		if (!this.#noShiftGrid._isEnabled) {
			this.#logDebug(debugPlaceholders, "Enabling NoShiftGrid");
			this.#noShiftGrid.enable();
		}
	}

	/**
	 * Handle filter change immediately
	 * @param {number} now - Current timestamp
	 * @param {boolean} debugPlaceholders - Debug flag
	 */
	/*
	#handleFilterChangeImmediate(now, debugPlaceholders) {
		this.#logDebug(debugPlaceholders, "Filter change detected - updating placeholders immediately", {
			timestamp: now,
		});

		// Clear any pending debounced update
		clearTimeout(this.#visibilityDebounceTimer);

		// Update placeholders immediately for filter changes
		this.#updatePlaceholders(true); // immediate = true
	}
	*/
	/**
	 * Debounce visibility update
	 * @param {Object} data - Event data
	 * @param {boolean} debugPlaceholders - Debug flag
	 */
	/*
	#debounceVisibilityUpdate(data, debugPlaceholders) {
		clearTimeout(this.#visibilityDebounceTimer);

		this.#visibilityDebounceTimer = setTimeout(() => {
			this.#logDebug(debugPlaceholders, "Processing debounced visibility update", {
				count: data.count,
				source: data.source,
			});

			// Update placeholders after debounce
			this.#updatePlaceholders();
		}, this.#visibilityDebounceDelay);
	}
	*/
}
