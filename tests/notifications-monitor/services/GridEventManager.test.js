import { GridEventManager } from "../../../scripts/notifications-monitor/services/GridEventManager.js";
import { HookMgr } from "../../../scripts/core/utils/HookMgr.js";

describe("GridEventManager", () => {
	let gridEventManager;
	let mockHookMgr;
	let mockNoShiftGrid;
	let mockMonitor;

	beforeEach(() => {
		// Create mocks
		mockHookMgr = {
			hookBind: jest.fn(),
			hookExecute: jest.fn(),
		};

		mockNoShiftGrid = {
			insertPlaceholderTiles: jest.fn(),
			resetEndPlaceholdersCount: jest.fn(),
			insertEndPlaceholderTiles: jest.fn(),
		};

		mockMonitor = {
			_sortType: "date_desc",
		};

		// Create instance
		gridEventManager = new GridEventManager(mockHookMgr, mockNoShiftGrid, mockMonitor);
	});

	describe("Event Registration", () => {
		it("should register all grid event listeners on initialization", () => {
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-added", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-removed", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-cleared", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-filtered", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:truncated", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:sorted", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:paused", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledTimes(7);
		});
	});

	describe("Event Emission", () => {
		it("should emit events through HookMgr", () => {
			const eventName = "grid:items-added";
			const eventData = { count: 5 };

			gridEventManager.emitGridEvent(eventName, eventData);

			expect(mockHookMgr.hookExecute).toHaveBeenCalledWith(eventName, eventData);
		});

		it("should emit events without data", () => {
			const eventName = "grid:items-cleared";

			gridEventManager.emitGridEvent(eventName);

			expect(mockHookMgr.hookExecute).toHaveBeenCalledWith(eventName, null);
		});
	});

	describe("Placeholder Updates", () => {
		it("should update placeholders for add operation in date_desc sort", () => {
			// Trigger the event handler
			const addHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:items-added")[1];
			addHandler();

			expect(mockNoShiftGrid.insertPlaceholderTiles).toHaveBeenCalled();
		});

		it("should not update placeholders for add operation in non-date_desc sort", () => {
			mockMonitor._sortType = "price_asc";

			// Trigger the event handler
			const addHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:items-added")[1];
			addHandler();

			expect(mockNoShiftGrid.insertPlaceholderTiles).not.toHaveBeenCalled();
		});

		it("should handle truncation with fetchingRecentItems", () => {
			const truncateHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:truncated")[1];
			truncateHandler({ fetchingRecentItems: true });

			expect(mockNoShiftGrid.resetEndPlaceholdersCount).toHaveBeenCalled();
			expect(mockNoShiftGrid.insertPlaceholderTiles).toHaveBeenCalled();
		});

		it("should handle truncation with visibleItemsRemovedCount", () => {
			const truncateHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:truncated")[1];
			truncateHandler({ visibleItemsRemovedCount: 10 });

			expect(mockNoShiftGrid.insertEndPlaceholderTiles).toHaveBeenCalledWith(10);
			expect(mockNoShiftGrid.insertPlaceholderTiles).toHaveBeenCalled();
		});
	});

	describe("Enable/Disable", () => {
		it("should not update placeholders when disabled", () => {
			gridEventManager.setEnabled(false);

			const addHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:items-added")[1];
			addHandler();

			expect(mockNoShiftGrid.insertPlaceholderTiles).not.toHaveBeenCalled();
		});

		it("should report enabled state correctly", () => {
			expect(gridEventManager.isEnabled()).toBe(true);

			gridEventManager.setEnabled(false);
			expect(gridEventManager.isEnabled()).toBe(false);

			gridEventManager.setEnabled(true);
			expect(gridEventManager.isEnabled()).toBe(true);
		});
	});

	describe("Null Safety", () => {
		it("should handle null noShiftGrid gracefully", () => {
			gridEventManager = new GridEventManager(mockHookMgr, null, mockMonitor);

			// Should not throw when emitting events
			expect(() => {
				const addHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:items-added")[1];
				addHandler();
			}).not.toThrow();
		});
	});
});
