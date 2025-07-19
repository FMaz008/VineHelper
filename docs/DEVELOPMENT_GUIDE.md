# VineHelper Development Guide

## Table of Contents

1. [Overview](#overview)
2. [Development Setup](#development-setup)
3. [Debug Settings](#debug-settings)
4. [Dependency Injection Migration](#dependency-injection-migration)
5. [Development Workflow](#development-workflow)
6. [Testing Strategies](#testing-strategies)
7. [Troubleshooting](#troubleshooting)
8. [Code Organization](#code-organization)
9. [Contributing Guidelines](#contributing-guidelines)
10. [Project Status and Roadmap](#project-status-and-roadmap)

## Overview

This guide provides comprehensive information for developers working on VineHelper, including setup instructions, debug tools, migration guides, and best practices.

## Development Setup

### Prerequisites

- Chrome or Firefox browser
- Node.js (for testing and build tools)
- Git
- Text editor with JavaScript support

### Getting Started

1. Clone the repository
2. Load the extension in developer mode:
   - Chrome: `chrome://extensions/` → Enable Developer mode → Load unpacked
   - Firefox: `about:debugging` → This Firefox → Load Temporary Add-on
3. Open the Amazon Vine page to test

### Project Structure

```
VineHelper/
├── manifest.json          # Extension manifest
├── scripts/              # Core JavaScript files
│   ├── core/            # Core utilities and services
│   ├── infrastructure/  # DI container and adapters
│   ├── notifications-monitor/  # Monitor system
│   └── ui/              # UI components
├── tests/               # Test files
├── docs/                # Documentation
└── resource/            # CSS, images, sounds
```

## Debug Settings

VineHelper includes comprehensive debug settings for development and troubleshooting.

### Available Debug Settings

#### 1. debugSound
**Purpose**: Logs sound notification decisions
```javascript
// Logs appear at:
// - Bulk fetch start/end
// - Item sound selection
// - Sound decision after filtering
```

#### 2. debugDuplicates
**Purpose**: Tracks duplicate item detection
```javascript
// Logs when:
// - ASIN already being processed
// - Item already exists
// - Different image URL for same ASIN
// - Duplicate prevention by image URL
```

#### 3. debugVisibility
**Purpose**: Monitors visibility state management
```javascript
// Logs:
// - Race condition detection
// - Cache mismatches
// - Recalculation operations
// - Count changes
```

#### 4. debugItemProcessing
**Purpose**: Detailed item processing logs
```javascript
// Tracks:
// - New item additions
// - Updates to existing items
// - ETV styling decisions
// - Count changes during filtering
```

#### 5. debugTabTitle
**Purpose**: Tab title update debugging
```javascript
// Shows:
// - Count updates
// - Title changes
// - Update timing
```

#### 6. debugPlaceholders
**Purpose**: Placeholder system debugging
```javascript
// Monitors:
// - Placeholder calculations
// - Grid measurements
// - Update operations
```

### Enabling Debug Settings

**Via UI**:
1. Open VineHelper settings
2. Navigate to Debug tab
3. Check desired debug options
4. Save and reload

**Via Console**:
```javascript
// Enable specific debug setting
await chrome.storage.local.set({ 
  'general.debugItemProcessing': true 
});

// Enable multiple settings
await chrome.storage.local.set({
  'general.debugVisibility': true,
  'general.debugPlaceholders': true
});
```

### Debug Tools

#### Title Debug Logger
```javascript
// Enable in settings: Debug Title Display

// Console commands:
TitleDebugLogger.getInstance().printSummary();
TitleDebugLogger.getInstance().exportLogs();
TitleDebugLogger.getInstance().getLogsForAsin("B0XXXXXXXXX");
TitleDebugLogger.getInstance().findClearedTitles();
```

#### TileCounter Performance Monitor
```javascript
// Enable in settings: TileCounter Performance Monitoring

// Access in console (when enabled):
window.tileCounter.getPerformanceMetrics();
window.tileCounter.recountVisibleTiles(0, true);
```

#### Memory Debugger
```javascript
// Enable in settings: Memory Analysis

// Console commands:
VH_MEMORY.takeSnapshot("label");
VH_MEMORY.generateReport();
VH_MEMORY.detectLeaks();
VH_MEMORY.checkDetachedNodes();
```

## Dependency Injection Migration

VineHelper is migrating from singleton patterns to dependency injection for better testability and maintainability.

### Migration Status

✅ **Completed**:
- DIContainer implementation
- StorageAdapter abstraction
- SettingsMgrDI with compatibility layer

🔧 **In Progress**:
- Logger service
- Browser API adapters

📋 **Planned**:
- HiddenListMgr and PinnedListMgr
- Business logic services
- Notification monitor refactoring

### Migration Approaches

#### Quick Migration (Existing Code)
```javascript
// Change import only
// Before:
import { SettingsMgr } from "./scripts/SettingsMgr.js";

// After:
import { SettingsMgr } from "./scripts/SettingsMgrCompat.js";
```

#### Full Migration (New Code)
```javascript
// Use DI container
import { DIContainer } from "./scripts/infrastructure/DIContainer.js";
import { ChromeStorageAdapter } from "./scripts/infrastructure/StorageAdapter.js";
import { SettingsMgrDI } from "./scripts/SettingsMgrDI.js";

const container = new DIContainer();
container.register("storageAdapter", () => new ChromeStorageAdapter());
container.register("settingsManager", 
  (storage) => new SettingsMgrDI(storage), 
  { dependencies: ["storageAdapter"] }
);

const settings = container.resolve("settingsManager");
```

#### Testing with DI
```javascript
// Easy mocking for tests
import { MemoryStorageAdapter } from "./scripts/infrastructure/StorageAdapter.js";

const testStorage = new MemoryStorageAdapter();
const settings = new SettingsMgrDI(testStorage);

// Test without Chrome APIs
await settings.set("test.key", "value");
expect(settings.get("test.key")).toBe("value");
```

## Development Workflow

### Making Changes

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Follow Code Style**
   - Use consistent indentation (tabs)
   - Add JSDoc comments for public methods
   - Keep functions focused and small
   - Use meaningful variable names

3. **Test Your Changes**
   - Manual testing on Vine pages
   - Run existing tests
   - Add tests for new functionality

4. **Update Documentation**
   - Update relevant .md files
   - Add inline comments for complex logic
   - Update this guide if adding debug features

### Code Patterns

#### Component Lifecycle
```javascript
class MyComponent {
  constructor() {
    this.intervals = [];
    this.listeners = [];
  }
  
  initialize() {
    // Setup code
  }
  
  destroy() {
    // Cleanup intervals
    this.intervals.forEach(clearInterval);
    
    // Remove listeners
    this.listeners.forEach(([el, evt, fn]) => {
      el.removeEventListener(evt, fn);
    });
    
    // Clear references
    this.data = null;
  }
}
```

#### Settings Usage
```javascript
// Read settings
const keywords = Settings.get("general.highlightKeywords");

// Write settings
await Settings.set("general.highlightKeywords", newKeywords);

// Listen for changes
Settings.addListener("general.highlightKeywords", (newValue) => {
  this.updateKeywords(newValue);
});
```

#### Error Handling
```javascript
try {
  await riskyOperation();
} catch (error) {
  console.error("[ComponentName] Operation failed:", error);
  // Graceful fallback
}
```

## Testing Strategies

### Manual Testing Checklist

- [ ] Test on all Vine pages (RFY, AFA, AI)
- [ ] Test with 0, 10, 100, 500+ items
- [ ] Test all filter combinations
- [ ] Test keyword matching edge cases
- [ ] Test multi-tab scenarios
- [ ] Test memory usage over time
- [ ] Test with slow network

### Performance Testing

```javascript
// Measure operation time
console.time('operation');
await performOperation();
console.timeEnd('operation');

// Memory profiling
if (performance.memory) {
  console.log('Memory:', {
    used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
    total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB'
  });
}
```

### Debug Scenarios

1. **Duplicate Items**
   - Enable `debugDuplicates`
   - Watch for ASIN processing logs
   - Verify mutex locking works

2. **Performance Issues**
   - Enable TileCounter monitoring
   - Check recount times
   - Monitor cache hit rates

3. **Memory Leaks**
   - Enable memory debugging
   - Take snapshots over time
   - Look for growing object counts

## Troubleshooting

### Common Issues

#### Extension Not Loading
- Check manifest.json syntax
- Verify file paths are correct
- Check browser console for errors

#### Settings Not Saving
```javascript
// Debug storage issues
chrome.storage.local.get(null, (items) => {
  console.log('All storage:', items);
});

// Check for storage errors
chrome.runtime.lastError && console.error(chrome.runtime.lastError);
```

#### Performance Problems
1. Enable performance monitoring
2. Check for:
   - Excessive DOM queries
   - Unoptimized loops
   - Memory leaks
   - Event handler buildup

#### Keyword Matching Issues
```javascript
// Test keyword compilation
import { compile } from "./scripts/core/utils/KeywordCompiler.js";
const compiled = compile(["test.*pattern"]);
console.log('Compiled:', compiled);

// Test matching
import { findMatch } from "./scripts/core/utils/KeywordMatcher.js";
const match = findMatch("test text", compiled);
console.log('Match:', match);
```

## Code Organization

### File Naming
- Use camelCase for files: `myComponent.js`
- Use PascalCase for classes: `MyComponent`
- Suffix test files: `myComponent.test.js`

### Module Structure
```javascript
// Imports at top
import { dependency } from "./dependency.js";

// Constants
const CONSTANT_VALUE = 100;

// Class definition
export class MyClass {
  // Private fields first
  #privateField = null;
  
  // Constructor
  constructor() {}
  
  // Public methods
  publicMethod() {}
  
  // Private methods
  #privateMethod() {}
}

// Export utilities
export function utilityFunction() {}
```

### Documentation Standards
```javascript
/**
 * Brief description of the class
 * @class
 */
class MyClass {
  /**
   * Method description
   * @param {string} param - Parameter description
   * @returns {boolean} Return value description
   */
  myMethod(param) {
    // Implementation
  }
}
```

## Contributing Guidelines

### Before Contributing

1. Check existing issues and PRs
2. Discuss major changes in an issue first
3. Follow the code style guide
4. Test thoroughly

### Pull Request Process

1. **Branch from main**
   ```bash
   git checkout -b feature/description
   ```

2. **Make focused commits**
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve issue #123"
   git commit -m "docs: update README"
   ```

3. **Update documentation**
   - Code comments
   - README if needed
   - This guide for new features

4. **Submit PR**
   - Clear description
   - Link related issues
   - Include test results

### Commit Message Format
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Code style changes
- `refactor:` Code refactoring
- `perf:` Performance improvement
- `test:` Test additions/changes

## Project Status and Roadmap

### Recently Completed (2025)

✅ **Performance Optimizations**
- 15x keyword matching improvement
- 95% stream processing memory reduction
- Filter switching <100ms

✅ **Architecture Improvements**
- Simplified keyword system
- Removed GridEventManager
- Fixed memory leaks

✅ **Bug Fixes**
- Filter state during bulk fetch
- Duplicate item prevention
- Visibility count accuracy
- Unknown ETV handling

### Current Focus

🔧 **Race Condition Investigation**
- Items arriving within ~28ms
- Visibility/count desynchronization
- Debug instrumentation added

🔧 **Dependency Injection Migration**
- Logger service next
- Browser API adapters planned
- Gradual refactoring approach

### Future Roadmap

#### Phase 1: Performance (Q1 2025)
- [ ] Virtual scrolling for 1000+ items
- [ ] Intersection Observer counting
- [ ] Web Worker processing

#### Phase 2: Architecture (Q2 2025)
- [ ] Complete DI migration
- [ ] Extract business logic
- [ ] Modernize build system

#### Phase 3: Features (Q3 2025)
- [ ] Enhanced filtering options
- [ ] Export functionality
- [ ] Customizable notifications

#### Phase 4: Quality (Q4 2025)
- [ ] Comprehensive test suite
- [ ] Performance monitoring
- [ ] Documentation automation

### Success Metrics

- Filter operations: <100ms for 1000 items
- Memory usage: <100MB for 1000 items
- Zero memory leaks in 24-hour usage
- 90% reduction in performance complaints

## Conclusion

VineHelper development focuses on performance, maintainability, and user experience. This guide provides the foundation for contributing to the project effectively. Key principles:

1. **Performance First**: Every change should maintain or improve performance
2. **Clean Code**: Readable, maintainable, well-documented
3. **User Focus**: Features that solve real user problems
4. **Gradual Improvement**: Incremental refactoring over rewrites

For questions or discussions, please open an issue on the project repository.