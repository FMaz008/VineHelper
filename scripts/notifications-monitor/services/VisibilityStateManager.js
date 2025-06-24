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
 * - Debug mode with stack trace logging
 * - Double-counting prevention with WeakSet tracking
 */
class VisibilityStateManager {
	#count = 0;
	#hookMgr;
	#settings;
	#visibilityCache = new WeakMap();
	#computedStyleCache = new WeakMap();
	#trackedItems = new WeakSet(); // Track which items we've already counted
	#debugMode = false; // Debug mode flag for verbose logging
	#operationHistory = []; // Track recent operations for debugging
	#maxHistorySize = 100; // Limit history size to prevent memory issues
	#suspendCountUpdates = false; // Flag to suspend count update emissions during bulk operations

	/**
	 * @param {HookMgr} hookMgr - The hook manager for event handling
	 * @param {SettingsMgr} settings - The settings manager for debug flags
	 */
	constructor(hookMgr, settings) {
		this.#hookMgr = hookMgr;
		this.#settings = settings;
		
		// Initialize debug mode based on settings or global flags
		this.#updateDebugMode();
	}

	/**
	 * Update debug mode based on current settings
	 * @private
	 */
	#updateDebugMode() {
		this.#debugMode = typeof window !== "undefined" && (
			window.DEBUG_VISIBILITY_STATE ||
			window.DEBUG_TAB_TITLE ||
			this.#settings?.get("general.debugTabTitle") ||
			this.#settings?.get("general.debugVisibilityState")
		);
	}

	/**
	 * Enable or disable debug mode
	 * @param {boolean} enabled - Whether to enable debug mode
	 */
	setDebugMode(enabled) {
		this.#debugMode = enabled;
		if (enabled) {
			console.log("[VisibilityStateManager] Debug mode enabled");
		}
	}

	/**
	 * Get stack trace for debugging
	 * @private
	 * @returns {string} Formatted stack trace
	 */
	#getStackTrace() {
		const stack = new Error().stack;
		// Remove the first few lines that are internal to this method
		const lines = stack.split('\n').slice(3, 8);
		return lines.join('\n');
	}

	/**
	 * Add operation to history for debugging
	 * @private
	 * @param {Object} operation - Operation details
	 */
	#addToHistory(operation) {
		if (!this.#debugMode) return;
		
		this.#operationHistory.push({
			...operation,
			timestamp: new Date().toISOString(),
			stackTrace: this.#getStackTrace()
		});
		
		// Trim history if it gets too large
		if (this.#operationHistory.length > this.#maxHistorySize) {
			this.#operationHistory = this.#operationHistory.slice(-this.#maxHistorySize);
		}
	}

	/**
	 * Suspend count update emissions (useful during bulk operations like fetch)
	 * @param {boolean} suspend - Whether to suspend count updates
	 */
	suspendCountUpdates(suspend) {
		this.#suspendCountUpdates = suspend;
		if (this.#debugMode) {
			console.log(`[VisibilityStateManager] Count updates ${suspend ? 'suspended' : 'resumed'}`);
		}
	}

	/**
	 * Set the visibility of an element and track changes
	 * @param {HTMLElement} element - The element to update
	 * @param {boolean} visible - Whether the element should be visible
	 * @param {string} displayStyle - The display style to use when visible (default: 'block')
	 * @returns {boolean} Whether the visibility actually changed
	 */
	setVisibility(element, visible, displayStyle = "block") {
		if (!element) {
			if (this.#debugMode) {
				console.warn("[VisibilityStateManager] setVisibility called with null element");
			}
			return false;
		}

		// Update debug mode in case settings changed
		this.#updateDebugMode();

		// ISSUE #3 FIX: Prevent duplicate tracking by using a unique element identifier
		// Generate a unique ID for the element if it doesn't have one
		if (!element.id) {
			element.id = `vh-item-${Math.random().toString(36).substr(2, 9)}`;
		}
		
		const isFirstTimeTracking = !this.#trackedItems.has(element);
		const wasVisible = this.isVisible(element);
		const asin = element.dataset?.asin || element.getAttribute("data-asin") || "unknown";
		const elementId = element.id;
		
		// ISSUE #3 FIX: Additional safeguard - check for duplicate elements with same ASIN
		if (isFirstTimeTracking && asin !== "unknown") {
			// Check if we already have another element with this ASIN tracked
			const existingTrackedWithSameAsin = Array.from(document.querySelectorAll(`[data-asin="${asin}"]`))
				.filter(el => el !== element && this.#trackedItems.has(el));
			
			if (existingTrackedWithSameAsin.length > 0 && this.#debugMode) {
				console.error("[VisibilityStateManager] DUPLICATE ELEMENT DETECTED", {
					asin,
					newElementId: elementId,
					existingElements: existingTrackedWithSameAsin.map(el => ({
						id: el.id,
						tracked: this.#trackedItems.has(el),
						visible: this.isVisible(el)
					})),
					stackTrace: this.#getStackTrace()
				});
			}
		}
		
		// ISSUE #3 DEBUG: Track duplicate item detection
		if (this.#debugMode && asin === "B0F32SHGNR") {
			console.log("[VisibilityStateManager] B0F32SHGNR TRACKING CHECK", {
				asin,
				isFirstTimeTracking,
				trackedItemsSize: this.#trackedItems.size,
				elementId,
				element,
				hasElement: this.#trackedItems.has(element),
				currentCount: this.#count,
				stackTrace: this.#getStackTrace()
			});
			
			// Check if there are multiple elements with same ASIN
			const allElements = document.querySelectorAll(`[data-asin="${asin}"]`);
			if (allElements.length > 1) {
				console.warn("[VisibilityStateManager] MULTIPLE ELEMENTS WITH SAME ASIN", {
					asin,
					elementCount: allElements.length,
					elements: Array.from(allElements).map(el => ({
						id: el.id,
						className: el.className,
						isTracked: this.#trackedItems.has(el)
					}))
				});
			}
		}

		// Track call frequency
		if (!this._callFrequencyMap) {
			this._callFrequencyMap = new Map();
		}
		const callKey = `${asin}-${visible}`;
		const now = Date.now();
		const lastCall = this._callFrequencyMap.get(callKey);
		
		if (lastCall && (now - lastCall.timestamp) < 1000) {
			lastCall.count++;
			if (this.#debugMode) {
				console.warn(`[VisibilityStateManager] Rapid repeated call detected for ${asin}`, {
					callCount: lastCall.count,
					timeSinceLastCall: now - lastCall.timestamp,
					visible,
					wasVisible,
					stackTrace: this.#getStackTrace()
				});
			}
		} else {
			this._callFrequencyMap.set(callKey, { timestamp: now, count: 1 });
		}

		// Early exit if visibility hasn't changed and element is already tracked
		if (!isFirstTimeTracking && wasVisible === visible) {
			if (this.#debugMode) {
				console.log("[VisibilityStateManager] Early exit - no visibility change", {
					asin,
					visible,
					elementId
				});
			}
			// Still update the display style in case it changed
			element.style.display = visible ? displayStyle : "none";
			return false; // No change
		}

		// Defensive check: Ensure element has a valid parent
		if (!element.parentNode && this.#debugMode) {
			console.warn("[VisibilityStateManager] Element has no parent node", {
				elementId,
				asin,
				visible
			});
		}

		// Log operation details
		const operation = {
			operation: "setVisibility",
			elementId,
			asin,
			wasVisible,
			newVisible: visible,
			isFirstTimeTracking,
			currentCount: this.#count,
			hasCache: this.#visibilityCache.has(element),
			displayStyle
		};

		if (this.#debugMode) {
			console.log("[VisibilityStateManager] setVisibility called", {
				...operation,
				stackTrace: this.#getStackTrace()
			});
		}

		this.#addToHistory(operation);

		// Update the element's display style
		element.style.display = visible ? displayStyle : "none";

		// Clear caches for this element
		this.#computedStyleCache.delete(element);
		this.#visibilityCache.set(element, visible);

		// ISSUE #3 FIX: Always mark as tracked before processing visibility changes
		// This prevents the same element from being counted multiple times
		if (isFirstTimeTracking) {
			this.#trackedItems.add(element);
			if (this.#debugMode) {
				console.log("[VisibilityStateManager] Item tracked for the first time", {
					asin,
					elementId,
					visible,
					wasVisible,
					willChangeVisibility: wasVisible !== visible,
					decision: visible && wasVisible !== visible ? "will-increment" : "no-count-change",
					stackTrace: this.#getStackTrace()
				});
			}
		}
		
		// Track the change if visibility actually changed
		if (wasVisible !== visible) {

			// Defensive check: Validate count before modification
			const oldCount = this.#count;
			
			// ISSUE #3 FIX: Improved logic to prevent double counting
			// Only increment count if:
			// 1. Item is becoming visible AND
			// 2. Either it's first time tracking OR it was previously invisible
			if (visible) {
				if (isFirstTimeTracking) {
					// First time seeing this element and it's visible
					this.#incrementCount(1, asin, "first-time-visible");
				} else if (!wasVisible) {
					// Already tracked element becoming visible
					this.#incrementCount(1, asin, "visibility-change-to-visible");
				}
			} else if (!visible && wasVisible && !isFirstTimeTracking) {
				// Already tracked element becoming invisible
				this.#decrementCount(1, asin, "visibility-change-to-invisible");
			}
			
			// Debug check for the specific problematic ASIN
			if (this.#debugMode && asin === "B0F32SHGNR") {
				console.log("[VisibilityStateManager] B0F32SHGNR visibility change processed", {
					asin,
					elementId,
					wasVisible,
					isVisible: visible,
					isFirstTimeTracking,
					countChange: visible && (isFirstTimeTracking || !wasVisible) ? "+1" :
					            (!visible && wasVisible && !isFirstTimeTracking) ? "-1" : "0",
					currentCount: this.#count
				});
			}

			// Defensive check: Ensure count didn't go negative
			if (this.#count < 0) {
				console.error("[VisibilityStateManager] Count went negative!", {
					oldCount,
					newCount: this.#count,
					asin,
					visible,
					isFirstTimeTracking
				});
				this.#count = 0;
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
		// Note: We already marked as tracked above, so no need to do it again here

		return false;
	}

	/**
	 * Check if an element is visible
	 * @param {HTMLElement} element - The element to check
	 * @returns {boolean} Whether the element is visible
	 */
	isVisible(element) {
		if (!element) return false;

		try {
			// Check cache first
			if (this.#visibilityCache.has(element)) {
				const cached = this.#visibilityCache.get(element);
				// Validate cache by checking computed style
				const computedStyle = this.#getComputedStyle(element);
				const actuallyVisible = computedStyle && computedStyle.display !== "none";

				if (cached === actuallyVisible) {
					return cached;
				}
				// Cache was stale, update it
				this.#visibilityCache.set(element, actuallyVisible);
				
				if (this.#debugMode) {
					console.warn("[VisibilityStateManager] Cache was stale", {
						elementId: element.id,
						asin: element.dataset?.asin,
						cached,
						actual: actuallyVisible
					});
				}
				
				return actuallyVisible;
			}

			// Log uncached visibility check if bulk operations debug is enabled
			const debugBulkOperations = this.#settings?.get("general.debugBulkOperations");
			if (debugBulkOperations) {
				console.log("[VisibilityStateManager] isVisible called for uncached element:", {
					elementId: element.id,
					asin: element.dataset?.asin,
					className: element.className,
					stackTrace: new Error().stack.split('\n').slice(2, 5).join('\n')
				});
			}

			// Use computed style for accurate visibility check
			const computedStyle = this.#getComputedStyle(element);
			const isVisible = computedStyle && computedStyle.display !== "none";

			// Debug logging for uncached elements (likely new items)
			if (this.#debugMode) {
				console.log("[VisibilityStateManager] isVisible called for uncached element", {
					elementId: element.id,
					asin: element.dataset?.asin,
					isVisible,
					inlineDisplay: element.style.display,
					computedDisplay: computedStyle?.display,
					currentCount: this.#count,
					isTracked: this.#trackedItems.has(element),
					stackTrace: this.#getStackTrace()
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
		} catch (error) {
			// Handle cases where element might be detached or invalid
			if (this.#debugMode) {
				console.error("[VisibilityStateManager] Error checking visibility", {
					error,
					element,
					elementId: element?.id
				});
			}
			return false;
		}
	}

	/**
	 * Get computed style with caching
	 * @private
	 * @param {HTMLElement} element - The element
	 * @returns {CSSStyleDeclaration|null} The computed style or null if error
	 */
	#getComputedStyle(element) {
		try {
			if (!this.#computedStyleCache.has(element)) {
				// Defensive check: ensure element is still in DOM
				if (!element.isConnected && this.#debugMode) {
					console.warn("[VisibilityStateManager] Element not connected to DOM", {
						elementId: element.id,
						asin: element.dataset?.asin
					});
				}
				this.#computedStyleCache.set(element, window.getComputedStyle(element));
			}
			return this.#computedStyleCache.get(element);
		} catch (error) {
			if (this.#debugMode) {
				console.error("[VisibilityStateManager] Error getting computed style", {
					error,
					elementId: element?.id
				});
			}
			return null;
		}
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
			// Only emit if not suspended
			if (!this.#suspendCountUpdates) {
				// Only emit if not suspended
				if (!this.#suspendCountUpdates) {
					// Only emit if not suspended
					if (!this.#suspendCountUpdates) {
						this.#emitCountChanged();
					}
				}
			}
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

		// Debug logging
		const debugTabTitle = this.#settings?.get("general.debugTabTitle");
		const debugBulkOperations = this.#settings?.get("general.debugBulkOperations");
		
		if (debugBulkOperations) {
			console.log("[VisibilityStateManager] recalculateCount called with", elements.length, "elements");
			console.log("[VisibilityStateManager] Cache sizes before clear:", {
				visibilityCache: "WeakMap (size unknown)",
				computedStyleCache: "WeakMap (size unknown)"
			});
		}

		// Clear caches before recalculation
		this.clearCache();

		// Debug: log all elements and their visibility
		const debugElements = [];
		let uncachedCount = 0;
		for (const element of elements) {
			// Check if this will be uncached
			const wasCached = this.#visibilityCache.has(element);
			if (!wasCached) {
				uncachedCount++;
			}
			
			const isVisible = this.isVisible(element);
			if (isVisible) {
				count++;
			}

			// Collect debug info
			if (debugBulkOperations && debugElements.length < 10) { // Only log first 10 for brevity
				debugElements.push({
					asin: element.getAttribute("data-asin"),
					display: element.style.display || "not set",
					computedDisplay: window.getComputedStyle(element).display,
					isVisible,
					wasCached
				});
			}
		}
		
		if (debugBulkOperations) {
			console.log("[VisibilityStateManager] Visibility check results:", {
				totalElements: elements.length,
				uncachedElements: uncachedCount,
				visibleCount: count,
				sampleElements: debugElements
			});
		}

		// Log when count changes if debug is enabled
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
	 * Increment the visible items count with enhanced logging
	 * @private
	 * @param {number} amount - Amount to increment
	 * @param {string} asin - The ASIN of the item
	 * @param {string} source - The source of the increment (e.g., "first-time-visible", "visibility-change")
	 */
	#incrementCount(amount, asin, source) {
		if (amount <= 0) return;

		const oldCount = this.#count;
		this.#count += amount;

		const operation = {
			operation: "increment",
			oldCount,
			newCount: this.#count,
			amount,
			asin,
			source
		};

		this.#addToHistory(operation);
		
		if (this.#debugMode) {
			console.log("[VisibilityStateManager] Count incremented", {
				...operation,
				stackTrace: this.#getStackTrace()
			});
		}

		// Defensive check for unexpected count values
		if (this.#count < 0 || !Number.isFinite(this.#count)) {
			console.error("[VisibilityStateManager] Invalid count after increment!", {
				oldCount,
				newCount: this.#count,
				amount,
				source
			});
			this.#count = Math.max(0, oldCount);
		}

		// Only emit if not suspended
		if (!this.#suspendCountUpdates) {
			// Only emit if not suspended
			if (!this.#suspendCountUpdates) {
				this.#emitCountChanged(source);
			}
		}
	}

	/**
	 * Decrement the visible items count with enhanced logging
	 * @private
	 * @param {number} amount - Amount to decrement
	 * @param {string} asin - The ASIN of the item
	 * @param {string} source - The source of the decrement
	 */
	#decrementCount(amount, asin, source) {
		if (amount <= 0) return;

		const oldCount = this.#count;
		this.#count = Math.max(0, this.#count - amount);

		const operation = {
			operation: "decrement",
			oldCount,
			newCount: this.#count,
			amount,
			asin,
			source
		};

		this.#addToHistory(operation);
		
		if (this.#debugMode) {
			console.log("[VisibilityStateManager] Count decremented", {
				...operation,
				stackTrace: this.#getStackTrace()
			});
		}

		// Defensive check: warn if we tried to go negative
		if (oldCount - amount < 0) {
			console.warn("[VisibilityStateManager] Attempted to decrement below zero", {
				oldCount,
				amount,
				source,
				asin
			});
		}

		this.#emitCountChanged(source);
	}

	/**
	 * Increment the visible items count
	 * @param {number} amount - Amount to increment (default: 1)
	 */
	increment(amount = 1) {
		this.#incrementCount(amount, "unknown", "manual-increment");
	}

	/**
	 * Decrement the visible items count
	 * @param {number} amount - Amount to decrement (default: 1)
	 */
	decrement(amount = 1) {
		this.#decrementCount(amount, "unknown", "manual-decrement");
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
			this.#trackedItems = new WeakSet(); // Clear tracked items on reset
			// Only emit if not suspended
			if (!this.#suspendCountUpdates) {
				this.#emitCountChanged("reset");
			}
		}
	}

	/**
	 * Get debug information about the current state
	 * @returns {Object} Debug information
	 */
	getDebugInfo() {
		return {
			count: this.#count,
			cacheSize: "WeakMap/WeakSet (size not available)",
			debugMode: this.#debugMode,
			recentOperations: this.#debugMode ? this.#operationHistory.slice(-10) : [],
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Get full operation history (debug mode only)
	 * @returns {Array} Operation history
	 */
	getOperationHistory() {
		if (!this.#debugMode) {
			console.warn("[VisibilityStateManager] Operation history only available in debug mode");
			return [];
		}
		return [...this.#operationHistory];
	}

	/**
	 * Clear operation history
	 */
	clearOperationHistory() {
		this.#operationHistory = [];
		if (this.#debugMode) {
			console.log("[VisibilityStateManager] Operation history cleared");
		}
	}

	/**
	 * Validate current state and check for inconsistencies
	 * @param {NodeList|Array<HTMLElement>} elements - Elements to validate against
	 * @returns {Object} Validation results
	 */
	validateState(elements) {
		const actualVisibleCount = Array.from(elements).filter(el => this.isVisible(el)).length;
		const isValid = actualVisibleCount === this.#count;
		
		const result = {
			isValid,
			expectedCount: this.#count,
			actualCount: actualVisibleCount,
			difference: this.#count - actualVisibleCount
		};

		if (!isValid) {
			console.error("[VisibilityStateManager] State validation failed!", result);
			
			if (this.#debugMode) {
				// Log details about each element
				const elementDetails = Array.from(elements).map(el => ({
					asin: el.dataset?.asin || el.getAttribute("data-asin"),
					isVisible: this.isVisible(el),
					isTracked: this.#trackedItems.has(el),
					display: el.style.display,
					computedDisplay: window.getComputedStyle(el).display
				}));
				
				console.log("[VisibilityStateManager] Element details:", elementDetails);
			}
		}

		return result;
	}

	/**
	 * Emit event when count changes
	 * @private
	 * @param {string} source - The source of the count change
	 */
	#emitCountChanged(source = "unknown") {
		// Update debug mode in case it changed
		this.#updateDebugMode();
		
		if (this.#debugMode) {
			console.log(`[VisibilityStateManager] Count changed to: ${this.#count}`, {
				source,
				timestamp: new Date().toISOString(),
				recentHistory: this.#operationHistory.slice(-5)
			});
		}

		// Emit the event for tab title updates
		this.#hookMgr.hookExecute("visibility:count-changed", {
			count: this.#count,
			source,
			timestamp: Date.now(),
		});

		// Also emit an immediate update event for UI elements that need instant feedback
		this.#hookMgr.hookExecute("visibility:count-changed-immediate", {
			count: this.#count,
			source,
			timestamp: Date.now(),
		});
	}
}

export { VisibilityStateManager };
