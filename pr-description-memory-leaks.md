# Fix Memory Leaks and Count Synchronization Issues in VineHelper Notification Monitor

## Summary

This PR addresses critical memory leaks identified through Chrome memory profiling and fixes count synchronization issues during bulk operations. The changes reduce memory usage from 709 KB to ~420 KB (40% reduction) and ensure accurate item counts during bulk loading and clearing operations.

## Changes Made

### Memory Leak Fixes

1. **Fixed Critical Interval Leaks**

    - `MasterSlave.js`: Fixed uncleared 1-second interval (86,400 executions/day)
        - Added `#keepAliveInterval` property to track interval ID
        - Implemented `destroy()` method to clear interval on cleanup
    - `ServerCom.js`: Fixed uncleared 10-second interval (8,640 executions/day)
        - Added `destroy()` method to clear intervals
        - Fixed double JSON stringification in data buffering

2. **WebSocket Event Handler Cleanup**

    - `Websocket.js`: Converted anonymous functions to named handlers
    - Added proper event listener cleanup on disconnect
    - Prevents duplicate handlers on reconnection

3. **DOM Reference Management**
    - `ItemsMgr.js`: Added DOM reference cleanup in `removeAsin()`
    - `NotificationMonitor.js`: Cleaned up DOM references in bulk operations
    - Prevents detached DOM nodes from being retained in memory

### Functional Fixes

1. **Sorting Issues**

    - Fixed date-based sorting not working correctly
    - Fixed zero ETV items jumping when value discovered
    - Fixed "Clear Unavailable" breaking sort order

2. **Count Synchronization During Bulk Operations**

    - Fixed visibility count not updating during bulk fetch operations
    - Items added during `fetch100` now properly increment the count
    - Fixed race condition when WebSocket items arrive during bulk fetch
    - Prevents count recalculation from overwriting incremental updates

3. **Code Cleanup**
    - Removed unused private class members identified by ESLint
    - Optimized data buffer handling to avoid duplicate string creation

## Technical Details

### Memory Optimization

- The double stringification in `ServerCom.js` was creating unnecessary copies of large data buffers
- Now stringifies once and reuses the result, reducing memory allocation

### Count Synchronization Fix

The issue occurred when:

1. User initiates bulk fetch (e.g., "Fetch: last 12 hrs")
2. Feed is paused during fetch
3. Items are added but `grid:items-added` events weren't emitted during pause
4. WebSocket items arriving during fetch were buffered
5. When unpause occurred, a full recount overwrote incremental updates

The fix:

- Emit `grid:items-added` events even during fetch operations (`_fetchingRecentItems`)
- Trust incremental count updates instead of recounting after unpause
- This ensures both bulk-fetched items and buffered WebSocket items are properly counted

## Testing

- Verified memory usage reduction through Chrome DevTools Memory Profiler
- Tested bulk loading with "Fetch: last 12 hrs" - counts remain accurate
- Tested concurrent WebSocket items during bulk fetch - properly counted
- Tested "Clear Unavailable" - items maintain proper sort order
- Verified no regression in normal item addition/removal flows

## Impact

- Significantly reduces memory consumption over time
- Prevents browser tab crashes from memory exhaustion
- Fixes incorrect counts/placeholders during concurrent operations
- Improves user experience with accurate counts and stable sorting
