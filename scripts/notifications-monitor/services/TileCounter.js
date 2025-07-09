const STATE_WAITING = 1;
const STATE_COUNTING = 2;
const STATE_READY = 3;

import { HookMgr } from "/scripts/core/utils/HookMgr.js";

class TileCounter {
	#count = 0;
	#state = STATE_READY;
	#timeoutInstance = null;
	#hookMgr = null;
	#monitor = null;

	//Non-critical variables:
	//#visibilityCache = null;
	//#cacheTimeout = null;
	#performanceMetrics = {
		enabled: false,
		lastRecountDuration: 0,
		recountHistory: [],
		earlyExitSavings: 0,
		averageCheckedTiles: 0,
		totalCheckedTiles: 0,
		totalPossibleTiles: 0,
	};

	constructor(monitor) {
		this.#monitor = monitor;
		this.#hookMgr = new HookMgr();
	}

	/**
	 * Manually alter the count for known reasons
	 * @param {number} value - The value to add to the count
	 */
	alterCount(value) {
		this.#count += value;
		this.#hookMgr.hookExecute("nm-update-tab-title");

		// Update placeholders
		if (this.#monitor._noShiftGrid) {
			this.#monitor._noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Recount the number of tiles on the page
	 * @param {number} waitTime - The time to wait before recounting the tiles, in milliseconds
	 * @param {Object} options - Additional options for the recount
	 * @param {boolean} options.isBulkOperation - Whether this is a bulk operation
	 */
	recountVisibleTiles(waitTime = 50, options = {}) {
		if (this.#performanceMetrics.enabled) {
			console.log("[TileCounter] recountVisibleTiles called with:", {
				waitTime,
				options,
				effectiveWaitTime: waitTime,
			});
		}

		this.#state = STATE_WAITING;

		// Clear any existing timeout
		window.clearTimeout(this.#timeoutInstance);

		// Create a new timeout
		if (waitTime === 0) {
			this.#startRecount(options);
		} else {
			this.#timeoutInstance = setTimeout(() => {
				this.#startRecount(options);
			}, waitTime);
		}
	}

	/**
	 * Start the recount timer
	 * @param {Object} options - Options passed from recountVisibleTiles
	 */
	#startRecount(options = {}) {
		this.#state = STATE_COUNTING;

		if (this.#performanceMetrics.enabled) {
			console.log("[TileCounter] Starting recount with options:", options);
		}
		const startTime = this.#performanceMetrics.enabled ? performance.now() : 0;

		// Get the grid element
		const grid = document.querySelector("#vvp-items-grid");
		if (!grid) {
			throw new Error("Grid #vvp-items-grid not found");
		}

		// Get all tiles at once
		const tiles = grid.querySelectorAll(
			'.vvp-item-tile:not(.vh-placeholder-tile)[data-display]:not([data-display="none"])'
		);

		// Store the previous count BEFORE updating
		const previousCount = this.#count;
		let count = tiles.length;

		/*
        // Optimize visibility checking
		if (this.#visibilityCache) {
			// Use cached visibility data if available
			count = this.#countWithCache(tiles);
		} else {
			// Batch DOM reads to minimize reflows
			count = this.#batchedVisibilityCheck(tiles);
		}
		*/
		//count = this.#justCountTheGoddamnTiles(tiles);

		// Update the count
		this.#count = count;
		this.#state = STATE_READY;

		// Track performance metrics
		if (this.#performanceMetrics.enabled) {
			const duration = performance.now() - startTime;
			this.#performanceMetrics.lastRecountDuration = duration;
			this.#performanceMetrics.recountHistory.push({
				timestamp: Date.now(),
				duration,
				tileCount: tiles.length,
				visibleCount: count,
			});

			// Keep only last 100 entries
			if (this.#performanceMetrics.recountHistory.length > 100) {
				this.#performanceMetrics.recountHistory.shift();
			}

			console.log(
				`[TileCounter] Recount completed in ${duration.toFixed(2)}ms - ${count}/${tiles.length} visible tiles`
			);
		}

		const countChanged = previousCount !== count;

		if (this.#performanceMetrics.enabled) {
			console.log("[TileCounter] Triggering nm-update-tab-title hook:", {
				count: count,
				previousCount: previousCount,
				changed: countChanged,
				source: options.source || "recount",
				isBulkOperation: options.isBulkOperation || false,
			});
		}

		//Will update the tab title, no need for any options.
		this.#hookMgr.hookExecute("nm-update-tab-title");

		// Update placeholders
		if (this.#monitor._noShiftGrid) {
			this.#monitor._noShiftGrid.insertPlaceholderTiles();
		}

		// Clear cache after successful recount
		//this.#clearCache();
	}

	/**
	 * Perform batched visibility check to minimize reflows
	 * @param {NodeList} tiles - The tiles to check
	 * @returns {number} The count of visible tiles
	 */
	/*
	#batchedVisibilityCheck(tiles) {
		let count = 0;

		// Force a single reflow/repaint before reading
		const grid = document.querySelector("#vvp-items-grid");
		if (grid) {
			void grid.offsetHeight;
		}

		// Early exit optimization for large tile sets
		const tilesArray = Array.from(tiles);
		const totalTiles = tilesArray.length;

		// If we have many tiles, use early exit strategy
		if (totalTiles > 200) {
			return this.#batchedVisibilityCheckWithEarlyExit(tilesArray);
		}

		// OPTIMIZED: Check inline styles first (no reflow)
		// Only use getComputedStyle as fallback
		this.#visibilityCache = new Map();

		for (let i = 0; i < tiles.length; i++) {
			const tile = tiles[i];
			let isVisible = false;

			// First check inline style (no reflow)
			if (tile.style.display === "none") {
				isVisible = false;
			} else if (tile.style.display === "flex" || tile.style.display === "block") {
				// Explicitly set to visible
				isVisible = true;
			} else {
				// Fallback to computed style only when necessary
				const style = window.getComputedStyle(tile);
				isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
			}

			this.#visibilityCache.set(tile, isVisible);

			if (isVisible) {
				count++;
			}
		}

		// Set cache expiration
		this.#setCacheExpiration();

		return count;
	}
        */

	/**
	 * Optimized visibility check with early exit for large tile sets
	 * @param {Array} tilesArray - Array of tile elements
	 * @returns {number} The count of visible tiles
	 */
	/*
	#batchedVisibilityCheckWithEarlyExit(tilesArray) {
		const startTime = this.#performanceMetrics.enabled ? performance.now() : 0;
		let count = 0;

		// Create visibility cache
		this.#visibilityCache = new Map();

		// Determine expected visible tiles based on typical grid size
		// Most users see 50-100 tiles max on screen
		const maxExpectedVisible = 150;

		// Sort tiles by likelihood of being visible
		// Tiles at the top of the grid are more likely to be visible
		const prioritizedTiles = this.#prioritizeTilesByPosition(tilesArray);

		// Phase 1: Check most likely visible tiles
		const phase1Limit = Math.min(prioritizedTiles.length, maxExpectedVisible * 2);
		let checkedCount = 0;

		for (let i = 0; i < phase1Limit; i++) {
			const tile = prioritizedTiles[i];
			let isVisible = false;

			// OPTIMIZED: Check inline styles first (no reflow)
			if (tile.style.display === "none") {
				isVisible = false;
			} else if (tile.style.display === "flex" || tile.style.display === "block") {
				isVisible = true;
			} else {
				// Fallback to computed style only when necessary
				const style = window.getComputedStyle(tile);
				isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
			}

			this.#visibilityCache.set(tile, isVisible);
			checkedCount++;

			if (isVisible) {
				count++;
			}

			// Early exit if we've found enough visible tiles
			if (count >= maxExpectedVisible && i >= maxExpectedVisible * 1.5) {
				if (this.#performanceMetrics.enabled) {
					console.log(
						`[TileCounter] Early exit triggered: found ${count} visible tiles after checking ${checkedCount}/${prioritizedTiles.length}`
					);
				}
				break;
			}
		}

		// Phase 2: If we haven't found many visible tiles, check remaining
		// IMPORTANT: For filters like "Regular only" with 500+ items, we need to check them all
		if (checkedCount < prioritizedTiles.length) {
			if (this.#performanceMetrics.enabled) {
				console.log(
					`[TileCounter] Entering phase 2: found ${count} visible tiles so far, checking remaining ${
						prioritizedTiles.length - checkedCount
					}`
				);
			}

			for (let i = checkedCount; i < prioritizedTiles.length; i++) {
				const tile = prioritizedTiles[i];
				let isVisible = false;

				// OPTIMIZED: Check inline styles first
				if (tile.style.display === "none") {
					isVisible = false;
				} else if (tile.style.display === "flex" || tile.style.display === "block") {
					isVisible = true;
				} else {
					// Fallback to computed style only when necessary
					const style = window.getComputedStyle(tile);
					isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
				}

				this.#visibilityCache.set(tile, isVisible);
				checkedCount++;

				if (isVisible) {
					count++;
				}
			}
		}

		// Track performance metrics
		if (this.#performanceMetrics.enabled) {
			const duration = performance.now() - startTime;
			const savings = ((prioritizedTiles.length - checkedCount) / prioritizedTiles.length) * 100;

			this.#performanceMetrics.earlyExitSavings = savings;
			this.#performanceMetrics.totalCheckedTiles += checkedCount;
			this.#performanceMetrics.totalPossibleTiles += prioritizedTiles.length;
			this.#performanceMetrics.averageCheckedTiles =
				this.#performanceMetrics.totalCheckedTiles / (this.#performanceMetrics.recountHistory.length + 1);

			console.log(
				`[TileCounter] Early exit optimization: checked ${checkedCount}/${prioritizedTiles.length} tiles (${savings.toFixed(1)}% savings) in ${duration.toFixed(2)}ms`
			);
		}

		// Set cache expiration
		this.#setCacheExpiration();

		return count;
	}
    */
	/**
	 * Prioritize tiles by their position in the grid
	 * Tiles at the top are more likely to be visible
	 * @param {Array} tiles - Array of tile elements
	 * @returns {Array} Sorted array of tiles
	 */
	/*
	#prioritizeTilesByPosition(tiles) {
		// Get viewport bounds for reference
		const viewportHeight = window.innerHeight;
		const scrollTop = window.scrollY;
		const viewportBottom = scrollTop + viewportHeight;

		// Score each tile based on likelihood of visibility
		const tilesWithScores = tiles.map((tile) => {
			const rect = tile.getBoundingClientRect();
			const tileTop = rect.top + scrollTop;

			let score = 0;

			// Tiles in viewport get highest priority
			if (tileTop >= scrollTop && tileTop <= viewportBottom) {
				score = 1000;
			}
			// Tiles near viewport get medium priority
			else if (Math.abs(tileTop - scrollTop) < viewportHeight * 2) {
				score = 500;
			}
			// Tiles at the top of the document get some priority
			else if (tileTop < viewportHeight * 3) {
				score = 100;
			}

			return { tile, score, top: tileTop };
		});

		// Sort by score (descending) then by position (ascending)
		tilesWithScores.sort((a, b) => {
			if (a.score !== b.score) {
				return b.score - a.score;
			}
			return a.top - b.top;
		});

		return tilesWithScores.map((item) => item.tile);
	}
    */
	/**
	 * Count visible tiles using cached data
	 * @param {NodeList} tiles - The tiles to check
	 * @returns {number} The count of visible tiles
	 */
	/*
	#countWithCache(tiles) {
		let count = 0;
		let cacheHits = 0;
		let cacheMisses = 0;

		for (const tile of tiles) {
			if (this.#visibilityCache.has(tile)) {
				// Use cached visibility
				if (this.#visibilityCache.get(tile)) {
					count++;
				}
				cacheHits++;
			} else {
				// Fall back to computed style for new tiles
				const style = window.getComputedStyle(tile);
				const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";

				this.#visibilityCache.set(tile, isVisible);
				if (isVisible) {
					count++;
				}
				cacheMisses++;
			}
		}

		if (this.#performanceMetrics.enabled && cacheHits + cacheMisses > 0) {
			const hitRate = ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1);
			console.log(`[TileCounter] Cache hit rate: ${hitRate}% (${cacheHits} hits, ${cacheMisses} misses)`);
		}

		return count;
	}
    */
	/**
	 * Set cache expiration timer
	 */
	/*
	#setCacheExpiration() {
		// Clear any existing cache timeout
		if (this.#cacheTimeout) {
			clearTimeout(this.#cacheTimeout);
		}

		// Cache expires after 100ms (covers rapid bulk operations)
		this.#cacheTimeout = setTimeout(() => {
			this.#clearCache();
		}, 100);
	}
    */
	/**
	 * Clear the visibility cache
	 */
	/*
	#clearCache() {
		if (this.#visibilityCache) {
			this.#visibilityCache.clear();
			this.#visibilityCache = null;
		}

		if (this.#cacheTimeout) {
			clearTimeout(this.#cacheTimeout);
			this.#cacheTimeout = null;
		}
	}
    */
	/**
	 * Get the current count
	 * @returns {number} The current count
	 */
	getCount() {
		return this.#count;
	}

	/**
	 * Diagnostic method to verify tile count accuracy
	 * @returns {Object} Diagnostic information about tile counting
	 */
	diagnoseCount() {
		const grid = document.querySelector("#vvp-items-grid");
		if (!grid) {
			return { error: "Grid not found" };
		}

		// Get all tiles
		const allTiles = grid.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
		const placeholders = grid.querySelectorAll(".vh-placeholder-tile");

		// Manual count with detailed info
		const visibleTiles = [];
		const hiddenTiles = [];
		const edgeCases = [];

		allTiles.forEach((tile, index) => {
			const style = window.getComputedStyle(tile);
			const rect = tile.getBoundingClientRect();

			const visibility = {
				display: style.display,
				visibility: style.visibility,
				opacity: style.opacity,
				width: rect.width,
				height: rect.height,
				inlineDisplay: tile.style.display,
				classList: Array.from(tile.classList).join(" "),
				asin: tile.id?.replace("vh-notification-", "") || "unknown",
			};

			// Standard visibility check
			const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";

			// Additional edge case checks
			const hasZeroDimensions = rect.width === 0 || rect.height === 0;
			const isOffscreen = rect.bottom < 0 || rect.top > window.innerHeight;

			if (isVisible && !hasZeroDimensions && !isOffscreen) {
				visibleTiles.push(visibility);
			} else if (!isVisible) {
				hiddenTiles.push(visibility);
			} else {
				// Edge cases - technically visible but might not be
				visibility.zeroDimensions = hasZeroDimensions;
				visibility.offscreen = isOffscreen;
				edgeCases.push(visibility);
			}
		});

		const diagnosis = {
			reportedCount: this.#count,
			actualVisibleCount: visibleTiles.length,
			totalTiles: allTiles.length,
			placeholderCount: placeholders.length,
			hiddenCount: hiddenTiles.length,
			edgeCaseCount: edgeCases.length,
			discrepancy: visibleTiles.length - this.#count,
			visibleTiles: visibleTiles.slice(0, 5), // First 5 for brevity
			hiddenTiles: hiddenTiles.slice(0, 5),
			edgeCases: edgeCases,
		};

		console.log("[TileCounter] Diagnosis:", diagnosis);

		// If there's a discrepancy, log more details
		if (diagnosis.discrepancy !== 0) {
			console.warn("[TileCounter] Count discrepancy detected!", {
				reported: this.#count,
				actual: visibleTiles.length,
				difference: diagnosis.discrepancy,
			});

			// Log cache state
			/*if (this.#visibilityCache) {
				console.log("[TileCounter] Cache size:", this.#visibilityCache.size);
			}*/
		}

		return diagnosis;
	}

	/**
	 * Wait until the recount is complete
	 * @returns {Promise<void>} Promise that resolves when the recount is complete
	 */
	waitUntilCountComplete() {
		return new Promise((resolve, reject) => {
			const checkCount = () => {
				if (this.#state === STATE_READY) {
					resolve();
				} else {
					setTimeout(checkCount, 10);
				}
			};
			checkCount();
		});
	}

	/**
	 * Enable or disable performance metrics
	 * @param {boolean} enabled - Whether to enable performance metrics
	 */
	setPerformanceMetrics(enabled) {
		this.#performanceMetrics.enabled = enabled;
		if (!enabled) {
			this.#performanceMetrics.recountHistory = [];
		}
	}

	/**
	 * Get performance metrics
	 * @returns {Object} Performance metrics
	 */
	getPerformanceMetrics() {
		if (!this.#performanceMetrics.enabled) {
			return { enabled: false };
		}

		const history = this.#performanceMetrics.recountHistory;
		const avgDuration =
			history.length > 0 ? history.reduce((sum, entry) => sum + entry.duration, 0) / history.length : 0;

		const earlyExitStats =
			this.#performanceMetrics.totalPossibleTiles > 0
				? {
						averageEarlyExitSavings: this.#performanceMetrics.earlyExitSavings,
						averageCheckedTiles: this.#performanceMetrics.averageCheckedTiles,
						totalSavedChecks:
							this.#performanceMetrics.totalPossibleTiles - this.#performanceMetrics.totalCheckedTiles,
					}
				: {};

		return {
			enabled: true,
			lastRecountDuration: this.#performanceMetrics.lastRecountDuration,
			averageRecountDuration: avgDuration,
			recountCount: history.length,
			recentHistory: history.slice(-10), // Last 10 recounts
			...earlyExitStats,
		};
	}
}

export { TileCounter };
