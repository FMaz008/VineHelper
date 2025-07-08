/**
 * NoShiftGrid - Manages placeholder tiles to prevent grid shifting
 *
 * This class handles the insertion and management of placeholder tiles in the grid
 * to maintain consistent layout and prevent items from shifting positions when
 * new items are added or the grid is filtered.
 */
class NoShiftGrid {
	constructor(monitor) {
		this._monitor = monitor;
		this._gridContainer = null;
		this._gridWidth = 0;
		this._resizeTimeout = null;
		this._isEnabled = false;
		this._endPlaceholdersCount = 0;

		// Cache for tile width calculation
		this._cachedTileWidth = null;
		this._tileWidthCacheTime = 0;
		this._tileWidthCacheDuration = 1000; // Reduced to 1 second for better responsiveness

		// Placeholder update state management
		this._isUpdatingPlaceholders = false;
		this._pendingUpdate = false;
		this._pendingForceForFilter = false;
		this._lastPlaceholderUpdate = 0;
		this._placeholderUpdateCount = 0;
		this._minUpdateInterval = 50; // Minimum 50ms between updates

		this._boundResizeHandler = this._resizeHandler.bind(this);
		this._boundHandleTruncation = this.handleTruncation.bind(this);

		// Atomic update support
		this._atomicUpdateInProgress = false;
		this._atomicOperations = [];
	}

	/**
	 * Update the grid container (compatibility method for old API)
	 * @param {HTMLElement} gridContainer - The grid container element
	 */
	updateGridContainer(gridContainer) {
		// Call the new initialize method for compatibility
		this.initialize(gridContainer);
	}

	/**
	 * Initialize the NoShiftGrid with a grid container
	 * @param {HTMLElement} gridContainer - The grid container element
	 */
	initialize(gridContainer) {
		this._gridContainer = gridContainer;
		this._updateGridWidth();

		// Clear cache when grid container changes
		this._clearTileWidthCache();

		// Set up resize observer
		if (window.ResizeObserver) {
			this._resizeObserver = new ResizeObserver(this._boundResizeHandler);
			this._resizeObserver.observe(this._gridContainer);
		} else {
			// Fallback to window resize event
			window.addEventListener("resize", this._boundResizeHandler);
		}

		// Listen for truncation events using hookMgr if available
		if (this._monitor._hookMgr) {
			this._monitor._hookMgr.hookBind("grid:truncated", this._boundHandleTruncation);
		}
	}

	/**
	 * Clean up resources
	 */
	destroy() {
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
		} else {
			window.removeEventListener("resize", this._boundResizeHandler);
		}

		if (this._resizeTimeout) {
			clearTimeout(this._resizeTimeout);
		}

