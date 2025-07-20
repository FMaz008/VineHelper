/**
 * Tests for ErrorAlertManager
 *
 * This demonstrates how dependency injection makes testing easier.
 * We can provide a mock document object to test the service without a real DOM.
 */

import { ErrorAlertManager } from "../../../scripts/notifications-monitor/services/ErrorAlertManager.js";

describe("ErrorAlertManager", () => {
	let errorAlertManager;
	let mockDocument;
	let mockObserver;
	let observerCallback;
	let createdElements;

	beforeEach(() => {
		// Mock Node constants for Node.js environment
		global.Node = {
			ELEMENT_NODE: 1,
			TEXT_NODE: 3,
		};

		// Mock window object
		global.window = {
			scrollY: 0,
			scrollTo: jest.fn(),
		};

		// Track created elements for better testing
		createdElements = {
			styles: [],
			buttons: [],
		};

		// Create a more realistic mock document
		mockDocument = {
			createElement: jest.fn((tagName) => {
				const element = {
					tagName,
					className: "",
					innerHTML: "",
					title: "",
					textContent: "",
					style: {},
					setAttribute: jest.fn(),
					addEventListener: jest.fn(),
					appendChild: jest.fn(),
					remove: jest.fn(),
					parentElement: null,
				};

				if (tagName === "style") {
					createdElements.styles.push(element);
				} else if (tagName === "button") {
					createdElements.buttons.push(element);
				}

				return element;
			}),
			head: {
				appendChild: jest.fn(),
			},
			body: {},
			querySelectorAll: jest.fn(() => []),
			getElementById: jest.fn(() => null),
		};

		// Mock MutationObserver with ability to trigger mutations
		mockObserver = {
			observe: jest.fn(),
			disconnect: jest.fn(),
		};
		global.MutationObserver = jest.fn((callback) => {
			observerCallback = callback;
			return mockObserver;
		});

		// Create instance with mock document
		errorAlertManager = new ErrorAlertManager(mockDocument);
	});

	afterEach(() => {
		jest.clearAllMocks();
		delete global.Node;
		delete global.window;
	});

	describe("initialize", () => {
		it("should set up styles when initialized", () => {
			errorAlertManager.initialize();

			expect(mockDocument.createElement).toHaveBeenCalledWith("style");
			expect(mockDocument.head.appendChild).toHaveBeenCalled();

			// Verify style content includes necessary CSS
			const styleElement = createdElements.styles[0];
			expect(styleElement.textContent).toContain(".vh-alert-close-btn");
			expect(styleElement.textContent).toContain("position: absolute");
			expect(styleElement.textContent).toContain("cursor: pointer");
		});

		it("should only initialize once", () => {
			errorAlertManager.initialize();
			const firstStyleCount = createdElements.styles.length;

			errorAlertManager.initialize();

			// Should not create additional styles
			expect(createdElements.styles.length).toBe(firstStyleCount);
		});

		it("should set up mutation observer with correct config", () => {
			errorAlertManager.initialize();

			expect(global.MutationObserver).toHaveBeenCalled();
			expect(mockObserver.observe).toHaveBeenCalledWith(mockDocument.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["class"],
			});
		});

		it("should process existing alerts and add close buttons", () => {
			const mockContainer = {
				appendChild: jest.fn(),
			};
			const mockAlert = {
				classList: {
					contains: jest.fn((className) => {
						return ["a-box", "a-alert", "a-alert-error"].includes(className);
					}),
				},
				appendChild: jest.fn(),
				querySelector: jest.fn(() => mockContainer),
			};
			mockDocument.querySelectorAll.mockReturnValue([mockAlert]);

			errorAlertManager.initialize();

			// Should query for error alerts
			expect(mockDocument.querySelectorAll).toHaveBeenCalledWith(".a-box.a-alert.a-alert-error:not(.aok-hidden)");

			// Should create a button
			expect(createdElements.buttons.length).toBe(1);
			const button = createdElements.buttons[0];
			expect(button.className).toBe("vh-alert-close-btn");
			expect(button.innerHTML).toBe("×");
			expect(button.title).toBe("Close this alert");

			// Should add button to container
			expect(mockContainer.appendChild).toHaveBeenCalledWith(button);
		});

		it("should handle alerts without containers gracefully", () => {
			const mockAlert = {
				classList: {
					contains: jest.fn(() => true),
				},
				appendChild: jest.fn(),
				querySelector: jest.fn(() => null), // No container found
			};
			mockDocument.querySelectorAll.mockReturnValue([mockAlert]);

			errorAlertManager.initialize();

			// Should still create button but add directly to alert
			expect(createdElements.buttons.length).toBe(1);
			expect(mockAlert.appendChild).toHaveBeenCalledWith(createdElements.buttons[0]);
		});
	});

	describe("close button functionality", () => {
		it("should hide alert when close button is clicked", () => {
			const mockAlert = {
				classList: {
					contains: jest.fn(() => true),
					add: jest.fn(),
				},
				appendChild: jest.fn(),
				querySelector: jest.fn(() => ({ appendChild: jest.fn() })),
			};
			mockDocument.querySelectorAll.mockReturnValue([mockAlert]);

			errorAlertManager.initialize();

			// Get the click handler that was registered
			const button = createdElements.buttons[0];
			const clickHandler = button.addEventListener.mock.calls.find((call) => call[0] === "click")[1];

			// Simulate click with event object
			const mockEvent = {
				preventDefault: jest.fn(),
				stopPropagation: jest.fn(),
			};
			clickHandler(mockEvent);

			// Event methods should be called
			expect(mockEvent.preventDefault).toHaveBeenCalled();
			expect(mockEvent.stopPropagation).toHaveBeenCalled();

			// Alert should be hidden by adding aok-hidden class
			expect(mockAlert.classList.add).toHaveBeenCalledWith("aok-hidden");
		});

		it("should not add duplicate buttons to the same alert", () => {
			const mockAlert = {
				classList: {
					contains: jest.fn(() => true),
				},
				appendChild: jest.fn(),
				querySelector: jest.fn(() => ({ appendChild: jest.fn() })),
			};
			mockDocument.querySelectorAll.mockReturnValue([mockAlert]);

			errorAlertManager.initialize();

			// Process the same alert again through mutation observer
			observerCallback([
				{
					type: "childList",
					addedNodes: [mockAlert],
				},
			]);

			// Should still only have one button
			expect(createdElements.buttons.length).toBe(1);
		});
	});

	describe("mutation observer", () => {
		beforeEach(() => {
			errorAlertManager.initialize();
		});

		it("should detect new error alerts added to DOM", () => {
			const mockAlert = {
				nodeType: Node.ELEMENT_NODE,
				classList: {
					contains: jest.fn((className) => {
						return ["a-box", "a-alert", "a-alert-error"].includes(className);
					}),
				},
				appendChild: jest.fn(),
				querySelector: jest.fn(() => ({ appendChild: jest.fn() })),
				querySelectorAll: jest.fn(() => []),
			};

			// Simulate mutation
			observerCallback([
				{
					type: "childList",
					addedNodes: [mockAlert],
				},
			]);

			// Should create a button for the new alert
			expect(createdElements.buttons.length).toBe(1);
		});

		it("should detect alerts becoming visible via class change", () => {
			const mockAlert = {
				classList: {
					contains: jest.fn((className) => {
						if (className === "aok-hidden") return false;
						return ["a-box", "a-alert", "a-alert-error"].includes(className);
					}),
				},
				appendChild: jest.fn(),
				querySelector: jest.fn(() => ({ appendChild: jest.fn() })),
			};

			// Simulate class attribute change
			observerCallback([
				{
					type: "attributes",
					attributeName: "class",
					target: mockAlert,
				},
			]);

			// Should create a button for the now-visible alert
			expect(createdElements.buttons.length).toBe(1);
		});

		it("should check nested elements for alerts", () => {
			const mockAlert = {
				classList: {
					contains: jest.fn(() => true),
				},
				appendChild: jest.fn(),
				querySelector: jest.fn(() => ({ appendChild: jest.fn() })),
			};

			const mockContainer = {
				nodeType: Node.ELEMENT_NODE,
				classList: { contains: jest.fn(() => false) },
				querySelectorAll: jest.fn(() => [mockAlert]),
			};

			// Simulate adding a container with alerts inside
			observerCallback([
				{
					type: "childList",
					addedNodes: [mockContainer],
				},
			]);

			// Should find and process the nested alert
			expect(mockContainer.querySelectorAll).toHaveBeenCalledWith(
				".a-box.a-alert.a-alert-error:not(.aok-hidden)"
			);
			expect(createdElements.buttons.length).toBe(1);
		});

		it("should ignore non-element nodes", () => {
			const textNode = {
				nodeType: Node.TEXT_NODE,
			};

			// Simulate mutation with text node
			observerCallback([
				{
					type: "childList",
					addedNodes: [textNode],
				},
			]);

			// Should not create any buttons
			expect(createdElements.buttons.length).toBe(0);
		});

		it("should ignore hidden alerts", () => {
			const mockAlert = {
				classList: {
					contains: jest.fn((className) => {
						if (className === "aok-hidden") return true;
						return ["a-box", "a-alert", "a-alert-error"].includes(className);
					}),
				},
			};

			// Simulate class change on hidden alert
			observerCallback([
				{
					type: "attributes",
					attributeName: "class",
					target: mockAlert,
				},
			]);

			// Should not create button for hidden alert
			expect(createdElements.buttons.length).toBe(0);
		});
	});

	describe("destroy", () => {
		it("should disconnect observer when destroyed", () => {
			errorAlertManager.initialize();
			errorAlertManager.destroy();

			expect(mockObserver.disconnect).toHaveBeenCalled();
		});

		it("should handle destroy before initialize", () => {
			// Should not throw
			expect(() => errorAlertManager.destroy()).not.toThrow();
		});
	});
});

