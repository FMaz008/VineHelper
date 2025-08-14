import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
const Settings = new SettingsMgr();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
const i13n = new Internationalization();

import { initiateSettings } from "/page/settings_loadsave.js";

import { Template } from "/scripts/core/utils/Template.js";
var Tpl = new Template();

import { Environment } from "/scripts/core/services/Environment.js";
const env = new Environment();

// Clear template cache and variables when opening settings
Tpl.flushLocalStorage();

//If browser is firefox, load icon_firefox.css
if (navigator.userAgent.includes("Firefox")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="../resource/css/icon_firefox.css" />`;
}
//If the browser is chrome, load icon_chrome.css
if (navigator.userAgent.includes("Chrome") || navigator.userAgent.includes("Chromium")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="../resource/css/icon_chrome.css" />`;
}
if (navigator.userAgent.includes("Safari")) {
	document.head.innerHTML += `<link rel="stylesheet" type="text/css" href="../resource/css/icon_ios.css" />`;
}

function loadStyleSheetContent(content, path = "injected") {
	if (content != "") {
		const style = document.createElement("style");
		style.innerHTML = "/*" + path + "*/\n" + content;
		document.head.appendChild(style);
	}
}

//Render the main layout
(async () => {
	const promMainTpl = await Tpl.loadFile("/page/settings_main.tpl.html");
	const promTab1 = await Tpl.loadFile("/page/settings_general.tpl.html");
	const promTab2 = await Tpl.loadFile("/page/settings_notifications.tpl.html");
	const promTab3 = await Tpl.loadFile("/page/settings_system.tpl.html");
	const promTab4 = await Tpl.loadFile("/page/settings_styles.tpl.html");
	const promTab5 = await Tpl.loadFile("/page/settings_brenda.tpl.html");
	const promTab6 = await Tpl.loadFile("/page/settings_keywords.tpl.html");
	const promTab7 = await Tpl.loadFile("/page/settings_keybindings.tpl.html");
	const promTab8 = await Tpl.loadFile("/page/settings_premium.tpl.html");
	const promTab9 = await Tpl.loadFile("/page/settings_debug.tpl.html");
	const promTab10 = await Tpl.loadFile("/page/settings_about.tpl.html");

	// Clear any existing template variables before setting new ones
	Tpl.clearVariables();
	// Set Safari detection before loading premium template so it can be used within the template
	Tpl.setIf("isSafari", env.isSafari());
	Tpl.setVar("APP_VERSION", getAppVersion());
	Tpl.setVar("TAB1", Tpl.render(promTab1));
	Tpl.setVar("TAB2", Tpl.render(promTab2));
	Tpl.setVar("TAB3", Tpl.render(promTab3));
	Tpl.setVar("TAB4", Tpl.render(promTab4));
	Tpl.setVar("TAB5", Tpl.render(promTab5));
	Tpl.setVar("TAB6", Tpl.render(promTab6));
	Tpl.setVar("TAB7", Tpl.render(promTab7));
	Tpl.setVar("TAB8", Tpl.render(promTab8));
	Tpl.setVar("TAB9", Tpl.render(promTab9));
	Tpl.setVar("TAB10", Tpl.render(promTab10));

	await Settings.waitForLoad();

	//Load the custom CSS if the user is a premium user
	if (Settings.isPremiumUser(2) && Settings.get("general.customCSS")) {
		loadStyleSheetContent(Settings.get("general.customCSS"));
	}

	let domainTLD = "";
	const countryCode = Settings.get("general.country");
	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
		domainTLD = i13n.getDomainTLD();
	}
	Tpl.setIf("country_known", countryCode != null);
	Tpl.setVar("monitor_link", "https://www.amazon." + domainTLD + "/vine/vine-items?queue=encore#monitor");

	Tpl.setVar("light_monitor_link", chrome.runtime.getURL("page/notification_monitor_light.html"));
	Tpl.setVar("item_explorer_link", chrome.runtime.getURL("page/item_explorer.html"));
	Tpl.setIf("tier_3", Settings.isPremiumUser(3));

	document.body.innerHTML = Tpl.render(promMainTpl);

	if (countryCode != null) {
		initTabs();
		initiateSettings(); //page/settings_loadsave.js, initialize the loading and saving code for the page
		initMemoryDebugging(); // Initialize memory debugging controls
		initTileCounterDebugging(); // Initialize TileCounter debugging controls
	}
})();

