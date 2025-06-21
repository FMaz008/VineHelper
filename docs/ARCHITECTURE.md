# VineHelper Architecture Overview

## Project Structure

VineHelper is a browser extension that enhances the Amazon Vine experience. The codebase reveals several architectural patterns and areas for improvement.

## Current Architecture

### Core Components

1. **Bootloader System** (`scripts/bootloader.js`)

    - Initializes all singleton instances
    - Sets up the environment and dependencies
    - Creates grid instances and manages tabs
    - Heavy coupling with global state
    - **Enhances Amazon Vine pages** (RFY, AFA, AI tabs) with:
        - Tile and Toolbar components
        - Order status tracking (success/failed counts)
        - Hidden/Pinned item management
        - Direct DOM manipulation of existing Amazon elements

2. **Notifications Monitor** (`scripts/notification_monitor/`)

    - Complex subsystem with multiple components
    - Master/Slave architecture for multi-tab coordination
    - Stream-based processing for new items
    - Version-specific implementations (V2, V3)
    - **Separate from bootloader system** - creates its own:
        - Custom tile rendering system
        - Independent grid management
        - No order status tracking (by design)
        - Complete UI replacement, not enhancement

3. **Settings Management** (`scripts/SettingsMgr.js`)

    - Singleton pattern
    - Chrome storage integration
    - No dependency injection

4. **UI Components**
    - **Grid System**: Manages product tiles across different tabs
    - **Tile System**: Individual product representation
        - Bootloader tiles: Enhance existing Amazon tiles
        - Monitor tiles: Custom-built from scratch
    - **Toolbar**: Product-specific actions
        - Only used in bootloader-enhanced pages
        - Contains order widget when unavailable tab is active
    - **Modal Management**: Dynamic modal creation

### System Boundaries

**Important Distinction**: VineHelper operates in two distinct modes:

1. **Page Enhancement Mode** (Bootloader):

    - Runs on Amazon Vine pages (RFY, AFA, AI)
    - Enhances existing Amazon UI elements
    - Adds toolbars with order tracking, pinning, hiding
    - Preserves Amazon's tile structure

2. **Custom Interface Mode** (Notification Monitor):
    - Completely custom UI
    - Independent tile rendering system
    - No integration with Amazon's DOM structure
    - Focused on real-time notifications

These systems share some services (Settings, Environment) but have separate rendering pipelines and feature sets.

### Architectural Patterns

1. **Singleton Pattern (Overused)**

    - Almost every major component is a singleton
    - Makes testing difficult
    - Creates tight coupling

2. **Event-Driven Architecture**

    - Hook system for extensibility
    - Browser message passing
    - DOM event handling
    - **GridEventManager** for centralized grid modifications (NEW)
    - Event batching for performance optimization

3. **Stream Processing**
    - `Streamy.js` provides functional stream processing
    - Used in notification processing pipeline

## Areas for Improvement

### 1. Separation of Concerns

**Current Issues:**

- Monster classes with multiple responsibilities
- Business logic mixed with UI logic
- Data access spread throughout components

**Recommendations:**

- Extract business logic into service classes
- Implement repository pattern for data access
- Create dedicated UI controllers

### 2. Dependency Injection

**Current Issues:**

- Hard-coded singleton dependencies
- Difficult to mock for testing
- Tight coupling between components

**Recommendations:**

- Implement a DI container
- Use constructor injection
- Create interfaces for major components

### 3. Folder Structure Reorganization

**Current Structure:**

```
scripts/
├── notification_monitor/  # Subsystem
├── chart.js/             # External library
└── [40+ files]           # Mixed concerns
```

**Proposed Structure:**

```
scripts/
├── core/
│   ├── services/         # Business logic
│   ├── repositories/     # Data access
│   ├── models/          # Domain models
│   └── utils/           # Helpers
├── ui/
│   ├── components/      # UI components
│   ├── controllers/     # UI logic
│   └── templates/       # View templates
├── notification-monitor/
│   ├── core/           # Monitor main business logic
|   ├── services/       # Monitor business logic services/managers
│   ├── stream/         # Stream processing
│   └── coordination/   # Master/Slave logic
├── infrastructure/
│   ├── storage/        # Storage adapters
│   ├── messaging/      # Message bus
│   └── injection/      # DI container
└── vendor/             # Third-party libs
```

### 4. Testability Improvements

**Ready for Testing:**

