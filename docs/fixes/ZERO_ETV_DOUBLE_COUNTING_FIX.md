# Zero ETV Double Counting Fix

## Problem Summary

Items with Zero ETV or matching highlight keywords were being double-counted in the visible items count, causing the count to be higher than the actual number of visible items. This issue affected V3 monitors (the current production version).

## Root Cause

The double counting occurred in the `#handleVisibilityChange` method which was performing duplicate visibility processing:

1. **First increment**: During initial processing, visibility is set via:
    - `#processNotificationFiltering` → `#setElementVisibility` → `VisibilityStateManager.setVisibility()` → increment count

2. **Second increment**: The `#handleVisibilityChange` method was then:
    - Calling `#processNotificationFiltering` AGAIN (line 335 in the old code)
    - This triggered another visibility update and count increment
    - Items matching multiple criteria (e.g., both highlight keyword AND Zero ETV) were counted twice

### Specific Issue Example

- Item B0F9Z2T1TG arrives with both highlight keyword match and Zero ETV
- First visibility change happens via `#setElementVisibility` during initial processing
- `#handleVisibilityChange` is called and processes the item again
- Both paths independently increment the count, resulting in 5→6→7 instead of 5→6

## Solution Implemented

### Fix in NotificationMonitor.js #handleVisibilityChange (lines 313-344)

The fix prevents duplicate processing for V3 monitors:

```javascript
#handleVisibilityChange(element, wasVisible) {
    // For V3 with VisibilityStateManager, visibility is already handled by setElementVisibility
    // We just need to re-apply filtering without triggering another visibility change
    if (this._visibilityStateManager && this._visibilityStateManager.handlePossibleVisibilityChange) {
        // Get current visibility state from the element
        const isNowVisible = this._visibilityStateManager.isVisible(element);

        // Only emit change event if visibility actually changed
        // The count update was already handled by setElementVisibility
        if (wasVisible !== isNowVisible) {
            // Emit element-specific change event without updating count
            this._hookMgr?.hookExecute("visibility:element-changed", {
                element,
                wasVisible,
                isVisible: isNowVisible,
                timestamp: Date.now(),
            });
        }

        return isNowVisible;
    } else {
        // Fallback for V2 (legacy code path)
        const isNowVisible = this.#processNotificationFiltering(element);

        // Emit grid event if visibility changed
        if (wasVisible !== isNowVisible) {
            this.#emitGridEvent(isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
        }

        return isNowVisible;
    }
}
```

### Key Changes:

1. **No duplicate processing**: For V3, the method no longer calls `#processNotificationFiltering` again
2. **No duplicate count update**: Uses `isVisible()` to check current state without modifying it
3. **Event emission only**: Still emits visibility change events for other components that need them
4. **Count integrity maintained**: The count is only updated once during initial `#setElementVisibility` call

## Why This Fix Works

The root cause was that `#handleVisibilityChange` itself was performing duplicate processing by calling `#processNotificationFiltering` again after visibility had already been set. By modifying the method to only check state and emit events for V3 monitors (without re-processing), we eliminated the double counting issue entirely. No additional parameters, debouncing, or complex workarounds were needed - just a clean fix to prevent duplicate processing.

## Architectural Decision: Why hookExecute Instead of handlePossibleVisibilityChange

### The Problem with handlePossibleVisibilityChange

The `handlePossibleVisibilityChange` method in VisibilityStateManager violates the single responsibility principle by performing TWO distinct operations:

1. **State Management**: Updates the visibility count (lines 317-321)
2. **Event Notification**: Emits visibility change events (line 324)

This dual responsibility created the double counting issue because:

#### What handlePossibleVisibilityChange Does (5 Steps):

1. Checks current visibility state via `isVisible(element)`
2. Compares with previous state (`wasVisible`)
3. **Updates the count** if visibility changed (increment/decrement)
4. Emits a visibility change event
5. Returns whether visibility changed

The critical issue is **Step 3** - it modifies the count, but the count was already updated during the initial visibility processing through `setVisibility()`.

### The Two Code Paths Causing Double Increments

1. **First Path** (Initial Processing):
    - `processNotificationFiltering` → `setElementVisibility` → `VisibilityStateManager.setVisibility()`
    - This correctly updates visibility and increments count

2. **Second Path** (Duplicate Processing):
    - `handleVisibilityChange` → calls `handlePossibleVisibilityChange`
    - This AGAIN increments the count for the same visibility change

### The Architectural Fix: Separation of Concerns

The fix separates these responsibilities:

1. **VisibilityStateManager**: Exclusively manages visibility state and counts
    - `setVisibility()` is the ONLY method that updates counts
    - Provides read-only methods like `isVisible()` for checking state

2. **NotificationMonitor**: Uses `hookExecute` directly for notifications
    - Only emits events without modifying state
    - No count updates, no state changes

### Why This Prevents Double Counting

By using `hookExecute` directly instead of `handlePossibleVisibilityChange`:

- Visibility count updates happen in ONE place: `setVisibility()`
- Notifications happen separately via `hookExecute`
- No method performs both operations
- This architectural separation makes double counting impossible

The key insight: **State management and event notification should be separate concerns**. The original design mixed these concerns in `handlePossibleVisibilityChange`, leading to the double counting bug.

## Testing and Verification

To verify the fix:

1. Enable debug settings for visibility tracking
2. Monitor items that match multiple criteria (e.g., both highlight keyword and Zero ETV)
3. Verify that the count increments only once per item becoming visible
4. Check debug logs to confirm no duplicate processing occurs
5. Ensure the final count matches the actual number of visible items

## Implementation Details

The fix is implemented in the main item processing flow:

1. When an item is added (line 1509), visibility state is captured BEFORE setting type flags
2. Type flags are set (lines 1513-1523) for highlight keywords, Zero ETV, etc.
3. `#handleVisibilityChange` is called once (line 1530) to handle any visibility changes
4. For V3, this method now only checks state and emits events without re-processing

## Related Files

- `scripts/notifications-monitor/core/NotificationMonitor.js` - Contains the fix
- `scripts/notifications-monitor/services/VisibilityStateManager.js` - Manages visibility state and counts for V3 (includes built-in race condition detection)
