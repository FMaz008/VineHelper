/**
 * TileCounter Debugger Module
 *
 * Production-ready debugging tools for TileCounter performance monitoring.
 * Integrates with the existing debug infrastructure.
 */

class TileCounterDebugger {
	constructor(tileCounter) {
		this.tileCounter = tileCounter;
		this.isMonitoring = false;
		this.performanceData = {
			startTime: null,
			observations: {
				domMutations: [],
				tileCountUpdates: [],
				performanceMarkers: [],
			},
		};
		this.observer = null;
		this.originalSetTimeout = null;
		this.originalRAF = null;
	}

	/**
	 * Start monitoring TileCounter performance
	 */
	startMonitoring() {
		if (this.isMonitoring) {
			return { success: false, error: "Already monitoring" };
		}

		console.log("[TileCounterDebugger] Starting performance monitoring...");

		// Enable performance metrics in TileCounter
		if (this.tileCounter) {
			this.tileCounter.setPerformanceMetrics(true);
		} else {
			console.warn("[TileCounterDebugger] TileCounter not available - some metrics may be limited");
		}

		// Start observing DOM mutations
		this.observeMutations();

		// Hook into timing functions
		this.hookTimingFunctions();

		this.isMonitoring = true;
		this.performanceData.startTime = performance.now();

		return { success: true };
	}

	/**
	 * Stop monitoring and clean up
	 */
	stopMonitoring() {
		if (!this.isMonitoring) {
			return { success: false, error: "Not currently monitoring" };
		}

		console.log("[TileCounterDebugger] Stopping performance monitoring...");

		// Disable performance metrics in TileCounter
		if (this.tileCounter) {
			this.tileCounter.setPerformanceMetrics(false);
		}

		// Stop observing
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}

		// Restore original functions
		this.unhookTimingFunctions();

		this.isMonitoring = false;

