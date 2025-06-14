/**
 * Unit tests for DIContainer
 *
 * These tests demonstrate the DI container functionality
 * and serve as documentation for how to use it.
 */

import { DIContainer } from "../../scripts/infrastructure/DIContainer.js";

describe("DIContainer", () => {
	let container;

	beforeEach(() => {
		container = new DIContainer();
	});

	describe("Basic Registration and Resolution", () => {
		test("should register and resolve a simple service", () => {
			const service = { name: "TestService" };
			container.register("testService", service);

			const resolved = container.resolve("testService");
			expect(resolved).toBe(service);
		});

		test("should register and resolve a factory function", () => {
			const factory = () => ({ name: "FactoryService" });
			container.register("factoryService", factory);

			const resolved = container.resolve("factoryService");
			expect(resolved).toEqual({ name: "FactoryService" });
		});

		test("should throw error for unregistered service", () => {
			expect(() => container.resolve("nonExistent")).toThrow("Service 'nonExistent' not registered");
		});

		test("should throw error for invalid service name", () => {
			expect(() => container.register("", () => {})).toThrow("Service name must be a non-empty string");
			expect(() => container.register(null, () => {})).toThrow("Service name must be a non-empty string");
		});
	});

	describe("Singleton Behavior", () => {
		test("should return same instance for singleton services", () => {
			let callCount = 0;
			const factory = () => {
				callCount++;
				return { id: callCount };
			};

			container.register("singleton", factory, { singleton: true });

			const instance1 = container.resolve("singleton");
			const instance2 = container.resolve("singleton");

			expect(instance1).toBe(instance2);
			expect(callCount).toBe(1);
		});

		test("should return new instance for transient services", () => {
			let callCount = 0;
			const factory = () => {
				callCount++;
				return { id: callCount };
			};

			container.register("transient", factory, { singleton: false });

			const instance1 = container.resolve("transient");
			const instance2 = container.resolve("transient");

			expect(instance1).not.toBe(instance2);
			expect(instance1.id).toBe(1);
			expect(instance2.id).toBe(2);
			expect(callCount).toBe(2);
		});
	});

	describe("Dependency Injection", () => {
		test("should resolve dependencies", () => {
			container.register("logger", () => ({ log: jest.fn() }));
			container.register("database", () => ({ query: jest.fn() }));
			container.register(
				"userService",
				(logger, database) => ({
					logger,
					database,
					getUser: (id) => {
						logger.log(`Getting user ${id}`);
						return database.query(`SELECT * FROM users WHERE id = ${id}`);
					},
				}),
				{ dependencies: ["logger", "database"] }
			);

			const userService = container.resolve("userService");

			expect(userService.logger).toBeDefined();
			expect(userService.database).toBeDefined();
			expect(typeof userService.logger.log).toBe("function");
			expect(typeof userService.database.query).toBe("function");
		});

		test("should handle nested dependencies", () => {
			container.register("config", { apiUrl: "http://api.test" });
			container.register(
				"httpClient",
				(config) => ({
					get: (path) => `GET ${config.apiUrl}${path}`,
				}),
				{ dependencies: ["config"] }
			);
			container.register(
				"apiService",
				(httpClient) => ({
					fetchUser: (id) => httpClient.get(`/users/${id}`),
				}),
				{ dependencies: ["httpClient"] }
			);

			const apiService = container.resolve("apiService");
			const result = apiService.fetchUser(123);

			expect(result).toBe("GET http://api.test/users/123");
		});

		test("should throw error for circular dependencies", () => {
			container.register("serviceA", (serviceB) => ({ b: serviceB }), { dependencies: ["serviceB"] });
			container.register("serviceB", (serviceA) => ({ a: serviceA }), { dependencies: ["serviceA"] });

			// This will cause a stack overflow in a real circular dependency
			// In a production implementation, you'd want to detect and handle this
			expect(() => container.resolve("serviceA")).toThrow();
		});
	});

	describe("Utility Methods", () => {
		test("should check if service is registered", () => {
			expect(container.has("testService")).toBe(false);

			container.register("testService", () => ({}));

			expect(container.has("testService")).toBe(true);
		});

		test("should clear all registrations", () => {
			container.register("service1", () => ({}));
			container.register("service2", () => ({}));

			expect(container.has("service1")).toBe(true);
			expect(container.has("service2")).toBe(true);

			container.clear();

			expect(container.has("service1")).toBe(false);
			expect(container.has("service2")).toBe(false);
		});

		test("should create child container with parent services", () => {
			container.register("parentService", () => ({ name: "parent" }));

			const child = container.createChild();
			child.register("childService", () => ({ name: "child" }));

			// Child can resolve parent services
			expect(child.resolve("parentService")).toEqual({ name: "parent" });
			expect(child.resolve("childService")).toEqual({ name: "child" });

			// Parent cannot resolve child services
			expect(() => container.resolve("childService")).toThrow();
		});
	});

	describe("Real-world Example", () => {
		test("should work with storage adapter pattern", () => {
			// Mock storage adapter
			class MockStorageAdapter {
				constructor() {
					this.data = new Map();
				}
				async get(key) {
					return this.data.get(key);
				}
				async set(key, value) {
					this.data.set(key, value);
				}
			}

			// Mock logger
			class MockLogger {
				constructor() {
					this.logs = [];
				}
				add(message) {
					this.logs.push(message);
				}
			}

			// Register services
			container.register("storageAdapter", () => new MockStorageAdapter());
			container.register("logger", () => new MockLogger());
			container.register(
				"settingsManager",
				(storage, logger) => ({
					storage,
					logger,
					async getSetting(key) {
						logger.add(`Getting setting: ${key}`);
						return await storage.get(key);
					},
					async setSetting(key, value) {
						logger.add(`Setting ${key} = ${value}`);
						await storage.set(key, value);
					},
				}),
				{ dependencies: ["storageAdapter", "logger"] }
			);

			// Use the service
			const settings = container.resolve("settingsManager");
			const logger = container.resolve("logger");

			// Test the functionality
			return settings
				.setSetting("theme", "dark")
				.then(() => {
					return settings.getSetting("theme");
				})
				.then((theme) => {
					expect(theme).toBe("dark");
					expect(logger.logs).toContain("Setting theme = dark");
					expect(logger.logs).toContain("Getting setting: theme");
				});
		});
	});
});
