# Memory Optimization Recommendations

Based on Chrome memory allocation profile analysis and memory leak detection, here are the key areas for optimization:

## Critical Memory Leaks Identified (June 2025)

### 1. NotificationMonitor Instance Leak (735-1092 instances) ✅ FIXED

**Problem**: Multiple NotificationMonitor instances were being retained in memory
**Expected**: Only 1 instance should exist at a time
**Fix Applied**: Added cleanup in bootloader.js before creating new instances

### 2. KeywordMatch Object Retention (168-186 instances) ✅ FIXED

**Problem**: KeywordMatch objects consuming 3.0 MB each were not being garbage collected
**Root Cause**: WeakMap cache was accumulating because Settings.get() returns new array references
**Fix Applied**:

- Changed from WeakMap to Map with JSON stringified keys
- Added MAX_CACHE_SIZE limit of 10 entries
- Implemented automatic cache cleanup
- Added periodic cache clearing every 10 minutes via MemoryDebugger

### 3. ServerCom Instance Growth (84-248 instances) 🔧 PENDING

**Problem**: ServerCom instances growing 3x over time
**Root Cause**: WebSocket connections not being properly closed
**Required Fix**: Implement proper cleanup in destroy method

### 4. NewItemStreamProcessing Accumulation (20-52 instances) 🔧 PENDING

**Problem**: Stream processors not being cleaned up
**Root Cause**: Missing cleanup in destroy methods
**Required Fix**: Add comprehensive cleanup methods

### 5. Streamy Instance Retention (41-52 instances) 🔧 PENDING

**Problem**: Stream objects accumulating
**Root Cause**: Event listeners not being removed
**Required Fix**: Track and remove all event listeners

## 1. Keyword Matching Optimizations

### Current Issues:

- KeywordMatch.js shows high memory allocation (lines 124, 150, 168)
- Likely creating many temporary objects during regex matching

### Recommendations:

```javascript
// 1. Reuse regex test results
const regexCache = new Map();
function cachedRegexTest(regex, string) {
	const key = `${regex.source}:${string}`;
	if (regexCache.has(key)) {
		return regexCache.get(key);
	}
	const result = regex.test(string);
	// Limit cache size to prevent unbounded growth
	if (regexCache.size > 1000) {
		const firstKey = regexCache.keys().next().value;
		regexCache.delete(firstKey);
	}
	regexCache.set(key, result);
	return result;
}

// 2. Object pooling for keyword results
const keywordResultPool = [];
function getKeywordResult() {
	return keywordResultPool.pop() || {};
}
function releaseKeywordResult(result) {
	// Clear the object
	for (const key in result) {
		delete result[key];
	}
	keywordResultPool.push(result);
}
```

## 2. Stream Processing Optimizations

### Current Issues:

- NewItemStreamProcessing.js allocates memory for each item transformation
- Creates new objects instead of mutating existing ones

### Recommendations:

```javascript
// 1. Mutate objects in-place instead of creating new ones
const transformIsHighlight = dataStream.transformer(function (data) {
	// Instead of returning new object, mutate existing
	if (data.item?.data?.title !== undefined) {
		const highlightKWMatch = keywordMatch(
			Settings.get("general.highlightKeywords"),
			data.item.data.title,
			data.item.data.etv_min,
			data.item.data.etv_max
		);
		// Mutate in place
		data.item.data.KWsMatch = highlightKWMatch !== false;
		data.item.data.KW = highlightKWMatch;
	}
	return data; // Return same object
});

// 2. Clear old references
function processItemBatch(items) {
	const results = [];
	for (let i = 0; i < items.length; i++) {
		const result = processItem(items[i]);
		results.push(result);
		// Clear reference to allow GC
		items[i] = null;
	}
	return results;
}
```

## 3. NotificationMonitor Optimizations

### Current Issues:

- Creating many DOM elements and event listeners
- Keeping references to all items in memory

### Recommendations:

```javascript
// 1. Implement virtual scrolling for large item lists
class VirtualScroller {
	constructor(container, itemHeight) {
		this.container = container;
		this.itemHeight = itemHeight;
		this.visibleItems = new Map();
		this.itemPool = [];
	}

	getItemElement() {
		return this.itemPool.pop() || this.createItemElement();
	}

	releaseItemElement(element) {
		// Clear event listeners
		element.replaceWith(element.cloneNode(true));
		this.itemPool.push(element);
	}
}

// 2. Batch DOM operations
const pendingDOMUpdates = [];
let rafId = null;

function scheduleDOMUpdate(update) {
	pendingDOMUpdates.push(update);
	if (!rafId) {
		rafId = requestAnimationFrame(() => {
			const fragment = document.createDocumentFragment();
			pendingDOMUpdates.forEach((update) => update(fragment));
			container.appendChild(fragment);
			pendingDOMUpdates.length = 0;
			rafId = null;
		});
	}
}
```

