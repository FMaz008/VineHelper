import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";

class TitleDebugLogger {
	static #instance = null;
	#settings;
	#logData = new Map(); // Store logs per ASIN
	#globalLogs = [];
	#startTime = Date.now();

	constructor() {
		if (TitleDebugLogger.#instance) {
			return TitleDebugLogger.#instance;
		}
		TitleDebugLogger.#instance = this;
		this.#settings = new SettingsMgr();

		// Only initialize data structures if debug is enabled
		if (this.isEnabled()) {
			this.#logData = new Map();
			this.#globalLogs = [];
			this.#startTime = Date.now();
		}
	}

	static getInstance() {
		if (!TitleDebugLogger.#instance) {
			TitleDebugLogger.#instance = new TitleDebugLogger();
		}
		return TitleDebugLogger.#instance;
	}

	isEnabled() {
		return this.#settings.get("general.debugTitleDisplay");
	}

	log(asin, event, data = {}) {
		if (!this.isEnabled()) return;

		// Lazy initialize if needed
		if (!this.#logData) {
			this.#logData = new Map();
			this.#globalLogs = [];
			this.#startTime = Date.now();
		}

		const timestamp = Date.now() - this.#startTime;
		const stackTrace = this.#getStackTrace();

		const logEntry = {
			timestamp,
			event,
			data,
			stackTrace,
			time: new Date().toISOString(),
		};

		// Store per-ASIN logs
		if (!this.#logData.has(asin)) {
			this.#logData.set(asin, []);
		}
		this.#logData.get(asin).push(logEntry);

		// Also store in global logs
		this.#globalLogs.push({ asin, ...logEntry });

		// Console output with formatting
		console.group(`🔍 [TitleDebug] ${event} - ASIN: ${asin}`);
		console.log(`⏱️ Time: +${timestamp}ms`);
		console.log(`📊 Data:`, data);
		if (stackTrace.length > 0) {
			console.log(`📚 Stack trace:`, stackTrace);
		}
		console.groupEnd();
	}

	logMutation(asin, mutation, element) {
		if (!this.isEnabled()) return;

		const data = {
			type: mutation.type,
			target: {
				tagName: mutation.target.tagName,
				className: mutation.target.className,
				id: mutation.target.id,
				textContent: mutation.target.textContent?.substring(0, 100),
			},
			oldValue: mutation.oldValue,
			attributeName: mutation.attributeName,
			removedNodes: Array.from(mutation.removedNodes).map((node) => ({
				nodeType: node.nodeType,
				nodeName: node.nodeName,
				textContent: node.textContent?.substring(0, 100),
			})),
			addedNodes: Array.from(mutation.addedNodes).map((node) => ({
				nodeType: node.nodeType,
				nodeName: node.nodeName,
				textContent: node.textContent?.substring(0, 100),
			})),
		};

		// Check if this mutation cleared text
		const wasTextCleared = mutation.type === "characterData" && mutation.oldValue && !mutation.target.textContent;

		if (wasTextCleared) {
			data.textCleared = true;
			data.clearedText = mutation.oldValue;
		}

		this.log(asin, "MUTATION_OBSERVED", data);
	}

	#getStackTrace() {
		if (!this.isEnabled()) return [];

		const stack = new Error().stack;
		const lines = stack.split("\n");

