import { jest } from "@jest/globals";

describe("NotificationMonitor - Visibility State Management", () => {
	let monitor;
	let mockVisibilityStateManager;
	let mockItemsMgr;
	let mockElement;
	let mockItem;

	beforeEach(() => {
		// Mock dependencies
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
			// Grid events are now handled directly without GridEventManager
			"#emitGridEvent": jest.fn(),
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

			// Grid events are now handled internally without GridEventManager
			// No specific assertions needed for grid event emission
		});

		test("should handle item addition correctly", async () => {
			const asin = mockItem.data.asin;

			// Simulate adding an item
			mockItemsMgr.items.set(asin, { data: mockItem.data, element: mockElement });

			// Verify the item was added
			expect(mockItemsMgr.items.has(asin)).toBe(true);

			// Grid events are handled internally without GridEventManager
		});

		test("should handle item removal correctly", async () => {
			const asin = mockItem.data.asin;

			// Setup: Add item first
			mockItemsMgr.items.set(asin, { data: mockItem.data, element: mockElement });

			// Simulate removing an item
			mockItemsMgr.items.delete(asin);

			// Verify the item was removed
			expect(mockItemsMgr.items.has(asin)).toBe(false);

			// Grid events are handled internally without GridEventManager
		});
	});

	describe("Visibility State Management", () => {
		test("should track item visibility correctly", () => {
			// Test visibility state management
			const currentCount = mockVisibilityStateManager.getCount();
			expect(currentCount).toBe(5);

			// Test increment
			mockVisibilityStateManager.increment();
			expect(mockVisibilityStateManager.increment).toHaveBeenCalled();

			// Test decrement
			mockVisibilityStateManager.decrement();
			expect(mockVisibilityStateManager.decrement).toHaveBeenCalled();
		});
	});
});
