# Dependency Injection Migration Guide

This guide explains how to migrate from the singleton-based SettingsMgr to the new dependency injection approach. For architectural context and the overall refactoring plan, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Overview

The dependency injection refactoring introduces:

- A lightweight DI container (`DIContainer.js`)
- Storage adapters for testability (`StorageAdapter.js`)
- A refactored SettingsMgr that accepts dependencies (`SettingsMgrDI.js`)
- A compatibility layer for gradual migration (`SettingsMgrCompat.js`)

## Benefits

1. **Testability**: Mock dependencies for unit testing
2. **Flexibility**: Swap implementations without changing code
3. **Clarity**: Explicit dependencies make code easier to understand
4. **Maintainability**: Reduced coupling between components

## Migration Steps

### Option 1: Quick Migration (Recommended for existing code)

Simply change your import statement:

```javascript
// Before
import { SettingsMgr } from "./scripts/SettingsMgr.js";

// After
import { SettingsMgr } from "./scripts/SettingsMgrCompat.js";
```

This uses the compatibility layer that maintains the singleton pattern while using DI internally.

### Option 2: Full Migration (Recommended for new code)

Use the DI container directly:

```javascript
import { DIContainer } from "./scripts/infrastructure/DIContainer.js";
import { ChromeStorageAdapter } from "./scripts/infrastructure/StorageAdapter.js";
import { SettingsMgrDI } from "./scripts/SettingsMgrDI.js";
import { Logger } from "./scripts/Logger.js";

// Create and configure container
const container = new DIContainer();
container.register("storageAdapter", () => new ChromeStorageAdapter());
container.register("logger", () => new Logger());
container.register("settingsManager", (storage, logger) => new SettingsMgrDI(storage, logger), {
	dependencies: ["storageAdapter", "logger"],
});

// Resolve the settings manager
const settingsMgr = container.resolve("settingsManager");
```

### Option 3: Custom Configuration

Create your own instance with custom dependencies:

```javascript
import { SettingsMgrDI } from "./scripts/SettingsMgrDI.js";
import { MemoryStorageAdapter } from "./scripts/infrastructure/StorageAdapter.js";
import { Logger } from "./scripts/Logger.js";

// For testing or special use cases
const testStorage = new MemoryStorageAdapter();
const testLogger = new Logger();
const settingsMgr = new SettingsMgrDI(testStorage, testLogger);
```

## Testing

The DI approach makes testing much easier:

```javascript
import { SettingsMgrDI } from "./scripts/SettingsMgrDI.js";
import { MemoryStorageAdapter } from "./scripts/infrastructure/StorageAdapter.js";

describe("SettingsMgr", () => {
	let settingsMgr;
	let storage;

	beforeEach(() => {
		storage = new MemoryStorageAdapter();
		settingsMgr = new SettingsMgrDI(storage);
	});

	test("should save and retrieve settings", async () => {
		await settingsMgr.set("test.key", "value");
		expect(settingsMgr.get("test.key")).toBe("value");
	});
});
```

## Gradual Migration Strategy

1. **Phase 1**: Update imports to use `SettingsMgrCompat.js`
2. **Phase 2**: Write new code using DI patterns
3. **Phase 3**: Gradually refactor existing code to use DI
4. **Phase 4**: Remove the compatibility layer once fully migrated

## Example: Refactoring a Component

### Before (Singleton)

```javascript
import { SettingsMgr } from "./scripts/SettingsMgr.js";

class MyComponent {
	constructor() {
		this.settings = new SettingsMgr();
	}

	async doSomething() {
		const value = this.settings.get("some.setting");
		// ...
	}
}
```

### After (Dependency Injection)

```javascript
class MyComponent {
	constructor(settingsManager) {
		this.settings = settingsManager;
	}

	async doSomething() {
		const value = this.settings.get("some.setting");
		// ...
	}
}

// Register in DI container
container.register(
	"myComponent",
	(settingsManager) => {
		return new MyComponent(settingsManager);
	},
	{ dependencies: ["settingsManager"] }
);
```

## Next Steps

After migrating SettingsMgr, consider applying DI to other singletons:

- `Logger.js`
- `HiddenListMgr.js`
- `PinnedListMgr.js`
- Other manager classes

## Running Tests

```bash
# Install Jest if not already installed
npm install --save-dev jest

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## Troubleshooting

### Issue: "Service not registered" error

Make sure the service is registered before trying to resolve it. Services must be registered in the container before they can be resolved. See the example above for proper registration.

### Issue: Chrome storage not available in tests

Use `MemoryStorageAdapter` for testing instead of `ChromeStorageAdapter`.

### Issue: Circular dependencies

Review your dependency graph and consider using factory functions or lazy loading to break cycles.

## Recommended Next Steps

For a detailed implementation roadmap with code examples and specific tasks, see [DI_IMPLEMENTATION_ROADMAP.md](./DI_IMPLEMENTATION_ROADMAP.md).

### Quick Overview:

1. **Next PR**: Refactor Logger with DI
2. **Next Sprint**: Create browser API adapters and refactor list managers
3. **Next Month**: Extract business logic and refactor notifications monitor
4. **Next Quarter**: Complete bootloader refactoring

## External Resources

### Dependency Injection Concepts

- [Martin Fowler - Inversion of Control Containers](https://martinfowler.com/articles/injection.html) - Foundational article on DI
- [Dependency Injection in JavaScript](https://www.freecodecamp.org/news/a-quick-intro-to-dependency-injection-what-it-is-and-when-to-use-it-7578c84fa88f/) - Practical JS examples
- [InversifyJS Documentation](https://inversify.io/) - Advanced DI container for reference

### Testing Best Practices

- [JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices) - Comprehensive guide
- [Jest Documentation](https://jestjs.io/docs/getting-started) - Official Jest docs
- [Testing Library Principles](https://testing-library.com/docs/guiding-principles/) - Testing philosophy

### Refactoring Patterns

- [Refactoring Guru - Extract Class](https://refactoring.guru/extract-class) - Breaking down large classes
- [Working Effectively with Legacy Code](https://www.oreilly.com/library/view/working-effectively-with/0131177052/) - Strategies for gradual refactoring
- [Strangler Fig Pattern](https://martinfowler.com/bliki/StranglerFigApplication.html) - Gradual migration approach

## Additional Resources

- **Infrastructure README**: See `scripts/infrastructure/README.md` for detailed documentation on:
    - DIContainer API and usage patterns
    - StorageAdapter implementations
    - Design principles and best practices
    - Code examples

## Questions?

If you encounter issues during migration, check:

1. The test files for usage examples
2. The inline documentation in the source files
3. The ARCHITECTURE.md file for overall design decisions
4. The infrastructure README for component details
