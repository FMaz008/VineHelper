/**
 * Memory Debugging Tool for VineHelper Notification Monitor
 *
 * This tool helps track memory leaks by monitoring:
 * - DOM elements and their references
 * - Event listeners
 * - Detached DOM nodes
 * - Memory growth patterns
 */

class MemoryDebugger {
	constructor() {
		// Track tiles with WeakMap to avoid creating references
		this.tiles = new WeakMap();

		// Track event listeners with regular Map for reporting
		this.listeners = new Map();

		// Track removed elements to detect leaks
		this.removedElements = new WeakSet();

		// Memory snapshots
		this.snapshots = [];

		// Store interval IDs for cleanup
		this.monitoringIntervals = [];

		// Start periodic checks
		this.startMonitoring();
	}

	/**
	 * Track a tile element
	 */
	trackTile(element, asin) {
		if (!element || !asin) return;

		this.tiles.set(element, {
			asin,
			created: new Date(),
			stack: new Error().stack,
			listeners: new Set(),
		});
	}

	/**
	 * Track an event listener
	 */
	trackListener(element, event, handler, options = {}) {
		const key = this.getListenerKey(element, event);

		if (!this.listeners.has(key)) {
			this.listeners.set(key, []);
		}

		const listenerInfo = {
			element: new WeakRef(element),
			event,
			handler,
			options,
			stack: new Error().stack,
			timestamp: Date.now(),
			removed: false,
		};

		this.listeners.get(key).push(listenerInfo);

		// Also track in tile data if applicable
		if (this.tiles.has(element)) {
			const tileData = this.tiles.get(element);
			tileData.listeners.add(key);
		}
	}

	/**
	 * Track removal of an event listener
	 */
	untrackListener(element, event, handler) {
		// Find and mark the listener as removed
		for (const [key, listeners] of this.listeners.entries()) {
			for (const listener of listeners) {
				const el = listener.element.deref();
				if (el === element && listener.event === event && listener.handler === handler) {
					listener.removed = true;
					return;
				}
			}
		}
	}

	/**
	 * Mark an element as removed
	 */
	markRemoved(element) {
		this.removedElements.add(element);
	}

	/**
	 * Get a unique key for a listener
	 */
	getListenerKey(element, event) {
		const id = element.id || element.className || "unknown";
		return `${id}-${event}-${Date.now()}`;
	}

	/**
	 * Check for detached DOM nodes
	 */
	checkDetachedNodes() {
		const detached = [];

		// Check all tracked listeners
		for (const [key, listeners] of this.listeners.entries()) {
			for (const listener of listeners) {
				// Skip if listener was properly removed
				if (listener.removed) continue;

				const element = listener.element.deref();

				if (element && !document.contains(element)) {
					detached.push({
						key,
						event: listener.event,
						timestamp: listener.timestamp,
						isRemoved: this.removedElements.has(element),
					});
				}
			}
		}

		return detached;
	}

	/**
	 * Take a memory snapshot
	 */
	takeSnapshot(label = "") {
		const snapshot = {
			label,
			timestamp: Date.now(),
			memory: performance.memory
				? {
						usedJSHeapSize: performance.memory.usedJSHeapSize,
						totalJSHeapSize: performance.memory.totalJSHeapSize,
						jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
					}
				: null,
			domNodes: document.querySelectorAll("*").length,
			tiles: document.querySelectorAll(".vh-notification-tile").length,
			listeners: this.listeners.size,
			detachedNodes: this.checkDetachedNodes().length,
		};

		this.snapshots.push(snapshot);
		return snapshot;
	}

	/**
	 * Compare two snapshots
	 */
	compareSnapshots(index1, index2) {
		const snap1 = this.snapshots[index1];
		const snap2 = this.snapshots[index2];

		if (!snap1 || !snap2) {
			console.error("Invalid snapshot indices");
			return null;
		}

		const comparison = {
			timeDiff: snap2.timestamp - snap1.timestamp,
			memoryDiff: snap2.memory
				? {
						usedJSHeapSize: snap2.memory.usedJSHeapSize - snap1.memory.usedJSHeapSize,
						totalJSHeapSize: snap2.memory.totalJSHeapSize - snap1.memory.totalJSHeapSize,
					}
				: null,
			domNodesDiff: snap2.domNodes - snap1.domNodes,
			tilesDiff: snap2.tiles - snap1.tiles,
			listenersDiff: snap2.listeners - snap1.listeners,
			detachedNodesDiff: snap2.detachedNodes - snap1.detachedNodes,
		};

		return comparison;
	}

