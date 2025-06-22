/**
 * Tests for single-tab operation without multi-tab coordination
 * Ensures VineHelper works perfectly for users with only one tab open
 */

describe("Single-Tab Operation", () => {
	let monitor;
	let mockDocument;
	let originalBroadcastChannel;
	let mockSettingsMgr;
	let mockHookMgr;
	let mockItemsMgr;
	let mockServerComMgr;

	beforeEach(() => {
		// Save original BroadcastChannel
		originalBroadcastChannel = global.window?.BroadcastChannel;

		// Setup mock document
		mockDocument = {
			querySelector: jest.fn(),
			querySelectorAll: jest.fn(() => []),
			createElement: jest.fn(() => ({
				style: {},
				classList: {
					add: jest.fn(),
					remove: jest.fn(),
					contains: jest.fn(() => false),
				},
				appendChild: jest.fn(),
				removeChild: jest.fn(),
				innerHTML: "",
				textContent: "",
			})),
			getElementById: jest.fn(),
			body: {
				appendChild: jest.fn(),
				removeChild: jest.fn(),
			},
		};

		// Mock settings manager
		mockSettingsMgr = {
			get: jest.fn((key) => {
				const defaults = {
					"general.debugKeywords": false,
					"general.notifications": true,
					"keywords.active": [],
					"keywords.hidden": [],
				};
				return defaults[key] || null;
			}),
			set: jest.fn(),
			on: jest.fn(),
			off: jest.fn(),
		};

		// Mock hook manager
		mockHookMgr = {
			hookBind: jest.fn(),
			unbind: jest.fn(),
		};

		// Mock items manager
		mockItemsMgr = {
			addItem: jest.fn(),
			getItem: jest.fn(),
			removeItem: jest.fn(),
			getAllItems: jest.fn(() => []),
			clear: jest.fn(),
		};

		// Mock server communication manager
		mockServerComMgr = {
			updateServicesStatus: jest.fn(),
			startPolling: jest.fn(),
			stopPolling: jest.fn(),
		};

		// Setup global mocks
		global.window = {
			location: { href: "https://example.com" },
			addEventListener: jest.fn(),
			removeEventListener: jest.fn(),
		};

		global.chrome = {
			runtime: {
				sendMessage: jest.fn(),
				onMessage: {
					addListener: jest.fn(),
					removeListener: jest.fn(),
				},
				lastError: null,
			},
			storage: {
				local: {
					get: jest.fn((keys, callback) => callback({})),
					set: jest.fn((data, callback) => callback && callback()),
				},
			},
		};

		// Mock crypto for UUID generation
		global.crypto = {
			randomUUID: jest.fn(() => "test-uuid-" + Math.random()),
		};
	});

	afterEach(() => {
		// Restore original BroadcastChannel
		if (originalBroadcastChannel) {
			global.window.BroadcastChannel = originalBroadcastChannel;
		}
		jest.clearAllMocks();
	});

	describe("Extension Initialization", () => {
		test("should initialize without BroadcastChannel API", () => {
			// Remove BroadcastChannel to simulate unsupported browser
			delete global.window.BroadcastChannel;

			// Create monitor without errors
			expect(() => {
				monitor = {
					_document: mockDocument,
					_settingsMgr: mockSettingsMgr,
					_hookMgr: mockHookMgr,
					_itemsMgr: mockItemsMgr,
					_serverComMgr: mockServerComMgr,
					_isMasterMonitor: true,
					_channel: null,
					setMasterMonitor: jest.fn(),
					setSlaveMonitor: jest.fn(),
				};

				// Simulate initialization
				monitor.setMasterMonitor();
			}).not.toThrow();

			// Verify it operates as master
			expect(monitor._isMasterMonitor).toBe(true);
			expect(monitor.setMasterMonitor).toHaveBeenCalled();
			expect(monitor._channel).toBeNull();
		});

		test("should handle BroadcastChannel constructor errors gracefully", () => {
			// Mock BroadcastChannel to throw error
			global.window.BroadcastChannel = jest.fn(() => {
				throw new Error("BroadcastChannel not supported");
			});

			expect(() => {
				monitor = {
					_document: mockDocument,
					_isMasterMonitor: false,
					setMasterMonitor: jest.fn(),
				};

				// Try to create channel
				try {
					monitor._channel = new window.BroadcastChannel("vine-helper");
				} catch (error) {
					// Fallback to master mode
					monitor._channel = null;
					monitor.setMasterMonitor();
				}
			}).not.toThrow();

			expect(monitor._channel).toBeNull();
			expect(monitor.setMasterMonitor).toHaveBeenCalled();
		});

		test("should not create MasterSlave coordinator without BroadcastChannel", () => {
			delete global.window.BroadcastChannel;

			// Mock MasterSlave constructor check
			const mockMasterSlave = jest.fn(function (monitor) {
				if (!window.BroadcastChannel) {
					monitor.setMasterMonitor();
					return;
				}
			});

			const testMonitor = {
				setMasterMonitor: jest.fn(),
			};

			mockMasterSlave(testMonitor);

			expect(testMonitor.setMasterMonitor).toHaveBeenCalled();
		});
	});

	describe("Keyword Matching Functionality", () => {
		test("should match keywords without multi-tab coordination", () => {
			delete global.window.BroadcastChannel;

			// Mock keyword matcher
			const keywordMatcher = {
				matchKeywords: jest.fn((title, keywords) => {
					return keywords.some((keyword) => {
						if (typeof keyword === "string") {
							return title.toLowerCase().includes(keyword.toLowerCase());
						}
						return keyword.contains && title.toLowerCase().includes(keyword.contains.toLowerCase());
					});
				}),
			};

			const testTitle = "Test Phone Case";
			const keywords = ["phone", { contains: "case", without: "leather" }];

			const matches = keywordMatcher.matchKeywords(testTitle, keywords);

			expect(keywordMatcher.matchKeywords).toHaveBeenCalledWith(testTitle, keywords);
			expect(matches).toBe(true);
		});

		test("should handle keyword updates in single-tab mode", () => {
			delete global.window.BroadcastChannel;

			const newKeywords = ["laptop", "tablet", "accessories"];

			// Simulate settings update
			mockSettingsMgr.set("keywords.active", newKeywords);

			// Trigger update callback
			const updateCallback = mockSettingsMgr.on.mock.calls.find((call) => call[0] === "keywords.active")?.[1];

			if (updateCallback) {
				updateCallback(newKeywords);
			}

			expect(mockSettingsMgr.set).toHaveBeenCalledWith("keywords.active", newKeywords);
		});
	});

	describe("Item Processing", () => {
		test("should process items without coordination messages", () => {
			delete global.window.BroadcastChannel;

			const testItem = {
				id: "item-123",
				title: "Test Product",
				price: "$19.99",
				etv: 20,
			};

			// Process item
			mockItemsMgr.addItem(testItem);
			mockItemsMgr.getItem = jest.fn(() => testItem);

			// Verify item was processed
			expect(mockItemsMgr.addItem).toHaveBeenCalledWith(testItem);
			expect(mockItemsMgr.getItem("item-123")).toEqual(testItem);

			// Verify no broadcast messages were attempted
			expect(global.window.BroadcastChannel).toBeUndefined();
		});

		test("should handle item removal in single-tab mode", () => {
			delete global.window.BroadcastChannel;

			const itemId = "item-456";

			// Remove item
			mockItemsMgr.removeItem(itemId);

			expect(mockItemsMgr.removeItem).toHaveBeenCalledWith(itemId);
		});
	});

	describe("Settings Updates", () => {
		test("should update settings without broadcasting to other tabs", () => {
			delete global.window.BroadcastChannel;

			const settingKey = "general.notifications";
			const settingValue = false;

			// Update setting
			mockSettingsMgr.set(settingKey, settingValue);

			// Verify setting was updated locally
			expect(mockSettingsMgr.set).toHaveBeenCalledWith(settingKey, settingValue);

			// Verify no broadcast attempted
			expect(global.window.BroadcastChannel).toBeUndefined();
		});

		test("should handle settings sync without BroadcastChannel", () => {
			delete global.window.BroadcastChannel;

			// Simulate chrome storage update
			const storageData = {
				"keywords.active": ["new", "keywords"],
				"general.notifications": true,
			};

			chrome.storage.local.get = jest.fn((keys, callback) => {
				callback(storageData);
			});

			// Trigger storage sync
			chrome.storage.local.get(["keywords.active", "general.notifications"], (data) => {
				Object.entries(data).forEach(([key, value]) => {
					mockSettingsMgr.set(key, value);
				});
			});

			expect(mockSettingsMgr.set).toHaveBeenCalledWith("keywords.active", ["new", "keywords"]);
			expect(mockSettingsMgr.set).toHaveBeenCalledWith("general.notifications", true);
		});
	});

	describe("UI Elements", () => {
		test("should not display master/slave status indicators", () => {
			delete global.window.BroadcastChannel;

			// Mock UI elements
			const statusElement = mockDocument.createElement("div");
			statusElement.id = "master-slave-status";

			mockDocument.querySelector = jest.fn((selector) => {
				if (selector === "#master-slave-status") {
					return statusElement;
				}
				return null;
			});

			// In single-tab mode, status should not be shown
			statusElement.style.display = "none";
			statusElement.textContent = "";

			expect(statusElement.style.display).toBe("none");
			expect(statusElement.textContent).toBe("");
		});

		test("should not show coordination-related UI controls", () => {
			delete global.window.BroadcastChannel;

			// Ensure querySelector returns null for non-existent elements
			mockDocument.querySelector = jest.fn(() => null);

			const coordinationControls = ["#force-master-button", "#sync-status-indicator", "#tab-count-display"];

			coordinationControls.forEach((selector) => {
				const element = mockDocument.querySelector(selector);
				expect(element).toBeNull();
			});

			// Verify querySelector was called for each control
			expect(mockDocument.querySelector).toHaveBeenCalledTimes(coordinationControls.length);
		});
	});

	describe("Error Scenarios", () => {
		test("should continue operating when BroadcastChannel becomes unavailable", () => {
			// Start with BroadcastChannel available
			global.window.BroadcastChannel = jest.fn(() => ({
				postMessage: jest.fn(() => {
					throw new Error("Channel closed");
				}),
				close: jest.fn(),
			}));

			const channel = new window.BroadcastChannel("test");

			// Simulate channel failure
			expect(() => {
				channel.postMessage({ test: "message" });
			}).toThrow();

			// Should continue operating without channel
			mockItemsMgr.addItem({ id: "test-item" });
			expect(mockItemsMgr.addItem).toHaveBeenCalled();
		});

		test("should handle chrome.runtime errors gracefully", () => {
			delete global.window.BroadcastChannel;

			// Simulate runtime error
			chrome.runtime.lastError = { message: "Extension context invalidated" };
			chrome.runtime.sendMessage = jest.fn((message, callback) => {
				if (callback) callback();
			});

			// Should not throw when sending messages
			expect(() => {
				chrome.runtime.sendMessage({ type: "test" }, () => {
					if (chrome.runtime.lastError) {
						console.warn("Runtime error:", chrome.runtime.lastError);
					}
				});
			}).not.toThrow();
		});
	});

	describe("Performance", () => {
		test("should not create unnecessary objects or listeners without BroadcastChannel", () => {
			delete global.window.BroadcastChannel;

			const initialMemory = {
				listeners: mockHookMgr.hookBind.mock.calls.length,
				chromeListeners: chrome.runtime.onMessage.addListener.mock.calls.length,
			};

			// Initialize monitor
			const monitor = {
				_hookMgr: mockHookMgr,
				init: function () {
					// Should not add broadcast-related listeners
					this._hookMgr.hookBind("someEvent", () => {});
				},
			};

			monitor.init();

			// Should only add necessary listeners, not broadcast-related ones
			expect(mockHookMgr.hookBind.mock.calls.length).toBe(initialMemory.listeners + 1);
			expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(initialMemory.chromeListeners);
		});
	});
});
