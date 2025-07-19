# Visibility Counting Architecture Analysis

## Executive Summary

The current TileCounter implementation recounts all visible tiles from the DOM for every single item addition, causing O(n²) performance degradation and event queue backlog. This document analyzes the root causes, proposes alternative architectures, and provides implementation recommendations.

## Current Architecture Problems

### 1. Full DOM Scan Per Item

```javascript
// Current implementation in TileCounter.js
recountVisibleTiles() {
    const tiles = grid.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
    let count = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (tiles[i].style.display !== "none") {
            count++;
        }
    }
}
```

**Performance Impact:**

- Adding 10 items with 50 existing = 10 × 50 = 500 DOM reads
- Adding 100 items with 200 existing = 100 × 200 = 20,000 DOM reads
- Creates cascading event loops lasting 10-30 seconds

### 2. Event Queue Saturation

```
Item Added → Recount → Event → Placeholder Update → Event → Next Item
    ↑                                                              ↓
    └──────────────────── Blocks Sound Events ────────────────────┘
```

This causes:

- Sound notifications delayed by 10-30 seconds
- UI becomes unresponsive
- Browser may show "slow script" warnings

## Why We Don't Trust State

### Sources of State Desynchronization

1. **Direct DOM Manipulation**
    - External scripts modifying visibility
    - Browser extensions hiding elements
    - CSS rules changing display properties

2. **Filter Changes**
    - Filters modify visibility without going through TileCounter
    - Multiple filter types interact in complex ways
    - Race conditions between filter application and counting

3. **Async Operations**
    - Items loaded asynchronously
    - Visibility changes during loading
    - Network delays causing out-of-order updates

4. **Memory Leaks**
    - Items removed from DOM but state not updated
    - Event listeners preventing garbage collection
    - Orphaned references in visibility state

## Proposed Solutions

### Solution 1: Incremental State Tracking

**Concept:** Maintain internal visibility state, update incrementally

```javascript
class TileCounter {
	#visibilityState = new Map(); // ASIN -> boolean

	addItem(asin, isVisible) {
		this.#visibilityState.set(asin, isVisible);
		if (isVisible) {
			this.#count++;
			this.#emitChange("single-add");
		}
	}

	updateVisibility(asin, isVisible) {
		const wasVisible = this.#visibilityState.get(asin);
		if (wasVisible !== isVisible) {
			this.#visibilityState.set(asin, isVisible);
			this.#count += isVisible ? 1 : -1;
			this.#emitChange("visibility-change");
		}
	}
}
```

**Pros:**

- O(1) updates instead of O(n)
- No DOM queries for counts
- Immediate response

**Cons:**

- Must intercept ALL visibility changes
- State can drift from reality
- Requires periodic reconciliation

**Mitigation:**

- Periodic full recount (every 60 seconds)
- Checksum validation
- State recovery mechanisms

### Solution 2: Batched Updates with State

**Concept:** Queue updates, process in batches

```javascript
class BatchedTileCounter {
	#pendingUpdates = [];
	#batchTimer = null;

	queueUpdate(operation) {
		this.#pendingUpdates.push(operation);
		this.#scheduleBatch();
	}

	#scheduleBatch() {
		if (!this.#batchTimer) {
			this.#batchTimer = setTimeout(() => {
				this.#processBatch();
			}, 16); // Next frame
		}
	}

	#processBatch() {
		const updates = this.#pendingUpdates.splice(0);
		let deltaCount = 0;

		updates.forEach((update) => {
			if (update.type === "add" && update.isVisible) deltaCount++;
			if (update.type === "remove" && update.wasVisible) deltaCount--;
		});

		this.#count += deltaCount;
		if (deltaCount !== 0) {
			this.#emitChange("batch", updates.length);
		}

		this.#batchTimer = null;
	}
}
```

**Pros:**

- Reduces event frequency
- Maintains accuracy
- Better for bulk operations

**Cons:**

- 16ms latency for updates
- Complex error handling
- Memory overhead for queue

### Solution 3: Hybrid Approach (Recommended)

**Concept:** Incremental state with smart reconciliation

```javascript
class HybridTileCounter {
	#state = new Map();
	#lastFullCount = 0;
	#lastFullCountTime = 0;
	#pendingOperations = [];
	#reconcileThreshold = 100; // Operations before reconcile

	updateItem(asin, isVisible, source) {
		// Immediate state update
		const prev = this.#state.get(asin);
		this.#state.set(asin, isVisible);

		// Track operation for reconciliation
		this.#pendingOperations.push({ asin, prev, isVisible, source });

		// Immediate count update
		if (prev !== isVisible) {
			this.#count += isVisible ? 1 : -1;
			this.#scheduleEmit(source);
		}

		// Check if reconciliation needed
		if (this.#needsReconciliation()) {
			this.#scheduleReconciliation();
		}
	}

	#needsReconciliation() {
		return (
			this.#pendingOperations.length > this.#reconcileThreshold || Date.now() - this.#lastFullCountTime > 60000 // 1 minute
		);
	}

	#reconcile() {
		const actualCount = this.#performFullCount();
		const drift = Math.abs(actualCount - this.#count);

		if (drift > 0) {
			console.warn(`State drift detected: ${drift} items`);
			this.#count = actualCount;
			this.#rebuildState();
		}

		this.#pendingOperations = [];
		this.#lastFullCountTime = Date.now();
	}
}
```