	/**
	 * Generate a detailed report
	 */
	generateReport() {
		const report = {
			timestamp: new Date().toISOString(),
			currentState: {
				domNodes: document.querySelectorAll("*").length,
				tiles: document.querySelectorAll(".vh-notification-tile").length,
				listeners: this.listeners.size,
				detachedNodes: this.checkDetachedNodes(),
			},
			snapshots: this.snapshots,
			potentialLeaks: this.detectPotentialLeaks(),
		};

		console.group("🔍 Memory Debug Report");
		console.warn("Current State:", report.currentState);
		console.warn("Detached Nodes:", report.currentState.detachedNodes);
		console.warn("Potential Leaks:", report.potentialLeaks);
		console.table(this.snapshots);
		console.groupEnd();

		return report;
	}

	/**
	 * Detect potential memory leaks
	 */
	detectPotentialLeaks() {
		const leaks = [];

		// Check for listeners on detached nodes
		const detached = this.checkDetachedNodes();
		if (detached.length > 0) {
			leaks.push({
				type: "detached-listeners",
				count: detached.length,
				details: detached,
			});
		}

		// Check for old listeners (> 5 minutes)
		const oldListeners = [];
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

		for (const [key, listeners] of this.listeners.entries()) {
			for (const listener of listeners) {
				if (listener.timestamp < fiveMinutesAgo) {
					oldListeners.push({
						key,
						age: Date.now() - listener.timestamp,
						event: listener.event,
					});
				}
			}
		}

		if (oldListeners.length > 0) {
			leaks.push({
				type: "old-listeners",
				count: oldListeners.length,
				details: oldListeners,
			});
		}

		// Check memory growth
		if (this.snapshots.length >= 2) {
			const firstSnap = this.snapshots[0];
			const lastSnap = this.snapshots[this.snapshots.length - 1];

			if (lastSnap.memory && firstSnap.memory) {
				const memoryGrowth = lastSnap.memory.usedJSHeapSize - firstSnap.memory.usedJSHeapSize;
				const growthPercent = (memoryGrowth / firstSnap.memory.usedJSHeapSize) * 100;

				if (growthPercent > 50) {
					leaks.push({
						type: "excessive-memory-growth",
						growthBytes: memoryGrowth,
						growthPercent: growthPercent.toFixed(2),
					});
				}
			}
		}

		return leaks;
	}

	/**
	 * Start periodic monitoring
	 */
	startMonitoring() {
		// Check for detached nodes every 30 seconds
		const detachedCheckInterval = setInterval(() => {
			const detached = this.checkDetachedNodes();
			if (detached.length > 0) {
				console.error(`⚠️ Found ${detached.length} detached nodes with listeners!`, detached);
			}
		}, 30000);
		this.monitoringIntervals.push(detachedCheckInterval);

		// Take automatic snapshots every 2 minutes
		const snapshotInterval = setInterval(() => {
			this.takeSnapshot("auto");

			// Keep only last 10 snapshots
			if (this.snapshots.length > 10) {
				this.snapshots.shift();
			}
		}, 120000);
		this.monitoringIntervals.push(snapshotInterval);
	}

	/**
	 * Stop monitoring and clean up resources
	 */
	stopMonitoring() {
		// Clear all intervals
		this.monitoringIntervals.forEach((interval) => clearInterval(interval));
		this.monitoringIntervals = [];
	}

	/**
	 * Clean up old listener entries
	 */
	cleanup() {
		const cleaned = [];

		for (const [key, listeners] of this.listeners.entries()) {
			const activeListeners = listeners.filter((listener) => {
				const element = listener.element.deref();
				return element && document.contains(element);
			});

			if (activeListeners.length === 0) {
				this.listeners.delete(key);
				cleaned.push(key);
			} else if (activeListeners.length < listeners.length) {
				this.listeners.set(key, activeListeners);
			}
		}

		console.warn(`🧹 Cleaned up ${cleaned.length} listener entries`);
		return cleaned;
	}
}

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
	module.exports = MemoryDebugger;
}

// For ES6 modules
export default MemoryDebugger;
