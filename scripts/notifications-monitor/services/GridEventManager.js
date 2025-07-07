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

	// Event batching properties
	#batchedUpdates = new Map();
	#batchTimer = null;
	#batchDelay = 50; // milliseconds

	// Visibility count change debouncing
	#visibilityDebounceTimer = null;
	#visibilityDebounceDelay = 100; // milliseconds
	#lastVisibilityUpdate = 0;
	#visibilityUpdateCount = 0;
	#visibilityUpdateResetTimer = null;

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
		this.#hookMgr.hookBind("grid:items-added", (data) => this.#handleGridModification("add", data));
		this.#hookMgr.hookBind("grid:items-removed", (data) => this.#handleGridModification("remove", data));
		this.#hookMgr.hookBind("grid:items-cleared", (data) => this.#handleGridClear(data));
		this.#hookMgr.hookBind("grid:items-filtered", (data) => this.#handleGridFiltered(data));
		this.#hookMgr.hookBind("grid:truncated", (data) => this.#handleTruncation(data));
		this.#hookMgr.hookBind("grid:sorted", (data) => this.#handleGridSorted(data));
		this.#hookMgr.hookBind("grid:sort-needed", () => this.#handleSortNeeded());
		this.#hookMgr.hookBind("grid:unpaused", () => this.#handleGridUnpaused());
		this.#hookMgr.hookBind("grid:fetch-complete", (data) => this.#handleFetchComplete(data));
		this.#hookMgr.hookBind("grid:resized", () => this.#handleGridResized());
		this.#hookMgr.hookBind("grid:initialized", () => this.#handleGridInitialized());

		// Listen for visibility count changes (e.g., from recalculation)
		this.#hookMgr.hookBind("visibility:count-changed", (data) => this.#handleVisibilityCountChanged(data));
	}

	/**
	 * Handle grid modification events
	 * @param {string} operation - The type of operation performed
	 * @param {Object} data - Event data containing count information
	 */
	#handleGridModification(operation, data = {}) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		// Only update placeholders for operations that affect grid layout
		if (this.#shouldUpdatePlaceholders(operation)) {
			// Use requestAnimationFrame for visual stability
			requestAnimationFrame(() => {
				this.#updatePlaceholders(data?.fetchingRecentItems);
			});
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

		const debugPlaceholders = this.#monitor._settings?.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			console.log("[GridEventManager] DIAGNOSTIC - handleTruncation", {
				fetchingRecentItems,
				visibleItemsRemovedCount,
				endPlaceholdersCountBefore: this.#noShiftGrid._endPlaceholdersCount,
			});
		}

		if (fetchingRecentItems) {
			this.#noShiftGrid.resetEndPlaceholdersCount();
			this.#updatePlaceholders();
		} else if (visibleItemsRemovedCount > 0) {
			// Decrement visibility count by removed items

			this.#noShiftGrid.insertEndPlaceholderTiles(visibleItemsRemovedCount);
			if (debugPlaceholders) {
				console.log("[GridEventManager] DIAGNOSTIC - After insertEndPlaceholderTiles", {
					visibleItemsRemovedCount,
					endPlaceholdersCountAfter: this.#noShiftGrid._endPlaceholdersCount,
				});
			}
			this.#updatePlaceholders();
		}
	}

	/**
	 * Handle grid clear event
	 * @param {Object} data - Clear event data containing count of visible items removed
	 */
	#handleGridClear(data = {}) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		// Reset end placeholders count and update placeholders
		this.#noShiftGrid.resetEndPlaceholdersCount();
		if (this.#shouldUpdatePlaceholders("clear")) {
			this.#updatePlaceholders();
		}
	}

	/**
	 * Handle grid filtered event
	 * @param {Object} data - Filter event data containing new visible count
	 */
	#handleGridFiltered(data = {}) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		const debugPlaceholders = this.#monitor._settings?.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			console.log("[GridEventManager] Grid filtered event", {
				data,
				timestamp: Date.now(),
			});
		}

		// Note: We don't clear tile width cache on filter changes because
		// filters don't affect the CSS grid layout or tile dimensions

		// Don't reset end placeholders count during filtering
		// This preserves the placeholder state when items are being loaded concurrently
		// The insertPlaceholderTiles method will recalculate based on current visible count
		if (this.#shouldUpdatePlaceholders("filter")) {
			this.#updatePlaceholders(false, true); // Pass forceForFilter = true
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

		const { sortType, placeholdersHandled } = data || {};

		// Skip if placeholders were already handled during sort
		if (placeholdersHandled) {
			return;
		}

		// Delete placeholder tiles if not in date descending sort
		if (sortType && sortType !== "date_desc") {
			this.#noShiftGrid.deletePlaceholderTiles();
		} else if (this.#shouldUpdatePlaceholders("sort")) {
			this.#updatePlaceholders();
		}
	}

	/**
	 * Handle sort needed event - performs the actual sorting while preserving placeholders
	 */
	#handleSortNeeded() {
		if (!this.#isEnabled || !this.#monitor) {
			return;
		}

		const container = this.#monitor._gridContainer;
		if (!container) return;

		const debugPlaceholders = this.#monitor._settings?.get("general.debugPlaceholders");

		// Get current placeholder tiles before sorting
		const existingPlaceholders = Array.from(container.querySelectorAll(".vh-placeholder-tile"));

		if (debugPlaceholders) {
			console.log("[GridEventManager] Starting sort", {
				placeholderCount: existingPlaceholders.length,
				containerChildren: container.children.length,
			});
		}

		this.#monitor._preserveScrollPosition(() => {
			// Sort the items - reuse the sorting logic from ItemsMgr
			const sortedItems = this.#monitor._itemsMgr.sortItems();

			// Only proceed if we have items
			if (!sortedItems || sortedItems.length === 0) return;

			// Get all current item tiles from the DOM
			const itemTiles = Array.from(container.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)"));

			// Create a map of ASIN to DOM element for quick lookup
			const asinToElement = new Map();
			itemTiles.forEach((tile) => {
				const asin = tile.id?.replace("vh-notification-", "");
				if (asin) {
					asinToElement.set(asin, tile);
				}
			});

			// Calculate how many placeholders we need BEFORE building the fragment
			let placeholdersNeeded = 0;
			if (this.#monitor._sortType === "date_desc" && this.#noShiftGrid) {
				// Count visible items
				const visibleCount = sortedItems.filter((item) => {
					const element = asinToElement.get(item.asin);
					return element && element.style.display !== "none";
				}).length;

				// Calculate placeholders needed
				const tilesPerRow = this.#noShiftGrid.getTilesPerRow();
				if (tilesPerRow > 0 && visibleCount > 0) {
					const remainder = visibleCount % tilesPerRow;
					placeholdersNeeded = remainder > 0 ? tilesPerRow - remainder : 0;
				}

				if (debugPlaceholders) {
					console.log("[GridEventManager] Calculated placeholders needed", {
						visibleCount,
						tilesPerRow,
						placeholdersNeeded,
						existingPlaceholders: existingPlaceholders.length,
					});
				}
			}

			// Create a DocumentFragment for better performance
			const fragment = document.createDocumentFragment();

			// Adjust placeholder count to match what we need
			const placeholderTiles = [];

			// Reuse existing placeholders up to what we need
			for (let i = 0; i < Math.min(existingPlaceholders.length, placeholdersNeeded); i++) {
				const placeholder = existingPlaceholders[i];
				if (placeholder.parentNode) {
					placeholder.remove();
				}
				placeholderTiles.push(placeholder);
			}

			// Create new placeholders if we need more
			for (let i = existingPlaceholders.length; i < placeholdersNeeded; i++) {
				const placeholder = this.#noShiftGrid.createPlaceholderTile();
				placeholderTiles.push(placeholder);
			}

			// Remove excess placeholders
			for (let i = placeholdersNeeded; i < existingPlaceholders.length; i++) {
				const placeholder = existingPlaceholders[i];
				if (placeholder.parentNode) {
					placeholder.remove();
				}
			}

			// Add the correct number of placeholder tiles at the beginning
			placeholderTiles.forEach((placeholder) => {
				fragment.appendChild(placeholder);
			});

			// Add items to fragment in sorted order after placeholders
			sortedItems.forEach((item) => {
				const element = asinToElement.get(item.asin);
				if (element && element.parentNode) {
					element.remove();
					fragment.appendChild(element);
				}
			});

			if (debugPlaceholders) {
				console.log("[GridEventManager] Before appending fragment", {
					fragmentChildCount: fragment.childNodes.length,
					containerChildrenBefore: container.children.length,
					placeholdersInFragment: placeholderTiles.length,
					itemsInFragment: sortedItems.length,
					itemTilesFound: itemTiles.length,
				});
			}

			// Append the sorted content to the container
			// Don't clear the container - just move elements to their new positions
			container.appendChild(fragment);

			if (debugPlaceholders) {
				console.log("[GridEventManager] After sort", {
					containerChildrenAfter: container.children.length,
					firstChild: container.firstChild?.className,
					lastChild: container.lastChild?.className,
				});
			}
		});

		// Emit sorted event to trigger any additional handling
		// Note: We've already handled placeholders, so the handler should skip updating them
		this.#hookMgr.hookExecute("grid:sorted", {
			sortType: this.#monitor._sortType,
			placeholdersHandled: true,
		});
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
			this.#updatePlaceholders(false, true); // Pass forceForFilter = true for resize events
		}
	}

	/**
	 * Handle fetch complete event
	 * @param {Object} data - Fetch complete event data containing visible count
	 */
	#handleFetchComplete(data = {}) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		const debugPlaceholders = this.#monitor._settings?.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			console.log("[GridEventManager] Handling fetch complete", {
				visibleCount: data.visibleCount,
				endPlaceholdersCountBefore: this.#noShiftGrid._endPlaceholdersCount,
			});
		}

		// Reset end placeholders count after fetch completes
		// This prevents accumulation of removed items affecting placeholder calculations
		const endPlaceholdersCountBefore = this.#noShiftGrid._endPlaceholdersCount;
		this.#noShiftGrid.resetEndPlaceholdersCount();

		if (debugPlaceholders) {
			console.log("[GridEventManager] DIAGNOSTIC - Reset endPlaceholdersCount", {
				before: endPlaceholdersCountBefore,
				after: this.#noShiftGrid._endPlaceholdersCount,
				visibleCount: data.visibleCount,
				totalItems: data.totalItems,
			});
		}

		// Update placeholders after fetch completes
		if (this.#shouldUpdatePlaceholders("fetch")) {
			if (debugPlaceholders) {
				console.log("[GridEventManager] Updating placeholders after fetch");
			}
			this.#updatePlaceholders();

			// Trigger a sort to ensure placeholders are positioned correctly
			// This is needed because items were added in bulk during fetch
			// Use setTimeout to ensure DOM has updated before sorting
			// Use longer delay to ensure it happens after the count update
			setTimeout(() => {
				if (debugPlaceholders) {
					console.log("[GridEventManager] Triggering sort after fetch to position placeholders");
				}
				this.#handleSortNeeded();
			}, 150); // Slightly longer than NotificationMonitor's delay
		}
	}

	/**
	 * Handle grid resized event (window resize)
	 */
	#handleGridResized() {
		const debugPlaceholders = this.#monitor._settings.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			console.log("[GridEventManager] Grid resized event received", {
				isEnabled: this.#isEnabled,
				hasNoShiftGrid: !!this.#noShiftGrid,
			});
		}

		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		// Update placeholders after grid resize
		// Note: NoShiftGrid already handles resize events and clears its cache
		// The resize event is already debounced in NoShiftGrid
		const shouldUpdate = this.#shouldUpdatePlaceholders("resize");
		if (debugPlaceholders) {
			console.log("[GridEventManager] Should update placeholders after resize?", {
				shouldUpdate,
				sortType: this.#monitor._sortType,
			});
		}

		if (shouldUpdate) {
			if (debugPlaceholders) {
				console.log("[GridEventManager] Updating placeholders after resize");
			}
			this.#updatePlaceholders(false, true); // Pass forceForFilter = true for resize events
		}
	}

	/**
	 * Handle grid initialized event (initial load)
	 */
	#handleGridInitialized() {
		const debugPlaceholders = this.#monitor._settings.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			console.log("[GridEventManager] DEBUG - handleGridInitialized called", {
				isEnabled: this.#isEnabled,
				hasNoShiftGrid: !!this.#noShiftGrid,
				noShiftGridState: this.#noShiftGrid
					? {
							isEnabled: this.#noShiftGrid._isEnabled,
							hasGridContainer: !!this.#noShiftGrid._gridContainer,
						}
					: null,
			});
		}

		if (!this.#isEnabled || !this.#noShiftGrid) {
			console.warn("[GridEventManager] Cannot handle grid initialized - not enabled or no NoShiftGrid");
			return;
		}

		// Initialize NoShiftGrid with the grid container
		const gridContainer = this.#monitor._gridContainer;
		if (gridContainer) {
			if (!this.#noShiftGrid._gridContainer) {
				if (debugPlaceholders) {
					console.log("[GridEventManager] Initializing NoShiftGrid with grid container");
				}
				this.#noShiftGrid.initialize(gridContainer);
			}

			// Always enable NoShiftGrid if not already enabled
			if (!this.#noShiftGrid._isEnabled) {
				if (debugPlaceholders) {
					console.log("[GridEventManager] Enabling NoShiftGrid");
				}
				this.#noShiftGrid.enable();
			}
		}

		// Insert initial placeholders
		if (this.#shouldUpdatePlaceholders("init")) {
			this.#updatePlaceholders();
		}
	}

	/**
	 * Determine if placeholders should be updated for the given operation
	 * @param {string} operation - The operation type
	 * @returns {boolean}
	 */
	#shouldUpdatePlaceholders(operation) {
		// Update placeholders for operations that affect grid layout
		// Always update for filter operations to maintain grid alignment
		if (operation === "filter") {
			return true;
		}

		// For other operations, only update if we're in date descending sort
		return (
			this.#monitor._sortType === "date_desc" &&
			["add", "remove", "clear", "sort", "unpause", "fetch", "resize", "init"].includes(operation)
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

	/**
	 * Batch an update to prevent rapid consecutive updates
	 * @param {string} updateType - Type of update (e.g., 'placeholder', 'visibility')
	 * @param {Function} updateFn - Function to execute
	 */
	#batchUpdate(updateType, updateFn) {
		// Store the update function
		this.#batchedUpdates.set(updateType, updateFn);

		// Clear existing timer
		if (this.#batchTimer) {
			clearTimeout(this.#batchTimer);
		}

		// Set new timer to process batch
		this.#batchTimer = setTimeout(() => {
			this.#processBatch();
		}, this.#batchDelay);
	}

	/**
	 * Process all batched updates
	 */
	#processBatch() {
		// Execute all batched updates
		for (const [updateType, updateFn] of this.#batchedUpdates) {
			try {
				updateFn();
			} catch (error) {
				console.error(`[GridEventManager] Error processing batched update '${updateType}':`, error);
			}
		}

		// Clear the batch
		this.#batchedUpdates.clear();
		this.#batchTimer = null;
	}

	/**
	 * Handle visibility count changed events
	 * This occurs when the visibility state manager recalculates the count
	 * @param {Object} data - Event data containing the new count
	 */
	#handleVisibilityCountChanged(data) {
		if (!this.#isEnabled || !this.#noShiftGrid) {
			return;
		}

		const debugPlaceholders = this.#monitor?._settings?.get("general.debugPlaceholders");
		const now = Date.now();

		// Track rapid updates to detect loops
		if (now - this.#lastVisibilityUpdate < 500) {
			this.#visibilityUpdateCount++;

			// If we've had more than 5 updates in 500ms, we're likely in a loop
			if (this.#visibilityUpdateCount > 5) {
				if (debugPlaceholders) {
					console.warn("[GridEventManager] Detected rapid visibility updates, breaking potential loop", {
						updateCount: this.#visibilityUpdateCount,
						timeSinceLastUpdate: now - this.#lastVisibilityUpdate,
					});
				}
				return;
			}
		} else {
			// Reset counter if enough time has passed
			this.#visibilityUpdateCount = 1;
		}

		this.#lastVisibilityUpdate = now;

		// Reset the counter after 1 second of no updates
		if (this.#visibilityUpdateResetTimer) {
			clearTimeout(this.#visibilityUpdateResetTimer);
		}
		this.#visibilityUpdateResetTimer = setTimeout(() => {
			this.#visibilityUpdateCount = 0;
		}, 1000);

		if (debugPlaceholders) {
			console.log("[GridEventManager] Visibility count changed", {
				newCount: data.count,
				source: data.source || "unknown",
				timestamp: now,
				updateCount: this.#visibilityUpdateCount,
				stack: new Error().stack.split("\n").slice(2, 5).join(" -> "),
			});
		}

		// Debounce visibility count changes to prevent rapid recalculations
		if (this.#visibilityDebounceTimer) {
			clearTimeout(this.#visibilityDebounceTimer);
		}

		this.#visibilityDebounceTimer = setTimeout(() => {
			// Always update placeholders for:
			// 1. Count changes
			// 2. Bulk operations (like "Clear Unavailable")
			// 3. Filter changes (even if count remains the same)
			const shouldUpdate =
				data.changed ||
				data.isBulkOperation ||
				data.source === "bulk-operation" ||
				data.source === "filter-change";

			if (!shouldUpdate) {
				if (debugPlaceholders) {
					console.log("[GridEventManager] Skipping placeholder update - no changes detected");
				}
				return;
			}

			// Update placeholders with debouncing
			this.#updatePlaceholders(false, true);
		}, this.#visibilityDebounceDelay);
	}

	/**
	 * Update placeholder tiles with batching
	 * @param {boolean} fetchingRecentItems - Whether recent items are being fetched
	 * @param {boolean} forceForFilter - Force placeholder insertion for filter operations
	 */
	#updatePlaceholders(fetchingRecentItems, forceForFilter = false) {
		// For filter operations, always update immediately to prevent visual bounce
		if (forceForFilter) {
			this.#noShiftGrid.insertPlaceholderTiles(forceForFilter);
		} else if (fetchingRecentItems) {
			this.#batchUpdate("placeholder", () => {
				this.#noShiftGrid.insertPlaceholderTiles(forceForFilter);
			});
		} else {
			// For non-fetching updates, update placeholders immediately
			this.#noShiftGrid.insertPlaceholderTiles(forceForFilter);
		}
	}

	/**
	 * Clean up resources and remove event listeners
	 */
	destroy() {
		// Clear any pending batch timer
		if (this.#batchTimer) {
			clearTimeout(this.#batchTimer);
			this.#batchTimer = null;
		}

		// Clear visibility debounce timer
		if (this.#visibilityDebounceTimer) {
			clearTimeout(this.#visibilityDebounceTimer);
			this.#visibilityDebounceTimer = null;
		}

		// Clear visibility update reset timer
		if (this.#visibilityUpdateResetTimer) {
			clearTimeout(this.#visibilityUpdateResetTimer);
			this.#visibilityUpdateResetTimer = null;
		}

		// Clear batched updates
		this.#batchedUpdates.clear();

		// Note: We don't unbind hooks here because HookMgr doesn't provide
		// an unbind method. This is a limitation that should be addressed
		// in HookMgr itself. For now, we'll clear our references.

		// Clear references
		this.#hookMgr = null;
		this.#noShiftGrid = null;
		this.#monitor = null;
	}
}

export { GridEventManager };
