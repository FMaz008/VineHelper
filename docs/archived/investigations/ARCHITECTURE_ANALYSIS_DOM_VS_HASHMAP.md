# Architecture Analysis: DOM-based vs Hashmap-based Item Management

## Executive Summary

The current VineHelper notification monitor calls `setVisibility` 3 times for each new item due to overlapping filtering logic in the item addition flow. This analysis compares the current DOM-based architecture with a proposed hashmap-based approach using pre-computed views.

## Why setVisibility is Called 3 Times

### Call Stack Analysis

When a new item is added (e.g., ASIN B0F3RBVZFL), `setVisibility` is called 3 times:

1. **Initial Filtering (Line 1412 in addNewItem)**

    ```javascript
    const isVisible = this.#processNotificationFiltering(tileDOM);
    ```
    - Applies all filters (search text, queue, ETV range, etc.)
    - Sets initial visibility state

2. **Highlight Processing (Line 1761/1780 in #highlightedItemFound)**

    ```javascript
    const tileVisible = this.#processNotificationFiltering(notif);
    ```
    - Called from `addNewItem` when checking keyword highlights
    - Re-applies ALL filters again, not just highlight-specific logic

3. **Zero ETV Processing (Line 1880 in ETV processing)**
    ```javascript
    this.#processNotificationFiltering(notif);
    ```
    - Called when processing zero ETV items
    - Again re-applies ALL filters

### Root Cause

The issue stems from the monolithic `#processNotificationFiltering` method that:

- Checks ALL filter conditions every time
- Is called by multiple specialized handlers
- Has no awareness of what specific aspect changed

## Current Architecture: DOM-based Approach

### How It Works

1. **Data Storage**
    - Items stored in `ItemsMgr` using Map: `items = new Map()`
    - DOM elements tracked separately: `domElements = new WeakMap()`
    - Visibility determined by DOM state (`display: none`)

2. **Filtering Process**
    - Each filter check queries DOM element properties
    - Visibility changes modify DOM directly
    - Count maintained by `VisibilityStateManager` tracking DOM changes

3. **Performance Characteristics**
    - **Filter Application**: O(n) where n = number of items
    - **Single Item Update**: O(1) but with 3x redundancy
    - **Memory**: Low - only stores item data + DOM references
    - **CPU**: High - repeated DOM queries and modifications

### Pros

- Simple conceptual model
- Direct manipulation matches browser rendering
- Low memory footprint
- No synchronization issues between data and view

### Cons

- Redundant filtering calls (3x per item)
- DOM manipulation is expensive
- Filters coupled to DOM state
- Hard to optimize without major refactoring
- Testing requires DOM mocking

## Proposed Architecture: Hashmap with Pre-computed Views

### How It Would Work

1. **Data Storage**

    ```javascript
    class ItemStore {
    	items = new Map(); // ASIN -> Item data
    	views = new Map(); // Filter combination -> Set of visible ASINs
    	filterStates = new Map(); // ASIN -> Filter results cache
    }
    ```

2. **Pre-computed Views**

    ```javascript
    // Example view keys:
    // "queue:rfy|etv:0-0|highlight:true" -> Set(['B123', 'B456'])
    // "queue:all|etv:all|highlight:false" -> Set(['B123', 'B456', 'B789'])
    ```

3. **Filtering Process**
    ```javascript
    class FilterEngine {
    	applyFilter(item, filterType, filterValue) {
    		// Cache individual filter results
    		const key = `${item.asin}:${filterType}`;
    		if (this.cache.has(key)) return this.cache.get(key);

    		const result = this.evaluateFilter(item, filterType, filterValue);
    		this.cache.set(key, result);
    		return result;
    	}

    	updateViews(item, changedFilters) {
    		// Only update affected views
    		for (const view of this.affectedViews(changedFilters)) {
    			view.update(item);
    		}
    	}
    }
    ```

### Performance Characteristics

- **Filter Application**: O(1) for view lookup
- **Single Item Update**: O(v) where v = number of views (typically < 10)
- **Memory**: Higher - stores pre-computed results
- **CPU**: Lower - no DOM manipulation, cached results

### Pros

- Eliminates redundant filtering
- O(1) visibility lookups
- Testable without DOM
- Clear separation of concerns
- Enables advanced features (instant filter switching)

### Cons

- Higher memory usage
- Complex view invalidation logic
- Initial implementation complexity
- Potential sync issues between views

## Hybrid Approach: Optimized DOM with Smart Caching

### Best of Both Worlds

1. **Incremental Filtering**

    ```javascript
    class SmartFilter {
    	#filterResults = new WeakMap(); // Element -> { search: bool, etv: bool, ... }

    	processFiltering(element, changedAspects = ["all"]) {
    		const cached = this.#filterResults.get(element) || {};
    		let visibilityChanged = false;

    		for (const aspect of changedAspects) {
    			if (aspect === "all" || !cached.hasOwnProperty(aspect)) {
    				cached[aspect] = this.evaluateAspect(element, aspect);
    				visibilityChanged = true;
    			}
    		}

    		const isVisible = Object.values(cached).every((v) => v);
    		if (visibilityChanged) {
    			this.setElementVisibility(element, isVisible);
    		}

    		return isVisible;
    	}
    }
    ```

2. **Targeted Updates**

    ```javascript
    // In addNewItem:
    this.#processFiltering(element, ["search", "queue", "etv"]);

    // In highlightedItemFound:
    this.#processFiltering(element, ["highlight"]);

    // In zeroETVItemFound:
    this.#processFiltering(element, ["zeroETV"]);
    ```

### Benefits

- Eliminates redundant checks
- Maintains DOM-based simplicity
- Low memory overhead
- Backward compatible
- Incremental migration path

## Recommendations

### Short Term (Hybrid Approach)

1. Refactor `#processNotificationFiltering` to accept specific aspects
2. Cache filter results per element
3. Only update visibility when results actually change
4. Estimated effort: 2-3 days
5. Performance improvement: ~60-70% reduction in filtering overhead

### Long Term (Consider Hashmap)

1. Evaluate if memory trade-off is acceptable
2. Prototype with subset of features
3. Measure real-world performance gains
4. Consider for v4 architecture if benefits justify complexity

### Immediate Fix

```javascript
// Add to NotificationMonitor
#filteringInProgress = new WeakSet();

#processNotificationFiltering(node, aspects = null) {
  // Prevent recursive filtering
  if (this.#filteringInProgress.has(node)) {
    return this.#isElementVisible(node);
  }

  this.#filteringInProgress.add(node);
  try {
    // ... existing logic
  } finally {
    this.#filteringInProgress.delete(node);
  }
}
```

## Conclusion

The triple `setVisibility` calls are a symptom of monolithic filtering design. While a full hashmap architecture offers theoretical benefits, a hybrid approach with smart caching provides most benefits with minimal disruption. The immediate fix prevents recursive filtering while we implement the proper solution.

### Key Metrics to Track

- Filtering time per item
- Memory usage growth
- Tab title update frequency
- User-perceived responsiveness

### Next Steps

1. Implement immediate fix to prevent recursive filtering
2. Add performance instrumentation
3. Prototype hybrid caching approach
4. Measure and compare results
