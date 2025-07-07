# Placeholder Calculation Instability Fix

## Problem Diagnosis

### Observed Symptoms

Placeholder calculations were happening multiple times in succession and remained incorrect for 10-30 seconds after filter changes or window resizes. The issue persisted until a new item was received.

Example sequence:

1. Initial calculation: 102 visible, 3 placeholders
2. After sort: 99 visible, changes to 1 placeholder
3. Item visibility change: 100 visible, 0 placeholders
4. Multiple recalculations with same visible count

### Root Cause Analysis

#### 1. **Event Cascade Loop** (Primary Cause)

The system created a feedback loop through the following sequence:

- Visibility count changes trigger `visibility:count-changed` event
- GridEventManager responds by calling `updatePlaceholders()`
- NoShiftGrid's `insertPlaceholderTiles()` queries TileCounter for count
- DOM modifications may trigger another visibility recount
- This creates a cascading effect of multiple recalculations

**Evidence in Code:**

- `GridEventManager.js:481-496`: Immediately updates placeholders on count change
- `NoShiftGrid.js:235`: Queries TileCounter during placeholder calculation
- `TileCounter.js:101`: Broadcasts count changes to all listeners

#### 2. **Tile Width Measurement Instability** (Secondary Cause)

During window resize or filter changes, the tile width calculation was unstable:

- CSS Grid may not have settled when measurements are taken
- Cached tile width values might be stale during rapid changes
- This leads to incorrect `tilesPerRow` calculations
- Wrong calculations result in incorrect placeholder counts

**Evidence in Code:**

- `NoShiftGrid.js:240-241`: Calculates tilesPerRow based on tile width
- `NoShiftGrid.js:418-424`: Uses 5-second cache that may be stale
- Multiple fallback methods for tile width calculation indicate measurement difficulties

### Additional Contributing Factors

3. **Async Timing Issues**
    - 150ms setTimeout after fetch operations (GridEventManager.js:315)
    - Pending update mechanism with setTimeout(..., 0) (NoShiftGrid.js)
    - These async operations can execute out of order

4. **Visibility Cache Interference**
    - TileCounter has a 100ms cache
    - May provide stale counts during rapid updates

5. **Batching Mechanism Delays**
    - GridEventManager uses 50ms batch delay
    - Can cause updates to queue and execute unexpectedly

## Implemented Solutions

### 1. Event Cascade Loop Prevention (GridEventManager.js)

**Added Visibility Count Change Debouncing:**

- 100ms debounce delay for visibility count changes
- Prevents immediate placeholder updates from every count change
- Only processes updates when count actually changes

**Loop Detection:**

- Tracks rapid updates (more than 5 within 500ms)
- Breaks potential infinite loops by ignoring excessive updates
- Resets counter after 1 second of stability

```javascript
// Track rapid updates to detect loops
if (now - this.#lastVisibilityUpdate < 500) {
	this.#visibilityUpdateCount++;
	if (this.#visibilityUpdateCount > 5) {
		// Break the loop
		return;
	}
}
```

### 2. Tile Width Cache Management (NoShiftGrid.js)

**Reduced Cache Duration:**

- Changed from 5 seconds to 1 second
- Provides better responsiveness during dynamic changes

**Context-Aware Caching:**

- Skips cache during active transitions (fetching or filtering)
- Forces fresh measurements when accuracy is critical

**Clear Cache on Key Events:**

- Window resize events
- Filter changes
- Grid initialization

```javascript
// Don't use cache during active DOM operations
const isTransitioning =
	this._monitor._fetchingRecentItems || (this._monitor._filterType && this._monitor._filterType !== "all");

if (!isTransitioning) {
	return this._cachedTileWidth;
}
```

### 3. Update Consolidation (NoShiftGrid.js)

**Minimum Update Interval:**

- Enforces 50ms minimum between placeholder updates
- Prevents rapid consecutive recalculations

**Rapid Update Detection:**

- Tracks update frequency
- Enforces 500ms cooldown after detecting potential loop (10+ rapid updates)

```javascript
// Check minimum update interval
const timeSinceLastUpdate = callId - this._lastPlaceholderUpdate;
if (timeSinceLastUpdate < this._minUpdateInterval && !forceForFilter) {
	return;
}
```

### 4. Enhanced Safeguards

**State Tracking:**

- Tracks if placeholder update is in progress
- Queues pending updates instead of triggering new ones
- Processes queued updates after current one completes

**Debug Logging:**

- Enhanced logging for cache operations
- Loop detection warnings
- Update frequency tracking

## Results

These fixes work together to:

1. **Break cascading loops** by debouncing and detecting rapid updates
2. **Ensure accurate measurements** by managing cache intelligently
3. **Prevent redundant calculations** through update consolidation
4. **Maintain stability** while preserving responsiveness

The placeholder system now:

- Responds quickly to user actions
- Avoids infinite update loops
- Maintains accurate tile measurements
- Provides stable grid layout during all operations

## Testing

To verify the fixes:

1. **Rapid Filter Changes**: Switch quickly between filter types
2. **Window Resizing**: Resize browser window continuously
3. **Bulk Operations**: Load many items at once
4. **Mixed Operations**: Combine filtering, resizing, and scrolling

The grid should remain stable without rapid placeholder recalculations.

## Future Improvements

### Simpler Alternative Approach

The current fix adds significant complexity with multiple timers and state tracking. A simpler solution could implement a **single source of truth** pattern:

```javascript
// In GridEventManager
#handleVisibilityCountChanged(data) {
    // Only react to count changes from specific sources
    if (data.source === 'placeholder-update') {
        return; // Ignore our own updates
    }

    // Simple debounce
    clearTimeout(this.#updateTimer);
    this.#updateTimer = setTimeout(() => {
        this.#updatePlaceholders(false, true, 'visibility-change');
    }, 100);
}

// In NoShiftGrid
insertPlaceholderTiles(forceForFilter = false, source = 'unknown') {
    // ... existing logic ...

    // When we modify DOM, mark it
    this._monitor.getTileCounter()?.recountVisibleTiles(50, false, 'placeholder-update');
}
```

This approach would:

1. **Break the loop** by ignoring self-triggered events
2. **Use a single debounce timer** instead of multiple defensive mechanisms
3. **Require minimal code changes** while addressing the root cause
4. **Reduce complexity** by removing loop detection and state management

### Benefits of Future Refactoring

- **Cleaner code**: Less defensive programming, more direct solutions
- **Better performance**: Fewer timers and state checks
- **Easier maintenance**: Simpler logic is easier to understand and modify
- **Root cause fix**: Addresses the tight coupling between components

This refactoring should be considered for a future PR to maintain code quality while preserving the current fix's effectiveness.
