const STATE_WAITING = 1;
const STATE_COUNTING = 2;
const STATE_READY = 3;

import { HookMgr } from "/scripts/core/utils/HookMgr.js";

class TileCounter {
	#count = 0;
	#state = STATE_READY;
	#timeoutInstance = null;
	#hookMgr = null;
	#visibilityCache = null;
	#cacheTimeout = null;
	#performanceMetrics = {
		enabled: false,
		lastRecountDuration: 0,
		recountHistory: [],
		earlyExitSavings: 0,
		averageCheckedTiles: 0,
		totalCheckedTiles: 0,
		totalPossibleTiles: 0,
	};

	constructor() {
		this.#hookMgr = new HookMgr();
	}

	/**
	 * Recount the number of tiles on the page
	 * @param {number} waitTime - The time to wait before recounting the tiles, in milliseconds
	 * @param {boolean} priority - If true, uses immediate execution for user-initiated actions
	 * @param {Object} options - Additional options for the recount
	 * @param {boolean} options.isBulkOperation - Whether this is a bulk operation
	 */
	recountVisibleTiles(waitTime = 50, priority = false, options = {}) {
		if (this.#performanceMetrics.enabled) {
			console.log("[TileCounter] recountVisibleTiles called with:", {
				waitTime,
				priority,
				options,
				effectiveWaitTime: priority ? 0 : waitTime,
			});
		}

		this.#state = STATE_WAITING;

		// Clear any existing timeout
		window.clearTimeout(this.#timeoutInstance);

		// Smart debouncing: immediate for priority/user actions, delayed for bulk operations
		const effectiveWaitTime = priority ? 0 : waitTime;

		// Create a new timeout
		if (effectiveWaitTime === 0) {
			this.#startRecount(options);
		} else {
			this.#timeoutInstance = setTimeout(() => {
				this.#startRecount(options);
			}, effectiveWaitTime);
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
		const tiles = grid.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");

		// Optimize visibility checking
		let count = 0;

		if (this.#visibilityCache) {
			// Use cached visibility data if available
			count = this.#countWithCache(tiles);
		} else {
			// Batch DOM reads to minimize reflows
			count = this.#batchedVisibilityCheck(tiles);
		}

		// Store the previous count BEFORE updating
		const previousCount = this.#count;

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
			console.log("[TileCounter] Triggering visibility:count-changed hook:", {
				count: count,
				previousCount: previousCount,
				changed: countChanged,
				source: options.source || "recount",
				isBulkOperation: options.isBulkOperation || false,
			});
		}

		this.#hookMgr.hookExecute("visibility:count-changed", {
			count: count,
			previousCount: previousCount,
			changed: countChanged,
			source: options.source || "recount",
			isBulkOperation: options.isBulkOperation || false,
		});

		// Clear cache after successful recount
		this.#clearCache();
	}

	/**
	 * Perform batched visibility check to minimize reflows
	 * @param {NodeList} tiles - The tiles to check
	 * @returns {number} The count of visible tiles
	 */
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

		// Original implementation for smaller sets
		// Create visibility cache for rapid subsequent calls
		this.#visibilityCache = new Map();

		// Batch all style reads together
		const visibilityData = [];
		for (let i = 0; i < tiles.length; i++) {
			const tile = tiles[i];
			// Check multiple visibility indicators at once
			const style = window.getComputedStyle(tile);
			const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";

			visibilityData.push(isVisible);
			this.#visibilityCache.set(tile, isVisible);

			if (isVisible) {
				count++;
			}
		}

		// Set cache expiration
		this.#setCacheExpiration();

		return count;
	}

	/**
	 * Optimized visibility check with early exit for large tile sets
	 * @param {Array} tilesArray - Array of tile elements
	 * @returns {number} The count of visible tiles
	 */
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
			const style = window.getComputedStyle(tile);
			const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";

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
		// This handles cases where visible tiles are scattered throughout
		if (count < 50 && checkedCount < prioritizedTiles.length) {
			if (this.#performanceMetrics.enabled) {
				console.log(
					`[TileCounter] Continuing full scan: only found ${count} visible tiles in first ${checkedCount} checks`
				);
			}

			for (let i = checkedCount; i < prioritizedTiles.length; i++) {
				const tile = prioritizedTiles[i];
				const style = window.getComputedStyle(tile);
				const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";

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

	/**
	 * Prioritize tiles by their position in the grid
	 * Tiles at the top are more likely to be visible
	 * @param {Array} tiles - Array of tile elements
	 * @returns {Array} Sorted array of tiles
	 */
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

	/**
	 * Count visible tiles using cached data
	 * @param {NodeList} tiles - The tiles to check
	 * @returns {number} The count of visible tiles
	 */
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

	/**
	 * Set cache expiration timer
	 */
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

	/**
	 * Clear the visibility cache
	 */
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

	/**
	 * Get the current count
	 * @returns {number} The current count
	 */
	getCount() {
		return this.#count;
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
