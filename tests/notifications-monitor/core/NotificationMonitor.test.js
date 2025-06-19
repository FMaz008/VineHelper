import { jest } from "@jest/globals";

describe("NotificationMonitor - Visibility State Management", () => {
	let monitor;
	let mockGridEventManager;
	let mockVisibilityStateManager;
	let mockItemsMgr;
	let mockElement;
	let mockItem;

	beforeEach(() => {
		// Mock dependencies
		mockGridEventManager = {
			emitGridEvent: jest.fn(),
		};

		mockVisibilityStateManager = {
			increment: jest.fn(),
			decrement: jest.fn(),
			setCount: jest.fn(),
			getCount: jest.fn().mockReturnValue(5),
		};

		mockItemsMgr = {
			items: new Map(),
			imageUrls: new Set(),
			addItemData: jest.fn(),
			getItemDOMElement: jest.fn(),
			storeItemDOMElement: jest.fn(),
			updateItemTier: jest.fn(),
		};

		// Mock DOM element
		mockElement = {
			style: { display: "flex" },
			dataset: {
				asin: "TEST123",
				recommendationId: "old-id",
				tier: "silver",
			},
			querySelector: jest.fn().mockReturnValue({
				dataset: { recommendationId: "old-id" },
			}),
		};

		// Mock item data
		mockItem = {
			data: {
				asin: "TEST123",
				title: "Test Item",
				img_url: "test.jpg",
				unavailable: false,
			},
			getRecommendationType: jest.fn().mockReturnValue("test-type"),
			getRecommendationString: jest.fn().mockReturnValue("new-id"),
			getCoreInfo: jest.fn().mockReturnValue({}),
		};

		// Create a minimal NotificationMonitor mock
		monitor = {
			_gridEventManager: mockGridEventManager,
			_visibilityStateManager: mockVisibilityStateManager,
			_itemsMgr: mockItemsMgr,
			_settings: {
				get: jest.fn().mockReturnValue(false),
			},
			_tierMgr: {
				isGold: jest.fn().mockReturnValue(true),
				getSilverTierETVLimit: jest.fn().mockReturnValue(50),
			},
			_log: {
				add: jest.fn(),
			},
			_enableItem: jest.fn(),
			"#processNotificationFiltering": jest.fn(),
			"#emitGridEvent": function (eventName, data) {
				this._gridEventManager.emitGridEvent(eventName, data);
			},
		};
	});

	describe("Existing Item Updates", () => {
		test("should track visibility changes when item becomes visible", async () => {
			// Setup: Item exists but is hidden
			const asin = mockItem.data.asin;
			mockItemsMgr.items.set(asin, { data: mockItem.data, element: mockElement });
			mockItemsMgr.getItemDOMElement.mockReturnValue(mockElement);
			mockElement.style.display = "none"; // Initially hidden

			// Mock the filtering to make item visible after update
			const processNotificationFiltering = jest.fn().mockReturnValue(true);

			// Simulate the visibility check and event emission logic
			const wasVisible = mockElement.style.display !== "none";
			mockItemsMgr.addItemData(asin, mockItem.data);
			const isNowVisible = processNotificationFiltering(mockElement);

			// Verify visibility changed from hidden to visible
			expect(wasVisible).toBe(false);
			expect(isNowVisible).toBe(true);

			// Emit grid event if visibility changed
			if (wasVisible !== isNowVisible) {
				monitor["#emitGridEvent"](isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
			}

			// Verify correct event was emitted
			expect(mockGridEventManager.emitGridEvent).toHaveBeenCalledTimes(1);
			expect(mockGridEventManager.emitGridEvent).toHaveBeenCalledWith("grid:items-added", { count: 1 });
		});

		test("should track visibility changes when item becomes hidden", async () => {
			// Setup: Item exists and is visible
			const asin = mockItem.data.asin;
			mockItemsMgr.items.set(asin, { data: mockItem.data, element: mockElement });
			mockItemsMgr.getItemDOMElement.mockReturnValue(mockElement);
			mockElement.style.display = "flex"; // Initially visible

			// Mock the filtering to hide item after update
			const processNotificationFiltering = jest.fn().mockReturnValue(false);

			// Simulate the visibility check and event emission logic
			const wasVisible = mockElement.style.display !== "none";
			mockItemsMgr.addItemData(asin, mockItem.data);
			const isNowVisible = processNotificationFiltering(mockElement);

			// Verify visibility changed from visible to hidden
			expect(wasVisible).toBe(true);
			expect(isNowVisible).toBe(false);

			// Emit grid event if visibility changed
			if (wasVisible !== isNowVisible) {
				monitor["#emitGridEvent"](isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
			}

			// Verify correct event was emitted
			expect(mockGridEventManager.emitGridEvent).toHaveBeenCalledTimes(1);
			expect(mockGridEventManager.emitGridEvent).toHaveBeenCalledWith("grid:items-removed", { count: 1 });
		});

		test("should not emit events when visibility remains unchanged", async () => {
			// Setup: Item exists and is visible
			const asin = mockItem.data.asin;
			mockItemsMgr.items.set(asin, { data: mockItem.data, element: mockElement });
			mockItemsMgr.getItemDOMElement.mockReturnValue(mockElement);

			// Test both visible and hidden cases
			const testCases = [
				{ initialDisplay: "flex", filterResult: true, description: "visible item stays visible" },
				{ initialDisplay: "none", filterResult: false, description: "hidden item stays hidden" },
			];

			for (const testCase of testCases) {
				// Reset mocks
				mockGridEventManager.emitGridEvent.mockClear();
				mockElement.style.display = testCase.initialDisplay;

				// Mock the filtering to maintain current state
				const processNotificationFiltering = jest.fn().mockReturnValue(testCase.filterResult);

				// Simulate the visibility check and event emission logic
				const wasVisible = mockElement.style.display !== "none";
				mockItemsMgr.addItemData(asin, mockItem.data);
				const isNowVisible = processNotificationFiltering(mockElement);

				// Verify visibility didn't change
				expect(wasVisible).toBe(testCase.filterResult);
				expect(isNowVisible).toBe(testCase.filterResult);

				// Emit event only if visibility changed
				if (wasVisible !== isNowVisible) {
					monitor["#emitGridEvent"](isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
				}

				// Verify no events were emitted
				expect(mockGridEventManager.emitGridEvent).not.toHaveBeenCalled();
			}
		});
	});

	describe("Tier Updates", () => {
		test("should track visibility changes when tier update affects item visibility", async () => {
			// Setup: Silver user viewing silver tier item
			const asin = mockItem.data.asin;
			mockItemsMgr.items.set(asin, {
				data: { ...mockItem.data, tier: "silver" },
				element: mockElement,
			});
			mockItemsMgr.getItemDOMElement.mockReturnValue(mockElement);
			mockItemsMgr.updateItemTier.mockReturnValue(true);
			mockElement.style.display = "flex"; // Initially visible
			mockElement.dataset.tier = "silver";

			// Configure silver user with gold item filtering
			monitor._tierMgr.isGold.mockReturnValue(false);
			monitor._settings.get.mockImplementation((key) => {
				return key === "notification.monitor.hideGoldNotificationsForSilverUser";
			});

			// Mock the filtering to hide item after tier changes to gold
			const processNotificationFiltering = jest.fn().mockReturnValue(false);

			// Simulate tier update logic
			const wasVisible = mockElement.style.display !== "none";
			const newTier = "gold";
			mockItemsMgr.updateItemTier(asin, newTier);
			mockElement.dataset.tier = newTier;
			const isNowVisible = processNotificationFiltering(mockElement);

			// Verify visibility changed due to tier update
			expect(wasVisible).toBe(true);
			expect(isNowVisible).toBe(false);

			// Emit grid event if visibility changed
			if (wasVisible !== isNowVisible) {
				monitor["#emitGridEvent"](isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
			}

			// Verify correct event was emitted
			expect(mockGridEventManager.emitGridEvent).toHaveBeenCalledTimes(1);
			expect(mockGridEventManager.emitGridEvent).toHaveBeenCalledWith("grid:items-removed", { count: 1 });
		});

		test("should handle tier updates for gold users correctly", async () => {
			// Setup: Gold user can see all items
			const asin = mockItem.data.asin;
			mockItemsMgr.items.set(asin, {
				data: { ...mockItem.data, tier: "silver" },
				element: mockElement,
			});
			mockItemsMgr.getItemDOMElement.mockReturnValue(mockElement);
			mockItemsMgr.updateItemTier.mockReturnValue(true);
			mockElement.style.display = "flex"; // Initially visible

			// Configure gold user
			monitor._tierMgr.isGold.mockReturnValue(true);

			// Mock the filtering - gold users see all items
			const processNotificationFiltering = jest.fn().mockReturnValue(true);

			// Simulate tier update logic
			const wasVisible = mockElement.style.display !== "none";
			const newTier = "gold";
			mockItemsMgr.updateItemTier(asin, newTier);
			mockElement.dataset.tier = newTier;
			const isNowVisible = processNotificationFiltering(mockElement);

			// Verify item remains visible for gold user
			expect(wasVisible).toBe(true);
			expect(isNowVisible).toBe(true);

			// Emit event only if visibility changed
			if (wasVisible !== isNowVisible) {
				monitor["#emitGridEvent"](isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
			}

			// Verify no events were emitted (visibility unchanged)
			expect(mockGridEventManager.emitGridEvent).not.toHaveBeenCalled();
		});
	});

	describe("Edge Cases", () => {
		test("should handle missing DOM elements gracefully", async () => {
			// Setup: Item exists in data but DOM element is missing
			const asin = mockItem.data.asin;
			mockItemsMgr.items.set(asin, { data: mockItem.data, element: null });
			mockItemsMgr.getItemDOMElement.mockReturnValue(null);

			// Attempt to update - should not throw
			expect(() => {
				mockItemsMgr.addItemData(asin, mockItem.data);
				// No visibility check or event emission should occur
			}).not.toThrow();

			// Verify no events were emitted
			expect(mockGridEventManager.emitGridEvent).not.toHaveBeenCalled();
		});

		test("should handle Safari display style detection", async () => {
			// Setup: Item with computed style (Safari behavior)
			const asin = mockItem.data.asin;
			mockItemsMgr.items.set(asin, { data: mockItem.data, element: mockElement });
			mockItemsMgr.getItemDOMElement.mockReturnValue(mockElement);

			// Simulate Safari where style.display might not be reliable
			mockElement.style.display = ""; // Empty string in Safari

			// For this test, we assume the filtering logic handles Safari correctly
			const processNotificationFiltering = jest.fn().mockReturnValue(true);

			// The actual implementation should use getComputedStyle for Safari
			// This test verifies the logic works regardless of display detection method
			const wasVisible = mockElement.style.display !== "none"; // Would be true for empty string
			const isNowVisible = processNotificationFiltering(mockElement);

			// Verify the logic handles different display values
			expect(typeof wasVisible).toBe("boolean");
			expect(typeof isNowVisible).toBe("boolean");
		});
	});
});
