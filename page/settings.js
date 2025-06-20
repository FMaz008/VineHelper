// Load Apple SDK for Safari (moved from inline script to avoid CSP issues)
if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
	const script = document.createElement("script");
	script.type = "text/javascript";
	script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
	script.onerror = function () {
		console.warn("Apple Sign-In SDK failed to load. Receipt validation is still available.");
	};
	document.head.appendChild(script);
}

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

//Init the AppleAuth
function initAppleAuth(event) {
	event.preventDefault();

	// Check if AppleID is available (only in Safari with proper CSP)
	if (typeof AppleID !== "undefined" && AppleID.auth) {
		try {
			AppleID.auth.init({
				clientId: "com.FrancoisMazerolle.VineHelper",
				scope: "email name",
				redirectURI: "https://api.vinehelper.ovh/apple-login",
				state: `origin:web,uuid:${Settings.get("general.uuid", false)}`,
			});

			AppleID.auth.signIn();
		} catch (error) {
			console.error("Apple Sign-In error:", error);
			showAppleAuthFallback();
		}
	} else {
		showAppleAuthFallback();
	}
}

function showAppleAuthFallback() {
	// More user-friendly message for non-Safari browsers
	const isSafari = navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome");
	const message = isSafari
		? "Apple Sign-In is temporarily unavailable. Please use the receipt validation method below."
		: "Apple Sign-In is only available in Safari. Please use the receipt validation method below.";

	alert(message);
	// Focus on the receipt textarea
	document.getElementById("receiptData")?.focus();
}

async function validateReceipt() {
	const receiptData = document.getElementById("receiptData").value;
	const uuid = await Settings.get("general.uuid", false);

	const response = await fetch("/api/apple/validate-receipt", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ uuid, receiptData }),
	});

	const result = await response.json();
	if (result.success) {
		alert(`✅ Subscription linked: ${result.subscription.tier_name}`);
	}
}

//Render the main layout
(async () => {
	const promMainTpl = await Tpl.loadFile("/page/settings_main.tpl.html");
	const promTab1 = await Tpl.loadFile("/page/settings_general.tpl.html");
	const promTab2 = await Tpl.loadFile("/page/settings_notifications.tpl.html");
	const promTab3 = await Tpl.loadFile("/page/settings_system.tpl.html");
	const promTab4 = await Tpl.loadFile("/page/settings_brenda.tpl.html");
	const promTab5 = await Tpl.loadFile("/page/settings_keywords.tpl.html");
	const promTab6 = await Tpl.loadFile("/page/settings_keybindings.tpl.html");
	const promTab7 = await Tpl.loadFile("/page/settings_styles.tpl.html");
	const promTab8 = await Tpl.loadFile("/page/settings_premium.tpl.html");
	Tpl.setIf("isSafari", env.isSafari());
	const promTab9 = await Tpl.loadFile("/page/settings_about.tpl.html");

	// Clear any existing template variables before setting new ones
	Tpl.clearVariables();

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

	let domainTLD = "";
	const countryCode = Settings.get("general.country");
	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
		domainTLD = i13n.getDomainTLD();
	}
	Tpl.setIf("country_known", countryCode != null);
	if (Settings.get("notification.monitor.blockNonEssentialListeners")) {
		Tpl.setVar("monitor_link", "https://www.amazon." + domainTLD + "/vine/vine-items?queue=encore#monitor");
	} else {
		Tpl.setVar(
			"monitor_link",
			"https://www.amazon." + domainTLD + "/vine/vine-items?queue=encore#monitorLoadAllListeners"
		);
	}

	Tpl.setVar("light_monitor_link", chrome.runtime.getURL("page/notification_monitor_light.html"));
	Tpl.setVar("item_explorer_link", chrome.runtime.getURL("page/item_explorer.html"));
	Tpl.setIf("tier_3", Settings.isPremiumUser(3));

	document.body.innerHTML = Tpl.render(promMainTpl);

	if (countryCode != null) {
		initTabs();
		initiateSettings(); //page/settings_loadsave.js, initialize the loading and saving code for the page
		initMemoryDebugging(); // Initialize memory debugging controls
	}

	if (env.isSafari()) {
		//Bind the initAppleAuth function to the AppleLogin button
		document.getElementById("AppleLogin").addEventListener("click", initAppleAuth);
		//Bind the validateReceipt function to the validateReceipt button
		document.getElementById("validateReceipt").addEventListener("click", validateReceipt);
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