		// Remove truncation event listener
		if (this._monitor._hookMgr) {
			this._monitor._hookMgr.hookUnbind("grid:truncated", this._boundHandleTruncation);
		}
	}

	/**
	 * Handle resize events with debouncing
	 * @private
	 */
	_resizeHandler() {
		if (this._resizeTimeout) {
			clearTimeout(this._resizeTimeout);
		}

		this._resizeTimeout = setTimeout(() => {
			const oldWidth = this._gridWidth;
			this._updateGridWidth();

			if (Math.abs(oldWidth - this._gridWidth) > 1) {
				// Clear cache on resize as tile sizes may have changed
				this._clearTileWidthCache();

				const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
				if (debugPlaceholders) {
					console.log("[NoShiftGrid] Resize/zoom detected, recalculating grid width", {
						oldWidth: oldWidth,
						newWidth: this._gridWidth,
					});
				}

				// Emit resize event using hookMgr if available
				if (this._monitor._hookMgr) {
					this._monitor._hookMgr.hookExecute("grid:resized", {
						oldWidth: oldWidth,
						newWidth: this._gridWidth,
						isEnabled: this._isEnabled,
					});
				}
			}
		}, 100);
	}

	/**
	 * Clear the tile width cache
	 * @private
	 */
	_clearTileWidthCache() {
		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
		if (debugPlaceholders && this._cachedTileWidth !== null) {
			console.log("[NoShiftGrid] Clearing tile width cache", {
				previousWidth: this._cachedTileWidth,
				cacheAge: this._tileWidthCacheTime ? Date.now() - this._tileWidthCacheTime : 0,
			});
		}
		this._cachedTileWidth = null;
		this._tileWidthCacheTime = 0;
	}

	/**
	 * Update the grid width from the container
	 * @private
	 */
	_updateGridWidth() {
		if (!this._gridContainer) return;

		const rect = this._gridContainer.getBoundingClientRect();
		const computedStyle = window.getComputedStyle(this._gridContainer);
		const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
		const paddingRight = parseFloat(computedStyle.paddingRight) || 0;

		const oldWidth = this._gridWidth;
		this._gridWidth = Math.floor(rect.width - paddingLeft - paddingRight);

		// Only log significant changes to reduce noise
		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
		if (debugPlaceholders && Math.abs(oldWidth - this._gridWidth) > 10) {
			console.log("[NoShiftGrid] Grid width changed significantly", {
				oldWidth: oldWidth,
				newWidth: this._gridWidth,
				difference: Math.abs(oldWidth - this._gridWidth),
				containerElement: this._gridContainer,
			});
		}
	}

	/**
	 * Enable the NoShiftGrid functionality
	 */
	enable() {
		this._isEnabled = true;
		this.insertPlaceholderTiles();
	}

	/**
	 * Disable the NoShiftGrid functionality
	 */
	disable() {
		this._isEnabled = false;
		this.removeAllPlaceholderTiles();
	}

	/**
	 * Check if NoShiftGrid is enabled
	 * @returns {boolean}
	 */
	isEnabled() {
		return this._isEnabled;
	}

	/**
	 * Reset the end placeholders count to 0
	 * This is called after fetch operations complete to prevent accumulation
	 */
	resetEndPlaceholdersCount() {
		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
		const oldCount = this._endPlaceholdersCount;

		this._endPlaceholdersCount = 0;

		if (debugPlaceholders && oldCount > 0) {
			console.log("[NoShiftGrid] Reset end placeholders count", {
				oldCount,
				newCount: this._endPlaceholdersCount,
			});
		}
	}

	/**
	 * Handle grid truncation events
	 * @param {Object} data - Event data containing removedCount
	 */
	handleTruncation(data) {
		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");

		if (data.removedCount > 0) {
			// Update end placeholders count based on removed items
			const oldCount = this._endPlaceholdersCount;
			this._endPlaceholdersCount = Math.max(0, this._endPlaceholdersCount - data.removedCount);

			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Handling truncation event", {
					removedCount: data.removedCount,
					oldEndPlaceholdersCount: oldCount,
					newEndPlaceholdersCount: this._endPlaceholdersCount,
				});
			}

			// Re-insert placeholders if needed
			if (this._isEnabled) {
				this.insertPlaceholderTiles();
			}
		}
	}

	/**
	 * Insert placeholder tiles to maintain grid structure
	 * @param {boolean} forceForFilter - Force insertion for filter operations
	 */
	insertPlaceholderTiles(forceForFilter = false) {
		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
		const callId = Date.now();

		if (!this._isEnabled || !this._gridContainer) {
			return;
		}

		// Check minimum update interval to prevent rapid updates
		const timeSinceLastUpdate = callId - this._lastPlaceholderUpdate;
		if (timeSinceLastUpdate < this._minUpdateInterval && !forceForFilter) {
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Skipping update - too soon since last update", {
					callId,
					timeSinceLastUpdate,
					minInterval: this._minUpdateInterval,
				});
			}
			return;
		}

		// Track rapid updates to detect potential loops
		if (timeSinceLastUpdate < 200) {
			this._placeholderUpdateCount++;
			if (this._placeholderUpdateCount > 10) {
				console.warn("[NoShiftGrid] Detected rapid placeholder updates, possible loop", {
					updateCount: this._placeholderUpdateCount,
					timeSinceLastUpdate,
				});
				// Reset counter and enforce a cooldown
				this._placeholderUpdateCount = 0;
				this._lastPlaceholderUpdate = callId + 500; // 500ms cooldown
				return;
			}
		} else {
			// Reset counter if enough time has passed
			this._placeholderUpdateCount = 0;
		}

		// Check if we're in a pending update loop
		if (this._isUpdatingPlaceholders) {
			this._pendingUpdate = true;
			this._pendingForceForFilter = forceForFilter || this._pendingForceForFilter;
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Placeholder update already in progress, queuing", {
					callId,
					pendingUpdate: this._pendingUpdate,
					pendingForceForFilter: this._pendingForceForFilter,
				});
			}
			return;
		}

		this._isUpdatingPlaceholders = true;
		this._lastPlaceholderUpdate = callId;

		try {
			// Get current state
			const visibleItemsCount = this._monitor.getTileCounter()?.getCount() || 0;
			const sortType = this._monitor._sortType;
			const fetchingRecentItems = this._monitor._fetchingRecentItems;

			// Calculate how many placeholder tiles we need
			const tileWidth = this._calculateTileWidth();
			const tilesPerRow = Math.floor(this._gridWidth / tileWidth);

			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Starting placeholder calculation", {
					callId,
					visibleItemsCount,
					tileWidth,
					gridWidth: this._gridWidth,
					tilesPerRow,
					forceForFilter,
					fetchingRecentItems,
					sortType,
					timestamp: Date.now(),
				});
			}

			// For date sorting, we need to add placeholders at the beginning
			// to complete the first row of visible items
			let numPlaceholderTiles = 0;

			if (sortType === "date_desc" || sortType === "date_asc") {
				// Calculate how many items would be in the last incomplete row
				const remainder = visibleItemsCount % tilesPerRow;

				// If there's a remainder, we need placeholders to complete the row
				if (remainder > 0) {
					numPlaceholderTiles = tilesPerRow - remainder;
				}

				// During fetch operations, we might need to adjust for visibility state
				if (fetchingRecentItems && this._monitor._visibilityState) {
					const visibilityStateCount = Object.keys(this._monitor._visibilityState).length;
					if (visibilityStateCount > visibleItemsCount) {
						// Some items are hidden, adjust placeholder count
						const adjustedTotal = visibilityStateCount + this._endPlaceholdersCount;
						const adjustedRemainder = adjustedTotal % tilesPerRow;
						if (adjustedRemainder > 0) {
							numPlaceholderTiles = tilesPerRow - adjustedRemainder;
						}
					}
				}
			}

			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Placeholder calculation logic", {
					sortType,
					isDateSort: sortType === "date_desc" || sortType === "date_asc",
					visibleItemsCount,
					tilesPerRow,
					remainder: visibleItemsCount % tilesPerRow,
					numPlaceholderTiles,
					fetchingRecentItems,
					hasVisibilityState: !!this._monitor._visibilityState,
					visibilityStateCount: this._monitor._visibilityState
						? Object.keys(this._monitor._visibilityState).length
						: 0,
				});
			}

			// Always use the calculated placeholder count for proper grid updates
			const finalPlaceholderCount = forceForFilter
				? numPlaceholderTiles
				: Math.max(numPlaceholderTiles, this._getExistingPlaceholderCount());

			// Get current placeholder count
			const currentPlaceholderCount = this._getExistingPlaceholderCount();

			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Placeholder calculation result", {
					callId,
					visibleItemsCount,
					tilesPerRow,
					remainder: visibleItemsCount % tilesPerRow,
					numPlaceholderTiles,
					finalPlaceholderCount,
					currentPlaceholderCount,
					needsUpdate: currentPlaceholderCount !== finalPlaceholderCount,
					timestamp: Date.now(),
				});
			}

			// Only update if the count has changed
			if (currentPlaceholderCount === finalPlaceholderCount) {
				if (debugPlaceholders) {
					console.log("[NoShiftGrid] Placeholder count unchanged, skipping DOM update", {
						callId,
						count: finalPlaceholderCount,
					});
				}
				return;
			}

			// To avoid the "jump in" effect, we need to update placeholders atomically
			// We'll create all new placeholders first, then swap them in a single operation

			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Updating placeholders", {
					callId,
					currentCount: currentPlaceholderCount,
					targetCount: finalPlaceholderCount,
					difference: finalPlaceholderCount - currentPlaceholderCount,
				});
			}

			// Function to perform the actual DOM update
			const performUpdate = () => {
				// Temporarily disable CSS transitions for placeholders
				const style = document.createElement("style");
				style.textContent = `
					.vh-placeholder-tile {
						transition: none !important;
					}
				`;
				document.head.appendChild(style);

				// Create an array to hold all children in their final order
				const allChildren = [];

				// Create new placeholders
				for (let i = 0; i < finalPlaceholderCount; i++) {
					const placeholder = document.createElement("div");
					placeholder.className = "vh-placeholder-tile vvp-item-tile vh-logo-vh";
					allChildren.push(placeholder);
				}

				// Add all non-placeholder tiles to the array
				const realTiles = Array.from(this._gridContainer.children).filter(
					(child) =>
						!child.classList.contains("vh-placeholder-tile") ||
						child.classList.contains("vh-end-placeholder")
				);
				allChildren.push(...realTiles);

				// Replace all children atomically
				this._gridContainer.replaceChildren(...allChildren);

				// Force layout recalculation
				void this._gridContainer.offsetHeight;

				// Re-enable transitions after a short delay
				setTimeout(() => {
					style.remove();
				}, 50);
			};

			// If we're in an atomic update, queue the operation for batch execution
			// Otherwise, use requestAnimationFrame for smooth visual updates
			if (this._atomicUpdateInProgress) {
				// Queue the operation instead of executing immediately
				this._atomicOperations.push(performUpdate);
				if (debugPlaceholders) {
					console.log("[NoShiftGrid] Queued placeholder update for atomic execution", {
						atomicOperationsLength: this._atomicOperations.length,
						callId,
						timestamp: Date.now(),
					});
				}
			} else {
				requestAnimationFrame(performUpdate);
			}

			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Placeholder update completed", {
					callId,
					oldCount: currentPlaceholderCount,
					newCount: finalPlaceholderCount,
					timestamp: Date.now(),
				});
			}
		} finally {
			// Mark as done updating
			this._isUpdatingPlaceholders = false;

			// If there was a pending update, process it now
			if (this._pendingUpdate) {
				this._pendingUpdate = false;
				const pendingForceForFilter = this._pendingForceForFilter || false;
				this._pendingForceForFilter = false;
				if (debugPlaceholders) {
					console.log("[NoShiftGrid] Processing pending update", {
						callId,
						pendingForceForFilter,
						timestamp: Date.now(),
					});
				}
				// Use setTimeout to avoid stack overflow
				setTimeout(() => this.insertPlaceholderTiles(pendingForceForFilter), 0);
			}
		}
	}

	/**
	 * Get the count of existing placeholder tiles
	 * @private
	 * @returns {number}
	 */
	_getExistingPlaceholderCount() {
		if (!this._gridContainer) return 0;
		return this._gridContainer.querySelectorAll(".vh-placeholder-tile").length;
	}

	/**
	 * Insert placeholder tiles at the start of the grid
	 * @private
	 * @param {number} count - Number of placeholders to insert
	 */
	_insertPlaceholderTilesAtStart(count) {
		if (!this._gridContainer || count <= 0) return;

		const operation = () => {
			const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");

			// Create document fragment for better performance
			const fragment = document.createDocumentFragment();

			// Create placeholder tiles
			for (let i = 0; i < count; i++) {
				const placeholder = document.createElement("div");
				placeholder.className = "vh-placeholder-tile vvp-item-tile vh-logo-vh";
				fragment.appendChild(placeholder);
			}

			// Insert at the beginning of the grid
			const firstChild = this._gridContainer.firstChild;
			if (firstChild) {
				this._gridContainer.insertBefore(fragment, firstChild);
			} else {
				this._gridContainer.appendChild(fragment);
			}

			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Inserted placeholders", {
					count,
					totalChildren: this._gridContainer.children.length,
				});
			}
		};

		// If atomic update is in progress, queue the operation
		if (this._atomicUpdateInProgress) {
			this._atomicOperations.push(operation);
		} else {
			operation();
		}
	}

	/**
	 * Remove all placeholder tiles from the grid
	 */
	removeAllPlaceholderTiles() {
		if (!this._gridContainer) return;

		const operation = () => {
			// Get all non-placeholder children to preserve
			const nonPlaceholders = Array.from(this._gridContainer.children).filter(
				(child) => !child.classList.contains("vh-placeholder-tile")
			);

			// Replace all children atomically with only non-placeholder items
			// This is more efficient than individual .remove() calls
			this._gridContainer.replaceChildren(...nonPlaceholders);
		};

		// If atomic update is in progress, queue the operation
		if (this._atomicUpdateInProgress) {
			this._atomicOperations.push(operation);
		} else {
			operation();
		}
	}

	/**
	 * Insert placeholder tiles at the end of the grid for removed items
	 * @param {number} count - Number of items that were removed
	 */
	insertEndPlaceholderTiles(count) {
		if (!this._isEnabled || !this._gridContainer || count <= 0) return;

		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");

		// Calculate how many tiles we need to complete the last row
		const tileWidth = this._calculateTileWidth();
		const tilesPerRow = Math.floor(this._gridWidth / tileWidth);

		// Update the end placeholders count
		const oldEndPlaceholdersCount = this._endPlaceholdersCount;
		this._endPlaceholdersCount += count;

		// Calculate if we need to insert any tiles to complete a row
		const totalItems = this._monitor.getTileCounter()?.getCount() || 0;
		const totalWithPlaceholders = totalItems + this._endPlaceholdersCount;
		const remainder = totalWithPlaceholders % tilesPerRow;
		const tilesToInsert = remainder === 0 ? 0 : count;

		if (debugPlaceholders) {
			console.log("[NoShiftGrid] insertEndPlaceholderTiles", {
				tilesToInsert,
				oldEndPlaceholdersCount,
				newEndPlaceholdersCount: this._endPlaceholdersCount,
				tilesPerRow,
			});
		}

		if (tilesToInsert > 0) {
			// Create and append placeholder tiles
			const fragment = document.createDocumentFragment();

			for (let i = 0; i < tilesToInsert; i++) {
				const placeholder = document.createElement("div");
				placeholder.className = "vh-placeholder-tile vvp-item-tile vh-logo-vh vh-end-placeholder";
				fragment.appendChild(placeholder);
			}

			this._gridContainer.appendChild(fragment);
		}

		// Trigger a re-calculation of start placeholders
		this.insertPlaceholderTiles();
	}

	/**
	 * Calculate the width of a tile including margins
	 * @private
	 * @returns {number} The width of a tile in pixels
	 */
	_calculateTileWidth() {
		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
		const now = Date.now();

		// Check if we have a valid cached value
		if (
			this._cachedTileWidth !== null &&
			this._cachedTileWidth > 50 &&
			now - this._tileWidthCacheTime < this._tileWidthCacheDuration
		) {
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Using cached tile width", {
					cachedWidth: this._cachedTileWidth,
					cacheAge: now - this._tileWidthCacheTime,
					timestamp: now,
				});
			}
			return this._cachedTileWidth;
		}

		// Clear invalid cached values
		if (this._cachedTileWidth !== null && this._cachedTileWidth <= 50) {
			this._cachedTileWidth = null;
			this._tileWidthCacheTime = 0;
		}

		// Try to get tile width from CSS Grid
		const cssGridWidth = this._getTileWidthFromCSSGrid();
		if (cssGridWidth && cssGridWidth > 50) {
			this._cachedTileWidth = cssGridWidth;
			this._tileWidthCacheTime = now;
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Calculated tile width from CSS Grid", {
					width: cssGridWidth,
					timestamp: now,
				});
			}
			return cssGridWidth;
		}

		// Try to measure an actual tile or create a dummy one
		const measuredWidth = this._measureTileWidth();
		if (measuredWidth && measuredWidth > 50) {
			this._cachedTileWidth = measuredWidth;
			this._tileWidthCacheTime = now;
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Measured tile width from DOM", {
					width: measuredWidth,
					timestamp: now,
				});
			}
			return measuredWidth;
		}

		// Fall back to settings
		const settingWidth = parseInt(this._monitor._settings?.get("general.tileSize.width") || "236");
		const fallbackWidth = settingWidth + 1; // Add 1px for margin

		return fallbackWidth;
	}

	/**
	 * Get tile width from CSS Grid template
	 * @private
	 * @returns {number|null} The tile width or null if not found
	 */
	_getTileWidthFromCSSGrid() {
		if (!this._gridContainer) return null;

		const computedStyle = window.getComputedStyle(this._gridContainer);
		const gridTemplateColumns = computedStyle.gridTemplateColumns;

		if (!gridTemplateColumns || gridTemplateColumns === "none") {
			return null;
		}

		// Parse different grid template patterns
		// Examples:
		// - "repeat(auto-fill, minmax(236px, auto))"
		// - "199.141px 199.141px 199.141px 199.141px"
		// - "1fr 1fr 1fr"

		// Try to extract from repeat() with minmax
		const repeatMatch = gridTemplateColumns.match(/repeat\([^,]+,\s*minmax\((\d+(?:\.\d+)?)px/);
		if (repeatMatch) {
			return parseFloat(repeatMatch[1]);
		}

		// Try to extract from explicit pixel values
		const pixelMatch = gridTemplateColumns.match(/(\d+(?:\.\d+)?)px/);
		if (pixelMatch) {
			return parseFloat(pixelMatch[1]);
		}

		// If we have equal fr units, calculate based on grid width
		const frMatches = gridTemplateColumns.match(/(\d+(?:\.\d+)?)fr/g);
		if (frMatches && frMatches.length > 0) {
			// All fr values should be equal for a uniform grid
			const frCount = frMatches.length;
			return this._gridWidth / frCount;
		}

		return null;
	}

	/**
	 * Measure tile width by creating or finding a tile
	 * @private
	 * @returns {number|null} The measured width or null if failed
	 */
	_measureTileWidth() {
		// First try to find an existing tile
		let tile = this._gridContainer.querySelector(".vvp-item-tile:not(.vh-placeholder-tile)");
		let createdDummy = false;

		// If no tile exists, create a dummy one
		if (!tile) {
			tile = document.createElement("div");
			tile.className = "vvp-item-tile";
			tile.style.visibility = "hidden";
			tile.style.position = "absolute";

			this._gridContainer.appendChild(tile);
			createdDummy = true;

			// Force layout
			void tile.offsetHeight;
		}

		let width = null;

		try {
			// Get computed style
			const computedStyle = window.getComputedStyle(tile);

			// Try different measurement methods
			const rect = tile.getBoundingClientRect();
			const marginLeft = parseFloat(computedStyle.marginLeft) || 0;
			const marginRight = parseFloat(computedStyle.marginRight) || 0;

			// Method 1: getBoundingClientRect
			if (rect.width > 0) {
				width = rect.width + marginLeft + marginRight;
			}
			// Method 2: offsetWidth (for CSS Grid items with negative margins)
			else if (tile.offsetWidth > 0) {
				width = tile.offsetWidth + marginLeft + marginRight;
			}
			// Method 3: Check CSS width property
			else if (computedStyle.width && computedStyle.width !== "auto") {
				const cssWidth = parseFloat(computedStyle.width);
				if (cssWidth > 0) {
					width = cssWidth + marginLeft + marginRight;
				}
			}
		} finally {
			// Clean up dummy tile
			if (createdDummy && tile.parentNode) {
				tile.remove();
			}
		}

		return width;
	}

	/**
	 * Get the number of tiles per row
	 * @returns {number} Number of tiles per row
	 */
	getTilesPerRow() {
		if (!this._gridContainer) return 0;

		// Use the centralized tile width calculation which includes caching
		const tileWidth = this._calculateTileWidth();
		if (!tileWidth || tileWidth <= 0) return 1;

		return Math.floor(this._gridWidth / tileWidth) || 1;
	}

	/**
	 * Create a single placeholder tile element
	 * @returns {HTMLElement} The placeholder tile element
	 */
	createPlaceholderTile() {
		const placeholder = document.createElement("div");
		placeholder.className = "vh-placeholder-tile vvp-item-tile vh-logo-vh";
		return placeholder;
	}

	/**
	 * Begin an atomic update operation
	 * All DOM operations will be batched until endAtomicUpdate is called
	 */
	beginAtomicUpdate() {
		if (this._atomicUpdateInProgress) {
			console.warn("[NoShiftGrid] Atomic update already in progress");
			return;
		}

		this._atomicUpdateInProgress = true;
		this._atomicOperations = [];

		// Atomic update started
		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			console.log("[NoShiftGrid] Beginning atomic update", {
				operationsLength: this._atomicOperations.length,
				timestamp: Date.now(),
				stackTrace: new Error().stack,
			});
		}
	}

	/**
	 * End an atomic update operation and apply all batched changes
	 * Uses requestAnimationFrame to ensure smooth visual updates
	 */
	endAtomicUpdate() {
		if (!this._atomicUpdateInProgress) {
			console.warn("[NoShiftGrid] No atomic update in progress");
			return;
		}

		const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");

		// Apply all operations in a single frame
		requestAnimationFrame(() => {
			const startTime = performance.now();

			// Temporarily disable CSS transitions for placeholders
			const style = document.createElement("style");
			style.textContent = `
				.vh-placeholder-tile {
					transition: none !important;
				}
			`;
			document.head.appendChild(style);

			// Apply all batched operations
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Executing batched operations", {
					operationCount: this._atomicOperations.length,
					timestamp: Date.now(),
				});
			}

			for (let i = 0; i < this._atomicOperations.length; i++) {
				if (debugPlaceholders) {
					console.log(`[NoShiftGrid] Executing operation ${i + 1}/${this._atomicOperations.length}`);
				}
				this._atomicOperations[i]();
			}

			// Force layout recalculation
			if (this._gridContainer) {
				void this._gridContainer.offsetHeight;
			}

			// Re-enable transitions after a short delay
			setTimeout(() => {
				style.remove();
			}, 50);

			// Atomic update completed
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Atomic update completed", {
					operationCount: this._atomicOperations.length,
					duration: `${(performance.now() - startTime).toFixed(2)}ms`,
					timestamp: new Date().toISOString(),
				});
			}

			// Reset atomic update state
			this._atomicUpdateInProgress = false;
			this._atomicOperations = [];
		});
	}
}

export { NoShiftGrid };
