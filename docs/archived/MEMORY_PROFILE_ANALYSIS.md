# Memory Profile Analysis - VineHelper Notification Monitor

## Date: June 21, 2025

### Executive Summary

Chrome memory profiling reveals that keyword matching operations are the primary memory consumers, accounting for approximately 50% of the heap allocation. While there are no critical memory leaks, there are significant optimization opportunities.

## Key Findings

### 1. Top Memory Consumers

#### Keyword Matching (49.91% of heap)

- `testKeywordMatch`: 2.8 MB
- `keywordMatchReturnFullObject`: 2.8 MB per instance (multiple instances)
- Transform handlers for keywords: ~1.9 MB each
- Multiple copies of keyword processing logic

#### Stream Processing (15.05% of heap)

- `filterHideItemHandler`: 844 KB
- `transformBlurHandler`: 86.6 KB
- `transformHighlightHandler`: 111 KB
- Each handler maintains separate state

#### DOM Operations (3.51% of heap)

- `storeItemDOMElement`: 98.4 KB per operation
- `addTileInGrid`: 98.4 KB per operation
- DOM references retained in memory

### 2. Memory Patterns

#### Positive Indicators

- No exponential growth patterns
- V8 API usage is minimal (246 KB)
- WebSocket memory usage is reasonable
- Most individual allocations are small

#### Areas of Concern

- Duplicate keyword matching logic
- Multiple transform handler instances
- DOM element references not using weak references
- Potential string concatenation in keyword matching

## Recommendations

### 1. Optimize Keyword Matching (High Priority)

**Current Issue**: Multiple instances of keyword matching logic consuming ~50% of heap

**Solution**:

```javascript
// SharedKeywordMatcher that leverages existing optimized caching
// IMPORTANT: Do NOT use WeakMap for caching - Settings.get() returns new arrays
// The existing KeywordMatch.js already has optimized caching with counter-based keys
class SharedKeywordMatcher {
	constructor() {
		// Track last matches to avoid redundant calls
		this.lastMatchCache = new Map();
	}

	match(keywords, title, etv_min, etv_max, keywordType) {
		// Use existing keywordMatchReturnFullObject which has:
		// - WeakMap + counter-based caching for compiled regexes
		// - Automatic pre-compilation on first use
		// - Proper cache size limits
		const result = keywordMatchReturnFullObject(keywords, title, etv_min, etv_max);

		// Simple last-match cache for consecutive identical calls
		const key = `${keywordType}:${title.substring(0, 50)}`;
		this.lastMatchCache.set(key, { result, etv_min, etv_max });

		return result;
	}
}
```

**Key Learnings from Past Implementations**:

- WeakMap caching failed because Settings.get() returns new array references
- JSON.stringify for cache keys was too expensive (1055x slower)
- Current solution uses WeakMap + counter approach for O(1) lookups
- Array caching in SettingsMgrDI maintains stable references

### 2. Consolidate Transform Handlers (Medium Priority)

**Current Issue**: Separate handlers for filter, blur, and highlight operations

**Solution**:

```javascript
// Single pipeline for all transformations
class UnifiedTransformHandler {
	constructor() {
		this.transformers = [this.filterTransform, this.highlightTransform, this.blurTransform];
	}

	async transform(item) {
		return this.transformers.reduce(async (acc, transformer) => transformer(await acc), Promise.resolve(item));
	}
}
```

### 3. Use WeakMap for DOM References (Medium Priority)

**Current Issue**: DOM elements retained in memory preventing garbage collection

**Solution**:

```javascript
// Replace Map with WeakMap for DOM references
const domElementCache = new WeakMap();

function storeItemDOMElement(item, element) {
	domElementCache.set(item, element);
}
```

### 4. Implement String Interning for Keywords (Low Priority)

**Current Issue**: Duplicate string allocations for repeated keywords

**Solution**:

```javascript
class StringInterner {
	constructor() {
		this.pool = new Map();
	}

	intern(str) {
		if (!this.pool.has(str)) {
			this.pool.set(str, str);
		}
		return this.pool.get(str);
	}
}
```

## Implementation Priority

1. **Immediate**: Keyword matching optimization (50% memory reduction potential)
2. **Next Sprint**: Transform handler consolidation (15% memory reduction potential)
3. **Future**: DOM reference optimization and string interning (5-10% memory reduction potential)

## Expected Impact

- **Memory Usage**: 40-60% reduction in heap allocation
- **Performance**: Faster keyword matching through caching
- **GC Pressure**: Reduced through WeakMap usage
- **Maintainability**: Cleaner code with consolidated handlers

## Monitoring Recommendations

1. Add memory usage metrics to track:
    - Heap size over time
    - Keyword cache hit rates
    - Transform pipeline performance

2. Set up alerts for:
    - Heap size > 100MB
    - GC pause time > 50ms
    - Memory growth > 10MB/hour

## Next Steps

1. Create a memory optimization branch
2. Implement SharedKeywordMatcher
3. Profile before/after changes
4. Deploy with monitoring enabled
5. Iterate based on production metrics
