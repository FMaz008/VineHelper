import { jest } from "@jest/globals";
import { SettingsMgrDI } from "../scripts/core/services/SettingsMgrDI.js";
import { keywordMatch, keywordMatcher, clearKeywordCache } from "../scripts/core/utils/KeywordMatch.js";
import { sharedKeywordMatcher } from "../scripts/core/utils/SharedKeywordMatcher.js";

describe("Keyword Matching End-to-End Tests", () => {
	let mockStorage;
	let settingsMgr;

	beforeEach(async () => {
		// Clear any caches
		clearKeywordCache();

		// Create mock storage with realistic keyword data
		mockStorage = {
			data: {
				settings: {
					general: {
						highlightKeywords: [
							{ contains: "poe", etv_min: null, etv_max: null },
							{ contains: "ethernet|rj45", etv_min: null, etv_max: null },
							{ contains: "EPLZON|Weewooday|ELEGOO", etv_min: null, etv_max: null },
							{ contains: "battery", without: "charger", etv_min: null, etv_max: null },
						],
						// Pre-compiled keywords that might be out of order
						highlightKeywords_compiled: [
							{
								pattern: "\\bbattery\\b",
								flags: "iu",
								withoutPattern: "\\bcharger\\b",
								withoutFlags: "iu",
								hasEtvCondition: false,
								originalIndex: 3,
							},
							{
								pattern: "\\bEPLZON|Weewooday|ELEGOO\\b",
								flags: "iu",
								withoutPattern: null,
								hasEtvCondition: false,
								originalIndex: 2,
							},
							{
								pattern: "\\bethernet|rj45\\b",
								flags: "iu",
								withoutPattern: null,
								hasEtvCondition: false,
								originalIndex: 1,
							},
							{
								pattern: "\\bpoe\\b",
								flags: "iu",
								withoutPattern: null,
								hasEtvCondition: false,
								originalIndex: 0,
							},
						],
						debugKeywords: true,
						version: "3.6.0", // Add version to skip migrations
					},
					unavailableTab: {},
					hiddenTab: {},
					pinnedTab: {},
					notification: {
						monitor: {},
					},
				},
			},
			get: jest.fn(async (keys) => {
				if (typeof keys === "string") {
					// Return the whole settings object when "settings" is requested
					if (keys === "settings") {
						return mockStorage.data.settings;
					}
					const path = keys.split(".");
					let value = mockStorage.data;
					for (const key of path) {
						value = value?.[key];
					}
					return value;
				}
				return mockStorage.data;
			}),
			set: jest.fn(async (items) => {
				Object.assign(mockStorage.data, items);
			}),
			clear: jest.fn(async () => {
				mockStorage.data = {};
			}),
		};

		// Initialize settings manager
		settingsMgr = new SettingsMgrDI(mockStorage);
		// Wait for initialization to complete
		await settingsMgr.waitForLoad();

		// Set the settings manager on the keyword matcher
		keywordMatcher.setSettingsManager(settingsMgr);
	});

	describe("Full Flow: Settings → Parsing → Compiling → Matching", () => {
		test("should correctly match keywords from settings with pre-compiled patterns", async () => {
			const itemTitle =
				"Rliwov MFi Certified Ethernet Adapter Compatible with Lightning to RJ45 Ethernet LAN Network Adapter for i-Phone14/ 13/12/11/i-Pad/i-Pod, Plug and Play, Supports 100Mbps (Non-PoE) (7.8 IN, Grey)";

			console.log("\n=== Testing Full Keyword Matching Flow ===");
			console.log("Item title:", itemTitle);

			// Get keywords from settings
			const keywords = await settingsMgr.get("general.highlightKeywords");
			console.log("\nKeywords from settings:", keywords.length);
			keywords.forEach((kw, i) => {
				console.log(`  ${i}: "${kw.contains}"${kw.without ? ` (without: "${kw.without}")` : ""}`);
			});

			// Get pre-compiled patterns
			const compiledPatterns = await settingsMgr.getCompiledKeywords("general.highlightKeywords");
			console.log("\nPre-compiled patterns:", compiledPatterns.length);
			compiledPatterns.forEach((p, i) => {
				console.log(`  ${i}: originalIndex=${p.originalIndex}, pattern="${p.regex}"`);
			});

			// Test matching with settings manager (uses pre-compiled)
			console.log("\n=== Testing with pre-compiled patterns ===");
			const match = await keywordMatch(keywords, itemTitle, null, null, settingsMgr);

			if (match) {
				const matchStr = typeof match === "object" ? match.contains : match;
				console.log(`Match found: "${matchStr}"`);

				// Verify this is the correct match
				const expectedMatches = ["poe", "ethernet|rj45"];
				const isExpected = expectedMatches.some((expected) => matchStr.toLowerCase().includes(expected));
				console.log(`Is expected match: ${isExpected}`);

				expect(isExpected).toBe(true);
			} else {
				console.log("No match found");
				expect(match).toBeTruthy(); // Should have found a match
			}
		});

		test("should NOT match incorrect keywords", async () => {
			const itemTitle =
				"Rliwov MFi Certified Ethernet Adapter Compatible with Lightning to RJ45 Ethernet LAN Network Adapter for i-Phone14/ 13/12/11/i-Pad/i-Pod, Plug and Play, Supports 100Mbps (Non-PoE) (7.8 IN, Grey)";

			// Test that EPLZON|Weewooday|ELEGOO does not match
			const eplzonKeyword = { contains: "EPLZON|Weewooday|ELEGOO" };
			const eplzonMatch = await keywordMatch([eplzonKeyword], itemTitle);

			console.log(`\nEPLZON|Weewooday|ELEGOO matches: ${eplzonMatch ? "YES" : "NO"}`);
			expect(eplzonMatch).toBeFalsy();
		});

		test("should handle keyword order correctly with originalIndex", async () => {
			const itemTitle = "This item contains EPLZON brand";

			// Match using full keyword array
			const keywords = await settingsMgr.get("general.highlightKeywords");
			const match = await keywordMatch(keywords, itemTitle, null, null, settingsMgr);

			if (match) {
				const matchStr = typeof match === "object" ? match.contains : match;
				console.log(`\nMatched: "${matchStr}"`);

				// Find the index in the original array
				const originalIndex = keywords.findIndex(
					(kw) => (typeof kw === "object" ? kw.contains : kw) === matchStr
				);
				console.log(`Original index: ${originalIndex}`);

				// Should be index 2 (EPLZON|Weewooday|ELEGOO)
				expect(originalIndex).toBe(2);
				expect(matchStr).toBe("EPLZON|Weewooday|ELEGOO");
			} else {
				expect(match).toBeTruthy(); // Should have found a match
			}
		});

		test("should match multiple items correctly", async () => {
			const items = [
				{
					title: "Rliwov MFi Certified Ethernet Adapter Compatible with Lightning to RJ45",
					expectedMatch: "ethernet|rj45",
				},
				{
					title: "EPLZON USB-C Hub with HDMI",
					expectedMatch: "EPLZON|Weewooday|ELEGOO",
				},
				{
					title: "Portable Battery Pack 10000mAh",
					expectedMatch: "battery",
				},
				{
					title: "Battery Charger for AA/AAA",
					expectedMatch: null, // Should not match due to "without: charger"
				},
			];

			console.log("\n=== Testing multiple items ===");
			const keywords = await settingsMgr.get("general.highlightKeywords");

			for (const item of items) {
				const match = await keywordMatch(keywords, item.title, null, null, settingsMgr);
				const matchStr = match ? (typeof match === "object" ? match.contains : match) : null;

				console.log(`\nItem: "${item.title}"`);
				console.log(`Expected: ${item.expectedMatch || "no match"}`);
				console.log(`Actual: ${matchStr || "no match"}`);

				if (item.expectedMatch) {
					expect(matchStr?.toLowerCase()).toContain(item.expectedMatch.toLowerCase());
				} else {
					expect(match).toBeFalsy();
				}
			}
		});

		test("should work with SharedKeywordMatcher wrapper", async () => {
			const itemTitle = "Rliwov MFi Certified Ethernet Adapter Compatible with Lightning to RJ45";

			// Set settings manager on shared matcher
			sharedKeywordMatcher.settingsMgr = settingsMgr;

			const keywords = await settingsMgr.get("general.highlightKeywords");
			const match = sharedKeywordMatcher.match(keywords, itemTitle, null, null, "highlight", settingsMgr);

			console.log("\n=== Testing with SharedKeywordMatcher ===");
			if (match) {
				const matchStr = typeof match === "object" ? match.contains : match;
				console.log(`Match found: "${matchStr}"`);
				expect(matchStr.toLowerCase()).toContain("ethernet");
			} else {
				expect(match).toBeTruthy(); // Should have found a match
			}
		});
	});

	describe("Edge Cases and Error Conditions", () => {
		test("should handle missing originalIndex gracefully", async () => {
			// Modify compiled patterns to remove originalIndex
			mockStorage.data.settings.general.highlightKeywords_compiled = [
				{
					pattern: "\\bpoe\\b",
					flags: "iu",
					withoutPattern: null,
					hasEtvCondition: false,
					// No originalIndex
				},
			];

			const itemTitle = "PoE Ethernet Adapter";
			const keywords = await settingsMgr.get("general.highlightKeywords");
			const match = await keywordMatch(keywords, itemTitle, null, null, settingsMgr);

			// Should still work, falling back to array index
			expect(match).toBeTruthy();
		});

		test("should handle case sensitivity correctly", async () => {
			const testCases = [
				{ title: "POE adapter", shouldMatch: true },
				{ title: "poe adapter", shouldMatch: true },
				{ title: "PoE adapter", shouldMatch: true },
				{ title: "ETHERNET cable", shouldMatch: true },
				{ title: "RJ45 connector", shouldMatch: true },
			];

			const keywords = await settingsMgr.get("general.highlightKeywords");

			for (const testCase of testCases) {
				const match = await keywordMatch(keywords, testCase.title, null, null, settingsMgr);
				console.log(`"${testCase.title}" matches: ${match ? "YES" : "NO"}`);

				if (testCase.shouldMatch) {
					expect(match).toBeTruthy();
				} else {
					expect(match).toBeFalsy();
				}
			}
		});
	});
});
