# Future Improvements and Optimizations

This document consolidates planned improvements, optimizations, and technical debt items across the VineHelper codebase.

## Performance Optimizations

### 1. Visibility Caching System (High Priority)

**From:** Visibility code optimizations
**Status:** Next priority after Safari optimization

**Current Issue:**

- Visibility is recalculated frequently, even when elements haven't changed
- Multiple operations might check the same element's visibility repeatedly
- No centralized visibility state management

**Proposed Implementation:**

```javascript
// Visibility cache that tracks element visibility state
#visibilityCache = new WeakMap();
#cacheGeneration = 0; // Increment to invalidate all cached values

#getCachedVisibility(element) {
    const cached = this.#visibilityCache.get(element);
    if (cached && cached.generation === this.#cacheGeneration) {
        return cached.isVisible;
    }

    const isVisible = this.#isElementVisible(element);
    this.#visibilityCache.set(element, {
        isVisible,
        generation: this.#cacheGeneration
    });
    return isVisible;
}

#invalidateVisibilityCache() {
    this.#cacheGeneration++;
    // Also invalidate computed style cache for Safari
    if (this._env.isSafari()) {
        this.#invalidateComputedStyleCache();
    }
}
```

**Benefits:**

- Avoids redundant visibility calculations
- Particularly beneficial for operations that check multiple elements
- Generation-based invalidation is more efficient than clearing WeakMap

### 2. Event Batching Improvements

**Status:** Medium priority

- Batch visibility change events within a microtask
- Use a single "visibility:changed" event with details
- Implement event debouncing for rapid changes

### 3. Memory Optimization

**Status:** Low priority

- Ensure proper cleanup when elements are removed
- Consider using WeakRef for long-lived references
- Monitor for memory leaks in visibility tracking

## Architectural Improvements

### 1. Dependency Injection (In Progress)

**Status:** Active development
**Details:** See [DI_IMPLEMENTATION_ROADMAP.md](./DI_IMPLEMENTATION_ROADMAP.md)

### 2. Notification Monitor Refactoring

**Status:** Planning phase

- Extract notification processing logic into services
- Separate coordination from business logic
- Create testable components

### 3. HookMgr Enhancement

**Status:** Blocked - requires architectural change

**Issue:** No unbind method for event listeners
**Impact:** Memory leak risk in GridEventManager and other services
**Solution:** Implement unbind functionality in HookMgr

## Code Quality Improvements

### 1. Reduce Code Duplication

**Areas identified:**

- Visibility check patterns (partially addressed)
- Filter application logic
- Event emission patterns

### 2. Service Extraction

**Candidates:**

- Keyword matching logic
- Filter management
- Sort operations

### 3. Testing Coverage

**Priority areas:**

- Visibility state management
- Event-driven operations
- Memory leak prevention

## Technical Debt

### 1. Timer Management

**Issue:** Potential memory leaks in services using setInterval without cleanup
**Affected files:**

- MasterSlave.js - "ImAlive" interval
- Websocket.js - reconnect timer
- ServerCom.js - service worker status timer

### 2. DOM Reference Management

**Issue:** Arrays of DOM references created frequently
**Solution:** Use WeakMap/WeakSet where appropriate

### 3. Bootloader Refactoring

**Status:** High risk, high reward
**Goal:** Reduce coupling and improve testability

## Feature Enhancements

### 1. Order Status Tracking in Notification Monitor

**Status:** Not planned
**Note:** Currently only available in bootloader-enhanced pages (RFY, AFA, AI)
**Reason:** Architectural separation between systems

### 2. Advanced Filtering Options

**Status:** Under consideration

- Multi-criteria filtering
- Custom filter expressions
- Filter presets

## Performance Metrics to Track

1. **Visibility Operations:**

    - Time per visibility check
    - Cache hit rate
    - Event emission frequency

2. **Memory Usage:**

    - Heap growth over time
    - Detached DOM nodes
    - Event listener count

3. **User Experience:**
    - Filter application speed
    - Sort operation performance
    - UI responsiveness

## Implementation Priority

1. **Immediate (Next PR):**

    - Visibility caching system
    - Complete DI migration for Logger

2. **Short-term (Next 2-3 PRs):**

    - Event batching improvements
    - Timer management fixes
    - Browser API adapters

3. **Long-term:**
    - Bootloader refactoring
    - Full notification monitor service extraction
    - Comprehensive testing suite

## Notes

- This document should be updated as improvements are completed
- New technical debt should be added as discovered
- Priority may shift based on user feedback and performance metrics
