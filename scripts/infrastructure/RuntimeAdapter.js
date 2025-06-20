/**
 * RuntimeAdapter - Abstraction for Chrome runtime API
 *
 * This adapter provides a testable interface for chrome.runtime API calls,
 * allowing for easy mocking in tests and consistent API across contexts.
 */

export class RuntimeAdapter {
	#isServiceWorker;

	constructor() {
		// Detect if we're running in a service worker context
		this.#isServiceWorker =
			typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getBackgroundPage === "undefined";
	}

	/**
	 * Send a message to the extension runtime
	 * @param {Object} message - The message to send
	 * @returns {Promise} Response from the message handler
	 */
	async sendMessage(message) {
		if (typeof chrome === "undefined" || !chrome.runtime) {
			throw new Error("Chrome runtime API not available");
		}

		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(message, (response) => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve(response);
				}
			});
		});
	}

	/**
	 * Add a message listener
	 * @param {Function} callback - The callback function
	 * @returns {Function} Function to remove the listener
	 */
	onMessage(callback) {
		if (typeof chrome === "undefined" || !chrome.runtime) {
			console.warn("Chrome runtime API not available");
			return () => {}; // Return no-op function
		}

		const listener = (message, sender, sendResponse) => {
			// Wrap the callback to handle async responses properly
			const result = callback(message, sender, sendResponse);
			// If the callback returns true, it will respond asynchronously
			return result === true;
		};

		chrome.runtime.onMessage.addListener(listener);

		// Return function to remove listener
		return () => {
			chrome.runtime.onMessage.removeListener(listener);
		};
	}

	/**
	 * Get the extension's background page (only available in extension pages)
	 * @returns {Promise<Window|null>}
	 */
	async getBackgroundPage() {
		if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getBackgroundPage) {
			return null;
		}

		return new Promise((resolve) => {
			chrome.runtime.getBackgroundPage((backgroundPage) => {
				resolve(backgroundPage || null);
			});
		});
	}

	/**
	 * Check if we're in a service worker context
	 * @returns {boolean}
	 */
	isServiceWorker() {
		return this.#isServiceWorker;
	}

	/**
	 * Get the extension URL
	 * @param {string} path - The path relative to extension root
	 * @returns {string}
	 */
	getURL(path) {
		if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
			return path;
		}
		return chrome.runtime.getURL(path);
	}

	/**
	 * Get the extension manifest
	 * @returns {Object}
	 */
	getManifest() {
		if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getManifest) {
			return {};
		}
		return chrome.runtime.getManifest();
	}
}

/**
 * Mock implementation for testing
 */
export class MockRuntimeAdapter extends RuntimeAdapter {
	#messageHandlers = [];
	#messages = [];
	#responses = new Map();

	constructor() {
		super();
	}

	/**
	 * Set a mock response for a specific message
	 * @param {Object} message - The message to match
	 * @param {*} response - The response to return
	 */
	setMockResponse(message, response) {
		const key = JSON.stringify(message);
		this.#responses.set(key, response);
	}

	async sendMessage(message) {
		this.#messages.push(message);

		// Check if we have a mock response
		const key = JSON.stringify(message);
		if (this.#responses.has(key)) {
			return this.#responses.get(key);
		}

		// Simulate message being handled by registered handlers
		for (const handler of this.#messageHandlers) {
			let response;
			const sendResponse = (resp) => {
				response = resp;
			};
			const result = handler(message, { id: "mock-sender" }, sendResponse);

			if (result === true || response !== undefined) {
				return response;
			}
		}

		return null;
	}

	onMessage(callback) {
		this.#messageHandlers.push(callback);
		return () => {
			const index = this.#messageHandlers.indexOf(callback);
			if (index > -1) {
				this.#messageHandlers.splice(index, 1);
			}
		};
	}

	async getBackgroundPage() {
		return null; // Mock always returns null
	}

	isServiceWorker() {
		return false; // Mock is never a service worker
	}

	getURL(path) {
		return `chrome-extension://mock-extension-id/${path}`;
	}

	getManifest() {
		return {
			manifest_version: 3,
			name: "Mock Extension",
			version: "1.0.0",
		};
	}

	/**
	 * Get all messages that were sent
	 * @returns {Array}
	 */
	getSentMessages() {
		return [...this.#messages];
	}

	/**
	 * Clear all mock data
	 */
	clearMocks() {
		this.#messages = [];
		this.#responses.clear();
	}

	/**
	 * Simulate receiving a message
	 * @param {Object} message - The message to simulate
	 * @param {Object} sender - The sender info
	 */
	simulateMessage(message, sender = { id: "mock-sender" }) {
		const responses = [];

		for (const handler of this.#messageHandlers) {
			const sendResponse = (response) => {
				responses.push(response);
			};

			handler(message, sender, sendResponse);
		}

		return responses;
	}
}

/**
 * Register the RuntimeAdapter with the DI container
 */
export function registerRuntimeAdapter(container) {
	container.register(
		"runtimeAdapter",
		() => {
			// Use mock adapter in test environment
			if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
				return new MockRuntimeAdapter();
			}
			return new RuntimeAdapter();
		},
		{
			singleton: true,
		}
	);
}
