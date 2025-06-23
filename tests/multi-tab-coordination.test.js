/**
 * Integration tests for multi-tab coordination
 */

const { MasterSlave } = require("../scripts/notifications-monitor/coordination/MasterSlave.js");

describe("Multi-Tab Integration", () => {
	let monitor;
	let instance;

	beforeEach(() => {
		// Reset singleton before each test
		MasterSlave.resetInstance();

		// Mock monitor
		monitor = {
			_channel: {
				addEventListener: jest.fn(),
				removeEventListener: jest.fn(),
				postMessage: jest.fn(),
				close: jest.fn(),
			},
			_hookMgr: {
				hookBind: jest.fn(),
				unbind: jest.fn(),
			},
			setMasterMonitor: jest.fn(),
			setSlaveMonitor: jest.fn(),
			_serverComMgr: {
				updateServicesStatus: jest.fn(),
			},
			_isMasterMonitor: false,
		};

		// Mock crypto.randomUUID
		global.crypto = {
			randomUUID: jest.fn(() => "test-uuid-123"),
		};
	});

	afterEach(() => {
		// Clean up instance
		if (instance && instance.destroy) {
			instance.destroy();
		}

		// Clear all mocks
		jest.clearAllMocks();
		jest.useRealTimers();
	});

	describe("Basic Functionality", () => {
		test("should create singleton instance", () => {
			const instance1 = new MasterSlave(monitor);
			const instance2 = new MasterSlave(monitor);
			expect(instance1).toBe(instance2);
		});

		test("should set as master by default", () => {
			instance = new MasterSlave(monitor);
			expect(monitor.setMasterMonitor).toHaveBeenCalled();
		});

		test("should setup event listeners", () => {
			instance = new MasterSlave(monitor);
			expect(monitor._channel.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
			expect(monitor._hookMgr.hookBind).toHaveBeenCalledWith("beforeunload", expect.any(Function));
		});

		test("should send areYouTheMaster query on initialization", () => {
			instance = new MasterSlave(monitor);
			expect(monitor._channel.postMessage).toHaveBeenCalledWith({
				type: "areYouTheMaster",
				destination: "*",
				sender: "test-uuid-123",
			});
		});
	});

	describe("Message Handling", () => {
		let messageHandler;

		beforeEach(() => {
			instance = new MasterSlave(monitor);
			// Get the message handler that was registered
			messageHandler = monitor._channel.addEventListener.mock.calls.find((call) => call[0] === "message")[1];
		});

		test("should respond to masterMonitorPing when master", () => {
			monitor._isMasterMonitor = true;

			messageHandler({ data: { type: "masterMonitorPing" } });

			expect(monitor._channel.postMessage).toHaveBeenCalledWith({
				type: "masterMonitorPong",
			});
		});

		test("should handle ImTheMaster message", () => {
			messageHandler({
				data: {
					type: "ImTheMaster",
					sender: "other-monitor",
					destination: "test-uuid-123",
				},
			});

			expect(monitor.setSlaveMonitor).toHaveBeenCalled();
		});

		test("should track alive monitors", () => {
			messageHandler({
				data: {
					type: "ImAlive",
					sender: "monitor-456",
					destination: "*",
				},
			});

			// Send quit message from same monitor
			messageHandler({
				data: {
					type: "IQuit",
					sender: "monitor-456",
					destination: "*",
				},
			});

			// No errors should occur
			expect(monitor.setMasterMonitor).toHaveBeenCalledTimes(1); // Only initial call
		});

		test("should respond to areYouTheMaster when master", () => {
			// Set as master
			messageHandler({
				data: {
					type: "ImTheMaster",
					sender: "test-uuid-123",
					destination: "*",
				},
			});

			// Clear previous calls
			monitor._channel.postMessage.mockClear();

			// Receive areYouTheMaster query
			messageHandler({
				data: {
					type: "areYouTheMaster",
					sender: "new-monitor",
					destination: "*",
				},
			});

			// Should respond with ImTheMaster and ImAlive
			const calls = monitor._channel.postMessage.mock.calls;
			expect(calls).toContainEqual([
				{
					type: "ImTheMaster",
					sender: "test-uuid-123",
					destination: "new-monitor",
				},
			]);
			expect(calls).toContainEqual([
				{
					type: "ImAlive",
					sender: "test-uuid-123",
					destination: "new-monitor",
				},
			]);
		});
	});

	describe("Keep-Alive Mechanism", () => {
		test("should send periodic ImAlive messages", () => {
			jest.useFakeTimers();

			instance = new MasterSlave(monitor);

			// Clear initial messages
			monitor._channel.postMessage.mockClear();

			// Advance time by 1 second
			jest.advanceTimersByTime(1000);

			// Should have sent ImAlive message
			expect(monitor._channel.postMessage).toHaveBeenCalledWith({
				type: "ImAlive",
				destination: "*",
				sender: "test-uuid-123",
			});

			jest.useRealTimers();
		});
	});

	describe("Cleanup", () => {
		test("should send IQuit message on beforeunload", () => {
			instance = new MasterSlave(monitor);

			// Get the beforeunload handler
			const beforeUnloadHandler = monitor._hookMgr.hookBind.mock.calls.find(
				(call) => call[0] === "beforeunload"
			)[1];

			// Clear previous messages
			monitor._channel.postMessage.mockClear();

			// Trigger beforeunload
			beforeUnloadHandler();

			// Should send quit message
			expect(monitor._channel.postMessage).toHaveBeenCalledWith({
				type: "IQuit",
				sender: "test-uuid-123",
				destination: "*",
			});
		});

		test("should cleanup on destroy", () => {
			jest.useFakeTimers();

			instance = new MasterSlave(monitor);

			// Destroy instance
			instance.destroy();

			// Clear any previous calls
			monitor._channel.postMessage.mockClear();

			// Advance time - should not send any more messages
			jest.advanceTimersByTime(2000);

			expect(monitor._channel.postMessage).not.toHaveBeenCalled();
			expect(monitor._channel.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));

			jest.useRealTimers();
		});
	});

	describe("Error Handling", () => {
		test("should handle missing BroadcastChannel", () => {
			// Remove BroadcastChannel
			const originalBC = global.BroadcastChannel;
			delete global.BroadcastChannel;

			const errorMonitor = {
				setMasterMonitor: jest.fn(),
				setSlaveMonitor: jest.fn(),
			};

			// Should not throw
			expect(() => {
				new MasterSlave(errorMonitor);
			}).not.toThrow();

			// Should set as master
			expect(errorMonitor.setMasterMonitor).toHaveBeenCalled();

			// Restore
			global.BroadcastChannel = originalBC;
		});

		test("should handle null channel", () => {
			const errorMonitor = {
				_channel: null,
				setMasterMonitor: jest.fn(),
				setSlaveMonitor: jest.fn(),
			};

			// Should not throw
			expect(() => {
				new MasterSlave(errorMonitor);
			}).not.toThrow();

			// Should set as master
			expect(errorMonitor.setMasterMonitor).toHaveBeenCalled();
		});

		test("should handle postMessage errors gracefully", () => {
			instance = new MasterSlave(monitor);

			// Make postMessage throw
			monitor._channel.postMessage.mockImplementation(() => {
				throw new Error("Failed to post message");
			});

			// Get message handler
			const messageHandler = monitor._channel.addEventListener.mock.calls.find(
				(call) => call[0] === "message"
			)[1];

			// Should not throw when handling messages
			expect(() => {
				messageHandler({ data: { type: "masterMonitorPing" } });
			}).not.toThrow();
		});
	});
});
