/**
 * Unit tests for StorageAdapter implementations
 */

import { StorageAdapter, MemoryStorageAdapter } from "../../scripts/infrastructure/StorageAdapter.js";

describe("StorageAdapter", () => {
	describe("Base StorageAdapter", () => {
		test("should throw error for unimplemented methods", async () => {
			const adapter = new StorageAdapter();

			await expect(adapter.get("key")).rejects.toThrow("get() must be implemented by subclass");
			await expect(adapter.getMultiple(["key1", "key2"])).rejects.toThrow(
				"getMultiple() must be implemented by subclass"
			);
			await expect(adapter.set("key", "value")).rejects.toThrow("set() must be implemented by subclass");
			await expect(adapter.setMultiple({ key: "value" })).rejects.toThrow(
				"setMultiple() must be implemented by subclass"
			);
			await expect(adapter.remove("key")).rejects.toThrow("remove() must be implemented by subclass");
			await expect(adapter.clear()).rejects.toThrow("clear() must be implemented by subclass");
		});
	});

	describe("MemoryStorageAdapter", () => {
		let adapter;

		beforeEach(() => {
			adapter = new MemoryStorageAdapter();
		});

		describe("get/set operations", () => {
			test("should store and retrieve a value", async () => {
				await adapter.set("testKey", "testValue");
				const value = await adapter.get("testKey");
				expect(value).toBe("testValue");
			});

			test("should return undefined for non-existent key", async () => {
				const value = await adapter.get("nonExistent");
				expect(value).toBeUndefined();
			});

			test("should overwrite existing value", async () => {
				await adapter.set("key", "value1");
				await adapter.set("key", "value2");
				const value = await adapter.get("key");
				expect(value).toBe("value2");
			});

			test("should handle complex objects", async () => {
				const complexObject = {
					settings: {
						theme: "dark",
						notifications: true,
						nested: {
							deep: "value",
						},
					},
					array: [1, 2, 3],
				};

				await adapter.set("complex", complexObject);
				const retrieved = await adapter.get("complex");
				expect(retrieved).toEqual(complexObject);
			});
		});

		describe("getMultiple/setMultiple operations", () => {
			test("should get multiple values", async () => {
				await adapter.set("key1", "value1");
				await adapter.set("key2", "value2");
				await adapter.set("key3", "value3");

				const values = await adapter.getMultiple(["key1", "key3"]);
				expect(values).toEqual({
					key1: "value1",
					key3: "value3",
				});
			});

			test("should only return existing keys", async () => {
				await adapter.set("exists", "value");

				const values = await adapter.getMultiple(["exists", "notExists"]);
				expect(values).toEqual({
					exists: "value",
				});
				expect(values.notExists).toBeUndefined();
			});

			test("should set multiple values", async () => {
				await adapter.setMultiple({
					key1: "value1",
					key2: "value2",
					key3: "value3",
				});

				const value1 = await adapter.get("key1");
				const value2 = await adapter.get("key2");
				const value3 = await adapter.get("key3");

				expect(value1).toBe("value1");
				expect(value2).toBe("value2");
				expect(value3).toBe("value3");
			});
		});

		describe("remove operations", () => {
			test("should remove a value", async () => {
				await adapter.set("toRemove", "value");
				expect(await adapter.get("toRemove")).toBe("value");

				await adapter.remove("toRemove");
				expect(await adapter.get("toRemove")).toBeUndefined();
			});

			test("should handle removing non-existent key", async () => {
				// Should not throw
				await expect(adapter.remove("nonExistent")).resolves.toBeUndefined();
			});
		});

		describe("clear operation", () => {
			test("should clear all values", async () => {
				await adapter.setMultiple({
					key1: "value1",
					key2: "value2",
					key3: "value3",
				});

				await adapter.clear();

				expect(await adapter.get("key1")).toBeUndefined();
				expect(await adapter.get("key2")).toBeUndefined();
				expect(await adapter.get("key3")).toBeUndefined();
			});
		});

		describe("Edge cases", () => {
			test("should handle null and undefined values", async () => {
				await adapter.set("nullValue", null);
				await adapter.set("undefinedValue", undefined);

				expect(await adapter.get("nullValue")).toBeNull();
				expect(await adapter.get("undefinedValue")).toBeUndefined();
			});

			test("should handle empty strings and arrays", async () => {
				await adapter.set("emptyString", "");
				await adapter.set("emptyArray", []);

				expect(await adapter.get("emptyString")).toBe("");
				expect(await adapter.get("emptyArray")).toEqual([]);
			});

			test("should maintain reference equality for objects", async () => {
				const obj = { test: "value" };
				await adapter.set("object", obj);

				const retrieved1 = await adapter.get("object");
				const retrieved2 = await adapter.get("object");

				// In memory adapter, same reference should be returned
				expect(retrieved1).toBe(retrieved2);
				expect(retrieved1).toBe(obj);
			});
		});
	});

	// Note: ChromeStorageAdapter tests would require mocking chrome.storage API
	// Example structure for ChromeStorageAdapter tests:
	describe("ChromeStorageAdapter (mock example)", () => {
		test("should be tested with chrome.storage mock", () => {
			// This is a placeholder to show where ChromeStorageAdapter tests would go
			// In a real test environment, you would mock chrome.storage.local
			expect(true).toBe(true);
		});
	});
});
