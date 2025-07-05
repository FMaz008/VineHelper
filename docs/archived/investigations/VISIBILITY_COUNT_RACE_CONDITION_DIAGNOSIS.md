# Visibility Count Race Condition Diagnosis

## Problem Summary

Items arriving in rapid succession (within ~28ms) can cause the visibility count to become incorrect. Specifically:

- Item B0FCDSYQ8P changes from invisible to visible (count: 3 → 4) ✓
- Item B0FDMYY6GG arrives 28ms later (remains invisible) but count jumps to 5 ✗
- System detects mismatch and corrects back to 4

## Root Cause Analysis

### Primary Hypothesis: Asynchronous State Update Race Condition

When two items arrive in rapid succession, there's a race condition between:

1. The visibility state check (`isVisible()`)
2. The DOM manipulation (`element.style.display`)
3. The count increment operation

### Sequence of Events

1. **Item B0FCDSYQ8P arrives** (T+0ms)
    - Initially invisible (isVisible: false)
    - Gets processed, matches KW filter
    - Visibility changes to true
    - Count increments: 3 → 4

2. **Item B0FDMYY6GG arrives** (T+28ms)
    - Should remain invisible (doesn't match filter)
    - **RACE CONDITION**: The visibility check may be reading stale state
    - Count incorrectly increments: 4 → 5

### Contributing Factors

1. **Timing Window**: 28ms is within the typical DOM update cycle
2. **Cache Invalidation**: The visibility cache might not be properly synchronized
3. **Computed Style Lag**: `getComputedStyle()` may return stale values during rapid updates
4. **Filter Processing Order**: Items are processed before their final visibility state is determined

## Debug Instrumentation Added

### 1. Race Condition Detection in VisibilityStateManager

```javascript
// Double-check visibility before incrementing
if (visible) {
	const computedStyle = window.getComputedStyle(element);
	const actuallyVisible = computedStyle.display !== "none";

	if (!actuallyVisible) {
		console.error("[VisibilityStateManager] RACE CONDITION DETECTED!", {
			asin: element.dataset?.asin,
			requestedVisible: visible,
			actuallyVisible,
			// ... additional debug info
		});
		return false; // Don't increment
	}
}
```

### 2. Enhanced Logging in NotificationMonitor

- Added filter state to count change logs
- Added final state logging for new items
- Added inline vs computed display comparison

### 3. Race Condition Detection in VisibilityStateManager

The VisibilityStateManager now includes built-in race condition detection that:

- Double-checks visibility state before incrementing count
- Logs race condition warnings when detected
- Prevents incorrect count increments
- Validates actual DOM state before modifications

## Validation Steps

To confirm this diagnosis, please:

1. **Enable debug settings in VineHelper Settings**:
    - Go to VineHelper Settings → Debug tab
    - Enable these checkboxes:
        - ✓ Debug Tab Title Updates
        - ✓ Debug Visibility State
        - ✓ Debug Item Processing (optional, for additional context)

2. **Reproduce the issue** by triggering rapid item arrivals

3. **Look for these log patterns**:
    - `[VisibilityStateManager] RACE CONDITION DETECTED!`
    - `[DEBUG-RACE] OVERLAPPING OPERATIONS DETECTED!`
    - Count mismatches in the logs

## Proposed Fix

If the race condition is confirmed, the fix would involve:

1. **Synchronous visibility updates**: Ensure visibility state is fully committed before count changes
2. **Atomic operations**: Bundle visibility check + count update in a single operation
3. **Debouncing rapid updates**: Add a small delay for items arriving within the race window
4. **State validation**: Always validate actual DOM state before count modifications

## Questions for Confirmation

1. Do you see the "RACE CONDITION DETECTED!" error in the console when the issue occurs?
2. Does the timing analysis show multiple operations within 50ms?
3. Are the computed vs inline display values different during the mismatch?

Please run with the debug instrumentation and share the logs to confirm this diagnosis before we proceed with the fix.
