# Infrastructure Components

This directory contains the foundational infrastructure components for VineHelper's dependency injection system.

## Overview

The infrastructure layer provides:

- **Dependency Injection Container** - Manages service registration and resolution
- **Storage Adapters** - Abstracts browser storage APIs for testability

## Components

### DIContainer.js

A lightweight dependency injection container that supports:

- Singleton and transient lifetimes
- Dependency resolution
- Factory functions
- Child containers for scoping

```javascript
import { DIContainer } from "./DIContainer.js";

// Create container
const container = new DIContainer();

// Register a service
container.register("myService", () => new MyService(), {
	singleton: true,
	dependencies: ["logger", "storage"],
});

// Resolve a service
const service = container.resolve("myService");
```

### StorageAdapter.js

Provides abstraction over browser storage APIs:

- `StorageAdapter` - Base interface
- `ChromeStorageAdapter` - Production implementation using chrome.storage
- `MemoryStorageAdapter` - In-memory implementation for testing

```javascript
// Production
const storage = new ChromeStorageAdapter("local");

// Testing
const storage = new MemoryStorageAdapter();
```

## Design Principles

1. **Testability First** - All components are designed to be easily testable
2. **Gradual Migration** - Existing code can adopt DI incrementally
3. **Explicit Dependencies** - Dependencies are declared, not discovered
4. **Minimal Overhead** - Lightweight implementation suitable for browser extensions

## Usage Patterns

### Service Registration

```javascript
// Simple service
container.register("config", { apiUrl: "https://api.example.com" });

// Factory function
container.register("logger", () => new Logger());

// With dependencies
container.register(
	"apiClient",
	(config, logger) => {
		return new ApiClient(config.apiUrl, logger);
	},
	{ dependencies: ["config", "logger"] }
);
```

### Testing

```javascript
// Create isolated container for tests
const testContainer = new DIContainer();
testContainer.register("storage", () => new MemoryStorageAdapter());
testContainer.register("settings", (storage) => new SettingsMgrDI(storage), {
	dependencies: ["storage"],
});

// Test with mocked dependencies
const settings = testContainer.resolve("settings");
```

### Scoped Containers

```javascript
// Create child container for request-specific services
const requestContainer = container.createChild();
requestContainer.register("requestId", () => generateId());

// Child can access parent services
const logger = requestContainer.resolve("logger"); // From parent
const requestId = requestContainer.resolve("requestId"); // From child
```

## Migration Guide

See [DEPENDENCY_INJECTION_MIGRATION.md](../../docs/DEPENDENCY_INJECTION_MIGRATION.md) for detailed migration instructions.

## Future Enhancements

- Decorator support for cleaner syntax
- Automatic circular dependency detection
- Service lifecycle hooks
- Configuration-based registration

## Learning Resources

### Core Concepts

- [SOLID Principles](https://www.digitalocean.com/community/conceptual-articles/s-o-l-i-d-the-first-five-principles-of-object-oriented-design) - Foundation for good DI design
- [Composition over Inheritance](https://www.thoughtworks.com/insights/blog/composition-vs-inheritance-how-choose) - Why DI matters
- [Dependency Inversion Principle](https://stackify.com/dependency-inversion-principle/) - The 'D' in SOLID

### Implementation Patterns

- [Constructor Injection](https://www.tutorialsteacher.com/ioc/constructor-injection) - Our chosen approach
- [Service Locator Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/) - What to avoid
- [Factory Pattern with DI](https://www.baeldung.com/java-factory-pattern) - Creating instances dynamically

### JavaScript-Specific Resources

- [ES6 Classes and DI](https://medium.com/@jeffwhelpley/dependency-injection-in-es6-b8b9c36a5604) - Modern JS patterns
- [Private Fields in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_class_fields) - Using # syntax
- [Async/Await Best Practices](https://blog.risingstack.com/mastering-async-await-in-nodejs/) - For async dependencies