// Memory Debugging Functions
function initMemoryDebugging() {
	// Check if memory debugging is enabled
	const debugMemoryCheckbox = document.querySelector('input[name="general.debugMemory"]');
	const memoryDebugControls = document.getElementById("memoryDebugControls");

	if (!debugMemoryCheckbox || !memoryDebugControls) return;

	// Show/hide controls based on checkbox state
	function updateMemoryDebugVisibility() {
		memoryDebugControls.style.display = debugMemoryCheckbox.checked ? "block" : "none";
	}

	// Initial visibility
	updateMemoryDebugVisibility();

	// Listen for changes
	debugMemoryCheckbox.addEventListener("change", updateMemoryDebugVisibility);

	// Memory debug log
	const logElement = document.getElementById("memoryDebugLog");
	let logContent = [];

	function addToLog(message, type = "info") {
		const timestamp = new Date().toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});

		// Use icons/symbols for different types
		const typeSymbol = type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️";
		const color = type === "error" ? "#d32f2f" : type === "success" ? "#2e7d32" : "#555";

		// Format message more compactly - all on one line
		const logEntry =
			`<div style="margin: 3px 0; font-size: 11px; line-height: 1.3;">` +
			`<span style="color: #999; font-size: 10px; display: inline-block; width: 55px;">${timestamp}</span> ` +
			`<span style="display: inline-block; width: 20px; text-align: center;">${typeSymbol}</span> ` +
			`<span style="color: ${color};">${message}</span>` +
			`</div>`;

		logContent.push(logEntry);

		// Keep only last 50 entries for dropdown view
		if (logContent.length > 50) {
			logContent.shift();
		}

		logElement.innerHTML = logContent.join("");
		logElement.scrollTop = logElement.scrollHeight;
	}

	// Clear log button
	document.getElementById("clearLogBtn")?.addEventListener("click", () => {
		logContent = [];
		logElement.innerHTML = '<div style="color: #888; font-style: italic;">Memory debugging log cleared.</div>';
		addToLog("Log cleared", "info");
	});

	// Copy log button
	document.getElementById("copyLogBtn")?.addEventListener("click", async () => {
		try {
			// Extract text content from log entries
			const logText = logContent
				.map((entry) => {
					// Parse the HTML to extract text
					const tempDiv = document.createElement("div");
					tempDiv.innerHTML = entry;
					return tempDiv.textContent || tempDiv.innerText || "";
				})
				.join("\n");

			// Copy to clipboard
			await navigator.clipboard.writeText(logText);

			// Show success feedback
			const copyBtn = document.getElementById("copyLogBtn");
			const originalText = copyBtn.textContent;
			copyBtn.textContent = "✓";
			copyBtn.style.background = "#d4edda";

			setTimeout(() => {
				copyBtn.textContent = originalText;
				copyBtn.style.background = "#f0f0f0";
			}, 1500);

			addToLog("Log copied to clipboard", "success");
		} catch (error) {
			console.error("Failed to copy log:", error);
			addToLog("Failed to copy log: " + error.message, "error");
		}
	});

	// Memory debugging API communication
	async function sendMemoryCommand(command, params = {}) {
		try {
			// Send message to all tabs to execute memory debugging command
			const tabs = await chrome.tabs.query({});
			const vineTab = tabs.find((tab) => tab.url && tab.url.includes("amazon.") && tab.url.includes("/vine/"));

			if (!vineTab) {
				addToLog("No Vine tab found. Please open a Vine page first.", "error");
				return null;
			}

			return new Promise((resolve) => {
				chrome.tabs.sendMessage(
					vineTab.id,
					{
						type: "MEMORY_DEBUG_COMMAND",
						command: command,
						params: params,
					},
					(response) => {
						if (chrome.runtime.lastError) {
							addToLog(`Error: ${chrome.runtime.lastError.message}`, "error");
							resolve(null);
						} else {
							resolve(response);
						}
					}
				);
			});
		} catch (error) {
			addToLog(`Error: ${error.message}`, "error");
			return null;
		}
	}

	// Take snapshot button
	document.getElementById("takeSnapshotBtn")?.addEventListener("click", async () => {
		const snapshotNameInput = document.getElementById("snapshotName");
		const snapshotName = snapshotNameInput.value.trim() || `snap-${Date.now()}`;

		// Disable button during operation
		const btn = document.getElementById("takeSnapshotBtn");
		btn.disabled = true;
		btn.textContent = "Taking...";

		addToLog(`Taking snapshot: ${snapshotName}`);

		const result = await sendMemoryCommand("takeSnapshot", { name: snapshotName });
		if (result && result.success) {
			addToLog(`Snapshot saved: ${snapshotName}`, "success");
			snapshotNameInput.value = ""; // Clear input after success
		} else {
			addToLog(`Snapshot failed: ${result?.error || "Unknown error"}`, "error");
		}

		// Re-enable button
		btn.disabled = false;
		btn.textContent = "Take Snapshot";
	});

	// Generate report button
	document.getElementById("generateReportBtn")?.addEventListener("click", async () => {
		addToLog("Generating memory report...");

		const result = await sendMemoryCommand("generateReport");
		if (result && result.success) {
			addToLog("Memory report generated:", "success");
			addToLog(JSON.stringify(result.data, null, 2));
		} else {
			addToLog(`Failed to generate report: ${result?.error || "Unknown error"}`, "error");
		}
	});

	// Detect leaks button
	document.getElementById("detectLeaksBtn")?.addEventListener("click", async () => {
		addToLog("Detecting memory leaks...");

		const result = await sendMemoryCommand("detectLeaks");
		if (result && result.success) {
			const leaks = result.data;

			// Compact summary
			const hasIssues = leaks.notificationMonitors > 1 || leaks.detachedNodes > 100;
			addToLog("Leak detection complete", hasIssues ? "error" : "success");

			// Only show problematic values
			if (leaks.notificationMonitors > 1) {
				addToLog(`⚠️ Monitors: ${leaks.notificationMonitors} (should be 1)`, "error");
			}
			if (leaks.detachedNodes > 100) {
				addToLog(`⚠️ Detached nodes: ${leaks.detachedNodes}`, "error");
			}
			if (leaks.keywordMatchInstances > 50) {
				addToLog(`⚠️ Keywords: ${leaks.keywordMatchInstances}`, "error");
			}

			// Show summary if no issues
			if (!hasIssues) {
				addToLog(`✓ No memory leaks detected`, "success");
			}
		} else {
			addToLog(`Leak detection failed`, "error");
		}
	});

	// Check detached nodes button
	document.getElementById("checkDetachedBtn")?.addEventListener("click", async () => {
		addToLog("Checking for detached DOM nodes...");

		const result = await sendMemoryCommand("checkDetachedNodes");
		if (result && result.success) {
			const detached = result.data;
			addToLog(`Found ${detached.length} detached nodes`, detached.length > 0 ? "error" : "success");
			if (detached.length > 0 && detached.length <= 10) {
				detached.forEach((node, i) => {
					addToLog(`  ${i + 1}. ${node}`);
				});
			}
		} else {
			addToLog(`Failed to check detached nodes: ${result?.error || "Unknown error"}`, "error");
		}
	});

	// Cleanup button
	document.getElementById("cleanupBtn")?.addEventListener("click", async () => {
		addToLog("Running memory cleanup...");

		const result = await sendMemoryCommand("cleanup");
		if (result && result.success) {
			const cleaned = result.data;
			addToLog(`Cleanup completed! Cleaned ${cleaned.length} items`, "success");
			cleaned.forEach((item) => {
				addToLog(`  - ${item}`);
			});
		} else {
			addToLog(`Failed to run cleanup: ${result?.error || "Unknown error"}`, "error");
		}
	});
}

