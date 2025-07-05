/**
 * VisibilityStateManager - Centralized visibility state and count management
 *
 * This service provides a single source of truth for element visibility,
 * handling both the state management and count tracking. It ensures
 * consistency across all visibility operations.
 *
 * Features:
 * - Element visibility state tracking with caching
 * - Automatic count management based on visibility changes
 * - Batch operations for performance
 * - Event emission for visibility changes
 * - WeakMap-based caching to prevent memory leaks
 */
class VisibilityStateManager {
	#count = 0;
	#hookMgr;
	#settings;
	#visibilityCache = new WeakMap();
	#computedStyleCache = new WeakMap();

	/**
	 * @param {HookMgr} hookMgr - The hook manager for event handling
	 * @param {SettingsMgr} settings - The settings manager for debug flags
	 */
	constructor(hookMgr, settings) {
		this.#hookMgr = hookMgr;
		this.#settings = settings;
	}

	/**
	 * Set the visibility of an element and track changes
	 * @param {HTMLElement} element - The element to update
	 * @param {boolean} visible - Whether the element should be visible
	 * @param {string} displayStyle - The display style to use when visible (default: 'block')
	 * @returns {boolean} Whether the visibility actually changed
	 */
	setVisibility(element, visible, displayStyle = "block") {
		if (!element) return false;

		const wasVisible = this.isVisible(element);

		// Debug logging for setVisibility calls
		if (this.#settings.get("general.debugTabTitle")) {
			console.log("[VisibilityStateManager] setVisibility called", {
				elementId: element.id,
				asin: element.dataset?.asin,
				wasVisible,
				newVisible: visible,
				currentCount: this.#count,
				hasCache: this.#visibilityCache.has(element),
				timestamp: new Date().toISOString(),
			});
		}

		// Update the element's display style
		element.style.display = visible ? displayStyle : "none";

		// Clear caches for this element
		this.#computedStyleCache.delete(element);
		this.#visibilityCache.set(element, visible);

		// Track the change if visibility actually changed
		if (wasVisible !== visible) {
			// Debug logging for visibility state changes
			if (this.#settings.get("general.debugTabTitle") || this.#settings.get("general.debugItemProcessing")) {
				console.log("[VisibilityStateManager] Visibility state change detected", {
					asin: element.dataset?.asin,
					wasVisible,
					isVisible: visible,
					countBefore: this.#count,
					countAfter: this.#count + (visible ? 1 : -1),
					displayStyle,
					elementDisplay: element.style.display,
					timestamp: new Date().toISOString(),
					stack: new Error().stack.split("\n").slice(2, 5).join("\n"),
				});
			}

			// RACE CONDITION DEBUG: Check if element is actually visible before incrementing
			if (visible) {
				// Double-check visibility state before incrementing
				const computedStyle = window.getComputedStyle(element);
				const actuallyVisible = computedStyle.display !== "none";

				if (!actuallyVisible) {
					console.error("[VisibilityStateManager] RACE CONDITION DETECTED!", {
						asin: element.dataset?.asin,
						requestedVisible: visible,
						actuallyVisible,
						computedDisplay: computedStyle.display,
						inlineDisplay: element.style.display,
						countBefore: this.#count,
						timestamp: new Date().toISOString(),
					});
					// Don't increment if element is not actually visible
					return false;
				}

				this.increment(1);
			} else {
				this.decrement(1);
			}

			// Emit visibility change event for this specific element
			this.#hookMgr.hookExecute("visibility:element-changed", {
				element,
				wasVisible,
				isVisible: visible,
				timestamp: Date.now(),
			});

