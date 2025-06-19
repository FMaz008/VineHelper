# Dependency Injection Implementation Roadmap

This document provides a detailed roadmap for completing the dependency injection refactoring across VineHelper.

## Current Status ✅

- [x] DIContainer implementation
- [x] StorageAdapter abstraction
- [x] SettingsMgr refactored with DI
- [x] Compatibility layer for gradual migration
- [x] Unit tests for infrastructure
- [x] Migration documentation
- [x] ErrorAlertManager as example of piecemeal migration (see NotificationMonitorV3)

## Phase 1: Core Services (Next 2 PRs)

### PR 1: Logger Refactoring

```javascript
// Current: Singleton with console.log
class Logger {
  static instance = new Logger();
  add(message) { console.log(message); }
}

// Target: DI with multiple implementations
class LoggerDI {
  constructor(config, transport) {
    this.#config = config;
    this.#transport = transport;
  }
}

// Implementations
class ConsoleTransport { write(level, message) { console[level](message); } }
class MemoryTransport { write(level, message) { this.logs.push({level, message}); } }
class RemoteTransport { async write(level, message) { await fetch(...); } }
```

**Tasks:**

1. Create LoggerDI with transport abstraction
2. Implement Console, Memory, and Remote transports
3. Add LoggerCompat for backward compatibility
4. Update SettingsMgrDI to use injected logger
5. Write comprehensive tests

### PR 2: Browser API Adapters

```javascript
// Create adapters for testability
class RuntimeAdapter {
	async sendMessage(message) {
		return chrome.runtime.sendMessage(message);
	}
	onMessage(callback) {
		chrome.runtime.onMessage.addListener(callback);
	}
}

class TabsAdapter {
	async query(queryInfo) {
		return chrome.tabs.query(queryInfo);
	}
	async create(createProperties) {
		return chrome.tabs.create(createProperties);
	}
}

class StorageAdapter {
	// Already implemented ✅
}
```

**Tasks:**

1. Create RuntimeAdapter with mock implementation
2. Create TabsAdapter with mock implementation
3. Create NotificationsAdapter
4. Update components to use adapters
5. Write tests using mock adapters

## Phase 2: List Managers (Next Sprint)

### PR 3: List Manager Services

```javascript
// Current: Singletons with direct storage access
class HiddenListMgr {
	static instance = new HiddenListMgr();
	constructor() {
		this.settings = new SettingsMgr();
	}
}

// Target: Services with repository pattern
class HiddenListService {
	constructor(repository, eventBus) {
		this.#repository = repository;
		this.#eventBus = eventBus;
	}

	async hideItem(asin) {
		await this.#repository.add(asin);
		this.#eventBus.emit("item:hidden", { asin });
	}
}

class ListRepository {
	constructor(storage, key) {
		this.#storage = storage;
		this.#key = key;
	}

	async getAll() {
		return this.#storage.get(this.#key) || [];
	}
	async add(item) {
		/* ... */
	}
	async remove(item) {
		/* ... */
	}
}
```

**Tasks:**

1. Create ListRepository abstraction
2. Refactor HiddenListMgr → HiddenListService
3. Refactor PinnedListMgr → PinnedListService
4. Create EventBus for decoupled communication
5. Update UI components to use services

## Phase 3: Business Logic Extraction (Next Month)

### PR 4: Keyword Matching Service

**Note:** The keyword matching logic has already been optimized with pre-compilation
(see [KEYWORD_PRECOMPILATION.md](./KEYWORD_PRECOMPILATION.md)). This PR would focus
on wrapping the existing optimized implementation in a DI-friendly service.

```javascript
// Extract from various components
class KeywordMatchingService {
	constructor(config) {
		this.#config = config;
	}

	matches(text, keywords) {
		// Wraps the existing keywordMatch function
		// Already optimized with automatic pre-compilation
		return keywordMatch(keywords, text);
	}

	getMatchType(text, keywords) {
		// Returns 'title', 'description', 'both', or null
		// Can leverage the existing keywordMatchReturnFullObject
	}
}
```

### PR 5: Notification Processing

```javascript
// Break down the monolith
class NotificationService {
	constructor(soundPlayer, storage, eventBus) {
		this.#soundPlayer = soundPlayer;
		this.#storage = storage;
		this.#eventBus = eventBus;
	}
}

class NotificationSoundPlayer {
	constructor(audioAdapter) {
		this.#audioAdapter = audioAdapter;
	}
}
```

## Phase 4: Major Refactoring (Next Quarter)

### Notifications Monitor Decomposition

Break down into:

- StreamProcessor
- ItemMatcher
- NotificationDispatcher
- TabCoordinator
- QueueManager

### Bootloader Refactoring

```javascript
// Target structure
class Application {
	constructor(container) {
		this.#container = container;
	}

	async initialize() {
		// Register all services
		this.#registerServices();

		// Initialize in dependency order
		await this.#container.resolve("database").connect();
		await this.#container.resolve("settings").load();

		// Start UI
		this.#container.resolve("ui").render();
	}
}
```

## Testing Strategy

### Unit Test Coverage Goals

- Infrastructure: 100% ✅
- Services: 90%
- Repositories: 95%
- UI Components: 70%
- Integration: 80%

### Test Patterns

```javascript
// Service tests
describe("HiddenListService", () => {
	let service, mockRepo, mockEventBus;

	beforeEach(() => {
		mockRepo = createMockRepository();
		mockEventBus = createMockEventBus();
		service = new HiddenListService(mockRepo, mockEventBus);
	});

	test("should hide item and emit event", async () => {
		await service.hideItem("B001");

		expect(mockRepo.add).toHaveBeenCalledWith("B001");
		expect(mockEventBus.emit).toHaveBeenCalledWith("item:hidden", { asin: "B001" });
	});
});
```

## Success Metrics

1. **Code Coverage**: Increase from ~0% to 80%
2. **Coupling**: Reduce average dependencies per class from 5+ to 2-3
3. **Testability**: 100% of business logic testable in isolation
4. **Maintainability**: Reduce average file size by 50%
5. **Performance**: No regression in runtime performance

## Common Patterns

### Service Registration

```javascript
// In each service file
export function registerMyService(container) {
	container.register(
		"myService",
		(dep1, dep2) => {
			return new MyService(dep1, dep2);
		},
		{
			dependencies: ["dep1", "dep2"],
			singleton: true,
		}
	);
}
```

### Compatibility Layers

```javascript
// For gradual migration
export class ServiceCompat {
	static #instance;

	static getInstance() {
		if (!this.#instance) {
			const container = getGlobalContainer();
			this.#instance = container.resolve("service");
		}
		return this.#instance;
	}
}
```

### Testing Helpers

```javascript
// Create test container with mocks
export function createTestContainer() {
	const container = new DIContainer();

	// Register mocks
	container.register("storage", () => new MemoryStorageAdapter());
	container.register("logger", () => new NullLogger());
	container.register("eventBus", () => new MockEventBus());

	return container;
}
```

## Review Checklist

For each PR:

- [ ] All new code uses DI
- [ ] Compatibility layer provided for existing code
- [ ] Unit tests cover all new code
- [ ] Documentation updated
- [ ] No console.log in production code
- [ ] Follows repository conventions (tabs, private fields)
- [ ] Performance impact measured
- [ ] Migration guide updated if needed

## Questions or Blockers?

1. Check existing implementations in `scripts/infrastructure/`
2. Review test examples in `tests/infrastructure/`
3. Consult migration guide in `docs/DEPENDENCY_INJECTION_MIGRATION.md`
4. Ask in PR reviews for guidance
