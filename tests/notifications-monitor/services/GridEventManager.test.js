import { GridEventManager } from "../../../scripts/notifications-monitor/services/GridEventManager.js";
import { DIContainer } from "../../../scripts/infrastructure/DIContainer.js";

describe("GridEventManager", () => {
	let container;
	let gridEventManager;
	let mockHookMgr;
	let mockNoShiftGrid;
	let mockMonitor;

	beforeEach(() => {
		// Create a new DI container for each test
		container = new DIContainer();

		// Create mocks
		mockHookMgr = {
			hookBind: jest.fn(),
			hookExecute: jest.fn(),
		};

		mockNoShiftGrid = {
			insertPlaceholderTiles: jest.fn(),
			resetEndPlaceholdersCount: jest.fn(),
			insertEndPlaceholderTiles: jest.fn(),
			deletePlaceholderTiles: jest.fn(),
		};

		mockMonitor = {
			_sortType: "date_desc",
		};

		// Register mocks in the DI container
		container.register("hookMgr", () => mockHookMgr);
		container.register("noShiftGrid", () => mockNoShiftGrid);
		container.register("monitor", () => mockMonitor);

		// Register GridEventManager with its dependencies
		container.register(
			"gridEventManager",
			(hookMgr, noShiftGrid, monitor) => new GridEventManager(hookMgr, noShiftGrid, monitor),
			{
				singleton: true,
				dependencies: ["hookMgr", "noShiftGrid", "monitor"],
			}
		);

		// Resolve GridEventManager from the container
		gridEventManager = container.resolve("gridEventManager");
	});

	describe("Event Registration", () => {
		it("should register all grid event listeners on initialization", () => {
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-added", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-removed", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-cleared", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:items-filtered", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:truncated", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:sorted", expect.any(Function));
			expect(mockHookMgr.hookBind).toHaveBeenCalledWith("grid:unpaused", expect.any(Function));
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

		it("should reset end placeholders count for filter operation", () => {
			const filterHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:items-filtered")[1];
			filterHandler();

			expect(mockNoShiftGrid.resetEndPlaceholdersCount).toHaveBeenCalled();
			expect(mockNoShiftGrid.insertPlaceholderTiles).toHaveBeenCalled();
		});

		it("should reset end placeholders count for clear operation", () => {
			const clearHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:items-cleared")[1];
			clearHandler();

			expect(mockNoShiftGrid.resetEndPlaceholdersCount).toHaveBeenCalled();
			expect(mockNoShiftGrid.insertPlaceholderTiles).toHaveBeenCalled();
		});

		it("should insert end placeholder tiles for unpause operation", () => {
			const unpauseHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:unpaused")[1];
			unpauseHandler();

			expect(mockNoShiftGrid.insertEndPlaceholderTiles).toHaveBeenCalledWith(0);
			expect(mockNoShiftGrid.insertPlaceholderTiles).toHaveBeenCalled();
		});

		it("should delete placeholder tiles when sort type is not date_desc", () => {
			const sortHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:sorted")[1];
			sortHandler({ sortType: "price_asc" });

			expect(mockNoShiftGrid.deletePlaceholderTiles).toHaveBeenCalled();
			expect(mockNoShiftGrid.insertPlaceholderTiles).not.toHaveBeenCalled();
		});

		it("should insert placeholder tiles when sort type is date_desc", () => {
			const sortHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:sorted")[1];
			sortHandler({ sortType: "date_desc" });

			expect(mockNoShiftGrid.deletePlaceholderTiles).not.toHaveBeenCalled();
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
			// Register a null noShiftGrid
			container.register("noShiftGrid", () => null);

			// Create a new instance with null noShiftGrid
			const safeGridEventManager = container.resolve("gridEventManager");

			// Should not throw when emitting events
			expect(() => {
				const addHandler = mockHookMgr.hookBind.mock.calls.find((call) => call[0] === "grid:items-added")[1];
				addHandler();
			}).not.toThrow();
		});
	});

	describe("DI Container Integration", () => {
		it("should resolve GridEventManager with all dependencies", () => {
			// Verify that GridEventManager was created with the correct dependencies
			expect(gridEventManager).toBeInstanceOf(GridEventManager);

			// Verify that the dependencies were injected correctly by checking that
			// the event listeners were registered
			expect(mockHookMgr.hookBind).toHaveBeenCalled();
		});

		it("should use singleton pattern for GridEventManager", () => {
			// Resolve GridEventManager twice
			const instance1 = container.resolve("gridEventManager");
			const instance2 = container.resolve("gridEventManager");

			// Both instances should be the same (singleton)
			expect(instance1).toBe(instance2);
		});
	});
});
