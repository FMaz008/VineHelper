# Count/Placeholder Synchronization Investigation

## Summary

This document details the investigation and resolution of four critical synchronization issues in the VineHelper notification monitor:

1. **KW Match Filter Count Desynchronization**: When applying the KW Match filter, the visible item count in the tab title would become out of sync with the actual number of visible items.

2. **Placeholder Positioning During Fetch**: During the "fetching recent items" phase, placeholder tiles would briefly appear at the top of the grid before jumping to their correct position at the bottom.

3. **Zero ETV Duplicate Processing**: When items receive Zero ETV values, the visibility count would be updated multiple times, causing count mismatches.

4. **Undefined ASIN in Duplicate Processing Check**: The Zero ETV duplicate processing prevention was ineffective due to using an undefined `asin` variable.

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

### 3. **Zero ETV Duplicate Processing**

When items receive Zero ETV values, the visibility count would be updated multiple times, causing count mismatches. This was caused by:

- The `#setETV` method being called multiple times for the same item (once for min value, once for max value)
- Each call triggering the full Zero ETV visibility check logic
- No mechanism to prevent duplicate processing of the same item
- Resulting in multiple visibility state changes and count updates for a single item

### 4. **Undefined ASIN in Duplicate Processing Check**

The Zero ETV duplicate processing prevention mechanism was failing due to a scoping issue. This was caused by:

- The `#checkZeroETVStatus` method attempting to use an undefined `asin` variable
- The duplicate check `this.#etvProcessingItems.has(asin)` always returning false because `asin` was undefined
- This allowed the same item to be processed multiple times, defeating the purpose of the tracking Set

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

#### Changes in `NotificationMonitor.js` (formerly GridEventManager):

1. **Immediate Placeholder Updates**: Modified filter event handling to:
    - Update placeholders immediately when filtering is applied
    - Use the current visible count from the visibility state manager

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

#### Changes in `NotificationMonitor.js`:

1. **Fetch Complete Handling**: Modified to:
    - Update placeholders immediately after fetch completes
    - Trigger sort after placeholder update to ensure correct positioning
    - Prevent placeholder "bounce" during initial load

### Fix 3: Zero ETV Duplicate Processing Prevention

#### Changes in `NotificationMonitor.js`:

1. **Processing Tracker**: Added `#etvProcessingItems` Set to track items currently being processed:
    - Prevents duplicate Zero ETV visibility checks for the same item
    - Ensures each item's visibility is only updated once per ETV update cycle
    - Automatically cleaned up when items are removed

2. **Modified `#setETV` Method**:
    - Check if item is already being processed before running Zero ETV logic
    - Add item to processing set at start of Zero ETV check
    - Remove from set after processing completes
    - Prevents race conditions when min/max ETV values are set in quick succession

3. **Enhanced Debug Logging**:
    - Added stack trace logging to identify duplicate processing call paths
    - Track when items are added/removed from processing set
    - Log visibility state changes with detailed context

### Fix 4: Undefined ASIN Variable Fix

#### Changes in `NotificationMonitor.js`:

1. **Fixed Variable Scoping in `#checkZeroETVStatus`**:
    - Added `const asin = notif.dataset.asin;` to properly retrieve the ASIN
    - This ensures the duplicate processing check actually works
    - The tracking Set can now properly identify and prevent duplicate processing

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
5. `NotificationMonitor` receives event and immediately updates placeholders
6. Placeholders are recalculated with accurate count

### Event Flow for Fetch Complete:

1. Recent items finish loading
2. `fetchRecentItemsEnd()` is called
3. After 100ms delay (to ensure DOM has settled):
    - Visible count is recalculated
    - `grid:fetch-complete` event is emitted
4. `NotificationMonitor` handles the event:
    - Updates placeholders first
    - Triggers sort to position placeholders correctly

### Event Flow for Zero ETV Processing:

1. Item receives ETV update via `#setETV(item, value, isMax)`
2. Method checks if item is already in `#etvProcessingItems` Set
3. If not already processing:
    - Add item to processing set
    - Check if value is zero and item matches Zero ETV criteria
    - If visibility needs to change:
        - Update item visibility
        - Trigger visibility state change in `VisibilityStateManager`
        - Count is updated only once
    - Remove item from processing set
4. If already processing (duplicate call):
    - Skip all Zero ETV logic
    - Prevent duplicate visibility updates

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

3. **For Zero ETV Duplicate Processing**:
    - Enable debug tab title and debug placeholders settings
    - Monitor items receiving Zero ETV values
    - Check console for "Zero ETV item visibility check" logs
    - Verify each item only appears once in these logs
    - Confirm count changes by exactly 1 for each Zero ETV item
    - Watch for "Item already being processed" debug messages

## Memory Considerations

The fixes include proper cleanup:

- Computed style cache is cleared when no longer needed
- Event listeners are properly managed
- No memory leaks from cached DOM references
- `#etvProcessingItems` Set is cleaned up when items are removed
- Processing tracker prevents memory buildup from duplicate operations

## Future Improvements

1. Consider implementing periodic count verification (already prototyped in `_setupCountVerification`)
2. Add unit tests for count synchronization logic
3. Consider moving placeholder logic to a more centralized location
4. Implement more granular event types for different visibility change scenarios
