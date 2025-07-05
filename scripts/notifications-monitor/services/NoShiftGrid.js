const TYPE_DATE_DESC = "date_desc";

/**
 * NoShiftGrid - Manages placeholder tiles to prevent grid shifting
 *
 * This service ensures that items remain in their columns when new items are added
 * by inserting placeholder tiles at the beginning of the grid.
 */
class NoShiftGrid {
	_monitor = null;
	_visibilityStateManager = null;
	_gridWidth = 0;
	_endPlaceholdersCount = 0;
	_endPlaceholdersCountBuffer = 0;
	#isUpdatingPlaceholders = false;
	#pendingUpdate = false;
	#pendingForceForFilter = false;

	constructor(monitorInstance, visibilityStateManager) {
		this._monitor = monitorInstance;
		this._visibilityStateManager = visibilityStateManager;
		this._resizeHandler = null;
		this._resizeTimer = null;
		this.#setupEventListener();
		this.#calculateGridWidth();
	}

	/**
	 * Update the grid container reference
	 * @param {HTMLElement} gridContainer - The new grid container element
	 */
	updateGridContainer(gridContainer) {
		this._monitor._gridContainer = gridContainer;
		this.#calculateGridWidth();

		// Set up ResizeObserver for the new container
		if (window.ResizeObserver && gridContainer) {
			// Disconnect existing observer if any
			if (this._resizeObserver) {
				this._resizeObserver.disconnect();
			}

			// Create new observer for the grid container
			this._resizeObserver = new ResizeObserver((entries) => {
				// Trigger resize handler when container size changes
				this._resizeHandler();
			});

			// Observe the new grid container
			this._resizeObserver.observe(gridContainer);
		}
	}

	#setupEventListener() {
		// Debounce resize events to avoid calculation during resize animation
		this._resizeHandler = () => {
			clearTimeout(this._resizeTimer);
			this._resizeTimer = setTimeout(() => {
				// Check if grid width actually changed
				const oldWidth = this._gridWidth;
				this.#calculateGridWidth();

				// Only proceed if width actually changed
				if (oldWidth !== this._gridWidth) {
					const debugPlaceholders = this._monitor._settings.get("general.debugPlaceholders");
					if (debugPlaceholders) {
						console.log("[NoShiftGrid] Resize/zoom detected, recalculating grid width", {
							oldWidth,
							newWidth: this._gridWidth,
						});
					}

					// Emit event instead of direct call to ensure proper batching
					if (this._monitor && this._monitor._hookMgr) {
						this._monitor._hookMgr.hookExecute("grid:resized");
					}
				}
			}, 50); // Reduced delay for more responsive updates
		};

		window.addEventListener("resize", this._resizeHandler);

		// Store initial DPR and check for changes
		this._lastDevicePixelRatio = window.devicePixelRatio || 1;