		return { success: true };
	}

	/**
	 * Get current performance metrics
	 */
	getMetrics() {
		try {
			const tileCounterMetrics = this.tileCounter ? this.tileCounter.getPerformanceMetrics() : {};
			const currentCount = this.tileCounter ? this.tileCounter.getCount() : 0;

			// Calculate average delay from observations
			const timeouts = this.performanceData.observations.performanceMarkers.filter((m) => m.type === "timeout");
			const delays = timeouts.map((t) => t.delay);
			const averageDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;

			// Calculate cache hit rate from recent history
			let cacheHitRate = null;
			if (tileCounterMetrics && tileCounterMetrics.enabled && tileCounterMetrics.recentHistory) {
				// This would need to be extracted from console logs or added to TileCounter
				// For now, we'll estimate based on performance
				const avgDuration = tileCounterMetrics.averageRecountDuration || 0;
				if (avgDuration > 0) {
					// Faster recounts suggest better caching
					cacheHitRate = avgDuration < 5 ? 90 : avgDuration < 10 ? 70 : 50;
				}
			}

			return {
				success: true,
				data: {
					visibleCount: currentCount,
					lastRecountDuration: tileCounterMetrics ? tileCounterMetrics.lastRecountDuration : null,
					averageDelay: averageDelay,
					cacheHitRate: cacheHitRate,
					isMonitoring: this.isMonitoring,
					recountCount: tileCounterMetrics ? tileCounterMetrics.recountCount || 0 : 0,
				},
			};
		} catch (error) {
			console.error("[TileCounterDebugger] Error getting metrics:", error);
			return {
				success: false,
				error: error.message,
			};
		}
	}

	/**
	 * Generate comprehensive performance report
	 */
	generateReport() {
		if (!this.performanceData.startTime) {
			return { success: false, error: "No performance data available" };
		}

		const report = {
			summary: {
				totalObservationTime: performance.now() - this.performanceData.startTime,
				domMutations: this.performanceData.observations.domMutations.length,
				countUpdates: this.performanceData.observations.tileCountUpdates.length,
				performanceMarkers: this.performanceData.observations.performanceMarkers.length,
			},
			analysis: this.analyzePerformance(),
			recommendations: [],
		};

		// Analyze debouncing behavior
		const timeouts = this.performanceData.observations.performanceMarkers.filter((m) => m.type === "timeout");
		const debounceAnalysis = this.analyzeDebouncing(timeouts);
		report.debounceAnalysis = debounceAnalysis;

		// Generate recommendations
		if (debounceAnalysis.averageDelay < 10) {
			report.recommendations.push("✓ Optimized debouncing detected (immediate for user actions)");
		}

		if (this.tileCounter) {
			const tileCounterMetrics = this.tileCounter.getPerformanceMetrics();
			if (tileCounterMetrics && tileCounterMetrics.averageRecountDuration < 10) {
				report.recommendations.push("✓ Fast recount performance detected");
			}
		}

		if (report.analysis.bulkOperationsOptimized) {
			report.recommendations.push("✓ Bulk operations appear to be optimized");
		}

		console.log("[TileCounterDebugger] Performance Report:", report);

		return { success: true, data: report };
	}

	/**
	 * Clear all performance data
	 */
	clearData() {
		this.performanceData = {
			startTime: null,
			observations: {
				domMutations: [],
				tileCountUpdates: [],
				performanceMarkers: [],
			},
		};

		// Clear TileCounter metrics
		if (this.tileCounter) {
			this.tileCounter.setPerformanceMetrics(false);
			this.tileCounter.setPerformanceMetrics(true);
		}

		return { success: true };
	}

	/**
	 * Observe DOM mutations to track tile visibility checks
	 */
	observeMutations() {
		const targetNode = document.querySelector("#vvp-items-grid");
		if (!targetNode) {
			console.warn("[TileCounterDebugger] Grid container not found - monitoring may be limited");
			// Don't return early - allow monitoring to continue for other metrics
		}

		if (targetNode) {
			const config = {
				attributes: true,
				childList: true,
				subtree: true,
				attributeFilter: ["style", "class"],
			};

			this.observer = new MutationObserver((mutationsList) => {
				if (!this.isMonitoring) return;

				const timestamp = performance.now();
				let visibilityChanges = 0;

				for (const mutation of mutationsList) {
					if (
						mutation.type === "attributes" &&
						(mutation.attributeName === "style" || mutation.attributeName === "class")
					) {
						const element = mutation.target;
						if (element.classList && element.classList.contains("vvp-item-tile")) {
							visibilityChanges++;
						}
					}
				}

				if (visibilityChanges > 0) {
					this.performanceData.observations.domMutations.push({
						timestamp,
						visibilityChanges,
						type: "bulk-change",
					});
				}
			});

			this.observer.observe(targetNode, config);
		}
	}

	/**
	 * Hook into timing functions to track debouncing
	 */
	hookTimingFunctions() {
		// Store originals
		this.originalSetTimeout = window.setTimeout;
		this.originalRAF = window.requestAnimationFrame;

		// Override setTimeout to track debouncing behavior
		window.setTimeout = (fn, delay, ...args) => {
			if (this.isMonitoring && delay >= 0 && delay <= 100) {
				this.performanceData.observations.performanceMarkers.push({
					timestamp: performance.now(),
					type: "timeout",
					delay,
				});
			}
			return this.originalSetTimeout.call(window, fn, delay, ...args);
		};

		// Track animation frames
		window.requestAnimationFrame = (callback) => {
			if (this.isMonitoring) {
				this.performanceData.observations.performanceMarkers.push({
					timestamp: performance.now(),
					type: "raf",
				});
			}
			return this.originalRAF.call(window, callback);
		};
	}

	/**
	 * Restore original timing functions
	 */
	unhookTimingFunctions() {
		if (this.originalSetTimeout) {
			window.setTimeout = this.originalSetTimeout;
			this.originalSetTimeout = null;
		}

		if (this.originalRAF) {
			window.requestAnimationFrame = this.originalRAF;
			this.originalRAF = null;
		}
	}

	/**
	 * Analyze performance data
	 */
	analyzePerformance() {
		const analysis = {
			averageUpdateTime: 0,
			bulkOperationsOptimized: false,
			cachingDetected: false,
		};

		// Check for bulk operation optimization
		const bulkChanges = this.performanceData.observations.domMutations.filter((m) => m.visibilityChanges > 5);
		if (bulkChanges.length > 0) {
			// Check if updates were batched
			const updateTimes = this.performanceData.observations.tileCountUpdates.map((u) => u.timestamp);
			const batchedUpdates = updateTimes.filter((time, index) => {
				if (index === 0) return false;
				return time - updateTimes[index - 1] < 100; // Updates within 100ms
			});

			analysis.bulkOperationsOptimized = batchedUpdates.length < bulkChanges.length / 2;
		}

		// Get TileCounter metrics for additional analysis
		if (this.tileCounter) {
			const tileCounterMetrics = this.tileCounter.getPerformanceMetrics();
			if (tileCounterMetrics && tileCounterMetrics.enabled && tileCounterMetrics.averageRecountDuration < 5) {
				analysis.cachingDetected = true;
			}
		}

		return analysis;
	}

	/**
	 * Analyze debouncing behavior
	 */
	analyzeDebouncing(timeouts) {
		if (timeouts.length === 0) {
			return { averageDelay: 0, pattern: "none" };
		}

		const delays = timeouts.map((t) => t.delay);
		const averageDelay = delays.reduce((a, b) => a + b, 0) / delays.length;

		// Detect patterns
		const immediateCount = delays.filter((d) => d === 0).length;
		const debouncedCount = delays.filter((d) => d > 0).length;

		let pattern = "mixed";
		if (immediateCount > debouncedCount * 2) {
			pattern = "optimized-immediate";
		} else if (debouncedCount > immediateCount * 2) {
			pattern = "conservative-debounced";
		}

		return {
			averageDelay,
			pattern,
			immediateCount,
			debouncedCount,
		};
	}
}

export { TileCounterDebugger };
