/**
 * Heap Snapshot Helper for Memory Leak Detection
 *
 * This script helps automate the process of taking heap snapshots
 * and comparing them to identify memory leaks.
 *
 * Usage:
 * 1. Open Chrome DevTools
 * 2. Go to Console
 * 3. Copy and paste this script
 * 4. Run the test scenarios
 */

class HeapSnapshotHelper {
	constructor() {
		this.snapshots = [];
		this.testResults = [];

		console.log("🔍 Heap Snapshot Helper initialized");
		console.log("Available commands:");
		console.log("- heapTest.start() - Start a new test");
		console.log("- heapTest.snapshot(label) - Take a snapshot");
		console.log("- heapTest.addItems(count) - Add test items");
		console.log("- heapTest.removeItems() - Remove all items");
		console.log("- heapTest.runFullTest() - Run automated test");
		console.log("- heapTest.report() - Show results");
	}

	/**
	 * Start a new test session
	 */
	start() {
		this.snapshots = [];
		this.testResults = [];
		console.log('✅ Test session started. Take initial snapshot with heapTest.snapshot("initial")');
	}

	/**
	 * Take a heap snapshot (manual process)
	 */
	snapshot(label) {
		const snapshot = {
			label,
			timestamp: Date.now(),
			instructions: `Manual snapshot "${label}" - Please take heap snapshot in Memory tab`,
			memory: performance.memory
				? {
						usedJSHeapSize: performance.memory.usedJSHeapSize,
						totalJSHeapSize: performance.memory.totalJSHeapSize,
					}
				: null,
			domStats: this.getDOMStats(),
		};

		this.snapshots.push(snapshot);

		console.log(`📸 Snapshot "${label}" recorded at ${new Date().toLocaleTimeString()}`);
		console.log("DOM Stats:", snapshot.domStats);
		console.log("Memory:", snapshot.memory);
		console.log("⚠️  Now manually take a heap snapshot in the Memory tab and label it:", label);

		return snapshot;
	}

	/**
	 * Get current DOM statistics
	 */
	getDOMStats() {
		return {
			totalNodes: document.querySelectorAll("*").length,
			tiles: document.querySelectorAll(".vh-notification-tile").length,
			images: document.querySelectorAll("img").length,
			detachedNodes: this.findDetachedNodes().length,
			eventListeners: this.countEventListeners(),
		};
	}

	/**
	 * Find detached DOM nodes
	 */
	findDetachedNodes() {
		const allNodes = [];
		const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT, null, false);

		let node;
		while ((node = walker.nextNode())) {
			// TreeWalker should only return valid nodes, but add safety check
			if (node && node instanceof Node && !document.contains(node)) {
				allNodes.push(node);
			}
		}

