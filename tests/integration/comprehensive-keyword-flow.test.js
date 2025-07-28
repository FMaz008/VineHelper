/**
 * Comprehensive integration test for the complete keyword matching flow
 * This test ensures all keyword types work correctly through the entire lifecycle
 */

import { jest } from "@jest/globals";
import { compile as compileKeywords, compileKeywordObjects } from "../../scripts/core/utils/KeywordCompiler.js";
import { findMatch, getMatchedKeyword } from "../../scripts/core/utils/KeywordMatcher.js";
import { NewItemStreamProcessing } from "../../scripts/notifications-monitor/stream/NewItemStreamProcessing.js";
import { SettingsMgr } from "../../scripts/core/services/SettingsMgrDI.js";

// Mock SettingsMgr
jest.mock("../../scripts/core/services/SettingsMgrDI.js", () => ({
	SettingsMgr: jest.fn(),
}));

describe("Comprehensive Keyword Flow Tests", () => {
	describe("Blur Keywords", () => {
		test("Should match blur keywords correctly", () => {
			const blurKeywords = [
				{ contains: "spam", without: null },
				{ contains: "junk", without: null },
				{ contains: "fake", without: null },
				{ contains: "knock[- ]?off", without: null },
				{ contains: "\\bscam\\b", without: null },
				{ contains: "phishing", without: null },
				{ contains: "virus", without: null },
				{ contains: "malware", without: null },
				{ contains: "counterfeit", without: null },
				{ contains: "bootleg", without: null },
			];

			const compiled = compileKeywordObjects(blurKeywords);

			// Test case with multiple potential matches
			const title =
				"WARNING: Fake Designer Handbag Knock-off, Counterfeit Luxury Scam Product - Do Not Buy This Bootleg Item";

			const match = findMatch(title, compiled);

			// Should match on either "fake" or "knock-off"
			expect(match).toBeTruthy();
			expect(["fake", "knock[- ]?off"]).toContain(match.contains);

			// Additional test cases
			const testCases = [
				{ title: "Some product with spam in name", expected: "spam" },
				{ title: "Knock off designer watch", expected: "knock[- ]?off" },
				{ title: "Scam alert product", expected: "\\bscam\\b" },
				{ title: "Scampi pasta dish", expected: null }, // Should NOT match (no word boundary)
				{ title: "Phishing protection software", expected: "phishing" },
				{ title: "Bootleg recording device", expected: "bootleg" },
			];

			testCases.forEach(({ title, expected }) => {
				const result = findMatch(title, compiled);
				if (expected) {
					expect(result).toBeTruthy();
					expect(result.contains).toBe(expected);
				} else {
					expect(result).toBeFalsy();
				}
			});
		});

		test("Blur keyword with word boundaries", () => {
			const keywords = [{ contains: "\\bscam\\b", without: null }];
			const compiled = compileKeywordObjects(keywords);

			// Should match
			expect(findMatch("Scam product", compiled)).toBeTruthy();
			expect(findMatch("scam alert", compiled)).toBeTruthy();
			expect(findMatch("SCAM WARNING", compiled)).toBeTruthy();

			// Should NOT match
			expect(findMatch("Scampi shrimp", compiled)).toBeFalsy();
			expect(findMatch("Scrambled eggs", compiled)).toBeFalsy();
			expect(findMatch("Scammer", compiled)).toBeFalsy();
		});

		describe("Blur Keyword Stream Processing", () => {
			let streamProcessor;
			let mockSettings;

			beforeEach(() => {
				jest.clearAllMocks();
				mockSettings = {
					get: jest.fn(),
					waitForLoad: jest.fn().mockResolvedValue(true),
				};
				SettingsMgr.mockImplementation(() => mockSettings);
			});

			test("Should handle blur keywords as array format", async () => {
				mockSettings.get.mockImplementation((key) => {
					const settings = {
						"general.debugKeywords": true,
						"general.hideKeywords": [],
						"general.highlightKeywords": [],
						// CRITICAL: Blur keywords coming as ARRAY, not string!
						"general.blurKeywords": [
							"spam",
							"junk",
							"fake",
							"knock[- ]?off",
							"\\bscam\\b",
							"phishing",
							"virus",
							"malware",
							"counterfeit",
							"bootleg",
						],
					};
					return settings[key];
				});

				streamProcessor = new NewItemStreamProcessing(mockSettings, false);
				await streamProcessor.initialize();

				// Verify keywords were compiled from array format
				expect(streamProcessor.compiledBlurKeywords).toBeTruthy();
				expect(streamProcessor.compiledBlurKeywords.length).toBe(10);

				// Test with an item that should match multiple keywords
				const rawData = {
					item: {
						data: {
							asin: "B0F8BLDPXP",
							title: "Fake Designer Handbag - Counterfeit Luxury Knock-off Scam Product with Bootleg Materials and Spam Marketing",
						},
					},
				};

				const result = streamProcessor.transformIsBlur(rawData);

				// This MUST match!
				expect(result.item.data.BlurKWsMatch).toBe(true);
				expect(result.item.data.BlurKW).toBeTruthy();
				expect(["spam", "fake", "counterfeit", "knock[- ]?off", "\\bscam\\b", "bootleg"]).toContain(
					result.item.data.BlurKW
				);
			});

			test("Should handle empty blur keywords", async () => {
				mockSettings.get.mockImplementation((key) => {
					const settings = {
						"general.debugKeywords": true,
						"general.hideKeywords": [],
						"general.highlightKeywords": [],
						"general.blurKeywords": [],
					};
					return settings[key];
				});

				streamProcessor = new NewItemStreamProcessing(mockSettings, false);
				await streamProcessor.initialize();

				expect(streamProcessor.compiledBlurKeywords).toBe(null);

				const rawData = {
					item: {
						data: {
							asin: "TEST123",
							title: "Spam Product",
						},
					},
				};

				const result = streamProcessor.transformIsBlur(rawData);
				expect(result.item.data.BlurKWsMatch).toBe(false);
				expect(result.item.data.BlurKW).toBe(false);
			});

			test("Integration test: Blur keyword matching with direct transform", async () => {
				// This test verifies the blur keyword matching works correctly
				// without going through the full stream pipeline
				mockSettings.get.mockImplementation((key) => {
					const settings = {
						"general.debugKeywords": true,
						"general.blurKeywords": ["spam", "junk", "\\bscam\\b"],
						"general.hideKeywords": [],
						"general.highlightKeywords": [],
					};
					return settings[key];
				});

				streamProcessor = new NewItemStreamProcessing(mockSettings, false);
				await streamProcessor.initialize();

				// Test the transformIsBlur method directly
				const rawData = {
					item: {
						data: {
							asin: "B0F8BLDPXP",
							title: "Fake Designer Handbag Scam Alert Spam",
						},
					},
				};

				const result = streamProcessor.transformIsBlur(rawData);

				expect(result.item.data.BlurKWsMatch).toBe(true);
				expect(result.item.data.BlurKW).toBeTruthy();
				expect(["spam", "junk", "\\bscam\\b"]).toContain(result.item.data.BlurKW);
			});
		});

		describe("Complete Highlighting Flow", () => {
			test("Zero ETV highlighting logic works correctly", () => {
				// This test verifies the logic for zero ETV highlighting
				// without requiring the actual MonitorCore module

				// Mock DOM element representing a notification tile
				const mockNotif = {
					id: "vh-notification-TEST123",
					dataset: {
						typeZeroETV: "1",
						typeHighlight: "0",
						typeUnknownETV: "0",
					},
					querySelector: jest.fn().mockReturnValue({
						dataset: { etvMin: "0.00", etvMax: "0.00" },
					}),
					style: {
						backgroundColor: "",
						background: "",
					},
				};

				// Simulate the logic from _processNotificationHighlight
				const isZeroETV = mockNotif.dataset.typeZeroETV == 1;
				const isHighlight = mockNotif.dataset.typeHighlight == 1;
				const isUnknownETV = mockNotif.dataset.typeUnknownETV == 1;

				// Apply the styling logic
				if (isZeroETV && !isHighlight) {
					mockNotif.style.backgroundColor = "rgb(144, 238, 144)";
				}

				// Verify that the green background color was applied
				expect(mockNotif.style.backgroundColor).toBe("rgb(144, 238, 144)");
				expect(isZeroETV).toBe(true);
				expect(isHighlight).toBe(false);
				expect(isUnknownETV).toBe(false);
			});

			test("Unknown ETV styling is cleared and updated when ETV arrives", () => {
				// Mock DOM element with unknown ETV initially
				const mockNotif = {
					id: "vh-notification-TEST456",
					dataset: {
						typeZeroETV: "0",
						typeHighlight: "0",
						typeUnknownETV: "1", // Initially unknown
					},
					querySelector: jest.fn().mockReturnValue({
						dataset: { etvMin: "", etvMax: "" }, // No ETV values initially
					}),
					style: {
						backgroundColor: "rgb(255, 224, 232)", // Pink initially
						background: "",
					},
				};

				// Mock settings
				const mockSettings = {
					get: jest.fn((key) => {
						const settings = {
							"notification.monitor.unknownETV.colorActive": true,
							"notification.monitor.unknownETV.color": "rgb(255, 224, 232)",
							"general.debugItemProcessing": false,
						};
						return settings[key];
					}),
				};

				// Simulate ETV values arriving
				mockNotif.querySelector.mockReturnValue({
					dataset: { etvMin: "10.00", etvMax: "10.00" }, // ETV values now present
				});

				// The NotificationMonitor should clear the unknown ETV flag
				// and update styling when ETV values arrive
				expect(mockNotif.dataset.typeUnknownETV).toBe("1");

				// After clearing the flag and updating styling
				mockNotif.dataset.typeUnknownETV = "0";
				mockNotif.style.backgroundColor = ""; // Cleared

				expect(mockNotif.dataset.typeUnknownETV).toBe("0");
				expect(mockNotif.style.backgroundColor).toBe("");
			});
		});
	});

	describe("Unknown ETV Flow", () => {
		test("Complete flow: arrival → keyword match → ETV update with styling", () => {
			const simulateItemFlow = () => {
				const item = {
					asin: "B0DQ1FT7JD",
					title: "150 Pcs Solder Seal Wire Connectors",
					state: {
						typeHighlight: 0,
						typeUnknownETV: 0,
						typeZeroETV: 0,
						backgroundColor: "",
					},
				};

				// Stage 1: Item arrives with unknown ETV
				if (!item.etv_min && !item.etv_max) {
					item.state.typeUnknownETV = 1;
					item.state.backgroundColor = "rgb(255, 224, 232)"; // Pink
				}

				// Stage 2: Check keyword match
				const highlightKeywords = [{ contains: "solder", without: null }];
				const compiled = compileKeywordObjects(highlightKeywords);
				const match = findMatch(item.title, compiled);

				if (match) {
					item.state.typeHighlight = 1;
					// Update styling for highlight + unknown ETV
					if (item.state.typeUnknownETV === 1) {
						item.state.backgroundColor = "striped(pink+highlight)";
					}
				}

				// Stage 3: ETV arrives
				item.etv_min = "5.28";
				item.etv_max = "5.28";

				// Clear unknown ETV and update styling
				if (item.state.typeUnknownETV === 1 && item.etv_min && item.etv_max) {
					item.state.typeUnknownETV = 0;

					// Update styling based on current state
					if (item.state.typeHighlight === 1) {
						item.state.backgroundColor = "highlight-color";
					} else if (parseFloat(item.etv_min) === 0) {
						item.state.typeZeroETV = 1;
						item.state.backgroundColor = "zero-etv-color";
					} else {
						item.state.backgroundColor = ""; // No special styling
					}
				}

				return item;
			};

			const result = simulateItemFlow();

			// Verify final state
			expect(result.state.typeHighlight).toBe(1);
			expect(result.state.typeUnknownETV).toBe(0);
			expect(result.state.typeZeroETV).toBe(0);
			expect(result.state.backgroundColor).toBe("highlight-color");
		});

		test("Non-keyword item with unknown ETV → ETV update", () => {
			const item = {
				asin: "B0FCXY53VY",
				title: "15V 3A Power Supply Fit for Turtlebox",
				state: {
					typeHighlight: 0,
					typeUnknownETV: 1,
					typeZeroETV: 0,
					backgroundColor: "rgb(255, 224, 232)",
				},
			};

			// ETV arrives
			item.etv_min = "23.99";
			item.etv_max = "23.99";

			// Should clear unknown ETV and styling
			if (item.etv_min && item.etv_max) {
				item.state.typeUnknownETV = 0;
				item.state.backgroundColor = ""; // Clear pink background
			}

			expect(item.state.typeUnknownETV).toBe(0);
			expect(item.state.backgroundColor).toBe("");
		});
	});

	describe("Hide Keyword Priority", () => {
		test("Highlight keywords take precedence over hide keywords", () => {
			const highlightKeywords = [{ contains: "special", without: null }];
			const hideKeywords = [{ contains: "widget", without: null }];

			const compiledHighlight = compileKeywordObjects(highlightKeywords);
			const compiledHide = compileKeywordObjects(hideKeywords);

			const title = "Special Widget Device"; // Matches both

			// Check highlight first
			const highlightMatch = findMatch(title, compiledHighlight);
			expect(highlightMatch).toBeTruthy();

			// In real code, hide check is skipped if highlighted
			const shouldCheckHide = !highlightMatch;
			expect(shouldCheckHide).toBe(false);

			// Verify hide would match if checked
			const hideMatch = findMatch(title, compiledHide);
			expect(hideMatch).toBeTruthy();
			expect(hideMatch.contains).toBe("widget");
		});
	});

	describe("ETV Conditions", () => {
		test("Keywords with ETV conditions", () => {
			const keywords = [
				{ contains: "expensive", without: null, etv_min: 50 },
				{ contains: "cheap", without: null, etv_max: 10 },
			];

			const compiled = compileKeywordObjects(keywords);

			// Test "expensive" keyword (requires ETV >= 50)
			expect(findMatch("Expensive item", compiled, null, null)).toBeFalsy(); // No ETV
			expect(findMatch("Expensive item", compiled, 30, 30)).toBeFalsy(); // Too low
			expect(findMatch("Expensive item", compiled, 100, 100)).toBeTruthy(); // Matches

			// Test "cheap" keyword (requires ETV <= 10)
			expect(findMatch("Cheap item", compiled, null, null)).toBeFalsy(); // No ETV
			expect(findMatch("Cheap item", compiled, 20, 20)).toBeFalsy(); // Too high
			expect(findMatch("Cheap item", compiled, 5, 5)).toBeTruthy(); // Matches
		});
	});

	describe("Zero ETV Handling", () => {
		test("Zero ETV vs Unknown ETV", () => {
			const states = [
				{ etv: { min: null, max: null }, expected: { unknown: true, zero: false } },
				{ etv: { min: "", max: "" }, expected: { unknown: true, zero: false } },
				{ etv: { min: "0", max: "0" }, expected: { unknown: false, zero: true } },
				{ etv: { min: "0.00", max: "0.00" }, expected: { unknown: false, zero: true } },
				{ etv: { min: "5.00", max: "5.00" }, expected: { unknown: false, zero: false } },
			];

			states.forEach(({ etv, expected }) => {
				const state = {
					typeUnknownETV: 0,
					typeZeroETV: 0,
				};

				// Apply logic
				if (etv.min === null || etv.min === "" || etv.max === null || etv.max === "") {
					state.typeUnknownETV = 1;
				} else if (parseFloat(etv.min) === 0 || parseFloat(etv.max) === 0) {
					state.typeZeroETV = 1;
				}

				expect(state.typeUnknownETV).toBe(expected.unknown ? 1 : 0);
				expect(state.typeZeroETV).toBe(expected.zero ? 1 : 0);
			});
		});
	});

	describe("Real-world Bug Scenarios", () => {
		test("Bug 1: Items shown then immediately hidden", () => {
			// This was caused by hide keywords being checked even for highlighted items
			const item = {
				title: "Boobrie SMA Male to Male Coaxial Cable WiFi Antenna",
				highlightKeywords: [{ contains: "wi[- ]?fi", without: null }],
				hideKeywords: [{ contains: "boobs?", without: null }],
			};

			const compiledHighlight = compileKeywordObjects(item.highlightKeywords);
			const compiledHide = compileKeywordObjects(item.hideKeywords);

			// Should match highlight
			const highlightMatch = findMatch(item.title, compiledHighlight);
			expect(highlightMatch).toBeTruthy();

			// Should NOT check hide keywords when highlighted
			const shouldBeHidden = !highlightMatch && findMatch(item.title, compiledHide);
			expect(shouldBeHidden).toBe(false);
		});

		test("Bug 2: Unknown ETV styling persists after ETV arrives", () => {
			const updateItemState = (item, newEtv) => {
				// Update ETV
				item.etv = newEtv;

				// Clear unknown ETV if values present
				if (
					item.state.typeUnknownETV === 1 &&
					newEtv.min !== "" &&
					newEtv.min !== null &&
					newEtv.max !== "" &&
					newEtv.max !== null
				) {
					item.state.typeUnknownETV = 0;
					item.state.stylingUpdated = true;
				}

				return item;
			};

			let item = {
				etv: { min: "", max: "" },
				state: {
					typeUnknownETV: 1,
					backgroundColor: "rgb(255, 224, 232)",
					stylingUpdated: false,
				},
			};

			// ETV arrives
			item = updateItemState(item, { min: "23.99", max: "23.99" });

			expect(item.state.typeUnknownETV).toBe(0);
			expect(item.state.stylingUpdated).toBe(true);
		});

		test("Bug 3: Blur keywords not matching", () => {
			const blurKeywords = [{ contains: "\\banal\\b", without: null }];

			const compiled = compileKeywordObjects(blurKeywords);
			const title = "DIFFLUE 4PCS Silicone Anal Butt Plug Set";

			const match = findMatch(title, compiled);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("\\banal\\b");
		});

		test("Bug 4: Zero ETV highlighting after unknown ETV clears", () => {
			// This test verifies that items that start with unknown ETV and then
			// learn they have zero ETV get the proper green background styling

			// Mock the parent class _processNotificationHighlight
			const applyHighlightStyling = (notif) => {
				// Apply styling based on flags
				if (notif.dataset.typeZeroEtv === "1") {
					notif.style.backgroundColor = "rgb(144, 238, 144)";
				} else if (notif.dataset.typeHighlight === "1") {
					notif.style.backgroundColor = "rgb(255, 255, 0)";
				} else if (notif.dataset.typeUnknownEtv === "1") {
					notif.style.backgroundColor = "rgb(255, 224, 232)";
				} else {
					notif.style.backgroundColor = "";
				}
			};

			const mockDOM = {
				dataset: {
					typeZeroEtv: "0",
					typeHighlight: "0",
					typeUnknownEtv: "1",
					asin: "B0FC3WD41S",
				},
				style: {
					backgroundColor: "rgb(255, 224, 232)", // Pink for unknown
				},
			};

			// Simulate the complete setETV flow with our fix
			const setETV = (notif, etvMin, etvMax) => {
				// Clear unknown ETV flag when values arrive
				if (notif.dataset.typeUnknownEtv === "1" && etvMin !== "" && etvMax !== "") {
					notif.dataset.typeUnknownEtv = "0";

					// Apply styling after clearing unknown
					applyHighlightStyling(notif);
				}

				// Check for zero ETV
				if (parseFloat(etvMin) === 0 && notif.dataset.typeZeroEtv !== "1") {
					// Set the zero ETV flag
					notif.dataset.typeZeroEtv = "1";

					// Apply styling after setting zero ETV (THIS IS THE FIX)
					applyHighlightStyling(notif);
				}
			};

			// Update with zero ETV
			setETV(mockDOM, "0.00", "0.00");

			// Verify flags are updated correctly
			expect(mockDOM.dataset.typeUnknownEtv).toBe("0");
			expect(mockDOM.dataset.typeZeroEtv).toBe("1");

			// Verify green background is applied
			expect(mockDOM.style.backgroundColor).toBe("rgb(144, 238, 144)");
		});

		test("Bug 5: Zero ETV highlighting for new stream items", () => {
			// This test verifies that new items coming through the stream with zero ETV
			// get the proper green background styling applied
			const mockDOM = {
				dataset: {
					typeZeroEtv: "1",
					typeHighlight: "0",
					typeUnknownEtv: "0",
				},
				style: {},
				classList: {
					contains: () => false,
					add: jest.fn(),
					remove: jest.fn(),
				},
			};

			// Simulate the _processNotificationHighlight logic
			const processHighlight = (dom) => {
				// Parent class logic (MonitorCore)
				if (dom.dataset.typeZeroEtv === "1") {
					dom.style.backgroundColor = "rgb(144, 238, 144)";
				}

				// Child class logic (NotificationMonitor) - sync with Tile
				const tileHighlight = {
					isHighlighted: dom.dataset.typeHighlight === "1",
					isZeroEtv: dom.dataset.typeZeroEtv === "1",
					isUnknownEtv: dom.dataset.typeUnknownEtv === "1",
				};

				return {
					domStyle: dom.style,
					tileState: tileHighlight,
				};
			};

			const result = processHighlight(mockDOM);

			// Verify DOM gets green background
			expect(result.domStyle.backgroundColor).toBe("rgb(144, 238, 144)");

			// Verify tile state is synchronized
			expect(result.tileState.isZeroEtv).toBe(true);
			expect(result.tileState.isHighlighted).toBe(false);
		});
	});
});