## 4. Socket.io Memory Management

### Current Issues:

- WebSocket messages may be retained in memory
- Event emitters can leak if not properly cleaned

### Recommendations:

```javascript
// 1. Limit message buffer size
class BoundedMessageBuffer {
	constructor(maxSize = 1000) {
		this.messages = [];
		this.maxSize = maxSize;
	}

	add(message) {
		this.messages.push(message);
		if (this.messages.length > this.maxSize) {
			// Remove oldest messages
			this.messages.splice(0, this.messages.length - this.maxSize);
		}
	}

	clear() {
		this.messages.length = 0;
	}
}

// 2. Properly clean up event listeners
class SocketManager {
	constructor() {
		this.listeners = new Map();
	}

	on(event, handler) {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event).add(handler);

		// Return cleanup function
		return () => {
			const handlers = this.listeners.get(event);
			if (handlers) {
				handlers.delete(handler);
				if (handlers.size === 0) {
					this.listeners.delete(event);
				}
			}
		};
	}

	destroy() {
		this.listeners.clear();
	}
}
```

## 5. General Memory Management Best Practices

### 1. Implement Memory Monitoring

```javascript
class MemoryMonitor {
	static logMemoryUsage(label) {
		if (performance.memory) {
			console.log(`[Memory] ${label}:`, {
				usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + " MB",
				totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + " MB",
				jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + " MB",
			});
		}
	}

	static startMonitoring(interval = 30000) {
		return setInterval(() => {
			this.logMemoryUsage("Periodic Check");
		}, interval);
	}
}
```

### 2. Implement Cleanup Lifecycle

```javascript
class ComponentLifecycle {
	constructor() {
		this.cleanupTasks = [];
	}

	addCleanup(task) {
		this.cleanupTasks.push(task);
	}

	cleanup() {
		this.cleanupTasks.forEach((task) => {
			try {
				task();
			} catch (e) {
				console.error("Cleanup task failed:", e);
			}
		});
		this.cleanupTasks.length = 0;
	}
}
```

### 3. Use WeakMaps for Object Associations

```javascript
// Instead of attaching properties to DOM elements
const elementData = new WeakMap();

function setElementData(element, data) {
	elementData.set(element, data);
}

function getElementData(element) {
	return elementData.get(element);
}
// Data is automatically garbage collected when element is removed
```

## 6. DOM Visibility Checking Performance Optimizations

### Current Issues:

- `window.getComputedStyle()` forces style recalculation/reflow for each element
- Multiple loops through elements calling `getComputedStyle` can cause performance degradation
- Particularly impactful with large numbers of items (50+)

### Recommendations:

```javascript
// 1. Batch style calculations to minimize reflows
function countVisibleItemsBatched(container) {
	// Force a single reflow by reading offsetHeight first
	void container.offsetHeight;

	const itemTiles = container.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");

	// For Safari and large item counts, use optimized approach
	const useOptimizedApproach = isSafari() || itemTiles.length > 50;

	if (useOptimizedApproach) {
		// Batch read all computed styles at once to minimize reflows
		const tilesToCheck = Array.from(itemTiles);
		const computedStyles = tilesToCheck.map((tile) => ({
			tile,
			display: window.getComputedStyle(tile).display,
		}));

		// Process results without triggering additional reflows
		let count = 0;
		for (const { display } of computedStyles) {
			if (display !== "none") {
				count++;
			}
		}
		return count;
	} else {
		// Direct approach for smaller counts
		let count = 0;
		for (const tile of itemTiles) {
			if (window.getComputedStyle(tile).display !== "none") {
				count++;
			}
		}
		return count;
	}
}

// 2. Cache computed styles for Safari (already implemented in NotificationMonitor)
class ComputedStyleCache {
	constructor() {
		this.cache = new WeakMap();
	}

	getStyle(element) {
		let cachedStyle = this.cache.get(element);
		if (!cachedStyle) {
			cachedStyle = window.getComputedStyle(element);
			this.cache.set(element, cachedStyle);
		}
		return cachedStyle;
	}

	invalidate() {
		this.cache = new WeakMap();
	}
}

// 3. Use Intersection Observer for visibility tracking (future optimization)
class VisibilityTracker {
	constructor() {
		this.visibleElements = new Set();
		this.observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						this.visibleElements.add(entry.target);
					} else {
						this.visibleElements.delete(entry.target);
					}
				}
			},
			{ root: null, threshold: 0.1 }
		);
	}

	observe(element) {
		this.observer.observe(element);
	}

	unobserve(element) {
		this.observer.unobserve(element);
		this.visibleElements.delete(element);
	}

	getVisibleCount() {
		return this.visibleElements.size;
	}

	destroy() {
		this.observer.disconnect();
		this.visibleElements.clear();
	}
}
```