		return allNodes;
	}

	/**
	 * Count event listeners (approximate)
	 */
	countEventListeners() {
		// This is an approximation - Chrome DevTools has better access
		let count = 0;
		const elements = document.querySelectorAll("*");

		// Common event types to check
		const eventTypes = ["click", "mouseover", "mouseout", "scroll", "resize", "load", "error"];

		elements.forEach((el) => {
			eventTypes.forEach((type) => {
				// This only works for properties, not addEventListener
				if (el[`on${type}`]) count++;
			});
		});

		return count;
	}

	/**
	 * Add test items to the grid
	 */
	async addItems(count = 50) {
		console.log(`➕ Adding ${count} test items...`);

		// Simulate adding items
		const startTime = Date.now();

		for (let i = 0; i < count; i++) {
			// Trigger the notification monitor to add an item
			// This would need to be adapted to your actual implementation
			const testItem = {
				asin: `TEST${Date.now()}${i}`,
				title: `Test Item ${i}`,
				queue: "vine-regular",
				is_parent_asin: false,
				enrollment_guid: `test-guid-${i}`,
				img_url: "https://via.placeholder.com/150",
				domain: "test",
			};

			// Dispatch event or call method to add item
			if (window.notificationMonitor && window.notificationMonitor.addItem) {
				window.notificationMonitor.addItem(testItem);
			} else {
				console.warn("NotificationMonitor not found. Simulating DOM addition...");
				// Simulate DOM addition for testing
				const tile = document.createElement("div");
				tile.className = "vh-notification-tile";
				tile.dataset.asin = testItem.asin;
				tile.innerHTML = `<img src="${testItem.img_url}" alt="${testItem.title}">`;

				const grid = document.querySelector(".vh-notification-grid");
				if (grid) grid.appendChild(tile);
			}

			// Small delay to avoid overwhelming the system
			if (i % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		const elapsed = Date.now() - startTime;
		console.log(`✅ Added ${count} items in ${elapsed}ms`);
		console.log("Current DOM stats:", this.getDOMStats());
	}

	/**
	 * Remove all test items
	 */
	async removeItems() {
		console.log("🗑️  Removing all items...");

		const tiles = document.querySelectorAll(".vh-notification-tile");
		const count = tiles.length;

		if (window.notificationMonitor && window.notificationMonitor.clearAllItems) {
			// Use the actual clear method if available
			await window.notificationMonitor.clearAllItems();
		} else {
			// Manual removal for testing
			tiles.forEach((tile) => tile.remove());
		}

		console.log(`✅ Removed ${count} items`);
		console.log("Current DOM stats:", this.getDOMStats());
	}

	/**
	 * Force garbage collection (if available)
	 */
	forceGC() {
		if (window.gc) {
			console.log("🗑️  Forcing garbage collection...");
			window.gc();
			return true;
		} else {
			console.warn('⚠️  Garbage collection not available. Run Chrome with --js-flags="--expose-gc"');
			return false;
		}
	}

	/**
	 * Run a full automated test
	 */
	async runFullTest() {
		console.log("🚀 Starting automated memory leak test...");
		console.log('⚠️  Make sure to enable "Record allocation stacks" in Memory profiler settings');

		this.start();

		// Step 1: Initial snapshot
		this.snapshot("1-initial");
		await this.pause(3000);

		// Step 2: Add items
		await this.addItems(100);
		this.snapshot("2-after-add-100");
		await this.pause(3000);

		// Step 3: Remove items
		await this.removeItems();
		this.snapshot("3-after-remove");
		await this.pause(3000);

		// Step 4: Force GC and wait
		this.forceGC();
		await this.pause(5000);
		this.snapshot("4-after-gc");

		// Step 5: Repeat cycle
		console.log("🔄 Repeating cycle...");
		await this.addItems(100);
		this.snapshot("5-after-add-again");
		await this.pause(3000);

		await this.removeItems();
		this.forceGC();
		await this.pause(5000);
		this.snapshot("6-final");

		console.log("✅ Test complete! Use heapTest.report() to see results");
		console.log("📊 Now compare heap snapshots in Memory tab:");
		console.log("   1. Look for detached DOM trees");
		console.log("   2. Check for growing object counts");
		console.log('   3. Use "Comparison" view between snapshots');
	}

	/**
	 * Pause execution
	 */
	pause(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Generate report
	 */
	report() {
		console.group("📊 Memory Test Report");

		// Snapshot summary
		console.table(
			this.snapshots.map((s) => ({
				label: s.label,
				time: new Date(s.timestamp).toLocaleTimeString(),
				totalNodes: s.domStats.totalNodes,
				tiles: s.domStats.tiles,
				detached: s.domStats.detachedNodes,
				heapSize: s.memory ? (s.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + " MB" : "N/A",
			}))
		);

		// Memory growth analysis
		if (this.snapshots.length >= 2) {
			const first = this.snapshots[0];
			const last = this.snapshots[this.snapshots.length - 1];

			if (first.memory && last.memory) {
				const growth = last.memory.usedJSHeapSize - first.memory.usedJSHeapSize;
				const growthMB = (growth / 1024 / 1024).toFixed(2);
				const growthPercent = ((growth / first.memory.usedJSHeapSize) * 100).toFixed(2);

				console.log(`\n📈 Memory Growth: ${growthMB} MB (${growthPercent}%)`);

				if (growth > 10 * 1024 * 1024) {
					// 10MB
					console.warn("⚠️  Significant memory growth detected!");
				}
			}
		}

		// Leak indicators
		console.log("\n🔍 Potential Leak Indicators:");
		const indicators = this.checkLeakIndicators();
		indicators.forEach((indicator) => {
			console.log(`${indicator.severity === "high" ? "🔴" : "🟡"} ${indicator.message}`);
		});

		console.groupEnd();
	}

	/**
	 * Check for leak indicators
	 */
	checkLeakIndicators() {
		const indicators = [];

		if (this.snapshots.length < 2) {
			return indicators;
		}

		// Check if DOM nodes don't return to baseline
		const initial = this.snapshots[0];
		const final = this.snapshots[this.snapshots.length - 1];

		if (final.domStats.totalNodes > initial.domStats.totalNodes * 1.1) {
			indicators.push({
				severity: "high",
				message: `DOM nodes increased from ${initial.domStats.totalNodes} to ${final.domStats.totalNodes}`,
			});
		}

		// Check for persistent tiles after removal
		const afterRemove = this.snapshots.find((s) => s.label.includes("after-remove"));
		if (afterRemove && afterRemove.domStats.tiles > 0) {
			indicators.push({
				severity: "high",
				message: `${afterRemove.domStats.tiles} tiles remain after removal`,
			});
		}

		// Check for detached nodes
		if (final.domStats.detachedNodes > 0) {
			indicators.push({
				severity: "medium",
				message: `${final.domStats.detachedNodes} detached nodes found`,
			});
		}

		return indicators;
	}
}

// Create global instance
window.heapTest = new HeapSnapshotHelper();

// Also attach to window for easy access
window.HeapSnapshotHelper = HeapSnapshotHelper;

console.log("✅ HeapSnapshotHelper loaded! Use window.heapTest to start testing.");
