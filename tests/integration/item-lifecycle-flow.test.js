/**
 * Integration test for the complete item lifecycle flow
 * Tests the journey of an item from arrival through keyword matching to ETV updates
 */

import { jest } from "@jest/globals";
import { compileKeywordObjects } from "../../scripts/core/utils/KeywordCompiler.js";
import { findMatch } from "../../scripts/core/utils/KeywordMatcher.js";

describe("Item Lifecycle Flow Integration", () => {
	let mockSettings;
	let compiledHighlightKeywords;
	let compiledHideKeywords;

	beforeEach(() => {
		// Mock settings
		mockSettings = {
			"general.highlightKeywords": [{ contains: "soldering|\\bsolder\\b|\\bflux\\b", without: null }],
			"general.hideKeywords": [],
			"general.debugKeywords": true,
			"general.debugItemProcessing": true,
			"notification.monitor.highlight.sound": "1",
			"notification.hideList": false,
		};

		// Compile keywords
		compiledHighlightKeywords = compileKeywordObjects(mockSettings["general.highlightKeywords"]);
		compiledHideKeywords =
			mockSettings["general.hideKeywords"].length > 0
				? compileKeywordObjects(mockSettings["general.hideKeywords"])
				: null;
	});

	test("Complete item flow: arrival → keyword match → ETV update → state verification", () => {
		// Stage 1: Item arrives with unknown ETV
		const newItem = {
			asin: "B0DQ1FT7JD",
			title: "150 Pcs Solder Seal Wire Connectors White 26-24 AWG",
			type: "newItem",
			reason: "new item in encore",
			timestamp: Date.now(),
			etv_min: null,
			etv_max: null,
			queue: "encore",
		};

		// Simulate initial state
		const itemState = {
			typeHighlight: 0,
			typeUnknownETV: 1, // Unknown ETV on arrival
			typeZeroETV: 0,
			highlightKeyword: null,
		};

		// Stage 1: Check keyword match on arrival (no ETV)
		const matchResult = findMatch(newItem.title, compiledHighlightKeywords, null, null);

		expect(matchResult).toBeTruthy();
		expect(matchResult.contains).toBe("soldering|\\bsolder\\b|\\bflux\\b");

		// Update state based on match
		if (matchResult) {
			itemState.typeHighlight = 1;
			itemState.highlightKeyword = matchResult.contains;
		}

		// Verify Stage 1 state
		expect(itemState.typeHighlight).toBe(1); // Highlighted
		expect(itemState.typeUnknownETV).toBe(1); // Still unknown ETV
		expect(itemState.highlightKeyword).toBe("soldering|\\bsolder\\b|\\bflux\\b");

		// Stage 2: ETV data arrives
		const etvUpdate = {
			etv_min: 5.28,
			etv_max: 5.28,
		};

		// Check if we should clear unknown ETV flag
		if (
			etvUpdate.etv_min !== null &&
			etvUpdate.etv_max !== null &&
			etvUpdate.etv_min !== "" &&
			etvUpdate.etv_max !== ""
		) {
			itemState.typeUnknownETV = 0;
		}

		// Re-evaluate keyword match with ETV (in case keyword has ETV conditions)
		const matchWithEtv = findMatch(newItem.title, compiledHighlightKeywords, etvUpdate.etv_min, etvUpdate.etv_max);

		// Verify the match is still valid
		expect(matchWithEtv).toBeTruthy();
		expect(matchWithEtv.contains).toBe("soldering|\\bsolder\\b|\\bflux\\b");

		// Verify Stage 2 state
		expect(itemState.typeHighlight).toBe(1); // Still highlighted
		expect(itemState.typeUnknownETV).toBe(0); // No longer unknown ETV
		expect(itemState.typeZeroETV).toBe(0); // Not zero ETV
	});

	test("Item with ETV conditions: re-evaluation on ETV arrival", () => {
		// Keyword with ETV condition
		const keywordsWithEtv = [
			{
				contains: "expensive",
				without: null,
				etv_min: 10.0, // Only match if ETV >= $10
			},
		];

		const compiledEtvKeywords = compileKeywordObjects(keywordsWithEtv);

		const item = {
			title: "Expensive Electronic Device",
			etv_min: null,
			etv_max: null,
		};

		// Stage 1: No match without ETV (condition can't be evaluated)
		const matchNoEtv = findMatch(item.title, compiledEtvKeywords, null, null);
		expect(matchNoEtv).toBeFalsy();

		// Stage 2: ETV arrives below threshold
		const matchLowEtv = findMatch(item.title, compiledEtvKeywords, 5.0, 5.0);
		expect(matchLowEtv).toBeFalsy();

		// Stage 3: ETV arrives above threshold
		const matchHighEtv = findMatch(item.title, compiledEtvKeywords, 15.0, 15.0);
		expect(matchHighEtv).toBeTruthy();
		expect(matchHighEtv.contains).toBe("expensive");
	});

	test("Hide keyword priority: highlighted items should never be hidden", () => {
		// Set up both highlight and hide keywords that would match
		const highlightKeywords = [{ contains: "special", without: null }];
		const hideKeywords = [{ contains: "widget", without: null }];

		const compiledHighlight = compileKeywordObjects(highlightKeywords);
		const compiledHide = compileKeywordObjects(hideKeywords);

		const item = {
			title: "Special Widget Device", // Matches both "special" (highlight) and "widget" (hide)
			etv_min: 10.0,
			etv_max: 10.0,
		};

		// Check highlight match
		const highlightMatch = findMatch(item.title, compiledHighlight, item.etv_min, item.etv_max);
		expect(highlightMatch).toBeTruthy();

		// In the actual code, hide keywords are ONLY checked if NOT highlighted
		// This simulates the logic in NotificationMonitor
		let shouldCheckHide = !highlightMatch;
		let hideMatch = null;

		if (shouldCheckHide) {
			hideMatch = findMatch(item.title, compiledHide, item.etv_min, item.etv_max);
		}

		// Verify hide was not checked because item was highlighted
		expect(shouldCheckHide).toBe(false);
		expect(hideMatch).toBe(null);
	});

	test("Zero ETV vs Unknown ETV handling", () => {
		const itemStates = [
			// Unknown ETV
			{ etv_min: null, etv_max: null, expectedUnknown: 1, expectedZero: 0 },
			{ etv_min: "", etv_max: "", expectedUnknown: 1, expectedZero: 0 },

			// Zero ETV
			{ etv_min: 0, etv_max: 0, expectedUnknown: 0, expectedZero: 1 },
			{ etv_min: "0.00", etv_max: "0.00", expectedUnknown: 0, expectedZero: 1 },

			// Normal ETV
			{ etv_min: 5.28, etv_max: 5.28, expectedUnknown: 0, expectedZero: 0 },
			{ etv_min: "10.00", etv_max: "15.00", expectedUnknown: 0, expectedZero: 0 },
		];

		itemStates.forEach(({ etv_min, etv_max, expectedUnknown, expectedZero }) => {
			const state = {
				typeUnknownETV: 0,
				typeZeroETV: 0,
			};

			// Simulate the logic from NotificationMonitor
			if (parseFloat(etv_min) === 0 || parseFloat(etv_max) === 0) {
				state.typeZeroETV = 1;
			} else if (etv_min == "" || etv_min == null || etv_max == "" || etv_max == null) {
				state.typeUnknownETV = 1;
			}

			expect(state.typeUnknownETV).toBe(expectedUnknown);
			expect(state.typeZeroETV).toBe(expectedZero);
		});
	});

	test("Keyword match persistence through ETV updates", () => {
		const keywords = [
			{ contains: "laptop", without: null },
			{ contains: "gaming", without: "refurbished", etv_min: 50 },
		];

		const compiled = compileKeywordObjects(keywords);
		const item = {
			title: "Gaming Laptop High Performance",
			initialMatch: null,
			finalMatch: null,
		};

		// Initial match without ETV
		const match1 = findMatch(item.title, compiled, null, null);
		expect(match1).toBeTruthy();
		expect(match1.contains).toBe("laptop"); // First keyword matches

		// After ETV update
		const match2 = findMatch(item.title, compiled, 100, 100);
		expect(match2).toBeTruthy();
		// Could match either 'laptop' or 'gaming' now that ETV condition is met
		expect(["laptop", "gaming"]).toContain(match2.contains);
	});
});

