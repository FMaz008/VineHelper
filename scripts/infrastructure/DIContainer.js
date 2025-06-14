/**
 * Simple Dependency Injection Container for VineHelper
 *
 * This container provides a lightweight DI solution that:
 * - Supports singleton and transient lifetimes
 * - Allows factory functions for lazy instantiation
 * - Provides clear error messages for missing dependencies
 * - Maintains backward compatibility with existing code
 */
class DIContainer {
	#services;
	#singletons;

	constructor() {
		this.#services = new Map();
		this.#singletons = new Map();
	}

	/**
	 * Register a service with the container
	 * @param {string} name - Service identifier
	 * @param {Function|Object} factory - Factory function or instance
	 * @param {Object} options - Registration options
	 * @param {boolean} options.singleton - Whether to create only one instance
	 * @param {Array<string>} options.dependencies - Array of dependency names
	 */
	register(name, factory, options = {}) {
		if (!name || typeof name !== "string") {
			throw new Error("Service name must be a non-empty string");
		}

		const { singleton = true, dependencies = [] } = options;

		this.#services.set(name, {
			factory,
			singleton,
			dependencies,
			isInstance: typeof factory !== "function",
		});
	}

	/**
	 * Resolve a service from the container
	 * @param {string} name - Service identifier
	 * @returns {*} The resolved service instance
	 */
	resolve(name) {
		const service = this.#services.get(name);

		if (!service) {
			throw new Error(`Service '${name}' not registered`);
		}

		// If it's already an instance, return it
		if (service.isInstance) {
			return service.factory;
		}

		// Check if we already have a singleton instance
		if (service.singleton && this.#singletons.has(name)) {
			return this.#singletons.get(name);
		}

		// Resolve dependencies
		const resolvedDeps = service.dependencies.map((dep) => this.resolve(dep));

		// Create instance
		const instance = service.factory(...resolvedDeps);

		// Store singleton if needed
		if (service.singleton) {
			this.#singletons.set(name, instance);
		}

		return instance;
	}

	/**
	 * Check if a service is registered
	 * @param {string} name - Service identifier
	 * @returns {boolean}
	 */
	has(name) {
		return this.#services.has(name);
	}

	/**
	 * Clear all registrations and singletons
	 * Useful for testing
	 */
	clear() {
		this.#services.clear();
		this.#singletons.clear();
	}

	/**
	 * Create a child container that inherits from this one
	 * Useful for scoped dependencies
	 * @returns {DIContainer}
	 */
	createChild() {
		const child = new DIContainer();

		// Copy service definitions (not instances)
		for (const [name, service] of this.#services) {
			child.#services.set(name, { ...service });
		}

		return child;
	}
}

// Export a singleton instance for the application
const container = new DIContainer();

// Also export the class for testing purposes
export { DIContainer, container };
