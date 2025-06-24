import { VisibilityStateManager } from "../../../scripts/notifications-monitor/services/VisibilityStateManager.js";

describe("VisibilityStateManager", () => {
	let visibilityStateManager;
	let mockHookMgr;
	let executeCallCount;
	let lastExecuteArgs;

	beforeEach(() => {
		executeCallCount = 0;
		lastExecuteArgs = null;

		mockHookMgr = {
			hookExecute: jest.fn((event, data) => {
				executeCallCount++;
				lastExecuteArgs = { event, data };
			}),
		};

		visibilityStateManager = new VisibilityStateManager(mockHookMgr);
	});

	describe("constructor", () => {
		it("should initialize with count of 0", () => {
			expect(visibilityStateManager.getCount()).toBe(0);
		});

		it("should not emit event on initialization", () => {
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});
	});

	describe("increment", () => {
		it("should increment count by 1 when no amount specified", () => {
			visibilityStateManager.increment();
			expect(visibilityStateManager.getCount()).toBe(1);
		});

		it("should increment count by specified amount", () => {
			visibilityStateManager.increment(5);
			expect(visibilityStateManager.getCount()).toBe(5);
		});

		it("should emit count-changed event when incrementing", () => {
			visibilityStateManager.increment(3);

			expect(mockHookMgr.hookExecute).toHaveBeenCalledWith(
				"visibility:count-changed",
				expect.objectContaining({
					count: 3,
					timestamp: expect.any(Number),
				})
			);
		});

		it("should not increment or emit event for zero amount", () => {
			visibilityStateManager.increment(0);
			expect(visibilityStateManager.getCount()).toBe(0);
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});

		it("should not increment or emit event for negative amount", () => {
			visibilityStateManager.increment(-5);
			expect(visibilityStateManager.getCount()).toBe(0);
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});

		it("should handle multiple increments correctly", () => {
			visibilityStateManager.increment(2);
			visibilityStateManager.increment(3);
			visibilityStateManager.increment();

			expect(visibilityStateManager.getCount()).toBe(6);
			// Each increment/decrement emits 2 events (count-changed and count-changed-immediate)
			expect(mockHookMgr.hookExecute).toHaveBeenCalledTimes(6);
		});
	});

	describe("decrement", () => {
		beforeEach(() => {
			// Set initial count to 10
			visibilityStateManager.setCount(10);
			mockHookMgr.hookExecute.mockClear();
		});

		it("should decrement count by 1 when no amount specified", () => {
			visibilityStateManager.decrement();
			expect(visibilityStateManager.getCount()).toBe(9);
		});

		it("should decrement count by specified amount", () => {
			visibilityStateManager.decrement(3);
			expect(visibilityStateManager.getCount()).toBe(7);
		});

		it("should emit count-changed event when decrementing", () => {
			visibilityStateManager.decrement(2);

			expect(mockHookMgr.hookExecute).toHaveBeenCalledWith(
				"visibility:count-changed",
				expect.objectContaining({
					count: 8,
					timestamp: expect.any(Number),
				})
			);
		});

		it("should not go below zero", () => {
			visibilityStateManager.decrement(15);
			expect(visibilityStateManager.getCount()).toBe(0);
		});

		it("should not decrement or emit event for zero amount", () => {
			visibilityStateManager.decrement(0);
			expect(visibilityStateManager.getCount()).toBe(10);
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});

		it("should not decrement or emit event for negative amount", () => {
			visibilityStateManager.decrement(-5);
			expect(visibilityStateManager.getCount()).toBe(10);
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});

		it("should handle multiple decrements correctly", () => {
			visibilityStateManager.decrement(2);
			visibilityStateManager.decrement(3);
			visibilityStateManager.decrement();

			expect(visibilityStateManager.getCount()).toBe(4);
			// Each increment/decrement emits 2 events (count-changed and count-changed-immediate)
			expect(mockHookMgr.hookExecute).toHaveBeenCalledTimes(6);
		});
	});

	describe("setCount", () => {
		it("should set count to specified value", () => {
			visibilityStateManager.setCount(42);
			expect(visibilityStateManager.getCount()).toBe(42);
		});

		it("should emit count-changed event when setting count", () => {
			visibilityStateManager.setCount(15);

			expect(mockHookMgr.hookExecute).toHaveBeenCalledWith(
				"visibility:count-changed",
				expect.objectContaining({
					count: 15,
					timestamp: expect.any(Number),
				})
			);
		});

		it("should not emit event if count unchanged", () => {
			visibilityStateManager.setCount(0);
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});

		it("should handle negative values by setting to 0", () => {
			visibilityStateManager.setCount(-10);
			expect(visibilityStateManager.getCount()).toBe(0);
		});

		it("should emit event when changing from non-zero to same value", () => {
			visibilityStateManager.setCount(5);
			mockHookMgr.hookExecute.mockClear();

			visibilityStateManager.setCount(5);
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});
	});

	describe("reset", () => {
		it("should reset count to 0", () => {
			visibilityStateManager.setCount(25);
			mockHookMgr.hookExecute.mockClear();

			visibilityStateManager.reset();
			expect(visibilityStateManager.getCount()).toBe(0);
		});

		it("should emit count-changed event when resetting from non-zero", () => {
			visibilityStateManager.setCount(10);
			mockHookMgr.hookExecute.mockClear();

			visibilityStateManager.reset();

			expect(mockHookMgr.hookExecute).toHaveBeenCalledWith(
				"visibility:count-changed",
				expect.objectContaining({
					count: 0,
					timestamp: expect.any(Number),
				})
			);
		});

		it("should not emit event if already at 0", () => {
			visibilityStateManager.reset();
			expect(mockHookMgr.hookExecute).not.toHaveBeenCalled();
		});
	});

	describe("getCount", () => {
		it("should return current count", () => {
			expect(visibilityStateManager.getCount()).toBe(0);

			visibilityStateManager.setCount(7);
			expect(visibilityStateManager.getCount()).toBe(7);

			visibilityStateManager.increment(3);
			expect(visibilityStateManager.getCount()).toBe(10);

			visibilityStateManager.decrement(2);
			expect(visibilityStateManager.getCount()).toBe(8);

			visibilityStateManager.reset();
			expect(visibilityStateManager.getCount()).toBe(0);
		});
	});

	describe("event emission", () => {
		it("should include timestamp in all events", () => {
			const beforeTime = Date.now();
			visibilityStateManager.increment();
			const afterTime = Date.now();

			const eventData = mockHookMgr.hookExecute.mock.calls[0][1];
			expect(eventData.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(eventData.timestamp).toBeLessThanOrEqual(afterTime);
		});

		it("should emit correct event name", () => {
			visibilityStateManager.increment();
			expect(mockHookMgr.hookExecute).toHaveBeenCalledWith("visibility:count-changed", expect.any(Object));
		});
	});

	describe("integration scenarios", () => {
		it("should handle complex sequence of operations", () => {
			// Start at 0
			expect(visibilityStateManager.getCount()).toBe(0);

			// Add 5 items
			visibilityStateManager.increment(5);
			expect(visibilityStateManager.getCount()).toBe(5);

			// Add 3 more items
			visibilityStateManager.increment(3);
			expect(visibilityStateManager.getCount()).toBe(8);

			// Remove 2 items
			visibilityStateManager.decrement(2);
			expect(visibilityStateManager.getCount()).toBe(6);

			// Full recount shows 10 items
			visibilityStateManager.setCount(10);
			expect(visibilityStateManager.getCount()).toBe(10);

			// Remove all items
			visibilityStateManager.reset();
			expect(visibilityStateManager.getCount()).toBe(0);

			// Verify all operations emitted events
			// Each operation emits 2 events (count-changed and count-changed-immediate)
			expect(mockHookMgr.hookExecute).toHaveBeenCalledTimes(10);
		});

		it("should maintain consistency across rapid updates", () => {
			for (let i = 0; i < 100; i++) {
				visibilityStateManager.increment();
			}
			expect(visibilityStateManager.getCount()).toBe(100);

			for (let i = 0; i < 50; i++) {
				visibilityStateManager.decrement();
			}
			expect(visibilityStateManager.getCount()).toBe(50);
		});
	});
});