		// Check for DPR changes periodically as a fallback
		// This catches zoom changes that don't trigger resize events
		this._zoomCheckInterval = setInterval(() => {
			const currentDPR = window.devicePixelRatio || 1;
			if (Math.abs(currentDPR - this._lastDevicePixelRatio) > 0.001) {
				this._lastDevicePixelRatio = currentDPR;

				const debugPlaceholders = this._monitor._settings.get("general.debugPlaceholders");
				if (debugPlaceholders) {
					console.log("[NoShiftGrid] Zoom change detected via DPR check", {
						oldDPR: this._lastDevicePixelRatio,
						newDPR: currentDPR,
					});
				}

				// Trigger immediate update without debounce for zoom changes
				this.#calculateGridWidth();
				if (this._monitor && this._monitor._hookMgr) {
					this._monitor._hookMgr.hookExecute("grid:resized");
				}
			}
		}, 200); // Check every 200ms for more responsive zoom detection
	}

	/**
	 * Calculate and cache the grid width
	 * @private
	 */
	#calculateGridWidth() {
		if (this._monitor._gridContainer) {
			const oldWidth = this._gridWidth;
			this._gridWidth = this._monitor._gridContainer.offsetWidth;

			const debugPlaceholders = this._monitor._settings.get("general.debugPlaceholders");
			if (debugPlaceholders && oldWidth !== this._gridWidth) {
				console.log("[NoShiftGrid] Grid width changed", {
					oldWidth,
					newWidth: this._gridWidth,
					containerElement: this._monitor._gridContainer,
				});
			}
		}
	}

	/**
	 * Reset the end placeholders count
	 * This should be called after fetch completes to prevent accumulation
	 */
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
	 * @param {boolean} forceForFilter - Force placeholder insertion for filter operations
	 */
	insertPlaceholderTiles(forceForFilter = false) {
		// Prevent concurrent updates
		if (this.#isUpdatingPlaceholders) {
			this.#pendingUpdate = true;
			return;
		}

		// Skip if feed is paused
		if (this._monitor._fetchingRecentItems) {
			const debugPlaceholders = this._monitor._settings?.get("general.debugPlaceholders");
			if (debugPlaceholders) {
				console.log("[NoShiftGrid] Skipping placeholder insertion - fetching recent items");
			}
			return;
		}

		// Allow placeholders for filters regardless of sort type, otherwise only for date DESC
		if (!forceForFilter && this._monitor._sortType != TYPE_DATE_DESC) {
			return;
		}

		// Mark as updating
		this.#isUpdatingPlaceholders = true;
		this.#pendingForceForFilter = forceForFilter; // Store the parameter for pending updates

		try {
			// Ensure we have the current grid width
			this.#calculateGridWidth();

			// Don't proceed if grid has no width
			if (this._gridWidth <= 0) {
				return;
			}

			// Use VisibilityStateManager count if available for consistency
			let visibleItemsCount;
			let debugInfo = {};

			if (this._visibilityStateManager) {
				visibleItemsCount = this._visibilityStateManager.getCount();
				debugInfo.source = "VisibilityStateManager";
			} else {
				// Fallback to DOM count using computed styles
				const allTiles = this._monitor._gridContainer.querySelectorAll(
					".vvp-item-tile:not(.vh-placeholder-tile)"
				);

				// Performance optimization: batch style calculations
				// Force a single reflow by reading offsetHeight first
				void this._monitor._gridContainer.offsetHeight;

				// Count hidden tiles by checking computed style
				let hiddenCount = 0;

				// For Safari and large item counts, use optimized approach
				const useOptimizedApproach = this._monitor._env.isSafari() || allTiles.length > 50;

				if (useOptimizedApproach) {
					// Batch read all computed styles at once to minimize reflows
					const tilesToCheck = Array.from(allTiles);
					const computedStyles = tilesToCheck.map((tile) => window.getComputedStyle(tile).display);

					// Now process the results without triggering additional reflows
					for (const display of computedStyles) {
						if (display === "none") {
							hiddenCount++;
						}
					}
				} else {
					// For smaller counts, use direct approach
					for (const tile of allTiles) {
						const computedStyle = window.getComputedStyle(tile);
						if (computedStyle.display === "none") {
							hiddenCount++;
						}
					}
				}

				visibleItemsCount = allTiles.length - hiddenCount;
				debugInfo.source = "DOM count";
				debugInfo.totalTiles = allTiles.length;
				debugInfo.hiddenCount = hiddenCount;
			}

			// Debug logging
			const debugPlaceholders = this._monitor._settings.get("general.debugPlaceholders");
			// Only log starting calculation if debugging and something might change
			if (debugPlaceholders && forceForFilter) {
				console.log("[NoShiftGrid] Starting placeholder calculation", {
					visibleItemsCount,
					visibilityStateCount: this._visibilityStateManager?.getCount(),
					endPlaceholdersCount: this._endPlaceholdersCount,
					gridWidth: this._gridWidth,
					forceForFilter,
					sortType: this._monitor._sortType,
					...debugInfo,
				});
			}

			//Re-calculate the total number of items in the grid
			const theoricalItemsCount = visibleItemsCount + this._endPlaceholdersCount;

			// Calculate the actual tile width
			const tileWidth = this._calculateTileWidth();

			//Calculate the number of tiles per row
			const tilesPerRow = Math.floor(this._gridWidth / tileWidth);

			//Calculate the number of placeholder tiles we need to insert
			// When items would start a new row (remainder = 0), we need a full row of placeholders
			// Otherwise, we need enough to complete the current row
			const remainder = theoricalItemsCount % tilesPerRow;
			const numPlaceholderTiles = remainder === 0 ? 0 : tilesPerRow - remainder;

			// For filters, we always want to maintain alignment, so ensure we have placeholders
			// to keep items in their columns
			const finalPlaceholderCount =
				forceForFilter && numPlaceholderTiles === 0 && visibleItemsCount > 0
					? tilesPerRow
					: numPlaceholderTiles;

			// Only modify DOM if placeholder count changed
			const currentPlaceholders = this._monitor._gridContainer.querySelectorAll(".vh-placeholder-tile");

			// Debug logging - only log when debug is enabled AND (count changes OR force filter)
			if (debugPlaceholders && (finalPlaceholderCount !== currentPlaceholders.length || forceForFilter)) {
				console.log("[NoShiftGrid] Placeholder calculation result", {
					theoricalItemsCount,
					tilesPerRow,
					remainder,
					numPlaceholderTiles,
					finalPlaceholderCount,
					calculation: `remainder=${remainder}, placeholders=${numPlaceholderTiles}, final=${finalPlaceholderCount}`,
					tileWidth,
					gridWidth: this._gridWidth,
					currentPlaceholderCount: currentPlaceholders.length,
				});
			}
			// For filter operations, we need to reposition placeholders even if count is unchanged
			// because items may have been filtered out from different positions
			if (currentPlaceholders.length === finalPlaceholderCount && !forceForFilter) {
				// Only log if explicitly debugging placeholders (not for every operation)
				if (debugPlaceholders) {
					console.log("[NoShiftGrid] Placeholder count unchanged, skipping DOM update");
				}
				return;
			}

			// Use DocumentFragment to batch DOM operations and prevent flickering
			const fragment = document.createDocumentFragment();

			// Remove existing placeholders - use for...of to avoid function allocation
			for (const p of currentPlaceholders) {
				p.remove();
			}

			// Create new placeholders
			for (let i = 0; i < finalPlaceholderCount; i++) {
				const placeholderTile = document.createElement("div");
				placeholderTile.classList.add("vh-placeholder-tile");
				placeholderTile.classList.add("vvp-item-tile");
				placeholderTile.classList.add("vh-logo-vh");
				fragment.appendChild(placeholderTile);
			}

			// Insert all placeholders at once at the beginning
			if (fragment.childNodes.length > 0) {
				if (debugPlaceholders) {
					// Log detailed grid state before insertion
					const gridChildren = Array.from(this._monitor._gridContainer.children);
					const placeholderPositions = [];
					const itemPositions = [];

					gridChildren.forEach((child, index) => {
						if (child.classList.contains("vh-placeholder-tile")) {
							placeholderPositions.push(index);
						} else {
							itemPositions.push({
								index,
								asin: child.dataset?.asin || "unknown",
								display: child.style.display,
							});
						}
					});

					console.log("[NoShiftGrid] BEFORE placeholder insertion", {
						placeholderCount: fragment.childNodes.length,
						existingPlaceholderPositions: placeholderPositions,
						itemPositions: itemPositions.slice(0, 10), // First 10 items
						totalChildren: this._monitor._gridContainer.children.length,
						firstChildType: this._monitor._gridContainer.firstChild?.classList?.contains(
							"vh-placeholder-tile"
						)
							? "placeholder"
							: "item",
						gridWidth: this._gridWidth,
						tilesPerRow: Math.floor(this._gridWidth / this._calculateTileWidth()),
					});
				}

				// CRITICAL: Always insert placeholders at the very beginning
				// This ensures they don't end up in the middle of rows
				this._monitor._gridContainer.insertBefore(fragment, this._monitor._gridContainer.firstChild);

				// Log state after insertion (still within the outer debugPlaceholders check)
				if (debugPlaceholders) {
					const gridChildren = Array.from(this._monitor._gridContainer.children);
					const placeholderPositions = [];

					gridChildren.forEach((child, index) => {
						if (child.classList.contains("vh-placeholder-tile")) {
							placeholderPositions.push(index);
						}
					});

					console.log("[NoShiftGrid] AFTER placeholder insertion", {
						newPlaceholderPositions: placeholderPositions,
						totalChildren: this._monitor._gridContainer.children.length,
						placeholdersAtStart: placeholderPositions.every((pos, idx) => pos === idx),
					});
				}
			}
		} finally {
			// Mark as done updating
			this.#isUpdatingPlaceholders = false;

			// If there was a pending update, process it now
			if (this.#pendingUpdate) {
				this.#pendingUpdate = false;
				const pendingForceForFilter = this.#pendingForceForFilter || false;
				this.#pendingForceForFilter = false;
				// Use setTimeout to avoid stack overflow
				setTimeout(() => this.insertPlaceholderTiles(pendingForceForFilter), 0);
			}
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
		const tileWidth = this._calculateTileWidth();
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
	 * Calculate the width of a single tile including margins
	 * @private
	 * @returns {number} The width of a tile in pixels
	 */
	_calculateTileWidth() {
		//ToDo: Find a better way to precisely calculate the actual tile width (with 2 decimal places)
		return this._monitor._settings.get("notification.monitor.tileSize.width") + 1;
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

		// Disconnect ResizeObserver
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}

		// Clear zoom check interval
		if (this._zoomCheckInterval) {
			clearInterval(this._zoomCheckInterval);
			this._zoomCheckInterval = null;
		}

		// Clear references
		this._monitor = null;
		this._visibilityStateManager = null;
	}
}

export { NoShiftGrid };