- `Streamy.js` - Pure functional stream processing
- `keywordMatch.js` - Pure function with clear inputs/outputs

**Close to Testable:**

- `NotificationsSoundPlayer.js` - Needs Settings injection
- `NewItemStreamProcessing.js` - Needs Settings/output injection
- `MasterSlave.js` - Needs monitor injection

**Testing Strategy:**

1. Start with pure functions and utilities
2. Refactor classes to accept dependencies
3. Create test doubles for Chrome APIs
4. Implement integration tests for critical paths

## Recommended Refactoring Approach

### Phase 1: Foundation (Start Here)

1. **Create DI Container**

    - Simple factory pattern initially
    - Register core services
    - Gradually migrate from singletons

2. **Extract Pure Business Logic**
    - Start with `keywordMatch` functionality
    - Create service interfaces
    - Move logic out of UI components

### Phase 2: Restructure

1. **Reorganize Folder Structure**

    - Create new structure alongside old
    - Gradually migrate files
    - Update imports incrementally

2. **Refactor Notifications Monitor**
    - Extract stream processing logic
    - Separate coordination from business logic
    - Create testable components

### Phase 3: Testing

1. **Unit Tests**

    - Start with pure functions
    - Add tests for refactored services
    - Mock external dependencies

2. **Integration Tests**
    - Test critical user flows
    - Mock Chrome APIs
    - Test multi-tab coordination

## Priority Recommendations

Based on the developer's wishlist and codebase analysis:

1. **Start with Dependency Injection** (Highest Impact)

    - Enables all other improvements
    - Start small with Settings/Logger
    - Gradually expand to other services

2. **Refactor Streamy.js Testing**

    - Already close to testable
    - Good learning example
    - Demonstrates testing approach

3. **Extract Notification Processing Logic**

    - High complexity area
    - Would benefit most from refactoring
    - Critical to application functionality

4. **Reorganize Folder Structure**
    - Do incrementally alongside other work
    - Start with new code
    - Migrate during refactoring

## Technical Debt Priorities

1. **Bootloader Refactoring** - High risk, high reward
2. **Singleton Elimination** - Medium risk, high reward
3. **Monster Class Breakdown** - Low risk, medium reward
4. **Folder Reorganization** - Low risk, low reward

## Next Steps

1. ~~Create a simple DI container~~ ✓ Completed
2. ~~Refactor SettingsMgr to use DI~~ ✓ Completed
3. Write tests for Streamy.js
4. Extract keyword matching into a service
5. ~~Document patterns for team adoption~~ ✓ Completed (see DEPENDENCY_INJECTION_MIGRATION.md)

## Implementation Status

### Completed (Phase 1)

- Created DIContainer with singleton/transient support
- Implemented StorageAdapter abstraction (Chrome and Memory implementations)
- Refactored SettingsMgr to use dependency injection
- Created compatibility layer for gradual migration
- Added comprehensive unit tests for DI components
- Updated bootloader.js to demonstrate the pattern
- Created migration documentation

### In Progress

- Monitoring the implementation in production
- Gathering feedback on the DI approach

### Completed (Phase 2) - Event-Driven Architecture

#### Core Services Implemented

- **GridEventManager**: Centralized grid modification handling
- **VisibilityStateManager**: Single source of truth for item counts
- **Event Batching**: 50ms for placeholders, 100ms for tab title updates

#### Visibility Count Synchronization Fixes

Fixed the bug where tab title showed incorrect item counts (e.g., "12 items" when 13 were visible):

1. **Root Cause**: Operations changing item visibility without notifying VisibilityStateManager
2. **Fixed Operations**:

    - `addTileInGrid()` - Now tracks visibility changes when updating existing items
    - `setTierFromASIN()` - Tracks visibility changes when tier updates affect visibility
    - `#bulkRemoveItems()` - Counts visible items being removed (optimized to single loop)
    - `#clearAllVisibleItems()` - Properly delegates to bulk remove with event emission
    - `#clearUnavailableItems()` - Fixed double-counting issue
    - `#handlePauseClick()` - Recalculates count after unpause

3. **Safari Compatibility**: Added `getComputedStyle()` checks for Safari browsers
4. **Performance**: Minimal impact - bulk operations have zero additional cost due to optimization

#### Code Quality Improvements (DRY)

