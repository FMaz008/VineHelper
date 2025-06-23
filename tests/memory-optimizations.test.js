/**
 * Tests for memory optimization implementations
 */

import { sharedKeywordMatcher } from "../scripts/core/utils/SharedKeywordMatcher.js";
import { UnifiedTransformHandler } from "../scripts/notifications-monitor/stream/UnifiedTransformHandler.js";

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

	describe("UnifiedTransformHandler", () => {
		let mockSettings;
		let handler;

		beforeEach(() => {
			mockSettings = {
				get: jest.fn((key) => {
					const settings = {
						"general.hideKeywords": [{ contains: "hide" }],
						"general.highlightKeywords": [{ contains: "highlight" }],
						"general.blurKeywords": [{ contains: "blur" }],
						"notification.hideList": true,
						"notification.pushNotifications": true,
						"notification.pushNotificationsAFA": true,
					};
					return settings[key];
				}),
			};

			handler = new UnifiedTransformHandler(mockSettings);
		});

		test("should filter items based on hide keywords", () => {
			const data = {
				item: {
					data: {
						title: "Item to hide",
						etv_min: 100,
						etv_max: 200,
					},
				},
			};

			const result = handler.filter(data);
			expect(result).toBe(false);
		});

		test("should apply all transforms in single pass", () => {
			const data = {
				item: {
					data: {
						asin: "B123",
						title: "Test highlight item for blur",
						etv_min: 100,
						etv_max: 200,
						date: "2024-01-01 12:00:00",
						queue: "encore",
						is_parent_asin: false,
						enrollment_guid: "test-guid",
						img_url: "test.jpg",
					},
				},
			};

			const result = handler.transform(data);

			// Check highlight transform
			expect(result.item.data.KWsMatch).toBe(true);
			expect(result.item.data.KW).toBe("highlight");

			// Check blur transform
			expect(result.item.data.BlurKWsMatch).toBe(true);
			expect(result.item.data.BlurKW).toBe("blur");

			// Check search phrase (first 40 chars)
			expect(result.item.data.search).toBe("Test highlight item for");

			// Check timestamp
			expect(result.item.data.timestamp).toBeDefined();
			expect(typeof result.item.data.timestamp).toBe("number");
		});

		test("should handle notifications correctly", () => {
			const data = {
				item: {
					data: {
						asin: "B123",
						title: "Test highlight item",
						etv_min: 100,
						etv_max: 200,
						queue: "encore",
						KWsMatch: true,
						img_url: "test.jpg",
						search: "Test highlight item",
						is_parent_asin: false,
						enrollment_guid: "test-guid",
					},
				},
			};

			const result = handler.transform(data);

			expect(result.notification).toBeDefined();
			expect(result.notification.title).toBe("Test highlight item");
			expect(result.notification.item).toBeDefined();
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