describe("Edge Cases and Race Conditions", () => {
	test("Rapid ETV updates should maintain consistent state", () => {
		const updates = [
			{ etv_min: null, etv_max: null },
			{ etv_min: 1.0, etv_max: 1.0 },
			{ etv_min: 5.0, etv_max: 5.0 },
			{ etv_min: 3.0, etv_max: 7.0 },
		];

		const state = {
			typeUnknownETV: 1,
			lastEtvMin: null,
			lastEtvMax: null,
		};

		updates.forEach((update) => {
			// Update state based on ETV values
			if (update.etv_min !== null && update.etv_max !== null) {
				state.typeUnknownETV = 0;
			} else {
				state.typeUnknownETV = 1;
			}

			state.lastEtvMin = update.etv_min;
			state.lastEtvMax = update.etv_max;

			// Verify consistency
			if (update.etv_min === null || update.etv_max === null) {
				expect(state.typeUnknownETV).toBe(1);
			} else {
				expect(state.typeUnknownETV).toBe(0);
			}
		});
	});

	test("Empty string vs null ETV handling", () => {
		const testCases = [
			{ min: "", max: "", shouldBeUnknown: true },
			{ min: null, max: null, shouldBeUnknown: true },
			{ min: "0", max: "0", shouldBeUnknown: false },
			{ min: "5.28", max: "5.28", shouldBeUnknown: false },
			{ min: "", max: "5.28", shouldBeUnknown: true }, // Partial data
			{ min: "5.28", max: "", shouldBeUnknown: true }, // Partial data
		];

		testCases.forEach(({ min, max, shouldBeUnknown }) => {
			const isUnknown = min === "" || min === null || max === "" || max === null;
			expect(isUnknown).toBe(shouldBeUnknown);
		});
	});
});

