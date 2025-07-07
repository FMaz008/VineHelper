# Clear Unavailable Placeholder Fix

## Problem

After a "Clear Unavailable" operation, placeholders were not updating correctly even though the grid structure had changed. The logs showed:

```
Initial: 20 visible items, 3 placeholders (incorrect - should be 0 since 20 % 4 = 0)
After sort: 14 visible items, 0 placeholders (correct since 14 % 5 = 4, needs 1 placeholder)
```

The issue was that the GridEventManager was skipping placeholder updates with the message "Skipping placeholder update - count unchanged" because it only checked if the visible item count changed, not if the grid structure changed.

## Root Cause

The `GridEventManager.#handleVisibilityCountChanged()` method only checked `data.changed` to determine if placeholders needed updating. This failed in scenarios where:

1. Items were removed but the visible count stayed the same (due to filtering)
2. The grid structure changed (different number of rows) but the count remained constant
3. Bulk operations like "Clear Unavailable" changed the grid layout without changing the count

## Solution

We implemented a simplified check in `GridEventManager` that considers multiple scenarios:

1. **Count changes** - Always update if the count changed
2. **Bulk operations** - Force update after bulk operations via `isBulkOperation` flag
3. **Filter changes** - Force update when filters change via `source: 'filter-change'`

### Code Changes

1. **GridEventManager.js**:
    - Modified `#handleVisibilityCountChanged()` to check for:
        - `data.changed` (count changed)
        - `data.isBulkOperation` (bulk operations like "Clear Unavailable")
        - `data.source === 'filter-change'` (filter changes)

2. **TileCounter.js**:
    - Added `options` parameter to `recountVisibleTiles()` method
    - Pass `source` from options (or default to 'recount') in visibility:count-changed event
    - Pass `isBulkOperation` flag in visibility:count-changed event

3. **NotificationMonitor.js**:
    - Pass `{ isBulkOperation: true }` when calling `recountVisibleTiles()` after clearing unavailable items
    - Pass `{ source: 'filter-change' }` when calling `recountVisibleTiles()` after filter changes

## Testing

To test the fix:

1. Open the Notification Monitor with items that create incorrect placeholders
2. Click "Clear Unavailable"
3. Verify that placeholders update correctly based on the new grid structure
4. Check that the grid maintains proper alignment without shifts

## Impact

This fix ensures that placeholder tiles are correctly recalculated after bulk operations, preventing visual glitches and maintaining grid stability even when the visible item count doesn't change.
