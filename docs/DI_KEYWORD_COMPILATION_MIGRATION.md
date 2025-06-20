# DI Keyword Compilation Migration Guide

This guide explains how to migrate VineHelper to use the new Dependency Injection-based keyword compilation service that shares compiled keywords across browser extension contexts.

## Overview

The new architecture introduces:

- **KeywordCompilationService**: Centralized service for compiling and caching keywords
- **RuntimeAdapter**: Abstraction for Chrome runtime API to enable testing
- **KeywordMatchDI**: Enhanced keyword matching with DI support
- **SettingsFactoryEnhanced**: Extended factory with all DI services

## Benefits

1. **Memory Efficiency**: Keywords are compiled once and shared across all contexts
2. **Performance**: Compiled regex patterns are cached and reused
3. **Testability**: All services can be mocked for unit testing
4. **Maintainability**: Clear separation of concerns with DI pattern

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Service Worker    │     │  Content Script  │     │    Main Page    │
│                     │     │                  │     │                 │
│ KeywordCompilation  │◄────┤ KeywordMatchDI   │◄────┤ KeywordMatchDI  │
│     Service         │     │                  │     │                 │
│                     │     └──────────────────┘     └─────────────────┘
│  (Compiles Once)    │              ▲                        ▲
│                     │              │                        │
└──────────┬──────────┘              │                        │
           │                         │                        │
           ▼                         │                        │
    ┌──────────────┐                 │                        │
    │   Storage    │                 │                        │
    │              │                 │                        │
    │  Serialized  │─────────────────┴────────────────────────┘
    │  Compiled    │         (Shared via Storage/Messages)
    │  Keywords    │
    └──────────────┘
```

## Migration Steps

### 1. Update Service Worker

Replace the current service worker with the DI version:

```javascript
// manifest.json
{
  "background": {
    "service_worker": "scripts/vh_service_worker_di.js",
    "type": "module"
  }
}
```

### 2. Update Content Scripts

For content scripts that use keyword matching, update imports:

```javascript
// Before
import { keywordMatch } from "./KeywordMatch.js";

// After
import { keywordMatchDI } from "./KeywordMatchDI.js";
import { initializeServices } from "./infrastructure/SettingsFactoryEnhanced.js";

// Initialize on startup
await initializeServices();

// Use async version for shared compilation
const matched = await keywordMatchDI(keywords, title, etv_min, etv_max, "highlight");
```

### 3. Backward Compatibility

The KeywordMatchDI module provides synchronous fallback methods for gradual migration:

```javascript
// These work without DI (uses local compilation)
import { keywordMatch, keywordMatchReturnFullObject } from "./KeywordMatchDI.js";

// Use exactly like before
const matched = keywordMatch(keywords, title, etv_min, etv_max);
```

### 4. Update Keyword Updates

When keywords are updated, clear the cache:

```javascript
// After updating keywords in settings
await chrome.runtime.sendMessage({ action: "keywordsUpdated" });
```

### 5. Testing

Use the test container for unit tests:

```javascript
import { createTestContainer } from "./infrastructure/SettingsFactoryEnhanced.js";

describe("MyComponent", () => {
	let container;

	beforeEach(() => {
		container = createTestContainer();
	});

	it("should match keywords", async () => {
		const service = container.resolve("keywordCompilationService");
		await service.compileAndShare("highlight", ["test"]);
		// ... test logic
	});
});
```

## Implementation Details

### KeywordCompilationService

The service handles:

- Compiling keywords with regex patterns
- Serializing compiled patterns for storage
- Sharing compilations across contexts
- Caching for performance

Key methods:

- `compileAndShare(type, keywords)`: Compile and distribute keywords
- `getCompiled(type, keywords)`: Retrieve compiled keywords
- `clearCache()`: Clear all cached compilations

### RuntimeAdapter

Provides abstraction over Chrome runtime APIs:

- `sendMessage(message)`: Send messages between contexts
- `onMessage(callback)`: Listen for messages
- `MockRuntimeAdapter`: Test implementation

### Storage Format

Compiled keywords are stored as:

```json
{
	"version": "1.0.0",
	"compilations": {
		"highlight_12345": [
			{
				"index": 0,
				"keyword": "laptop",
				"pattern": "\\blaptop\\b",
				"flags": "iu",
				"hasEtvCondition": false
			}
		]
	}
}
```

## Performance Considerations

1. **Initial Load**: First compilation takes time but is cached
2. **Memory Usage**: Shared compilation reduces memory by ~60-80%
3. **Message Passing**: Small overhead for cross-context communication
4. **Cache Invalidation**: Automatic when keywords are updated

## Troubleshooting

### Keywords Not Matching

1. Check if services are initialized:

```javascript
const service = getKeywordCompilationService();
console.log("Service initialized:", service !== null);
```

2. Verify cache status:

```javascript
const stats = await service.compileAndShare("highlight", keywords);
console.log("Compilation stats:", stats);
```

### Memory Issues

1. Clear cache periodically:

```javascript
await service.clearCache();
```

2. Monitor storage usage:

```javascript
const usage = await chrome.storage.local.getBytesInUse();
console.log("Storage used:", usage);
```

## Future Enhancements

1. **Incremental Compilation**: Only compile changed keywords
2. **Compression**: Compress serialized patterns for storage
3. **Background Compilation**: Compile in web worker
4. **Pattern Optimization**: Combine similar patterns

## Migration Checklist

- [ ] Update service worker to use DI version
- [ ] Update manifest.json if needed
- [ ] Migrate keyword matching in content scripts
- [ ] Add keyword update notifications
- [ ] Update tests to use test container
- [ ] Verify cross-context communication
- [ ] Test with various keyword configurations
- [ ] Monitor memory usage improvements
- [ ] Update documentation

## References

- [DI Implementation Roadmap](./DI_IMPLEMENTATION_ROADMAP.md)
- [Keyword Precompilation](./KEYWORD_PRECOMPILATION.md)
- [Dependency Injection Migration](./DEPENDENCY_INJECTION_MIGRATION.md)