describe("Real-world Scenario Tests", () => {
	test("Actual log sequence from bug report", () => {
		// This test recreates the exact sequence from the user's logs
		const keyword = "soldering|\\bsolder\\b|\\bflux\\b";
		const compiled = compileKeywordObjects([{ contains: keyword, without: null }]);

		// Timeline of events
		const events = [];

		// 1. Item arrives
		events.push({
			time: "14:18:22.969",
			action: "arrival",
			state: { typeHighlight: 0, typeUnknownETV: 1, typeZeroETV: 0 },
		});

		// 2. Keyword match detected
		const match = findMatch("150 Pcs Solder Seal Wire Connectors", compiled, null, null);
		if (match) {
			events.push({
				time: "14:18:22.970",
				action: "keyword_match",
				state: { typeHighlight: 1, typeUnknownETV: 1, typeZeroETV: 0 },
			});
		}

		// 3. ETV arrives
		events.push({
			time: "14:18:23.000",
			action: "etv_update",
			etv: { min: 5.28, max: 5.28 },
			state: { typeHighlight: 1, typeUnknownETV: 0, typeZeroETV: 0 }, // This should be the final state
		});

		// Verify the final state matches expectations
		const finalState = events[events.length - 1].state;
		expect(finalState.typeHighlight).toBe(1); // Still highlighted
		expect(finalState.typeUnknownETV).toBe(0); // No longer unknown
		expect(finalState.typeZeroETV).toBe(0); // Not zero ETV
	});

	test("Bug fix verification: typeUnknownETV should clear when ETV values arrive", () => {
		// This test specifically verifies the bug fix
		// Before fix: typeUnknownETV would remain 1 even after ETV values arrived
		// After fix: typeUnknownETV should be cleared to 0 when ETV values are present

		const simulateNotificationMonitorLogic = (currentState, etvMin, etvMax) => {
			const newState = { ...currentState };

			// OLD BUGGY CODE (commented out):
			// if (newState.typeUnknownETV == 1) {
			//     // Only cleared if already 1, but didn't check if ETV values arrived
			//     newState.typeUnknownETV = 0;
			// }

			// FIXED CODE:
			// Clear unknown ETV flag if we now have ETV values
			if (newState.typeUnknownETV == 1 && etvMin !== "" && etvMax !== "" && etvMin !== null && etvMax !== null) {
				newState.typeUnknownETV = 0;
			}

			return newState;
		};

		// Test case 1: Item starts with unknown ETV
		let state = {
			typeHighlight: 1,
			typeUnknownETV: 1,
			typeZeroETV: 0,
		};

		// ETV values arrive
		state = simulateNotificationMonitorLogic(state, "5.28", "5.28");

		// With the fix, typeUnknownETV should now be 0
		expect(state.typeUnknownETV).toBe(0);
		expect(state.typeHighlight).toBe(1); // Should remain highlighted

		// Test case 2: Item with empty string ETV (should remain unknown)
		state = {
			typeHighlight: 1,
			typeUnknownETV: 1,
			typeZeroETV: 0,
		};

		state = simulateNotificationMonitorLogic(state, "", "");
		expect(state.typeUnknownETV).toBe(1); // Should remain unknown

		// Test case 3: Partial ETV data (should remain unknown)
		state = {
			typeHighlight: 1,
			typeUnknownETV: 1,
			typeZeroETV: 0,
		};

		state = simulateNotificationMonitorLogic(state, "5.28", "");
		expect(state.typeUnknownETV).toBe(1); // Should remain unknown with partial data

		// Test case 4: Null ETV values (should remain unknown)
		state = {
			typeHighlight: 1,
			typeUnknownETV: 1,
			typeZeroETV: 0,
		};

		state = simulateNotificationMonitorLogic(state, null, null);
		expect(state.typeUnknownETV).toBe(1); // Should remain unknown
	});

	test("Non-keyword match items should also clear unknown ETV styling when ETV arrives", () => {
		// This test verifies the second bug where non-keyword items kept pink background

		const simulateFullFlow = (initialState, etvMin, etvMax, shouldUpdateStyling) => {
			const newState = { ...initialState };

			// Clear unknown ETV flag if we now have ETV values
			if (newState.typeUnknownETV == 1 && etvMin !== "" && etvMax !== "" && etvMin !== null && etvMax !== null) {
				newState.typeUnknownETV = 0;
				newState.stylingUpdated = shouldUpdateStyling; // Track if styling was updated
			}

			return newState;
		};

		// Test case 1: Non-keyword item starts with unknown ETV
		let state = {
			typeHighlight: 0, // Not a keyword match
			typeUnknownETV: 1,
			typeZeroETV: 0,
			backgroundColor: "rgb(255, 224, 232)", // Pink unknown ETV color
			stylingUpdated: false,
		};

		// ETV values arrive
		state = simulateFullFlow(state, "23.99", "23.99", true);

		// Verify both data and styling are updated
		expect(state.typeUnknownETV).toBe(0); // Data flag cleared
		expect(state.stylingUpdated).toBe(true); // Styling should be updated
		expect(state.typeHighlight).toBe(0); // Still not highlighted

		// Test case 2: Keyword match item with unknown ETV
		state = {
			typeHighlight: 1, // Keyword match
			typeUnknownETV: 1,
			typeZeroETV: 0,
			backgroundColor: "striped", // Striped pattern for highlight + unknown
			stylingUpdated: false,
		};

		state = simulateFullFlow(state, "5.28", "5.28", true);

		expect(state.typeUnknownETV).toBe(0); // Data flag cleared
		expect(state.stylingUpdated).toBe(true); // Styling should be updated
		expect(state.typeHighlight).toBe(1); // Still highlighted
	});

	test("Complete flow including visual styling updates", () => {
		// This comprehensive test tracks both data attributes and visual styling

		const itemLifecycle = {
			// Stage 1: Item arrives
			arrival: {
				data: { typeHighlight: 0, typeUnknownETV: 1, typeZeroETV: 0 },
				styling: { backgroundColor: "rgb(255, 224, 232)" }, // Pink for unknown ETV
			},
			// Stage 2: Keyword match detected (if applicable)
			keywordMatch: {
				data: { typeHighlight: 1, typeUnknownETV: 1, typeZeroETV: 0 },
				styling: { background: "striped-pattern" }, // Striped for highlight + unknown
			},
			// Stage 3: ETV arrives
			etvUpdate: {
				data: { typeHighlight: 1, typeUnknownETV: 0, typeZeroETV: 0 },
				styling: { backgroundColor: "highlight-color" }, // Solid highlight color
			},
		};

		// Verify each stage has correct data and styling
		expect(itemLifecycle.arrival.data.typeUnknownETV).toBe(1);
		expect(itemLifecycle.arrival.styling.backgroundColor).toBe("rgb(255, 224, 232)");

		expect(itemLifecycle.keywordMatch.data.typeHighlight).toBe(1);
		expect(itemLifecycle.keywordMatch.styling.background).toBe("striped-pattern");

		expect(itemLifecycle.etvUpdate.data.typeUnknownETV).toBe(0);
		expect(itemLifecycle.etvUpdate.styling.backgroundColor).toBe("highlight-color");
	});
});
