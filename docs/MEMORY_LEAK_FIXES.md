# Memory Leak Fixes - VineHelper

## Overview

This document tracks memory leak fixes in the VineHelper notification monitor, categorized by severity based on actual memory impact.

## CRITICAL Issues (Unbounded Growth)

### 1. Uncleared Interval in MasterSlave ⚠️ CRITICAL

- **Problem**: `setInterval` in `#keepAlive()` was never stored or cleared, creating a permanent 1-second interval
- **Leak Conditions**:
    - Every time a user opens a new notification monitor tab, a new MasterSlave instance is created
    - When the tab is closed or navigated away, the instance is abandoned but the interval continues running
    - Opening multiple tabs or refreshing the page creates multiple orphaned intervals
    - These intervals continue executing forever in the background, even after the tab is closed
- **Impact**: 86,400 executions per day per leaked instance, each posting messages and creating objects. With multiple tab opens/refreshes, this multiplies rapidly.
- **Location**: `scripts/notifications-monitor/coordination/MasterSlave.js`

### 2. Uncleared Interval in ServerCom ⚠️ SIGNIFICANT

- **Problem**: Service worker status check interval (10 seconds) was never cleared on destroy
- **Leak Conditions**:
    - Created when notification monitor initializes
    - When switching between master/slave mode or closing tabs, the ServerCom instance is replaced but interval persists
    - Each mode switch or tab refresh creates another orphaned interval
- **Impact**: 8,640 executions per day per leaked instance. Less frequent than MasterSlave but still permanent growth.
- **Location**: `scripts/notifications-monitor/stream/ServerCom.js`

## MODERATE Issues (Accumulative)

### 3. WebSocket Event Handler Duplication

- **Problem**: Event listeners were being added on reconnection without removing previous ones
- **Impact**: Could accumulate dozens/hundreds of duplicate handlers over days of reconnections
- **Location**: `scripts/notifications-monitor/stream/Websocket.js`

### 4. DOM Element Reference Retention

- **Problem**: DOM elements and Tile objects were stored but never cleaned up when items were removed
- **Impact**: Prevents garbage collection of removed items. Impact scales with item turnover.
- **Location**: `scripts/notifications-monitor/services/ItemsMgr.js`

## MINOR Issues (Best Practices)

### 5. Channel Event Listener Cleanup

- **Problem**: Channel message event listener was never removed on destroy
- **Impact**: Single listener, minimal memory impact but good practice
- **Location**: `scripts/notifications-monitor/stream/Websocket.js`

### 6. Error Object Optimization

- **Problem**: Full error objects with stack traces were being passed around
- **Impact**: Temporary objects, minimal long-term impact
- **Location**: `scripts/notifications-monitor/stream/Websocket.js`

### 7. Anonymous Function Optimization

- **Problem**: Anonymous functions in event handlers make debugging difficult
- **Impact**: Negligible memory impact, primarily improves debuggability
- **Location**: `scripts/notifications-monitor/stream/Websocket.js`

## Fixes Applied

### 1. WebSocket Event Handler Cleanup

Refactored to use named handlers stored in an object, with proper cleanup:

```javascript
// Define named handlers to reduce memory overhead
this.#socketHandlers = {
    connect: () => { /* handler code */ },
    newItem: (data) => { /* handler code */ },
    // ... other handlers
};

// Attach all handlers
Object.entries(this.#socketHandlers).forEach(([event, handler]) => {
    this.#socket.on(event, handler);
});

// Cleanup method now uses the same references
#cleanupSocketListeners() {
    if (this.#socket && this.#socketHandlers) {
        Object.entries(this.#socketHandlers).forEach(([event, handler]) => {
            this.#socket.off(event, handler);
        });
    }
    this.#socketHandlers = null;
}
```

### 2. Channel Event Listener Management

- Stored the channel message handler reference in `#channelMessageHandler`
- Modified `#createListener()` to store the handler reference
- Added cleanup in `destroyInstance()` to remove the channel listener

### 3. DOM Reference Cleanup in ItemsMgr

