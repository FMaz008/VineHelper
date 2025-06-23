# Placeholder Filter Fix Summary

## Issue Description

When changing filters in the notification monitor, placeholder tiles had three issues:

1. Sometimes they didn't appear or appeared after a delay
2. They would "bounce in" after tiles appeared, causing a visual shift
3. Different filter types exhibited different behaviors (some bounced, some jumped)

This has been a challenging intermittent issue with many previous fix attempts.

## Root Causes

### Issue 1: Placeholders Not Appearing

The issue was in the `NoShiftGrid.insertPlaceholderTiles()` method at line 291-296. The code had an early return that would skip DOM updates if the placeholder count remained the same:

```javascript
if (currentPlaceholders.length === finalPlaceholderCount) {
	// Skip DOM update
	return;
}
```

However, when filtering changes which items are visible, the placeholder count might remain the same but the placeholders still need to be repositioned at the beginning of the grid. The early return prevented this repositioning from happening.

### Issue 2: Placeholder "Bounce" Effect (Batching Delay)

The bounce effect was caused by the batching system in `GridEventManager`. When filtering, if `fetchingRecentItems` was true, the `updatePlaceholders` method would use `batchUpdate` which delays the placeholder insertion by 50ms. This caused tiles to appear first, then placeholders would "bounce in" after the delay.

### Issue 3: Double RequestAnimationFrame Delay

The most significant cause of the bounce effect was in `NotificationMonitor.#updateVisibleCountAfterFiltering()`. This method used a **double `requestAnimationFrame`** (nested), which created a significant delay (typically 32-33ms) before emitting the `grid:items-filtered` event. This delay meant:

- Tiles would be shown/hidden immediately by `applyFilteringToAllItems()`
- Placeholders would update 32-33ms later when the event finally fired
- Users would see tiles appear first, then placeholders "bounce in"

## Solutions

### Fix 1: Allow Placeholder Repositioning During Filtering

Modified the early return condition in `NoShiftGrid.js` to exclude filter operations:

```javascript
// For filter operations, we need to reposition placeholders even if count is unchanged
// because items may have been filtered out from different positions
if (currentPlaceholders.length === finalPlaceholderCount && !forceForFilter) {
	// Only log if explicitly debugging placeholders (not for every operation)
	if (debugPlaceholders) {
		console.log("[NoShiftGrid] Placeholder count unchanged, skipping DOM update");
	}
	return;
}
```

### Fix 2: Immediate Placeholder Updates for Filters

Modified the `updatePlaceholders` method in `GridEventManager.js` to bypass batching for filter operations:

```javascript
#updatePlaceholders(fetchingRecentItems, forceForFilter = false) {
    // For filter operations, always update immediately to prevent visual bounce
    if (forceForFilter) {
        this.#noShiftGrid.insertPlaceholderTiles(forceForFilter);
    } else if (fetchingRecentItems) {
        this.#batchUpdate("placeholder", () => {
            this.#noShiftGrid.insertPlaceholderTiles(forceForFilter);
        });
    } else {
        // For non-fetching updates, update placeholders immediately
        this.#noShiftGrid.insertPlaceholderTiles(forceForFilter);
    }
}
```

### Fix 3: Remove Double RequestAnimationFrame Delay

Modified `NotificationMonitor.#updateVisibleCountAfterFiltering()` to execute immediately instead of using double `requestAnimationFrame`:

```javascript
#updateVisibleCountAfterFiltering() {
    // For filter operations, update immediately to prevent placeholder bounce
    // The DOM is already updated by applyFilteringToAllItems

    // Invalidate computed style cache after bulk filtering
    // This prevents stale cached values after style changes
    this.#invalidateComputedStyleCache();

    // Force a reflow to ensure styles are applied
    void this._gridContainer.offsetHeight;

    // Recalculate visible count after filtering
    let newCount;
    if (this._visibilityStateManager && this._visibilityStateManager.recalculateCount) {
        // V3 with VisibilityStateManager - use its recalculation method
        const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
        newCount = this._visibilityStateManager.recalculateCount(tiles);
    } else {
        // V2 fallback - count directly
        newCount = this._countVisibleItems();
        // Update the visibility state manager with new count (V3 only)
        this._visibilityStateManager?.setCount(newCount);
    }

    // Update tab title
    this._updateTabTitle(newCount);
    // Emit event for filter change with visible count
    // The GridEventManager will handle placeholder updates via this event
    this.#emitGridEvent("grid:items-filtered", { visibleCount: newCount });
}
```

## Files Modified

- `scripts/notifications-monitor/services/NoShiftGrid.js` - Fixed the early return logic to allow placeholder repositioning during filter operations
- `scripts/notifications-monitor/services/GridEventManager.js` - Modified to bypass batching for filter operations, ensuring immediate placeholder updates
- `scripts/notifications-monitor/core/NotificationMonitor.js` - Removed double `requestAnimationFrame` delay for immediate event emission

## Testing

The fixes were thoroughly tested across all filter types to ensure proper placeholder behavior. See `docs/BATCHING_ANALYSIS.md` for analysis of when batching is needed and performance implications.

## Impact

These fixes ensure that:

1. **All filter types** (Zero ETV, KW Match, Show All, Regular, Unknown ETV, etc.) update placeholders immediately
2. Placeholder tiles are always properly positioned when filters change
3. Placeholders and tiles appear simultaneously without visual "bounce" or "jump"
4. Grid alignment is maintained and layout shifts are prevented
5. Performance optimizations for non-filter operations are preserved
6. User interactions feel responsive with no artificial delays

The changes are minimal and surgical, only affecting behavior during filter operations while preserving performance optimizations for bulk operations.
