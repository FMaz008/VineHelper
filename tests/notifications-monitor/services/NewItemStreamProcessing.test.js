import { NewItemStreamProcessing } from "../../../scripts/notifications-monitor/stream/NewItemStreamProcessing.js";
import { Item } from "../../../scripts/core/models/Item.js";

// Mock SettingsMgrDI
jest.mock("../../../scripts/core/services/SettingsMgrDI.js", () => {
	return {
		SettingsMgrDI: jest.fn().mockImplementation(() => ({
			get: jest.fn((key) => {
				const settings = {
					"general.highlightKeywords": [
						{ contains: "poe", etv_min: null, etv_max: null },
						{ contains: "ethernet", etv_min: null, etv_max: null },
					],
					"general.hideKeywords": [{ contains: "spam", etv_min: null, etv_max: null }],
					"general.blurKeywords": [{ contains: "sex", etv_min: null, etv_max: null }],
					"general.debugKeywords": false,
					"general.version": "3.6.0",
					"notification.hideList": true,
					"notification.pushNotifications": false,
					"notification.pushNotificationsAFA": false,
				};
				return settings[key];
			}),
			waitForLoad: jest.fn().mockResolvedValue(),
		})),
	};
});

describe("NewItemStreamProcessing", () => {
	let processor;
	let broadcastSpy;
	let pushSpy;
	let mockSettingsMgr;

	beforeEach(async () => {
		broadcastSpy = jest.fn();
		pushSpy = jest.fn();

		// Create mock settings manager
		const { SettingsMgrDI } = require("../../../scripts/core/services/SettingsMgrDI.js");
		mockSettingsMgr = new SettingsMgrDI();

		// Create processor with injected dependencies (disable chrome listener for tests)
		processor = new NewItemStreamProcessing(mockSettingsMgr, false);
		await processor.initialize();

		// Set up output functions
		processor.setBroadcastFunction(broadcastSpy);
		processor.setNotificationPushFunction(pushSpy);
	});

	test("should process item through pipeline correctly", async () => {
		const testItem = new Item({
			asin: "B123",
			title: "Test Laptop",
			etv_min: 200,
			etv_max: 400,
			queue: "all_items",
			date: "2023-12-25 10:00:00",
			img_url: "test.jpg",
			is_pre_release: false,
			is_parent_asin: false,
			enrollment_guid: null,
		});

		processor.input({
			item: testItem,
		});

		// Wait a bit for async processing
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(broadcastSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				item: expect.objectContaining({
					data: expect.objectContaining({
						asin: "B123",
						title: "Test Laptop",
						search: "Test", // The search phrase regex truncates after first word
						timestamp: expect.any(Number),
						KWsMatch: false, // This item doesn't match highlight keywords
						BlurKWsMatch: false,
					}),
				}),
			}),
			"notification"
		);
	});

	test("should handle highlight keywords correctly", async () => {
		const highlightItem = new Item({
			asin: "B789",
			title: "POE Network Switch", // Contains "poe" keyword
			etv_min: 150,
			etv_max: 350,
			queue: "all_items",
			date: "2023-12-25 10:00:00",
			img_url: "highlight.jpg",
			is_parent_asin: false,
			is_pre_release: false,
			enrollment_guid: null,
		});

		processor.input({
			item: highlightItem,
		});

		// Wait for async processing
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(broadcastSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				item: expect.objectContaining({
					data: expect.objectContaining({
						KWsMatch: true,
						KW: "poe",
					}),
				}),
			}),
			"notification"
		);
	});

	test("should handle hide keywords correctly", () => {
		const hideItem = new Item({
			asin: "B456",
			title: "spam item", // Contains "spam" keyword and should be hidden
			etv_min: 100,
			etv_max: 300,
			queue: "all_items",
			date: "2023-12-25 10:00:00",
			is_parent_asin: false,
			is_pre_release: false,
			enrollment_guid: null,
		});

		processor.input({
			item: hideItem,
		});

		// Item should be filtered out, so broadcast should not be called
		expect(broadcastSpy).not.toHaveBeenCalled();
	});

	test("should not hide highlighted items even if they match hide keywords", async () => {
		const conflictItem = new Item({
			asin: "B999",
			title: "poe spam adapter", // Contains both "poe" (highlight) and "spam" (hide)
			etv_min: 150,
			etv_max: 350,
			queue: "all_items",
			date: "2023-12-25 10:00:00",
			is_parent_asin: false,
			is_pre_release: false,
			enrollment_guid: null,
		});

		processor.input({
			item: conflictItem,
		});

		// Wait for async processing
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Should be highlighted and not hidden (highlight takes precedence)
		expect(broadcastSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				item: expect.objectContaining({
					data: expect.objectContaining({
						KWsMatch: true,
					}),
				}),
			}),
			"notification"
		);
	});

	test("should add timestamp to items", async () => {
		const testItem = new Item({
			asin: "B456",
			title: "Test Item",
			image_url: "test.jpg",
			queue: "all_items",
			date: "2023-12-25 10:00:00",
			is_parent_asin: false,
			is_pre_release: false,
			enrollment_guid: null,
		});

		processor.input({
			item: testItem,
		});

		// Wait for async processing
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(broadcastSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				item: expect.objectContaining({
					data: expect.objectContaining({
						timestamp: expect.any(Number),
					}),
				}),
			}),
			"notification"
		);
	});

	test("should allow manual settings override for testing", async () => {
		// Define default settings
		const defaultSettings = {
			"general.highlightKeywords": [
				{ contains: "poe", etv_min: null, etv_max: null },
				{ contains: "ethernet", etv_min: null, etv_max: null },
			],
			"general.hideKeywords": [{ contains: "spam", etv_min: null, etv_max: null }],
			"general.blurKeywords": [{ contains: "sex", etv_min: null, etv_max: null }],
			"general.debugKeywords": false,
			"general.version": "3.6.0",
			"notification.hideList": true,
			"notification.pushNotifications": false,
			"notification.pushNotificationsAFA": false,
		};
		
		// Override settings to enable push notifications
		mockSettingsMgr.get.mockImplementation((key) => {
			const overrides = {
				"notification.pushNotifications": true,
				"general.highlightKeywords": [{ contains: "notification" }],
			};
			return overrides[key] !== undefined ? overrides[key] : defaultSettings[key];
		});
		
		// Recompile keywords with new settings
		await processor.compileKeywords();

		const notificationItem = new Item({
			asin: "B101",
			title: "notification item",
			etv_min: 200,
			etv_max: 400,
			queue: "all_items",
			date: "2023-12-25 10:00:00",
			is_parent_asin: false,
			is_pre_release: false,
			enrollment_guid: null,
		});

		processor.input({
			item: notificationItem,
		});

		// Should trigger push notification for highlighted item
		expect(pushSpy).toHaveBeenCalledWith("Vine Helper - New item match KW!", expect.any(Item));
	});
});
