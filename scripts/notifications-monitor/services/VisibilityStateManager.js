/**
 * VisibilityStateManager - Manages the visible items count for the notification monitor
 *
 * This service centralizes the management of visible item counts, providing:
 * - Incremental updates to avoid full recounts
 * - Event emission when count changes
 * - Clean API for count management
 */
class VisibilityStateManager {
	#count = 0;
	#hookMgr;

	/**
	 * @param {HookMgr} hookMgr - The hook manager for event handling
	 */
	constructor(hookMgr) {
		this.#hookMgr = hookMgr;
	}

	/**
	 * Increment the visible items count
	 * @param {number} amount - Amount to increment (default: 1)
	 */
	increment(amount = 1) {
		if (amount <= 0) return;

		this.#count += amount;
		this.#emitCountChanged();
	}

	/**
	 * Decrement the visible items count
	 * @param {number} amount - Amount to decrement (default: 1)
	 */
	decrement(amount = 1) {
		if (amount <= 0) return;

		this.#count = Math.max(0, this.#count - amount);
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
			this.#emitCountChanged();
		}
	}

	/**
	 * Emit event when count changes
	 * @private
	 */
	#emitCountChanged() {
		// Debug logging for count changes
		if (typeof window !== "undefined" && window.DEBUG_TAB_TITLE) {
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
}

export { VisibilityStateManager };