### Performance Trade-offs:

- **`getComputedStyle()`**: More accurate but slower, triggers reflows
- **Inline style checking**: Faster but less accurate, misses CSS rules
- **Batching**: Reduces reflows but uses more memory temporarily
- **Caching**: Faster for repeated checks but requires invalidation management

### When to Use Each Approach:

1. **Small item counts (<50)**: Direct `getComputedStyle` approach
2. **Large item counts (50+)**: Batched approach with array mapping
3. **Safari browser**: Use WeakMap cache (already implemented)
4. **Future optimization**: Consider Intersection Observer for viewport-based visibility

## Memory Debugging Tools

### Using the Memory Debugger

The VineHelper includes a built-in memory debugger that can be activated by enabling "Debug Memory" in settings. Once enabled and after page reload, use these commands in the browser console:

```javascript
// Take a memory snapshot
VH_MEMORY.takeSnapshot("before-changes");

// Generate a memory report
VH_MEMORY.generateReport();

// Detect memory leaks
VH_MEMORY.detectLeaks();

// Check for detached DOM nodes
VH_MEMORY.checkDetachedNodes();

// Clean up tracked resources
VH_MEMORY.cleanup();

// Stop monitoring (to free resources)
VH_MEMORY.stopMonitoring();
```

### Automated Memory Monitoring

The MemoryDebugger automatically:

- Checks for detached nodes every 30 seconds
- Takes memory snapshots every 2 minutes
- Runs leak detection every 5 minutes
- Clears keyword cache every 10 minutes

## Implementation Priority

1. **Completed**: NotificationMonitor singleton pattern ✅
2. **Completed**: KeywordMatch memory optimization ✅
3. **High Priority**: ServerCom WebSocket cleanup 🔧
4. **High Priority**: NewItemStreamProcessing cleanup 🔧
5. **High Priority**: Streamy event listener cleanup 🔧
6. **Medium Priority**: DOM visibility checking optimizations
7. **Medium Priority**: Virtual scrolling for large item lists
8. **Low Priority**: General object pooling and reuse

## Prevention Strategies

1. **Implement Destroy Pattern**: Every class must have a destroy() method
2. **Use WeakMaps**: For DOM element associations
3. **Event Listener Registry**: Track and clean all listeners
4. **Resource Pooling**: Reuse objects instead of creating new ones
5. **Periodic Cleanup**: Run cleanup tasks every 5-10 minutes
6. **Singleton Pattern**: Ensure single instances of major components

## Monitoring Success

After implementing these optimizations:

1. Take new memory profiles using Chrome DevTools
2. Compare allocation counts at the same code locations
3. Monitor heap size over time using VH_MEMORY tools
4. Check for memory growth patterns during extended use
5. Measure performance with Chrome DevTools Performance profiler
6. Test with varying item counts (10, 50, 100, 500+ items)
7. Monitor specific leak indicators:
    - NotificationMonitor instances should stay at 1
    - KeywordMatch cache size should stay under 10
    - WebSocket connections should be properly closed
    - Event listener count should remain stable

## Recent Fixes (June 2025)

### Memory Debugging UI Implementation ✅

- Added interactive memory debugging interface in settings page
- Take snapshots, generate reports, detect leaks, check detached nodes
- Color-coded log window with copy functionality
- Works via Chrome messaging API (no CSP violations)

### Detached DOM Node Event Listener Fix ✅

- Fixed MemoryDebugger false positives for grid container replacements
- Added proper untracking before DOM replacement:

```javascript
if (window.MEMORY_DEBUGGER && this.#eventHandlers.grid) {
	window.MEMORY_DEBUGGER.untrackListener(this._gridContainer, "click", this.#eventHandlers.grid);
}
```

### Memory Debugger Console Access ✅

- Created `VH_MEMORY` API directly on window object
- All methods accessible from browser console without CSP issues

## Next Steps

1. ✅ ~~Implement singleton pattern for NotificationMonitor~~
2. ✅ ~~Fix KeywordMatch memory leak with cache limits~~
3. ✅ ~~Add memory debugging UI to settings~~
4. ✅ ~~Fix detached DOM node tracking~~
5. 🔧 Add comprehensive destroy() methods to ServerCom
6. 🔧 Fix NewItemStreamProcessing cleanup
7. 🔧 Fix Streamy event listener removal
8. 🔧 Add memory leak detection to CI/CD pipeline
9. 🔧 Set up automated memory profiling
