// Copy and paste this ENTIRE block into the console
// This will expose the memory debugger that's already initialized

// First, let's check if it's in the page's actual window object
console.warn("Checking for MEMORY_DEBUGGER...");

// Method 1: Direct property check
if (typeof MemoryDebugger !== "undefined") {
	console.warn("Found MemoryDebugger class!");
	window.md = new MemoryDebugger();
	console.warn('✓ Created new instance. Use: md.takeSnapshot("test")');
} else {
	console.warn("MemoryDebugger class not found in global scope");
}

// Method 2: Since the console shows it exists, let's create our own
if (!window.md) {
	console.warn("Creating memory debugger manually...");

	// Define a simple memory debugger that logs to console
	window.md = {
		snapshots: [],

		takeSnapshot: function (name) {
			const snapshot = {
				name: name,
				timestamp: Date.now(),
				memory: performance.memory
					? {
							usedJSHeapSize: performance.memory.usedJSHeapSize,
							totalJSHeapSize: performance.memory.totalJSHeapSize,
							jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
						}
					: null,
			};
			this.snapshots.push(snapshot);
			console.warn(`📸 Snapshot "${name}" taken at ${new Date().toLocaleTimeString()}`);
			if (snapshot.memory) {
				console.warn(`   Heap: ${(snapshot.memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
			}
			return snapshot;
		},

		generateReport: function () {
			console.warn("📊 Memory Report:");
			console.warn(`Total snapshots: ${this.snapshots.length}`);

			if (this.snapshots.length >= 2) {
				const first = this.snapshots[0];
				const last = this.snapshots[this.snapshots.length - 1];

				if (first.memory && last.memory) {
					const diff = last.memory.usedJSHeapSize - first.memory.usedJSHeapSize;
					const percent = ((diff / first.memory.usedJSHeapSize) * 100).toFixed(2);
					console.warn(`Memory change: ${(diff / 1048576).toFixed(2)} MB (${percent}%)`);
				}
			}

			this.snapshots.forEach((snap, i) => {
				console.warn(`${i + 1}. ${snap.name} - ${new Date(snap.timestamp).toLocaleTimeString()}`);
				if (snap.memory) {
					console.warn(`   ${(snap.memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
				}
			});

			return this.snapshots;
		},

		reset: function () {
			this.snapshots = [];
			console.warn("🔄 Snapshots cleared");
		},
	};

	console.warn("✓ Manual memory debugger created!");
	console.warn("📌 Available commands:");
	console.warn('   md.takeSnapshot("name")  - Take a memory snapshot');
	console.warn("   md.generateReport()      - Show memory report");
	console.warn("   md.reset()               - Clear all snapshots");
}