		// Filter out this logger's frames and format
		return lines
			.slice(3) // Skip Error line and this function
			.filter((line) => !line.includes("TitleDebugLogger"))
			.map((line) => line.trim())
			.slice(0, 5); // Keep top 5 frames
	}

	logTileCreation(asin, titleElement, initialText) {
		this.log(asin, "TILE_CREATED", {
			hasTitle: !!titleElement,
			titleTagName: titleElement?.tagName,
			titleClassName: titleElement?.className,
			initialText: initialText?.substring(0, 200),
			textLength: initialText?.length,
			parentElement: titleElement?.parentElement?.className,
		});
	}

	logTemplateProcessing(asin, templateUrl, hasDescription, processedText) {
		this.log(asin, "TEMPLATE_PROCESSED", {
			templateUrl,
			hasDescriptionPlaceholder: hasDescription,
			processedText: processedText?.substring(0, 200),
			textLength: processedText?.length,
		});
	}

	logTooltipAdded(asin, element, tooltipText) {
		this.log(asin, "TOOLTIP_ADDED", {
			elementClass: element.className,
			tooltipText: tooltipText?.substring(0, 200),
			tooltipLength: tooltipText?.length,
			elementTextContent: element.textContent?.substring(0, 200),
		});
	}

	logTextCleared(asin, element, previousText) {
		this.log(asin, "TEXT_CLEARED", {
			elementClass: element.className,
			elementTag: element.tagName,
			previousText: previousText?.substring(0, 200),
			previousLength: previousText?.length,
			currentText: element.textContent,
			isEmpty: !element.textContent,
		});
	}

	logTextRestored(asin, element, restoredText, method) {
		this.log(asin, "TEXT_RESTORED", {
			method,
			elementClass: element.className,
			restoredText: restoredText?.substring(0, 200),
			restoredLength: restoredText?.length,
		});
	}

	logDOMExtraction(asin, source, extractedText) {
		this.log(asin, "DOM_TEXT_EXTRACTED", {
			source,
			extractedText: extractedText?.substring(0, 200),
			textLength: extractedText?.length,
			isEmpty: !extractedText,
		});
	}

	generateSummary() {
		if (!this.isEnabled() || !this.#logData) return null;

		const summary = {
			totalTiles: this.#logData.size,
			tilesWithClearedText: 0,
			clearingPatterns: new Map(),
			timingPatterns: [],
			commonStackTraces: new Map(),
		};

		// Analyze each tile's logs
		for (const [asin, logs] of this.#logData) {
			const clearedEvents = logs.filter((log) => log.event === "TEXT_CLEARED");
			if (clearedEvents.length > 0) {
				summary.tilesWithClearedText++;

				// Analyze timing
				const creationLog = logs.find((log) => log.event === "TILE_CREATED");
				if (creationLog) {
					clearedEvents.forEach((clearEvent) => {
						summary.timingPatterns.push({
							asin,
							timeUntilCleared: clearEvent.timestamp - creationLog.timestamp,
						});
					});
				}
			}

			// Analyze stack traces
			logs.forEach((log) => {
				if (log.stackTrace && log.stackTrace.length > 0) {
					const traceKey = log.stackTrace[0]; // Top frame
					if (!summary.commonStackTraces.has(traceKey)) {
						summary.commonStackTraces.set(traceKey, {
							count: 0,
							events: [],
						});
					}
					const traceData = summary.commonStackTraces.get(traceKey);
					traceData.count++;
					traceData.events.push(log.event);
				}
			});
		}

		// Calculate average timing
		if (summary.timingPatterns.length > 0) {
			const totalTime = summary.timingPatterns.reduce((sum, p) => sum + p.timeUntilCleared, 0);
			summary.averageTimeUntilCleared = totalTime / summary.timingPatterns.length;
		}

		return summary;
	}

	printSummary() {
		const summary = this.generateSummary();
		if (!summary) return;

		console.group("📊 Title Display Debug Summary");
		console.log(`Total tiles tracked: ${summary.totalTiles}`);
		console.log(`Tiles with cleared text: ${summary.tilesWithClearedText}`);

		if (summary.averageTimeUntilCleared) {
			console.log(`Average time until text cleared: ${summary.averageTimeUntilCleared.toFixed(2)}ms`);
		}

		if (summary.commonStackTraces.size > 0) {
			console.group("🔍 Common Stack Traces:");
			for (const [trace, data] of summary.commonStackTraces) {
				console.log(`${trace} (${data.count} occurrences)`);
				console.log(`  Events: ${[...new Set(data.events)].join(", ")}`);
			}
			console.groupEnd();
		}

		console.groupEnd();
	}

	exportLogs() {
		if (!this.isEnabled() || !this.#logData) {
			return {
				enabled: false,
				message: "Title debug logging is not enabled",
			};
		}

		return {
			startTime: new Date(this.#startTime).toISOString(),
			duration: Date.now() - this.#startTime,
			globalLogs: this.#globalLogs,
			perAsinLogs: Object.fromEntries(this.#logData),
			summary: this.generateSummary(),
		};
	}

	// Console helper methods
	static help() {
		console.log(`
🔍 Title Debug Logger Commands:
================================
TitleDebugLogger.getInstance().printSummary() - Print analysis summary
TitleDebugLogger.getInstance().exportLogs() - Export all logs as JSON
TitleDebugLogger.getInstance().getLogsForAsin('ASIN') - Get logs for specific ASIN
TitleDebugLogger.getInstance().findClearedTitles() - List all ASINs with cleared titles
TitleDebugLogger.getInstance().analyzeTimings() - Analyze timing patterns
        `);
	}

	getLogsForAsin(asin) {
		if (!this.isEnabled() || !this.#logData) return [];
		return this.#logData.get(asin) || [];
	}

	findClearedTitles() {
		if (!this.isEnabled() || !this.#logData) return [];

		const clearedTitles = [];
		for (const [asin, logs] of this.#logData) {
			const hasCleared = logs.some((log) => log.event === "TEXT_CLEARED");
			if (hasCleared) {
				const clearedLogs = logs.filter((log) => log.event === "TEXT_CLEARED");
				clearedTitles.push({
					asin,
					clearCount: clearedLogs.length,
					logs: clearedLogs,
				});
			}
		}
		return clearedTitles;
	}

	analyzeTimings() {
		if (!this.isEnabled() || !this.#logData) return [];

		const timings = [];
		for (const [asin, logs] of this.#logData) {
			const creationLog = logs.find((log) => log.event === "TILE_CREATED");
			const clearLogs = logs.filter((log) => log.event === "TEXT_CLEARED");

			if (creationLog && clearLogs.length > 0) {
				clearLogs.forEach((clearLog) => {
					timings.push({
						asin,
						timeUntilCleared: clearLog.timestamp - creationLog.timestamp,
						stackTrace: clearLog.stackTrace[0] || "Unknown",
					});
				});
			}
		}

		// Sort by timing
		timings.sort((a, b) => a.timeUntilCleared - b.timeUntilCleared);

		console.group("⏱️ Title Clearing Timing Analysis");
		console.table(timings);
		console.groupEnd();

		return timings;
	}
}

// Make it available globally for console access in the content script context
if (typeof window !== "undefined") {
	window.TitleDebugLogger = TitleDebugLogger;

	// Only log initialization message if debug is enabled
	const instance = TitleDebugLogger.getInstance();
	if (instance.isEnabled()) {
		console.log("🔍 TitleDebugLogger initialized. To access it from the console:");
		console.log("1. Open Chrome DevTools (F12)");
		console.log(
			'2. In the Console tab, change the context dropdown from "top" to the VineHelper extension context'
		);
		console.log("3. Then use: TitleDebugLogger.getInstance() or TitleDebugLogger.help()");
	}
}

export { TitleDebugLogger };