// TileCounter Debugging Functions
function initTileCounterDebugging() {
	// Check if TileCounter debugging is enabled
	const debugTileCounterCheckbox = document.querySelector('input[name="general.debugTileCounter"]');
	const tileCounterDebugControls = document.getElementById("tileCounterDebugControls");

	if (!debugTileCounterCheckbox || !tileCounterDebugControls) return;

	// Track if this is the first time enabling
	let hasShownReloadNotice = false;

	// Show/hide controls based on checkbox state
	function updateTileCounterDebugVisibility() {
		const isEnabled = debugTileCounterCheckbox.checked;
		tileCounterDebugControls.style.display = isEnabled ? "block" : "none";

		// Show a one-time notice when first enabled
		if (isEnabled && !hasShownReloadNotice) {
			hasShownReloadNotice = true;

			// Add a temporary notice to the log
			addToLog("⚠️ IMPORTANT: Open or reload the Notification Monitor to initialize the debugger!", "warning");
			addToLog("The TileCounter debugger only works in the Notification Monitor tab.", "info");

			// Also update the status to show it's not initialized
			const statusElement = document.getElementById("tcStatus");
			if (statusElement) {
				statusElement.textContent = "Not initialized - open Notification Monitor";
				statusElement.style.color = "#f57c00";
			}
		}
	}

	// Function to check if debugger is already initialized
	async function checkDebuggerStatus() {
		if (!debugTileCounterCheckbox.checked) return;

		try {
			// Check if debugger is initialized by sending a test command
			const result = await sendTileCounterCommand("getMetrics");
			if (result && result.success) {
				// Debugger is initialized and responding
				const statusElement = document.getElementById("tcStatus");
				if (statusElement) {
					statusElement.textContent = "Initialized";
					statusElement.style.color = "#2e7d32";
				}
				// Don't log this on every check, only on initial load
				if (!window.hasLoggedDebuggerReady) {
					window.hasLoggedDebuggerReady = true;
					addToLog("TileCounter debugger is initialized and ready", "success");
				}

				// Update metrics display with current data
				if (result.data) {
					updateMetricsDisplay(result.data);
				}
			} else {
				// Debugger not initialized - but only show warning if checkbox is checked
				const statusElement = document.getElementById("tcStatus");
				if (statusElement && debugTileCounterCheckbox.checked) {
					// Only show "not initialized" if we haven't seen it initialized before
					const currentText = statusElement.textContent;
					if (currentText !== "Initialized" && currentText !== "Monitoring") {
						statusElement.textContent = "Not initialized - open Notification Monitor";
						statusElement.style.color = "#f57c00";
					}
				}
			}
		} catch (error) {
			console.error("Error checking debugger status:", error);
		}
	}

	// Initial visibility
	updateTileCounterDebugVisibility();

	// Listen for changes
	debugTileCounterCheckbox.addEventListener("change", updateTileCounterDebugVisibility);

	// Check debugger status on load if debugging is enabled
	if (debugTileCounterCheckbox.checked) {
		// Small delay to ensure everything is initialized
		setTimeout(() => {
			checkDebuggerStatus();
		}, 500);
	}

	// Periodically check if debugger becomes available (e.g., when user opens a Vine tab)
	setInterval(() => {
		if (debugTileCounterCheckbox.checked && !isMonitoring) {
			checkDebuggerStatus();
		}
	}, 3000); // Check every 3 seconds

	// TileCounter debug log
	const logElement = document.getElementById("tileCounterDebugLog");
	let logContent = [];
	let isMonitoring = false;
	let monitoringInterval = null;

	function addToLog(message, type = "info") {
		const timestamp = new Date().toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});

		// Use icons/symbols for different types
		const typeSymbol = type === "error" ? "❌" : type === "success" ? "✅" : type === "warning" ? "⚠️" : "ℹ️";
		const color =
			type === "error" ? "#d32f2f" : type === "success" ? "#2e7d32" : type === "warning" ? "#f57c00" : "#555";

		// Format message more compactly - all on one line
		const logEntry =
			`<div style="margin: 3px 0; font-size: 11px; line-height: 1.3;">` +
			`<span style="color: #999; font-size: 10px; display: inline-block; width: 55px;">${timestamp}</span> ` +
			`<span style="display: inline-block; width: 20px; text-align: center;">${typeSymbol}</span> ` +
			`<span style="color: ${color};">${message}</span>` +
			`</div>`;

		logContent.push(logEntry);

		// Keep only last 50 entries for dropdown view
		if (logContent.length > 50) {
			logContent.shift();
		}

		logElement.innerHTML = logContent.join("");
		logElement.scrollTop = logElement.scrollHeight;
	}

	// Clear log button
	document.getElementById("clearTileCounterLogBtn")?.addEventListener("click", () => {
		logContent = [];
		logElement.innerHTML =
			'<div style="color: #888; font-style: italic;">TileCounter performance log cleared.</div>';
		addToLog("Log cleared", "info");
	});

	// Copy log button
	document.getElementById("copyTileCounterLogBtn")?.addEventListener("click", async () => {
		try {
			// Extract text content from log entries
			const logText = logContent
				.map((entry) => {
					// Parse the HTML to extract text
					const tempDiv = document.createElement("div");
					tempDiv.innerHTML = entry;
					return tempDiv.textContent || tempDiv.innerText || "";
				})
				.join("\n");

			// Copy to clipboard
			await navigator.clipboard.writeText(logText);

			// Show success feedback
			const copyBtn = document.getElementById("copyTileCounterLogBtn");
			const originalText = copyBtn.textContent;
			copyBtn.textContent = "✓";
			copyBtn.style.background = "#d4edda";

			setTimeout(() => {
				copyBtn.textContent = originalText;
				copyBtn.style.background = "#f0f0f0";
			}, 1500);

			addToLog("Log copied to clipboard", "success");
		} catch (error) {
			console.error("Failed to copy log:", error);
			addToLog("Failed to copy log: " + error.message, "error");
		}
	});

	// TileCounter debugging API communication
	async function sendTileCounterCommand(command, params = {}) {
		try {
			// First try to find an active Notification Monitor tab
			const tabs = await chrome.tabs.query({});
			const monitorTab = tabs.find(
				(tab) =>
					tab.url && tab.url.includes("amazon.") && tab.url.includes("/vine/") && tab.url.includes("#monitor")
			);

			if (!monitorTab) {
				if (command !== "getMetrics") {
					// Don't spam log for polling
					addToLog("No Notification Monitor tab found. Please open the Notification Monitor first.", "error");
					// Debug: show all vine tabs
					const vineTabs = tabs.filter(
						(tab) => tab.url && tab.url.includes("amazon.") && tab.url.includes("/vine/")
					);
					if (vineTabs.length > 0) {
						console.log(
							"Found Vine tabs but none with #monitor:",
							vineTabs.map((t) => t.url)
						);
					}
				}
				return null;
			}

			// For the initial start command, try to inject the script
			if (command === "startMonitoring") {
				try {
					await chrome.scripting.executeScript({
						target: { tabId: monitorTab.id },
						files: ["scripts/bootloaderLoader.js"],
					});
					// Give the script more time to initialize
					await new Promise((resolve) => setTimeout(resolve, 500));
				} catch (e) {
					// Script might already be injected, which is fine
				}
			}

			// Debug log when we find the monitor tab
			if (command === "startMonitoring") {
				console.log("Found Notification Monitor tab:", monitorTab.url);
			}

			return new Promise((resolve) => {
				chrome.tabs.sendMessage(
					monitorTab.id,
					{
						type: "TILECOUNTER_DEBUG_COMMAND",
						command: command,
						params: params,
					},
					(response) => {
						if (chrome.runtime.lastError) {
							// Only log errors for non-polling commands
							if (command !== "getMetrics") {
								addToLog(`Error: ${chrome.runtime.lastError.message}`, "error");
								console.error("Message send error:", chrome.runtime.lastError);
							}
							resolve(null);
						} else {
							if (command === "startMonitoring") {
								console.log("Response from monitor tab:", response);
							}
							resolve(response);
						}
					}
				);
			});
		} catch (error) {
			if (command !== "getMetrics") {
				// Don't spam log for polling
				addToLog(`Error: ${error.message}`, "error");
			}
			return null;
		}
	}

	// Update metrics display
	function updateMetricsDisplay(metrics) {
		const statusElement = document.getElementById("tcStatus");

		// Determine status text based on current state
		if (isMonitoring) {
			statusElement.textContent = "Monitoring";
			statusElement.style.color = "#2e7d32";
		} else if (metrics) {
			// We have metrics but not monitoring - debugger is initialized
			statusElement.textContent = "Initialized";
			statusElement.style.color = "#2e7d32";
		} else {
			// No metrics - check if we should keep the current status
			const currentText = statusElement.textContent;
			if (currentText === "Initialized" || currentText === "Monitoring") {
				// Debugger was previously initialized, keep showing as initialized
				statusElement.textContent = "Initialized";
				statusElement.style.color = "#2e7d32";
			} else if (currentText === "Not initialized - open Notification Monitor") {
				// Keep the not initialized message
				statusElement.style.color = "#f57c00";
			} else {
				// Default state
				statusElement.textContent = "Not monitoring";
				statusElement.style.color = "#888";
			}
		}

		if (metrics) {
			document.getElementById("tcVisibleCount").textContent = metrics.visibleCount || "-";
			document.getElementById("tcLastRecount").textContent = metrics.lastRecountDuration
				? `${metrics.lastRecountDuration.toFixed(2)}ms`
				: "-";
			document.getElementById("tcAvgDelay").textContent = metrics.averageDelay
				? `${metrics.averageDelay.toFixed(2)}ms`
				: "-";
			document.getElementById("tcCacheHitRate").textContent = metrics.cacheHitRate
				? `${metrics.cacheHitRate.toFixed(1)}%`
				: "-";

			// Determine optimization status
			let optimizationStatus = "Unknown";
			let optimizationColor = "#888";

			if (metrics.averageDelay !== undefined) {
				if (metrics.averageDelay < 10) {
					optimizationStatus = "Optimized";
					optimizationColor = "#2e7d32";
				} else if (metrics.averageDelay < 50) {
					optimizationStatus = "Partial";
					optimizationColor = "#f57c00";
				} else {
					optimizationStatus = "Not optimized";
					optimizationColor = "#d32f2f";
				}
			}

			const tcOptimization = document.getElementById("tcOptimization");
			tcOptimization.textContent = optimizationStatus;
			tcOptimization.style.color = optimizationColor;
		}
	}

	// Start monitoring button
	document.getElementById("startTileCounterMonitorBtn")?.addEventListener("click", async () => {
		if (isMonitoring) {
			addToLog("Already monitoring", "warning");
			return;
		}

		addToLog("Starting TileCounter monitoring...");

		const result = await sendTileCounterCommand("startMonitoring");
		if (result && result.success) {
			isMonitoring = true;
			document.getElementById("startTileCounterMonitorBtn").disabled = true;
			document.getElementById("stopTileCounterMonitorBtn").disabled = false;

			addToLog("Monitoring started", "success");

			// Start polling for metrics
			monitoringInterval = setInterval(async () => {
				const metricsResult = await sendTileCounterCommand("getMetrics");
				if (metricsResult && metricsResult.success) {
					updateMetricsDisplay(metricsResult.data);
				} else if (!metricsResult) {
					// Connection lost, stop monitoring
					clearInterval(monitoringInterval);
					monitoringInterval = null;
					isMonitoring = false;
					document.getElementById("startTileCounterMonitorBtn").disabled = false;
					document.getElementById("stopTileCounterMonitorBtn").disabled = true;
					updateMetricsDisplay(null);
					addToLog(
						"Monitoring stopped - connection lost. Please reload the Vine page and try again.",
						"error"
					);
				}
			}, 2000); // Update every 2 seconds (less frequent to reduce errors)
		} else {
			const errorMsg = result?.error || "Unknown error";
			if (errorMsg.includes("not initialized") || errorMsg.includes("not available")) {
				addToLog("TileCounter debugger not initialized!", "error");
				addToLog("Please open or reload the Notification Monitor and try again.", "warning");
				addToLog("The debugger only works in the Notification Monitor tab.", "info");
			} else {
				addToLog(`Failed to start monitoring: ${errorMsg}`, "error");
			}
		}
	});

	// Stop monitoring button
	document.getElementById("stopTileCounterMonitorBtn")?.addEventListener("click", async () => {
		if (!isMonitoring) {
			addToLog("Not currently monitoring", "warning");
			return;
		}

		addToLog("Stopping TileCounter monitoring...");

		// Stop polling first
		if (monitoringInterval) {
			clearInterval(monitoringInterval);
			monitoringInterval = null;
		}

		const result = await sendTileCounterCommand("stopMonitoring");

		// Update UI regardless of result (connection might be lost)
		isMonitoring = false;
		document.getElementById("startTileCounterMonitorBtn").disabled = false;
		document.getElementById("stopTileCounterMonitorBtn").disabled = true;
		updateMetricsDisplay(null);

		if (result && result.success) {
			addToLog("Monitoring stopped", "success");
		} else if (!result) {
			addToLog("Monitoring stopped (connection was lost)", "warning");
		} else {
			addToLog(`Monitoring stopped with error: ${result?.error || "Unknown error"}`, "warning");
		}
	});

	// Generate report button
	document.getElementById("generateTileCounterReportBtn")?.addEventListener("click", async () => {
		addToLog("Generating TileCounter performance report...");

		const result = await sendTileCounterCommand("generateReport");
		if (result && result.success) {
			const report = result.data;
			addToLog("Performance report generated:", "success");

			// Log report details
			addToLog(`Total observations: ${report.summary.totalObservationTime}ms`);
			addToLog(`DOM mutations: ${report.summary.domMutations}`);
			addToLog(`Count updates: ${report.summary.countUpdates}`);

			if (report.debounceAnalysis) {
				addToLog(`Debounce pattern: ${report.debounceAnalysis.pattern}`);
				addToLog(`Average delay: ${report.debounceAnalysis.averageDelay.toFixed(2)}ms`);
			}

			// Log recommendations
			if (report.recommendations && report.recommendations.length > 0) {
				addToLog("Optimizations detected:");
				report.recommendations.forEach((rec) => {
					addToLog(`  ${rec}`, "success");
				});
			}
		} else {
			addToLog(`Failed to generate report: ${result?.error || "Unknown error"}`, "error");
		}
	});

	// Clear data button
	document.getElementById("clearTileCounterDataBtn")?.addEventListener("click", async () => {
		addToLog("Clearing TileCounter performance data...");

		const result = await sendTileCounterCommand("clearData");
		if (result && result.success) {
			addToLog("Performance data cleared", "success");
			updateMetricsDisplay(null);
		} else {
			addToLog(`Failed to clear data: ${result?.error || "Unknown error"}`, "error");
		}
	});
}

function getAppVersion() {
	const manifest = chrome.runtime.getManifest();
	return manifest.version;
}

//Tab management
function initTabs() {
	//Bind the click event for the tabs
	document.querySelectorAll("#tabs-index > ul li").forEach(function (item) {
		item.onclick = function (event) {
			const currentTab = this.querySelector("a").href.split("#").pop();
			selectTab(currentTab);
			this.classList.add("active");
			return false;
		};
	});
	//Set the first tab as active
	document.querySelector("#tabs-index > ul li:first-child").click();
}

function selectTab(tab) {
	//Hide all tabs
	document.querySelectorAll("#tabs-content .tab").forEach(function (item) {
		item.style.display = "none";
	});

	document.querySelectorAll("#tabs-index > ul li").forEach(function (item) {
		item.classList.remove("active");
	});

	//Display the current tab
	document.querySelector("#" + tab).style.display = "flex";
}
