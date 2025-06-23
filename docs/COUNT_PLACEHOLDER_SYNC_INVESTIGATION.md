# Count/Placeholder Synchronization Investigation

## Problem Description

- Tab shows 11 items but only 10 are visible
- Missing placeholder in bottom right (empty space)
- This happened after initial bulk load was correct
- Tab has been left open receiving items as they come in
- No recent resizing
- NOT related to item width TODO

## Root Causes Identified

### 1. **KW Match Filter Count Synchronization Issue**

When using the KW Match filter (Zero ETV or KW match only), the visible item count would become out of sync with the actual number of visible items. This was caused by:

- Visibility changes not properly updating the count when filters were applied
- The `updateVisibleCountAfterFiltering` method was not forcing immediate DOM updates
- Stale cached computed styles were being used after bulk filtering operations

### 2. **Placeholder Positioning During Fetch**

During the "fetching recent items" phase, placeholders would briefly appear at the top of the grid before being repositioned correctly after sorting. This caused:

- Visual "bounce" effect as placeholders moved from top to bottom
- Poor user experience during initial page load

## Solutions Implemented

### Fix 1: KW Match Filter Count Synchronization

#### Changes in `NotificationMonitor.js`:

1. **Immediate Count Updates**: Modified `updateVisibleCountAfterFiltering` to:

    - Invalidate computed style cache after bulk filtering
    - Force a reflow to ensure styles are applied
    - Recalculate visible count immediately after filtering
    - Emit `grid:items-filtered` event with accurate count

2. **Cache Invalidation**: Added `invalidateComputedStyleCache()` calls after:
    - Bulk filtering operations
    - Filter type changes
    - Queue filter changes

#### Changes in `GridEventManager.js`:

1. **Immediate Placeholder Updates**: Modified filter event handling to:
    - Update placeholders immediately when `grid:items-filtered` is received
    - Use the provided visible count from the event
    - Skip debouncing for filter operations to prevent visual delays

### Fix 2: Placeholder Positioning with Immediate Updates

#### Changes in `NoShiftGrid.js`:

1. **Force Update Flag**: Added `forceForFilter` parameter to `insertPlaceholderTiles`:

    - Forces immediate placeholder recalculation during filter operations
    - Prevents using stale placeholder counts
    - Ensures placeholders are always in sync with visible items

2. **Debug Logging**: Added comprehensive debug logging (gated by `debugPlaceholders` flag) to track:
    - Placeholder calculations
    - Grid width changes
    - Zoom detection
    - Filter-triggered updates

#### Changes in `GridEventManager.js`:

1. **Fetch Complete Handling**: Modified to:
    - Update placeholders immediately after fetch completes
    - Trigger sort after placeholder update to ensure correct positioning
    - Prevent placeholder "bounce" during initial load

## Technical Details

### Event Flow for Filter Changes:

1. User changes filter (e.g., selects "Zero ETV or KW match only")
2. `applyFilteringToAllItems()` is called
3. Each item's visibility is updated via `processNotificationFiltering()`
4. `updateVisibleCountAfterFiltering()` is called:
    - Invalidates computed style cache
    - Forces DOM reflow
    - Recalculates visible count
    - Emits `grid:items-filtered` event
5. `GridEventManager` receives event and immediately updates placeholders
6. Placeholders are recalculated with accurate count

### Event Flow for Fetch Complete:

1. Recent items finish loading
2. `fetchRecentItemsEnd()` is called
3. After 100ms delay (to ensure DOM has settled):
    - Visible count is recalculated
    - `grid:fetch-complete` event is emitted
4. `GridEventManager` handles the event:
    - Updates placeholders first
    - Triggers sort to position placeholders correctly

## Debug Settings

To troubleshoot count/placeholder issues, enable these debug settings:

- **Debug tab title** (`debugTabTitle`): Logs count changes and verification
- **Debug placeholders** (`debugPlaceholders`): Logs placeholder calculations and updates

## Verification Steps

1. **For KW Match Filter Issue**:

    - Enable "Zero ETV or KW match only" filter
    - Verify count in tab title matches visible items
    - Check that placeholders fill the bottom row correctly
    - Switch filters and verify count updates immediately

2. **For Placeholder Positioning**:
    - Reload the page
    - Watch for placeholders during "fetching recent items"
    - Verify placeholders appear at bottom, not top
    - Confirm no visual "bounce" effect

## Memory Considerations

The fixes include proper cleanup:

- Computed style cache is cleared when no longer needed
- Event listeners are properly managed
- No memory leaks from cached DOM references

## Future Improvements

1. Consider implementing periodic count verification (already prototyped in `_setupCountVerification`)
2. Add unit tests for count synchronization logic
3. Consider moving placeholder logic to a more centralized location
4. Implement more granular event types for different visibility change scenarios
