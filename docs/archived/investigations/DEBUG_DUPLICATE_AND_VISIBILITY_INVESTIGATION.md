# Debug Investigation: Duplicate Items & Visibility Count Mismatch

## Investigation Summary

### Bug 4 - Duplicate Items

Users report seeing duplicate items in the grid. Investigation focused on:

- Deduplication logic in NotificationMonitor.js
- Race conditions in WebSocket message handling
- ItemsMgr storage and update mechanisms

### Bug 5 - Visibility Count Mismatch

The visibility count shown doesn't match actual visible items. Investigation focused on:

- VisibilityStateManager count tracking
- Cache consistency issues
- Race conditions in bulk operations

## Root Cause Analysis

### Duplicate Items - Potential Causes

1. **Race Condition in WebSocket Processing**
    - Multiple messages for the same ASIN arriving rapidly
    - No locking mechanism when checking/adding items
    - Location: `NotificationMonitor.js:1058-1086`

2. **Image URL Deduplication Edge Cases**
    - Only prevents duplicates by image URL, not ASIN
    - Image URLs might vary slightly for same product
    - Location: `NotificationMonitor.js:1089-1093`

### Visibility Count Mismatch - Potential Causes

1. **Cache Inconsistency in VisibilityStateManager**
    - Cached visibility states can become stale
    - No validation against actual DOM state
    - Location: `VisibilityStateManager.js:94-100`

2. **Race Conditions in Bulk Operations**
    - Multiple operations updating count simultaneously
    - Non-atomic count updates during bulk removes
    - Location: `NotificationMonitor.js:604-633`

## Debug Instrumentation Added

### 1. Duplicate Detection Logging

**File: `NotificationMonitor.js`**

- Logs when existing items are updated (line 1064)
- Tracks image URL duplicate prevention (line 1091)
- Shows stack traces to identify calling code paths

### 2. WebSocket Race Condition Tracking

**File: `Websocket.js`**

- Tracks rapid messages for same ASIN (line 103)
- Warns when messages arrive within 1 second
- Maintains global map of last received times

### 3. ItemsMgr Addition Tracking

**File: `ItemsMgr.js`**

- Logs all new item additions (line 203)
- Tracks updates to existing items (line 216)
- Shows image URL changes and element presence

### 4. Visibility State Debugging

**File: `VisibilityStateManager.js`**

- Detects cache mismatches (line 101)
- Tracks recalculation sources with stack traces (line 211)
- Logs when cached state differs from DOM

### 5. Bulk Operation Monitoring

**File: `NotificationMonitor.js`**

- Tracks bulk remove operations (line 606)
- Logs visibility count changes during bulk ops
- Shows items removed vs visible items removed

## How to Use Debug Logs

1. **Enable Debug Mode**

    ```javascript
    localStorage.setItem("vh_debug_websocket", "true");
    localStorage.setItem("vh_debug_tab_title", "true");
    ```

2. **Monitor Console Output**
    - Look for `[DEBUG-DUPLICATE]` - duplicate item issues
    - Look for `[DEBUG-VISIBILITY]` - count mismatch issues
    - Look for `[DEBUG-ITEMSMGR]` - item storage issues
    - Look for `[DEBUG-BULK]` - bulk operation issues
    - Look for `[DEBUG-WS]` - WebSocket race conditions

3. **Reproduce Issues**
    - For duplicates: Watch for rapid WebSocket messages
    - For count mismatch: Trigger bulk operations or filtering

## Expected Debug Output

### For Duplicate Items:

```
[DEBUG-WS-ITEMS] Rapid WebSocket messages for same ASIN {
  asin: "B123456",
  timeDiff: 250,
  imgUrl: "https://...",
  timestamp: "2025-01-04T16:25:00.000Z"
}

[DEBUG-DUPLICATE] Item already exists {
  asin: "B123456",
  hasElement: true,
  imgUrl: "https://...",
  existingImgUrl: "https://...",
  timestamp: "2025-01-04T16:25:00.250Z"
}
```

### For Visibility Count Mismatch:

```
[DEBUG-VISIBILITY] Cache mismatch detected! {
  asin: "B789012",
  cached: true,
  actuallyVisible: false,
  display: "none",
  timestamp: "2025-01-04T16:26:00.000Z"
}

[DEBUG-VISIBILITY] Starting recalculation {
  elementCount: 345,
  currentCount: 45,
  timestamp: "2025-01-04T16:26:01.000Z",
  stack: "recalculateCount\n#bulkRemoveItems\nclearUnavailableItems"
}
```

## Next Steps

1. **Deploy with debug logging enabled**
2. **Collect debug output from affected users**
3. **Analyze patterns in the logs**
4. **Implement fixes based on confirmed root causes**

## Implemented Fixes

### For Duplicate Items (FIXED):

1. Added mutex/lock for item addition using processingASINs map
2. Implemented ASIN-based deduplication in addition to image URL
3. ProcessingASINs map prevents concurrent processing of the same ASIN

### For Visibility Count Mismatch (FIXED):

1. Modified #handleVisibilityChange to prevent duplicate processing
2. Implemented atomic count updates for bulk operations
3. Added periodic count validation and auto-correction

## Note

This investigation document led to successful fixes for both duplicate items and visibility count mismatches. The debug instrumentation helped identify the root causes, and the fixes have been implemented without requiring debouncing or complex timing mechanisms.