			return true;
		}

		return false;
	}

	/**
	 * Check if an element is visible
	 * @param {HTMLElement} element - The element to check
	 * @returns {boolean} Whether the element is visible
	 */
	isVisible(element) {
		if (!element) return false;

		// Check cache first
		if (this.#visibilityCache.has(element)) {
			const cached = this.#visibilityCache.get(element);
			// Validate cache by checking computed style
			// TODO: this removes the perf benefit of the cache, remove after debugging
			const computedStyle = this.#getComputedStyle(element);
			const actuallyVisible = computedStyle.display !== "none";

			// DEBUG: Always log cache mismatches
			if (cached !== actuallyVisible) {
				console.warn("[DEBUG-VISIBILITY] Cache mismatch detected!", {
					asin: element.dataset?.asin,
					cached,
					actuallyVisible,
					display: computedStyle.display,
					timestamp: new Date().toISOString(),
				});
			}

			if (cached === actuallyVisible) {
				return cached;
			}
			// Cache was stale, update it
			this.#visibilityCache.set(element, actuallyVisible);
			return actuallyVisible;
		}

		// Use computed style for accurate visibility check
		const computedStyle = this.#getComputedStyle(element);
		const isVisible = computedStyle.display !== "none";

		// Debug logging for uncached elements (likely new items)
		if (this.#settings.get("general.debugTabTitle")) {
			console.log("[VisibilityStateManager] isVisible called for uncached element", {
				elementId: element.id,
				asin: element.dataset?.asin,
				isVisible,
				inlineDisplay: element.style.display,
				computedDisplay: computedStyle.display,
				currentCount: this.#count,
				timestamp: new Date().toISOString(),
			});
		}

		// Also check inline style as a safeguard
		// This catches cases where the style was just set but computed style hasn't updated
		if (element.style.display === "none") {
			this.#visibilityCache.set(element, false);
			return false;
		}

		// Cache the result
		this.#visibilityCache.set(element, isVisible);

		return isVisible;
	}

	/**
	 * Get computed style with caching
	 * @private
	 * @param {HTMLElement} element - The element
	 * @returns {CSSStyleDeclaration} The computed style
	 */
	#getComputedStyle(element) {
		if (!this.#computedStyleCache.has(element)) {
			this.#computedStyleCache.set(element, window.getComputedStyle(element));
		}
		return this.#computedStyleCache.get(element);
	}

	/**
	 * Clear all caches (should be called after batch operations)
	 */
	clearCache() {
		this.#computedStyleCache = new WeakMap();
		this.#visibilityCache = new WeakMap();
	}

	/**
	 * Batch update visibility for multiple elements
	 * @param {Array<{element: HTMLElement, visible: boolean, displayStyle?: string}>} updates
	 * @returns {number} Number of elements that changed visibility
	 */
	batchSetVisibility(updates) {
		let changedCount = 0;
		let visibleDelta = 0;

		// Process all updates
		for (const { element, visible, displayStyle = "block" } of updates) {
			if (!element) continue;

			const wasVisible = this.isVisible(element);
			element.style.display = visible ? displayStyle : "none";

			// Track changes
			if (wasVisible !== visible) {
				changedCount++;
				visibleDelta += visible ? 1 : -1;
			}

			// Update cache
			this.#visibilityCache.set(element, visible);
		}

		// Clear computed style cache after batch operation
		this.#computedStyleCache = new WeakMap();

		// Update count once for the entire batch
		if (visibleDelta !== 0) {
			this.#count = Math.max(0, this.#count + visibleDelta);
			this.#emitCountChanged();
		}

		return changedCount;
	}

	/**
	 * Recalculate the total count from scratch
	 * @param {NodeList|Array<HTMLElement>} elements - Elements to count
	 * @returns {number} The new count
	 */
	recalculateCount(elements) {
		let count = 0;

		// Clear caches before recalculation
		this.clearCache();

		// DEBUG: Track recalculation source
		if (this.#settings.get("general.debugVisibility")) {
			console.log("[DEBUG-VISIBILITY] Starting recalculation", {
				elementCount: elements.length,
				currentCount: this.#count,
				timestamp: new Date().toISOString(),
				stack: new Error().stack.split("\n").slice(2, 5).join("\n"),
			});
		}

		// Debug: log all elements and their visibility
		const debugElements = [];
		for (const element of elements) {
			const isVisible = this.isVisible(element);
			if (isVisible) {
				count++;
			}

			// Collect debug info
			debugElements.push({
				asin: element.getAttribute("data-asin"),
				display: window.getComputedStyle(element).display,
				isVisible,
			});
		}

		// Log when count changes if debug is enabled
		const debugTabTitle = this.#settings?.get("general.debugTabTitle");
		if (debugTabTitle && this.#count !== count) {
			console.log("[VisibilityStateManager] Recalculate count:", {
				oldCount: this.#count,
				newCount: count,
				totalElements: elements.length,
				elements: debugElements,
			});
		}

		if (this.#count !== count) {
			this.#count = count;
			this.#emitCountChanged();
		}

		return count;
	}

	/**
	 * Handle visibility change for an element
	 * @param {HTMLElement} element - The element that may have changed
	 * @param {boolean} wasVisible - Whether the element was visible before
	 * @returns {boolean} Whether visibility changed
	 */
	handlePossibleVisibilityChange(element, wasVisible) {
		const isVisible = this.isVisible(element);

		if (wasVisible !== isVisible) {
			// Update count
			if (isVisible) {
				this.increment(1);
			} else {
				this.decrement(1);
			}

			// Emit element-specific change event
			this.#hookMgr.hookExecute("visibility:element-changed", {
				element,
				wasVisible,
				isVisible,
				timestamp: Date.now(),
			});

			return true;
		}

		return false;
	}

	/**
	 * Get display style for a tile based on current grid mode
	 * @param {boolean} isInlineMode - Whether inline mode is active
	 * @returns {string} The display style to use
	 */
	getTileDisplayStyle(isInlineMode) {
		return isInlineMode ? "inline-block" : "block";
	}

	/**
	 * Increment the visible items count
	 * @param {number} amount - Amount to increment (default: 1)
	 */
	increment(amount = 1) {
		if (amount <= 0) return;

		const oldCount = this.#count;
		this.#count += amount;

		// Debug logging (only if debug flag is set)
		if (this.#settings.get("general.debugVisibility")) {
			console.log("[VisibilityStateManager] Count incremented", {
				oldCount,
				newCount: this.#count,
				amount,
				stack: new Error().stack.split("\n").slice(2, 5).join("\n"),
			});
		}

		this.#emitCountChanged();
	}

	/**
	 * Decrement the visible items count
	 * @param {number} amount - Amount to decrement (default: 1)
	 */
	decrement(amount = 1) {
		if (amount <= 0) return;

		const oldCount = this.#count;
		this.#count = Math.max(0, this.#count - amount);

		// Debug logging (only if debug flag is set)
		if (this.#settings.get("general.debugVisibility")) {
			console.log("[VisibilityStateManager] Count decremented", {
				oldCount,
				newCount: this.#count,
				amount,
				stack: new Error().stack.split("\n").slice(2, 5).join("\n"),
			});
		}

		this.#emitCountChanged();
	}

	/**
	 * Set the count to a specific value (for full recounts)
	 * @param {number} newCount - The new count value
	 */
	setCount(newCount) {
		if (newCount < 0) {
			newCount = 0;
		}

		if (this.#count !== newCount) {
			this.#count = newCount;
			this.#emitCountChanged();
		}
	}

	/**
	 * Get the current visible items count
	 * @returns {number} The current count
	 */
	getCount() {
		return this.#count;
	}

	/**
	 * Reset the count to zero
	 */
	reset() {
		if (this.#count !== 0) {
			this.#count = 0;
			this.clearCache();
			this.#emitCountChanged();
		}
	}

	/**
	 * Emit event when count changes
	 * @private
	 */
	#emitCountChanged() {
		// Debug logging for count changes
		if (this.#settings.get("general.debugTabTitle")) {
			console.log(`[VisibilityStateManager] Count changed to: ${this.#count}`, {
				timestamp: new Date().toISOString(),
				stack: new Error().stack.split("\n").slice(2, 5).join("\n"),
			});
		}

		this.#hookMgr.hookExecute("visibility:count-changed", {
			count: this.#count,
			timestamp: Date.now(),
		});
	}

	/**
	 * Clean up resources when the manager is destroyed
	 */
	destroy() {
		this.clearCache();
	}
}

export { VisibilityStateManager };
