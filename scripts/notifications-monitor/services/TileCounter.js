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
	};

	constructor() {
		this.#hookMgr = new HookMgr();
	}

	/**
	 * Recount the number of tiles on the page
	 * @param {number} waitTime - The time to wait before recounting the tiles, in milliseconds
	 * @param {boolean} priority - If true, uses immediate execution for user-initiated actions
	 */
	recountVisibleTiles(waitTime = 50, priority = false) {
		this.#state = STATE_WAITING;

		// Clear any existing timeout
		window.clearTimeout(this.#timeoutInstance);

		// Smart debouncing: immediate for priority/user actions, delayed for bulk operations
		const effectiveWaitTime = priority ? 0 : waitTime;

		// Create a new timeout
		if (effectiveWaitTime === 0) {
			this.#startRecount();
		} else {
			this.#timeoutInstance = setTimeout(() => {
				this.#startRecount();
			}, effectiveWaitTime);
		}
	}

	/**
	 * Start the recount timer
	 */
	#startRecount() {
		this.#state = STATE_COUNTING;

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

		this.#hookMgr.hookExecute("visibility:count-changed", { count: this.#count });

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

		return {
			enabled: true,
			lastRecountDuration: this.#performanceMetrics.lastRecountDuration,
			averageRecountDuration: avgDuration,
			recountCount: history.length,
			recentHistory: history.slice(-10), // Last 10 recounts
		};
	}
}

export { TileCounter };
