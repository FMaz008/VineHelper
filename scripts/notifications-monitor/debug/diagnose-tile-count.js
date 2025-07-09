// Copy and paste this ENTIRE block into the console to diagnose tile count issues

(function () {
	console.log("🔍 Starting Tile Count Diagnosis...");

	// Get the grid
	const grid = document.querySelector("#vvp-items-grid");
	if (!grid) {
		console.error("❌ Grid not found!");
		return;
	}

	// Get all tiles
	const allTiles = grid.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
	const placeholders = grid.querySelectorAll(".vh-placeholder-tile");
	const endPlaceholders = grid.querySelectorAll(".vh-placeholder-tile.vh-end-placeholder");

	console.log("📊 Grid Statistics:");
	console.log(`   Total tiles (non-placeholder): ${allTiles.length}`);
	console.log(`   Regular placeholders: ${placeholders.length - endPlaceholders.length}`);
	console.log(`   End placeholders: ${endPlaceholders.length}`);
	console.log(`   Total children: ${grid.children.length}`);

	// Manual visibility count
	let visibleCount = 0;
	let hiddenCount = 0;
	const hiddenTiles = [];
	const edgeCases = [];

	allTiles.forEach((tile, index) => {
		const style = window.getComputedStyle(tile);
		const rect = tile.getBoundingClientRect();

		// Standard visibility check
		const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";

		// Additional checks
		const hasZeroDimensions = rect.width === 0 || rect.height === 0;
		const isOffscreen = rect.bottom < 0 || rect.top > window.innerHeight;

		if (isVisible && !hasZeroDimensions && !isOffscreen) {
			visibleCount++;
		} else {
			hiddenCount++;
			const info = {
				index: index,
				asin: tile.id?.replace("vh-notification-", "") || "unknown",
				display: style.display,
				visibility: style.visibility,
				opacity: style.opacity,
				inlineDisplay: tile.style.display,
				width: rect.width,
				height: rect.height,
				zeroDimensions: hasZeroDimensions,
				offscreen: isOffscreen,
				classList: Array.from(tile.classList).join(" "),
			};

			if (isVisible && (hasZeroDimensions || isOffscreen)) {
				edgeCases.push(info);
			} else {
				hiddenTiles.push(info);
			}
		}
	});

	console.log("\n🎯 Visibility Count:");
	console.log(`   Visible tiles: ${visibleCount}`);
	console.log(`   Hidden tiles: ${hiddenCount}`);
	console.log(`   Edge cases: ${edgeCases.length}`);

	// Get reported count from tab title
	const tabTitle = document.title;
	const titleMatch = tabTitle.match(/\((\d+)\)/);
	const reportedCount = titleMatch ? parseInt(titleMatch[1]) : null;

	if (reportedCount !== null) {
		console.log(`\n📋 Tab Title Reports: ${reportedCount} items`);
		console.log(`   Discrepancy: ${visibleCount - reportedCount} (actual - reported)`);

		if (visibleCount !== reportedCount) {
			console.warn(`\n⚠️ COUNT MISMATCH DETECTED!`);
			console.warn(`   Actual visible: ${visibleCount}`);
			console.warn(`   Reported in title: ${reportedCount}`);
			console.warn(`   Difference: ${visibleCount - reportedCount}`);
		}
	}

	// Show details of hidden tiles
	if (hiddenTiles.length > 0) {
		console.log("\n🚫 Hidden Tiles (first 5):");
		hiddenTiles.slice(0, 5).forEach((tile) => {
			console.log(`   ASIN: ${tile.asin}`);
			console.log(`     display: ${tile.display}, visibility: ${tile.visibility}, opacity: ${tile.opacity}`);
			console.log(`     inline display: ${tile.inlineDisplay}`);
		});
	}

	// Show edge cases
	if (edgeCases.length > 0) {
		console.log("\n⚡ Edge Cases (visible but problematic):");
		edgeCases.forEach((tile) => {
			console.log(`   ASIN: ${tile.asin}`);
			console.log(`     Zero dimensions: ${tile.zeroDimensions}, Offscreen: ${tile.offscreen}`);
			console.log(`     Width: ${tile.width}, Height: ${tile.height}`);
		});
	}

	// Try to access TileCounter if available
	try {
		// Various ways the monitor might be exposed
		const possiblePaths = [
			"window._monitor",
			"window.monitor",
			"window.notificationMonitor",
			"window.VH_MONITOR",
			'document.querySelector("#vvp-items-grid")?._monitor',
			'document.querySelector("#vvp-items-grid")?.monitor',
		];

		let monitor = null;
		for (const path of possiblePaths) {
			try {
				monitor = eval(path);
				if (monitor && typeof monitor.getTileCounter === "function") {
					console.log(`\n✅ Found monitor at: ${path}`);
					break;
				}
			} catch (e) {
				// Continue trying
			}
		}

		if (monitor && monitor.getTileCounter) {
			const tileCounter = monitor.getTileCounter();
			if (tileCounter && typeof tileCounter.diagnoseCount === "function") {
				console.log("\n🔧 Running TileCounter diagnosis...");
				const diagnosis = tileCounter.diagnoseCount();
				console.log("TileCounter Diagnosis:", diagnosis);
			} else if (tileCounter && typeof tileCounter.getCount === "function") {
				console.log(`\n📊 TileCounter reports: ${tileCounter.getCount()} visible tiles`);
			}
		} else {
			console.log("\n⚠️ Could not access TileCounter for detailed diagnosis");
			console.log("   The monitor instance is not exposed to the global scope");
		}
	} catch (e) {
		console.error("Error accessing TileCounter:", e);
	}

	// Placeholder calculation check
	const tilesPerRow = 8; // Standard grid
	const remainder = visibleCount % tilesPerRow;
	const expectedPlaceholders = remainder === 0 ? 0 : tilesPerRow - remainder;
	const actualPlaceholders = placeholders.length - endPlaceholders.length;

	console.log("\n🔢 Placeholder Calculation:");
	console.log(`   Visible tiles: ${visibleCount}`);
	console.log(`   Tiles per row: ${tilesPerRow}`);
	console.log(`   Remainder: ${remainder}`);
	console.log(`   Expected placeholders: ${expectedPlaceholders}`);
	console.log(`   Actual placeholders: ${actualPlaceholders}`);

	if (expectedPlaceholders !== actualPlaceholders) {
		console.warn(`\n⚠️ PLACEHOLDER MISMATCH!`);
		console.warn(`   Expected: ${expectedPlaceholders}`);
		console.warn(`   Actual: ${actualPlaceholders}`);
		console.warn(`   Difference: ${actualPlaceholders - expectedPlaceholders}`);
	}

	console.log("\n✅ Diagnosis complete!");
})();
