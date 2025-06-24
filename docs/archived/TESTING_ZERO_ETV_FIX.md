# Testing Guide: Zero ETV Double Counting Fix

This guide explains how to test the fix for the zero ETV double counting issue in the VineHelper browser extension.

## Background

The issue was that when a zero ETV item became visible (e.g., when switching to "Zero ETV only" filter), the visibility count would increment twice. Investigation revealed TWO separate causes:

1. **First Cause**: Duplicate visibility processing in the `#addNewItem` method
2. **Second Cause**: Redundant `handlePossibleVisibilityChange` calls in NotificationMonitor

## The Complete Fix

The complete fix required addressing both causes:

1. **First Fix**: Modified item type handlers to skip redundant filtering by passing `skipFiltering=true` to the item type handlers (`#zeroETVItemFound`, `#highlightedItemFound`, `#regularItemFound`) when they're called from `#addNewItem`, since filtering has already been applied.

2. **Second Fix**: Commented out the redundant `handlePossibleVisibilityChange` call in NotificationMonitor that was creating a duplicate processing path.

**IMPORTANT**: Both fixes are required for the issue to be fully resolved. The WeakSet tracking in VisibilityStateManager provides an additional safeguard but both root causes needed to be addressed.

## Testing Steps

### Prerequisites

1. Install the VineHelper extension in your browser
2. Enable debug mode to see detailed console logs:
   - Go to VineHelper settings
   - Enable "Debug tab title" option
   - This will show detailed visibility tracking in the browser console

### Test Scenario 1: Zero ETV Item Visibility

1. **Setup**:
   - Open Amazon Vine page
   - Open browser developer console (F12)
   - Filter console to show only messages containing "VisibilityStateManager" or "NotificationMonitor"

2. **Test Steps**:
   - Start with "All" filter selected
   - Wait for some zero ETV items to appear in the feed
   - Switch to "Zero ETV only" filter
   - Observe the console logs

3. **Expected Behavior**:
   - When switching to "Zero ETV only", you should see:
     - Items with zero ETV becoming visible
     - Count incrementing by 1 for each item that becomes visible
     - NO "manual-increment" logs immediately after visibility changes
     - The count should match the actual number of visible zero ETV items

4. **What to Look For in Logs**:
   ```
   [VisibilityStateManager] setVisibility called {operation: 'setVisibility', ... wasVisible: false, newVisible: true}
   [VisibilityStateManager] Count incremented {operation: 'increment', oldCount: 0, newCount: 1, ... source: 'visibility-change'}
   ```
   
   You should NOT see:
   ```
   [VisibilityStateManager] Count incremented {... source: 'manual-increment'}
   ```

### Test Scenario 2: New Zero ETV Items

1. **Setup**:
   - Set filter to "Zero ETV only"
   - Clear console
   - Wait for new items to stream in

2. **Expected Behavior**:
   - New zero ETV items should appear and increment count by 1 each
   - No double counting
   - No "manual-increment" in logs

### Test Scenario 3: Count Verification

1. **Setup**:
   - Let the extension run for a few minutes with "Zero ETV only" filter

2. **Expected Behavior**:
   - Periodic count verification should show "Count verification passed"
   - Should NOT see "Count mismatch detected!" messages
   - If mismatches occur, they should be rare and quickly corrected

### Debugging Tips

1. **Enable Verbose Logging**:
   - In console, you can see the full flow by looking for:
     - `[NotificationMonitor] New item added to DOM`
     - `[NotificationMonitor] Zero ETV item visibility check`
     - `[VisibilityStateManager] setVisibility called`

2. **Check Stack Traces**:
   - The logs include stack traces that show where visibility changes originate
   - This helps identify if there are multiple paths causing visibility updates

3. **Sound Notifications**:
   - If you hear the notification sound twice for a single item, that's a sign of double processing
   - With the fix, you should only hear one sound per new visible item

## Automated Tests

Run the existing test suite to ensure no regressions:

```bash
npm test tests/notifications-monitor/core/NotificationMonitor.test.js
npm test tests/notifications-monitor/services/VisibilityStateManager.test.js
```

## Reporting Issues

If you still see double counting:
1. Save the console logs showing the issue
2. Note the exact steps to reproduce
3. Include the filter state when the issue occurred
4. Report whether the count eventually self-corrects

## Implementation Details

The complete fix involved two modifications:

1. **NotificationMonitor.js** - Modified to pass `skipFiltering=true` when calling item type handlers from `#addNewItem`, preventing duplicate visibility processing.

2. **NotificationMonitor.js** - Commented out redundant `handlePossibleVisibilityChange` call that was creating a second processing path.

This ensures that:
- Visibility is processed through a single, consistent path
- Visibility changes happen once during `#processNotificationFiltering`
- Item type handlers only handle sound effects and sorting, not visibility
- The VisibilityStateManager maintains an accurate count without duplicate operations
- No redundant visibility processing occurs from multiple code paths