## Implementation Plan

### Phase 1: Instrumentation (1 week)

1. Add comprehensive logging to track state drift
2. Measure current performance baseline
3. Identify all visibility change paths

### Phase 2: State Management (2 weeks)

1. Implement visibility state Map
2. Add state update methods
3. Create reconciliation logic
4. Add drift detection

### Phase 3: Batching Layer (1 week)

1. Implement operation queue
2. Add batch processing
3. Optimize batch sizes
4. Add priority handling for user actions

### Phase 4: Integration (2 weeks)

1. Update NotificationMonitor to use new API
2. Modify filter system integration
3. Update GridEventManager
4. Ensure backward compatibility

### Phase 5: Monitoring (1 week)

1. Add performance metrics
2. Create drift monitoring
3. Add debug UI
4. Document new architecture

## Batching Deep Dive

### Benefits of Batching

1. **Reduced Event Frequency**
    - 100 items → 1 event instead of 100
    - Less pressure on event queue
    - Allows other events (like sound) to process

2. **DOM Optimization**
    - Single reflow/repaint cycle
    - Better browser optimization
    - Reduced CPU usage

3. **Network Efficiency**
    - Can batch server requests
    - Reduced WebSocket messages
    - Better bandwidth usage

### Batching Tradeoffs

1. **Latency**
    - Minimum 16ms delay (1 frame)
    - Up to 50ms for low-priority updates
    - User might notice delay on single actions

2. **Memory**
    - Must store pending operations
    - Can grow large with rapid updates
    - Need size limits and overflow handling

3. **Complexity**
    - Error handling for partial batches
    - Priority management
    - Cancellation logic

### Optimal Batch Sizes

```javascript
const BATCH_CONFIGS = {
	userAction: {
		maxSize: 1, // Process immediately
		maxWait: 0, // No delay
		priority: "high",
	},
	streaming: {
		maxSize: 50, // Up to 50 items
		maxWait: 100, // Max 100ms wait
		priority: "normal",
	},
	background: {
		maxSize: 200, // Large batches OK
		maxWait: 1000, // Up to 1 second
		priority: "low",
	},
};
```

## State vs DOM Truth

### When to Trust State

1. **Recent Operations** - State updated within last 100ms
2. **Controlled Updates** - All changes go through our API
3. **Isolated Components** - No external interference

### When to Verify with DOM

1. **After Filter Changes** - Complex visibility logic
2. **After Bulk Operations** - Higher chance of drift
3. **Periodic Checks** - Every 60 seconds baseline
4. **User Reports Issues** - Manual reconciliation trigger

### Reconciliation Strategy

```javascript
class ReconciliationStrategy {
	// Quick check - sample random items
	quickVerify(state, sampleSize = 10) {
		const items = Array.from(state.entries());
		const sample = this.randomSample(items, sampleSize);

		for (const [asin, expectedVisible] of sample) {
			const element = document.getElementById(`vh-notification-${asin}`);
			const actualVisible = element && element.style.display !== "none";

			if (actualVisible !== expectedVisible) {
				return false; // Drift detected
			}
		}
		return true; // Sample matches
	}

	// Full reconciliation
	fullReconcile(state) {
		const corrections = new Map();

		// Check all state entries against DOM
		for (const [asin, expectedVisible] of state) {
			const element = document.getElementById(`vh-notification-${asin}`);
			const actualVisible = element && element.style.display !== "none";

			if (actualVisible !== expectedVisible) {
				corrections.set(asin, actualVisible);
			}
		}

		// Check for DOM elements not in state
		const allTiles = document.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
		for (const tile of allTiles) {
			const asin = tile.dataset.asin;
			if (asin && !state.has(asin)) {
				corrections.set(asin, tile.style.display !== "none");
			}
		}

		return corrections;
	}
}
```

## Performance Comparison

### Current Architecture

- **Add 100 items**: 100 × n DOM queries = O(n²)
- **Time**: ~2-5 seconds for 200 items
- **Memory**: Minimal (no state)
- **Accuracy**: 100% (always queries DOM)

### Incremental State

- **Add 100 items**: 100 × O(1) = O(n)
- **Time**: ~10-50ms
- **Memory**: O(n) for state Map
- **Accuracy**: 99.9% with reconciliation

### Batched Updates

- **Add 100 items**: 2-3 batches = O(1) events
- **Time**: ~100-200ms total
- **Memory**: O(batch size)
- **Accuracy**: 100% if done right

## Recommendations

1. **Implement Hybrid Approach**
    - Best balance of performance and accuracy
    - Graceful degradation
    - Easier migration path

2. **Add Comprehensive Monitoring**
    - Track drift frequency
    - Measure performance gains
    - Monitor memory usage

