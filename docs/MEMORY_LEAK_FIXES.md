# Memory Leak Fixes - VineHelper

## Overview

This document summarizes the memory leak fixes applied to the VineHelper notification monitor based on Chrome memory profile analysis.

## Issues Identified

### 1. WebSocket Event Handler Duplication

- **Problem**: Event listeners were being added on reconnection without removing previous ones, causing memory leaks through duplicate handlers
- **Location**: `scripts/notifications-monitor/stream/Websocket.js`

### 2. DOM Element Reference Retention

- **Problem**: DOM elements and Tile objects were stored but never cleaned up when items were removed
- **Location**: `scripts/notifications-monitor/services/ItemsMgr.js`

### 3. Channel Event Listener Leak

- **Problem**: Channel message event listener was never removed on destroy
- **Location**: `scripts/notifications-monitor/stream/Websocket.js`

### 4. Anonymous Function Memory Overhead

- **Problem**: Anonymous functions in event handlers create unnecessary closures and make debugging difficult
- **Location**: `scripts/notifications-monitor/stream/Websocket.js`

### 5. Error Object Retention

- **Problem**: Full error objects with stack traces were being passed around, retaining large amounts of memory
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

## Impact

These fixes should significantly reduce memory consumption over time, especially for users who keep the notification monitor running for extended periods. The fixes prevent:

- Duplicate event handlers from accumulating on reconnections
- DOM elements from being retained after items are removed
- Event listeners from persisting after the WebSocket is destroyed
- Anonymous function closures from retaining unnecessary memory
- Error objects with full stack traces from being retained