- **`#isElementVisible()`**: Centralized Safari compatibility (5 duplications removed)
- **`#handleVisibilityChange()`**: Consolidated visibility change pattern (2 duplications removed)
- **`#getTileDisplayStyle()`**: Replaced repeated ternary expressions (6 duplications removed)
- **`#updateVisibleCountAfterFiltering()`**: Consolidated filter update pattern (3 duplications removed)
- **Optional Chaining**: Modernized null checks with `?.` operator

#### Testing

- Comprehensive test suite: 17 tests covering all visibility operations
- Edge cases included: missing DOM elements, Safari compatibility
- Focus on behavior over implementation details

### Key Architectural Patterns

#### Event-Driven State Management

- **Pattern**: When modifying items that affect visibility, always:
    1. Check visibility state before the change
    2. Apply the change
    3. Check visibility state after the change
    4. Emit appropriate events if visibility changed
- **Example**: See `addTileInGrid()` and `setTierFromASIN()` implementations

#### Testing Best Practices

- Focus on behavior rather than implementation details
- Avoid brittle string matching and formatting dependencies
- Include edge cases (missing DOM elements, browser differences)
- Structure tests with clear describe blocks for organization

### Next Priority

- Refactor Logger to use DI
- Create adapters for other browser APIs
- Update HiddenListMgr and PinnedListMgr
- Add integration tests for grid operations
- Extract FilteringService to centralize all filtering logic with event-driven updates
- Implement StateManager with proper state machine for monitor states (INITIALIZING, RUNNING, PAUSED, etc.)
- Create DOMService for centralized DOM operations with batch updates
- Enhance SettingsService to make settings reactive with events

### Critical Implementation Guidelines

1. **Visibility State Changes**: Any operation that might change item visibility MUST:

    - Track the visibility state before and after the operation
    - Emit appropriate grid events when visibility changes
    - Update the VisibilityStateManager count accordingly

    **Operations requiring visibility tracking:**

    - `addTileInGrid()` - when updating existing items
    - `setTierFromASIN()` - when tier changes affect visibility
    - `#bulkRemoveItems()` - count visible items being removed
    - `#clearAllVisibleItems()` - remove only visible items
    - `#clearUnavailableItems()` - delegates to bulkRemoveItems for proper counting
    - `#handlePauseClick()` - recalculate count after unpause (matches original behavior)
    - Any filtering operations (search, type, queue filters)

    **Note:**

    - `markItemUnavailable()` does NOT change visibility - it only adds an "Unavailable" banner. Items remain visible until explicitly cleared.
    - During pause, items remain visible but grid events aren't emitted for new items

2. **Event Batching**: Use batching for performance-sensitive operations:

    - Placeholder updates: 50ms batch delay
    - Tab title updates: 100ms batch delay
    - Prevents UI thrashing during rapid updates

3. **Testing Strategy**:

    - Write tests that verify behavior, not implementation
    - Include edge cases and browser-specific scenarios
    - Ensure tests remain maintainable as implementation evolves
    - Test visibility state changes for all critical operations

4. **Safari Compatibility**:
    - Use `window.getComputedStyle()` for Safari
    - Use `element.style.display` for other browsers
    - Always check browser type when accessing display styles

## Memory Leak Prevention

### Overview

The notification monitor had significant memory leak issues with 24 event listeners being added but never removed. These have been comprehensively fixed.

### Issues Fixed

1. **Event Listener Memory Leaks**

    - **Problem**: Anonymous functions in addEventListener couldn't be removed
    - **Solution**: Added `#eventHandlers` property to store all handler references
    - **Impact**: All 24 event listeners now have proper cleanup

2. **Bulk Remove Operations**

    - **Problem**: Container replacement wasn't cleaning up old container's listeners
    - **Solution**: Proper cleanup in bulk remove operations before replacing grid container

3. **V3-Specific Cleanup**

    - **Problem**: NotificationMonitorV3 had additional beforeunload listener
    - **Solution**: Store handler reference and clean up in destroy() override

4. **GridEventManager Memory Leaks**

    - **Problem**: No cleanup method for event listeners via `hookBind()`
    - **Solution**: Added destroy() method to clear timers and references
    - **Note**: HookMgr limitation - cannot unbind hooks (architectural issue)

5. **NoShiftGrid Memory Leaks**

    - **Problem**: Window resize listener never removed
    - **Solution**: Added destroy() method to remove listener and clear timer

6. **MemoryDebugger False Positives**
    - **Problem**: Reported removed listeners as leaks
    - **Solution**: Added untrackListener() method to track removals

### Implementation Pattern

