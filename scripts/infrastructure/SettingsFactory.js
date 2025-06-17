/**
 * Settings Factory
 *
 * This factory provides a bridge between the old singleton pattern
 * and the new DI-based approach. It allows gradual migration while
 * maintaining backward compatibility.
 */

import { SettingsMgrDI } from "/scripts/core/services/SettingsMgrDI.js";
import { ChromeStorageAdapter } from "/scripts/infrastructure/StorageAdapter.js";
import { container } from "/scripts/infrastructure/DIContainer.js";

// Register the storage adapter in the DI container
container.register("storageAdapter", () => new ChromeStorageAdapter("local"), {
	singleton: true,
});

// Register the logger if needed (using existing Logger)
container.register(
	"logger",
	() => {
		// Dynamic import to avoid circular dependencies
		return import("/scripts/core/utils/Logger.js").then((module) => new module.Logger());
	},
	{
		singleton: true,
	}
);

// Register the SettingsMgrDI with its dependencies
container.register(
	"settingsManager",
	(storageAdapter) => {
		return new SettingsMgrDI(storageAdapter);
	},
	{
		singleton: true,
		dependencies: ["storageAdapter"],
	}
);

/**
 * Factory function to get the settings manager instance
 * This maintains backward compatibility with code expecting a singleton
 */
export function getSettingsManager() {
	return container.resolve("settingsManager");
}

/**
 * Create a new instance for testing or specific use cases
 * @param {StorageAdapter} storageAdapter - Storage adapter to use
 * @param {Logger} logger - Logger instance
 */
export function createSettingsManager(storageAdapter, logger) {
	return new SettingsMgrDI(storageAdapter, logger);
}