/**
 * Integration tests with the DI container
 */
describe("ErrorAlertManager with DI Container", () => {
	let container;
	let mockDocument;

	beforeEach(async () => {
		// Dynamically import to avoid module loading issues
		const { DIContainer } = await import("../../../scripts/infrastructure/DIContainer.js");
		container = new DIContainer();

		// Create a mock document for tests
		mockDocument = {
			createElement: jest.fn(() => ({
				textContent: "",
				addEventListener: jest.fn(),
				setAttribute: jest.fn(),
			})),
			head: { appendChild: jest.fn() },
			body: {},
			querySelectorAll: jest.fn(() => []),
			getElementById: jest.fn(() => null),
		};

		// Mock MutationObserver for DI tests
		global.MutationObserver = jest.fn(() => ({
			observe: jest.fn(),
			disconnect: jest.fn(),
		}));
	});

	it("should be resolvable from container as singleton", () => {
		// Register the service with mock document
		container.register("errorAlertManager", () => new ErrorAlertManager(mockDocument), {
			singleton: true,
		});

		// Resolve multiple times
		const manager1 = container.resolve("errorAlertManager");
		const manager2 = container.resolve("errorAlertManager");

		// Should be the same instance
		expect(manager1).toBeInstanceOf(ErrorAlertManager);
		expect(manager1).toBe(manager2);
	});

	it("should work with custom document dependency", () => {
		// Register with custom document
		container.register("document", mockDocument);
		container.register("errorAlertManager", (doc) => new ErrorAlertManager(doc), {
			singleton: true,
			dependencies: ["document"],
		});

		const manager = container.resolve("errorAlertManager");
		expect(manager).toBeInstanceOf(ErrorAlertManager);

		// Initialize and verify it uses the mock document
		manager.initialize();
		expect(mockDocument.createElement).toHaveBeenCalledWith("style");
	});

	it("should support child containers for scoped instances", () => {
		// Parent container with shared document
		const sharedDocument = {
			createElement: jest.fn(() => ({ textContent: "" })),
			head: { appendChild: jest.fn() },
			body: {},
			querySelectorAll: jest.fn(() => []),
			getElementById: jest.fn(() => null),
		};

		container.register("document", sharedDocument);

		// Create child container for a specific scope
		const childContainer = container.createChild();

		// Register ErrorAlertManager only in child
		childContainer.register("errorAlertManager", (doc) => new ErrorAlertManager(doc), {
			singleton: true,
			dependencies: ["document"],
		});

		// Child can resolve the service
		const manager = childContainer.resolve("errorAlertManager");
		expect(manager).toBeInstanceOf(ErrorAlertManager);

		// Parent cannot resolve child's service
		expect(() => container.resolve("errorAlertManager")).toThrow("Service 'errorAlertManager' not registered");

		// But child uses parent's document
		expect(childContainer.resolve("document")).toBe(sharedDocument);
	});

	it("should integrate with NotificationMonitorV3 pattern", () => {
		// This simulates how NotificationMonitorV3 uses a local container
		class MockNotificationMonitor {
			#container;

			constructor() {
				this.#container = new container.constructor(); // Use same DIContainer class
				this.#registerServices();
				this.errorAlertManager = this.#container.resolve("errorAlertManager");
			}

			#registerServices() {
				// Register with mock document to avoid window reference
				this.#container.register("errorAlertManager", () => new ErrorAlertManager(mockDocument), {
					singleton: true,
				});
			}
		}

		const monitor = new MockNotificationMonitor();
		expect(monitor.errorAlertManager).toBeInstanceOf(ErrorAlertManager);
	});
});
