# Tile Count Discrepancy Debug Guide

## Issue Description

The user reported that there are 59 visible tiles on the grid, but the log and tab title show 58. This indicates a counting discrepancy in the TileCounter service.

### Update: Root Cause Identified

The logs revealed that it took approximately 9 minutes for the count to update from 58 to 59. The timeline:

- At timestamp 1752019119933: Item visibility changed from `display: 'none'` to `display: 'flex'`
- At timestamp 1752019663836: Count finally updated to 59 (about 9 minutes later!)

The issue was that `#processNotificationFiltering()` changes item visibility but doesn't trigger a tile recount.

## Potential Causes

1. **Visibility Detection Edge Cases**
    - A tile might have CSS properties that make it visible to the user but not detected by the visibility check
    - The visibility check looks for: `display !== "none"`, `visibility !== "hidden"`, `opacity !== "0"`
    - Edge cases could include:
        - Tiles with zero dimensions but still taking up space
        - Tiles partially off-screen
        - Tiles with other CSS properties affecting visibility

2. **Cache Synchronization**
    - The TileCounter uses a visibility cache that might be out of sync
    - A tile's visibility might have changed but the cache wasn't updated

3. **Race Conditions**
    - A tile might be added/removed during the counting process
    - The DOM might be in a transitional state during counting

4. **Selector Issues**
    - The selector `.vvp-item-tile:not(.vh-placeholder-tile)` might not capture all visible tiles
    - There might be tiles with different class names

## Debugging Steps

### 1. Use the Diagnostic Script

Copy and paste the entire contents of `/scripts/notifications-monitor/debug/diagnose-tile-count.js` into the browser console. This will:

- Count all tiles manually
- Check visibility using the same logic as TileCounter
- Compare with the reported count in the tab title
- Show details about hidden tiles and edge cases
- Calculate expected vs actual placeholder counts

### 2. Check for Edge Cases

Look for tiles that might be:

- Visible but with zero width/height
- Partially off-screen
- Have unusual CSS properties

### 3. Verify TileCounter Logic

The TileCounter checks visibility with:

```javascript
const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
```

### 4. Force a Recount

If the monitor is exposed, you can force a recount:

```javascript
// If monitor is available
monitor.getTileCounter().recountVisibleTiles(0, true);
```

## Solutions Implemented

1. **Added Diagnostic Method**
    - Added `diagnoseCount()` method to TileCounter class
    - Provides detailed information about counting discrepancies
    - Checks for edge cases like zero dimensions and off-screen tiles

2. **Created Debug Script**
    - `/scripts/notifications-monitor/debug/diagnose-tile-count.js`
    - Can be pasted into console for immediate diagnosis
    - Compares manual count with reported count
    - Shows hidden tiles and edge cases

3. **Fixed Visibility Change Detection** (NEW)
    - Modified `NotificationMonitor.js` to trigger a tile recount when item visibility changes
    - Added recount trigger in the visibility change debug logging section
    - Uses 100ms delay to batch multiple visibility changes
    - This ensures the count updates promptly when items become visible/hidden

## Next Steps

1. **Run the diagnostic script** when the discrepancy occurs
2. **Identify the specific tile** that's being miscounted
3. **Update the visibility logic** if needed to handle the edge case
4. **Consider adding more robust visibility detection** that handles edge cases

## Related Files

- `/scripts/notifications-monitor/services/TileCounter.js` - Main counting logic
- `/scripts/notifications-monitor/debug/diagnose-tile-count.js` - Diagnostic script
- `/scripts/notifications-monitor/services/NoShiftGrid.js` - Uses tile count for placeholders
