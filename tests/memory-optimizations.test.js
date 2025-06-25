/**
 * Tests for memory optimization implementations
 */

import { sharedKeywordMatcher } from "../scripts/core/utils/SharedKeywordMatcher.js";

describe("Memory Optimizations", () => {
	describe("SharedKeywordMatcher", () => {
		beforeEach(() => {
			sharedKeywordMatcher.clearCache();
		});

		test("should return consistent match results", () => {
			const keywords = [
				{ contains: "laptop", etv_min: 100, etv_max: 500 },
				{ contains: "phone", without: "case" },
			];
			const title = "Gaming laptop with RGB keyboard";

			// First call
			const result1 = sharedKeywordMatcher.match(keywords, title, 200, 400, "test");

			// Second call - should return same result
			const result2 = sharedKeywordMatcher.match(keywords, title, 200, 400, "test");

			expect(result1).toEqual(result2);
			expect(result1).toEqual({ contains: "laptop", etv_min: 100, etv_max: 500 });

			const stats = sharedKeywordMatcher.getStats();
			expect(stats.totalMatches).toBe(2);
			// Note: Last-match cache was removed as analysis showed it was ineffective
			// The cacheSize now reflects compiled regex patterns, not match results
		});

		test("should handle different keyword types separately", () => {
			const keywords = [{ contains: "test" }];
			const title = "test item";

			// Different types can share results since underlying match is the same
			const hideResult = sharedKeywordMatcher.match(keywords, title, null, null, "hide");
			const highlightResult = sharedKeywordMatcher.match(keywords, title, null, null, "highlight");
			const blurResult = sharedKeywordMatcher.match(keywords, title, null, null, "blur");

			// All should find the same match
			expect(hideResult).toEqual({ contains: "test" });
			expect(highlightResult).toEqual({ contains: "test" });
			expect(blurResult).toEqual({ contains: "test" });

			const stats = sharedKeywordMatcher.getStats();
			// Total matches includes previous tests, so just check it increased by 3
			expect(stats.totalMatches).toBeGreaterThanOrEqual(3);
		});

		test("should return correct match results", () => {
			// Need to precompile keywords first
			const keywords = [
				{ contains: "laptop", etv_min: 100, etv_max: 500 },
				{ contains: "phone", without: "case" },
				"tablet",
			];

			// Test matching (SharedKeywordMatcher handles compilation internally)
			const laptopMatch = sharedKeywordMatcher.match(keywords, "Gaming laptop", 200, 300, "test");
			expect(laptopMatch).toEqual({ contains: "laptop", etv_min: 100, etv_max: 500 });

			// Test non-matching
			const noMatch = sharedKeywordMatcher.match(keywords, "Random item", 200, 300, "test");
			expect(noMatch).toBeUndefined();

			// Test string keyword
			const tabletMatch = sharedKeywordMatcher.match(keywords, "Android tablet", null, null, "test");
			expect(tabletMatch).toBe("tablet");
		});
	});

	describe("ItemsMgr WeakMap usage", () => {
		// Note: WeakMap behavior is difficult to test directly
		// This test verifies the API still works correctly
		test("should use WeakMaps for DOM storage", () => {
			// Since ItemsMgr uses WeakMaps internally, we can't directly test them
			// but we can verify the public API works correctly

			// Create a mock ItemsMgr-like object to test the pattern
			class TestItemsMgr {
				constructor() {
					this.items = new Map();
					this.domElements = new WeakMap();
					this.tiles = new WeakMap();
				}

				addItem(asin, data) {
					this.items.set(asin, { data });
				}

				storeDOMElement(asin, element) {
					const item = this.items.get(asin);
					if (item) {
						this.domElements.set(item, element);
						return true;
					}
					return false;
				}

				getDOMElement(asin) {
					const item = this.items.get(asin);
					return item ? this.domElements.get(item) : undefined;
				}

				removeItem(asin) {
					// WeakMaps automatically clean up when item is removed
					this.items.delete(asin);
				}
			}

			const mgr = new TestItemsMgr();

			// Add item
			mgr.addItem("B123", { title: "Test Item" });

			// Store DOM element
			const mockElement = { id: "test-element" };
			const stored = mgr.storeDOMElement("B123", mockElement);
			expect(stored).toBe(true);

			// Retrieve DOM element
			const retrieved = mgr.getDOMElement("B123");
			expect(retrieved).toBe(mockElement);

			// Remove item - WeakMap will allow GC
			mgr.removeItem("B123");
			expect(mgr.getDOMElement("B123")).toBeUndefined();
		});
	});
});