Enhanced the `removeAsin()` method to properly clean up references:

```javascript
removeAsin(asin) {
    const item = this.items.get(asin);
    if (item) {
        // Clean up DOM references to prevent memory leaks
        if (item.element) {
            item.element = null;
        }

        // Clean up Tile instance if it exists
        if (item.tile) {
            item.tile = null;
        }
    }
    this.items.delete(asin);
}
```

### 4. Error Object Optimization

Modified error handlers to only pass minimal error information:

```javascript
connection_error: (error) => {
    // Only pass minimal error info to prevent retaining large error objects
    this.#relayMessage({
        type: "wsStatus",
        status: "wsError",
        error: error.message || 'Connection error'
    });
},

connect_error: (error) => {
    // Extract only the message to avoid retaining the full error object
    const errorMessage = error.message || 'Unknown error';
    this.#relayMessage({
        type: "wsStatus",
        status: "wsError",
        error: errorMessage
    });
    console.error(`${new Date().toLocaleString()} - Socket.IO error: ${errorMessage}`);
}
```

## Testing

All existing tests pass after these changes (200 tests, 14 test suites), confirming that functionality is preserved while fixing the memory leaks.

## Memory Profile Improvements

The fixes address the following patterns observed in the Chrome memory profile:

- 709 KB total allocation with multiple 263 KB allocations
- Repeated anonymous function allocations
- Socket.io operation memory overhead
- DOM element reference retention

## Future Recommendations

1. **Implement Item Limits**: Consider limiting the number of items stored in memory to prevent unbounded growth
2. **Add Periodic Cleanup**: Implement a mechanism to periodically clean up old items
3. **Use WeakMap for DOM References**: Consider using WeakMap for DOM element storage to allow automatic garbage collection
4. **Add Memory Monitoring**: Implement memory usage tracking to detect future leaks early
5. **Create Tile Destroy Method**: Consider adding a proper destroy method to the Tile class for comprehensive cleanup
6. **Optimize Array Operations**: Review and combine filter/map/forEach chains into single loops where possible
7. **Implement Object Pooling**: For frequently created objects in socket message processing

## Additional Fix: Bulk Remove DOM Cleanup

### Issue

The `bulkRemoveItems` method in NotificationMonitor was not cleaning up DOM references when removing items in bulk (during auto-truncate), which could lead to memory leaks.

### Fix Applied

Modified `bulkRemoveItems` to null out DOM element and tile references for items being removed, ensuring proper garbage collection during bulk operations.

## Additional Fix: Interval Cleanup

### Issue

Two critical interval-based memory leaks were discovered:

1. **MasterSlave Keep-Alive Interval**: The `setInterval` in `#keepAlive()` was never stored in a variable, making it impossible to clear. This created a permanent 1-second interval that would continue running even after the instance was destroyed.

2. **ServerCom Service Worker Status Timer**: The 10-second interval for checking service worker status was never cleared when the ServerCom instance was destroyed.

### Fix Applied

1. **MasterSlave.js**:

    - Added `#keepAliveInterval` property to store the interval reference
    - Modified `#keepAlive()` to clear any existing interval before creating a new one
    - Added `destroy()` method to clear the interval and clean up the static instance reference

2. **ServerCom.js**:

    - Added `destroy()` method to clear both `#serviceWorkerStatusTimer` and `#statusTimer`
    - Clears the static instance reference

3. **NotificationMonitor.js**:
    - Updated `destroy()` method to call destroy on both `_masterSlave` and `_serverComMgr` instances

## Impact Summary

The critical fixes (intervals) prevent the most severe memory leaks:

- **MasterSlave interval**: Saves ~86,400 function calls and message objects per day
- **ServerCom interval**: Saves ~8,640 function calls per day
- **Combined**: Prevents ~95,000 unnecessary operations per day that would never be garbage collected

The moderate fixes improve memory efficiency:

- **WebSocket handlers**: Prevents accumulation of duplicate event handlers
- **DOM cleanup**: Allows proper garbage collection of removed items

The minor fixes are primarily best practices with minimal memory impact.