3. **Gradual Rollout**
    - Feature flag for new architecture
    - A/B test with small percentage
    - Monitor error rates

4. **Sound Event Priority**
    - Separate queue for audio events
    - Web Audio API for precise timing
    - Bypass main event queue

## Performance Profile Analysis: 1000+ Items, 62 Visible

### Critical Bottlenecks Identified

From the Chrome DevTools profile with 1000+ items but only 62 visible:

1. **DOM Query Cost**: ~7,687ms spent in TileCounter operations
    - Each `querySelectorAll` with 1000+ items takes 5-10ms
    - Multiplied by hundreds of item additions = seconds of delay

2. **getComputedStyle Overhead**: ~3,766ms in style calculations
    - 1000+ calls per visibility check
    - Each call forces style recalculation
    - Browser must compute styles for hidden elements too

3. **Unnecessary Work**: 94% of tiles are hidden but still checked
    - Checking 1000+ tiles to find 62 visible ones
    - No early exit optimization
    - No spatial indexing or viewport culling

### Immediate Optimization: Viewport-Based Counting

```javascript
class OptimizedTileCounter {
	#intersectionObserver = null;
	#visibleTiles = new Set();

	constructor() {
		// Use Intersection Observer for viewport tracking
		this.#intersectionObserver = new IntersectionObserver((entries) => this.#handleIntersection(entries), {
			root: document.querySelector("#vvp-items-grid"),
			rootMargin: "50px", // Slightly larger than viewport
			threshold: 0.01,
		});
	}

	#handleIntersection(entries) {
		let changed = false;

		for (const entry of entries) {
			const tile = entry.target;
			const wasVisible = this.#visibleTiles.has(tile);

			if (entry.isIntersecting && !wasVisible) {
				// Tile entered viewport
				this.#visibleTiles.add(tile);
				changed = true;
			} else if (!entry.isIntersecting && wasVisible) {
				// Tile left viewport
				this.#visibleTiles.delete(tile);
				changed = true;
			}
		}

		if (changed) {
			this.#emitCountChange();
		}
	}

	observeTile(tile) {
		this.#intersectionObserver.observe(tile);
	}

	getCount() {
		// O(1) - just return Set size
		return this.#visibleTiles.size;
	}
}
```

**Benefits:**

- O(1) count retrieval
- Browser-optimized viewport detection
- No manual style calculations
- Automatic updates on scroll

### Short-term Fix: Early Exit Optimization

For immediate relief without major refactoring:

```javascript
#batchedVisibilityCheck(tiles) {
    let count = 0;
    const targetCount = 100; // Reasonable max visible tiles

    // Check tiles in viewport first (likely visible)
    const viewportBounds = this.#getViewportBounds();
    const tilesArray = Array.from(tiles);

    // Sort by likelihood of visibility (in viewport first)
    tilesArray.sort((a, b) => {
        const aInViewport = this.#isInViewport(a, viewportBounds);
        const bInViewport = this.#isInViewport(b, viewportBounds);
        return bInViewport - aInViewport;
    });

    // Check with early exit
    for (const tile of tilesArray) {
        if (count >= targetCount) {
            // Assume we found most/all visible tiles
            break;
        }

        const style = window.getComputedStyle(tile);
        if (style.display !== "none") {
            count++;
        }
    }

    return count;
}
```

### CSS-Only Visibility Tracking

Leverage CSS counters for zero-JavaScript counting:

```css
#vvp-items-grid {
	counter-reset: visible-tiles;
}

.vvp-item-tile:not(.vh-placeholder-tile):not([style*="display: none"]) {
	counter-increment: visible-tiles;
}

#vvp-items-grid::after {
	content: counter(visible-tiles);
	position: absolute;
	visibility: hidden;
}
```

Then read the count:

```javascript
const gridStyle = window.getComputedStyle(grid, "::after");
const count = parseInt(gridStyle.content);
```

## Revised Recommendations

### For 1000+ Items Scenario

1. **Implement Intersection Observer** (Highest Priority)
    - Eliminates need to check all tiles
    - Browser-optimized performance
    - Works well with virtual scrolling

2. **Add Virtual Scrolling**
    - Only render visible tiles + buffer
    - Dramatically reduces DOM size
    - Common pattern for large lists

3. **Batch Streaming Updates**
    - Collect items for 100-200ms
    - Process as single batch
    - One visibility count per batch

4. **Lazy Visibility Checking**
    - Only count when needed (user requests, sorts, etc.)
    - Cache aggressively between operations
    - Use dirty flags to track changes

## Conclusion

The current architecture's O(n²) performance is unsustainable. For scenarios with 1000+ items, the Intersection Observer approach provides the best immediate relief, while virtual scrolling offers the ultimate solution. The investment in refactoring will pay dividends in user experience, especially for power users with hundreds of items in their grid.

Key success metrics:

- Reduce visibility count time from 2-5s to <10ms for 1000+ items
- Eliminate getComputedStyle calls for hidden elements
- Achieve O(1) visibility counting
- Enable real-time updates without performance degradation
