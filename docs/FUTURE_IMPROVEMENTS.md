# Future Improvements and Optimizations

This document tracks planned improvements that are not yet implemented or are in active development.

## Performance Optimizations

### Visibility Caching System (High Priority)

**Status:** Next priority after current work

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

## Completed Improvements

The following improvements have been completed and documented in other files:

### Performance

- ✅ **Keyword Matching Performance** (Commit: 9b126fb) - See [MEMORY_MANAGEMENT.md](./MEMORY_MANAGEMENT.md)
    - 15x improvement (19.4s → 1.3s)
    - WeakMap-based caching with module-level array storage
- ✅ **Stream Processing Memory Usage** (Commit: a4066e0) - See [MEMORY_MANAGEMENT.md](./MEMORY_MANAGEMENT.md)
    - 95% memory reduction (1.6 MB → 69.2 KB)
    - Named functions and cached settings

### Architecture

- ✅ **Dependency Injection** - See [DI_IMPLEMENTATION_ROADMAP.md](./DI_IMPLEMENTATION_ROADMAP.md)
- ✅ **Event-Driven Architecture** - See [ARCHITECTURE.md](./ARCHITECTURE.md)
- ✅ **Memory Leak Fixes** - See [MEMORY_MANAGEMENT.md](./MEMORY_MANAGEMENT.md)

### Code Quality

- ✅ **DRY Improvements** - See [ARCHITECTURE.md](./ARCHITECTURE.md)
    - ETV validation logic (hasRequiredEtvData helper)
    - Title validation logic (hasTitle helper)
    - Visibility checking patterns

## Active Development

### Dependency Injection Migration

**Status:** In Progress  
**Details:** See [DI_IMPLEMENTATION_ROADMAP.md](./DI_IMPLEMENTATION_ROADMAP.md)

Current focus:

- Logger service migration
- Browser API adapters
- Testing infrastructure

## Implementation Priority

1. **Immediate (Next PR):**

    - Visibility caching system
    - Complete DI migration for Logger

2. **Short-term (Next 2-3 PRs):**

    - Browser API adapters
    - Integration tests for grid operations

3. **Long-term:**
    - See [ARCHITECTURE.md](./ARCHITECTURE.md) for full architectural roadmap

## Performance Metrics to Track

1. **Visibility Operations:**

    - Time per visibility check
    - Cache hit rate
    - Event emission frequency

2. **Memory Usage:**

    - See [MEMORY_MANAGEMENT.md](./MEMORY_MANAGEMENT.md) for comprehensive metrics

3. **User Experience:**
    - Filter application speed
    - Sort operation performance
    - UI responsiveness

## Notes

- This document focuses on work not yet started or in early stages
- Completed work is documented in respective files
- Priority may shift based on user feedback and performance metrics
