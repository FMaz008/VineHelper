# Unknown ETV Filter Fix

## Problem

Items on the "Unknown ETV only" filter were not being removed when they received ETV data. The items would remain visible even after their `typeUnknownETV` flag was cleared.

## Root Cause

The issue was in the `#checkZeroETVStatus` method. When an item received ETV data:

1. The `typeUnknownETV` flag was correctly cleared (set to 0)
2. The filter was re-applied via `#processNotificationFiltering`, which should hide the item
3. **BUT** the method continued to check if the item had zero ETV
4. If the item had zero ETV, it would set `typeZeroETV = 1` and call `#processNotificationFiltering` AGAIN
5. This second filtering call could make the item visible again if the filter included zero ETV items

## Solution

Added an early return after re-applying the filter for items on the Unknown ETV filter. This prevents the zero ETV check from potentially re-showing the item.

### Code Changes

In `scripts/notifications-monitor/core/NotificationMonitor.js`, method `#checkZeroETVStatus`:

```javascript
// After clearing unknown ETV flag and re-applying filter
if (this._filterType === TYPE_UNKNOWN_ETV && wasVisible) {
	// ... logging ...

	// Re-apply the filter to this specific item
	const newVisibility = this.#processNotificationFiltering(notif);

	// ... more logging ...

	// IMPORTANT: Return early to prevent further processing that might re-show the item
	return;
}
```

### Debug Logging Added

Enhanced debug logging to track:

1. When entering `#checkZeroETVStatus` with all relevant data
2. When clearing the unknown ETV flag with ETV values
3. The visibility state before and after filter re-application

## Testing

To test the fix:

1. Enable "Debug Item Processing" in debug settings
2. Switch to "Unknown ETV only" filter
3. Wait for items with unknown ETV to appear
4. Watch console logs as items receive ETV data
5. Verify items disappear from the view when they get ETV values

## Related Files

- `scripts/notifications-monitor/core/NotificationMonitor.js` - Contains the fix
- `scripts/notifications-monitor/core/MonitorCore.js` - Handles styling application