```javascript
// Event handler storage pattern
#eventHandlers = {
    window: [],
    document: [],
    elements: new WeakMap()
};

// Store handlers before adding
const handler = (e) => this.#handleClick(e);
this.#eventHandlers.window.push({ event: 'click', handler });
window.addEventListener('click', handler);

// Comprehensive cleanup
destroy() {
    // Remove all window listeners
    this.#eventHandlers.window.forEach(({ event, handler }) => {
        window.removeEventListener(event, handler);
    });
    // Clear references
    this.#eventHandlers = { window: [], document: [], elements: new WeakMap() };
}
```

### Memory Debugging

Enable memory debugging for development:

```javascript
localStorage.setItem("vh_debug_memory", "true");
// Reload page
```

The MemoryDebugger tracks:

- Tile creation and removal
- Event listener lifecycle
- Detached DOM nodes
- Memory growth patterns

### Prevention Guidelines

1. **Always store handler references** - Never use anonymous functions in addEventListener
2. **Always remove listeners** - Implement destroy() methods in all services
3. **Use event delegation** - For dynamic content like tiles
4. **Clear references** - Null out data and handlers when removing elements
5. **Clear timers** - Store and clear all setInterval/setTimeout IDs
6. **Test memory usage** - Use Chrome DevTools Memory profiler
7. **Use WeakMap/WeakSet** - For DOM references where possible
8. **Trust incremental updates** - Avoid full recounts after operations that track changes incrementally
9. **Emit events consistently** - Ensure count events are emitted even during "paused" states

### Known Limitations

1. **HookMgr** - No unbind method for event listeners (requires architectural change)
2. ~~**Other Services** - Potential timer leaks in MasterSlave.js, Websocket.js, ServerCom.js~~ ✅ **FIXED**
    - MasterSlave.js: Fixed uncleared 1-second interval in `#keepAlive()`
    - ServerCom.js: Fixed uncleared 10-second interval and added proper destroy()
    - Websocket.js: Confirmed proper cleanup already existed

### Testing Strategy

- Manual: Add/remove items and check for detached nodes
- Automated: Verify listener cleanup in destroy()
- Monitor: Use MemoryDebugger in development

## Future Architectural Improvements

### High Priority

1. **HookMgr Enhancement**

    - **Issue:** No unbind method for event listeners
    - **Impact:** Memory leak risk in GridEventManager and other services
    - **Solution:** Implement unbind functionality in HookMgr

2. **Notification Monitor Service Extraction**

    - Extract notification processing logic into services
    - Separate coordination from business logic
    - Create testable components

3. **Visibility Caching System**
    - Implement centralized visibility state management
    - Cache visibility calculations with generation-based invalidation
    - Reduce redundant DOM operations
    - See FUTURE_IMPROVEMENTS.md for detailed implementation

### Medium Priority

1. **Event System Improvements**

    - Implement event batching for performance
    - Create typed event system
    - Add event debugging capabilities

2. **Service Layer Extraction**

    - Filter management service
    - Sort operations service
    - Settings caching layer (partially implemented)

3. **DOM Reference Management**
    - Use WeakMap/WeakSet for DOM references
    - Implement proper cleanup lifecycle
    - Prevent memory leaks from detached nodes

### Low Priority

1. **Advanced Filtering System**

    - Multi-criteria filtering
    - Custom filter expressions
    - Filter presets and saving

2. **Performance Monitoring**
    - Built-in performance metrics
    - User experience tracking
    - Automated performance regression detection

### Technical Debt Items

1. **Timer Management**

    - ✅ Fixed: MasterSlave and ServerCom timer cleanup
    - Remaining: Audit all setTimeout/setInterval usage

2. **Count Synchronization Best Practices**

    - Trust incremental count updates
    - Avoid full recounts after operations
    - Handle race conditions between data sources

3. **Memory Management**

    - See [MEMORY_MANAGEMENT.md](./MEMORY_MANAGEMENT.md) for comprehensive details
    - Implement destroy() pattern consistently
    - Use WeakMaps for object associations

4. **Code Duplication**

    - ✅ Fixed: ETV validation logic (hasRequiredEtvData helper)
    - ✅ Fixed: Title validation logic (hasTitle helper)
    - Remaining: Event emission patterns

5. **Bootloader Refactoring**
    - **Status:** High risk, high reward
    - **Goal:** Reduce coupling and improve testability
    - Break down monolithic initialization
    - Extract service creation into factories
