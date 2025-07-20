# Debug Tools for Notification Monitor

This directory contains debugging utilities for the notification monitor system, including memory analysis and performance monitoring tools.

## Files

### Memory Debugging

- **MemoryDebugger.js**: Main debugging class that tracks memory usage, event listeners, and DOM nodes
- **HeapSnapshotHelper.js**: Utility for taking and comparing heap snapshots
- **expose-debugger.js**: Helper script for exposing debugger in console (development only)

### TileCounter Performance

- **TileCounterDebugger.js**: Performance monitoring and analysis for TileCounter operations (integrated into settings panel)

## Usage

### Enabling Memory Debugging

Memory debugging is disabled by default and has zero impact on production performance.

To enable:

#### Option 1: Via Settings (Recommended)

1. Go to VineHelper Settings > General tab
2. Scroll to "Debugging" section > "Memory Analysis"
3. Enable "Enable Memory Debugging"
4. Optionally enable "Auto Heap Snapshots" for automatic snapshots
5. Save settings and reload the notification monitor

#### Option 2: Via localStorage (for development)

```javascript
localStorage.setItem("vh_debug_memory", "true");
location.reload();
```

#### Option 3: Via window flag (before page load)

```javascript
window.DEBUG_MEMORY = true;
```

### Using the Debugger

When memory debugging is enabled via settings, the debugger is automatically available as `window.md` or `window.MEMORY_DEBUGGER`.

If you need to manually expose it (e.g., for development):

1. **Copy the entire contents of `expose-debugger.js`** into the browser console
2. **Use the exposed `window.md` object**:

```javascript
// Take memory snapshots
window.md.takeSnapshot("initial");
window.md.takeSnapshot("after-operations");
window.md.takeSnapshot("after-clearing");

// Generate a memory report
window.md.generateReport();

// Clear all snapshots
window.md.reset();
```

### Example Usage

```javascript
// 1. Take initial snapshot
window.md.takeSnapshot("initial");

// 2. Perform operations (add items, filter, etc.)

// 3. Take another snapshot
window.md.takeSnapshot("after-300-items");

// 4. Clear some items

// 5. Take final snapshot
window.md.takeSnapshot("after-clear");

// 6. Generate report to see memory changes
window.md.generateReport();
```

The report will show:

- Total snapshots taken
- Memory change from first to last snapshot (MB and %)
- Individual snapshot details with timestamps and heap sizes

## TileCounter Performance Debugging

### Enabling TileCounter Debugging

TileCounter performance monitoring helps identify bottlenecks in tile counting operations within the Notification Monitor.

**Note: TileCounter debugging only works in the Notification Monitor tab.**

To enable:

#### Via Settings (Recommended)

1. Go to VineHelper Settings > Debug tab
2. Enable "Enable TileCounter Performance Monitoring"
3. Save settings
4. Open or reload the **Notification Monitor** tab
5. The TileCounter debug panel will appear below the checkbox in settings

### Using the TileCounter Debugger

#### Via Debug Panel (Recommended)

1. Click "Start Monitoring" to begin collecting performance data
2. Interact with the page (filter items, hide/show tiles, etc.)
3. View real-time metrics:
    - **Visible Tiles**: Current count of visible tiles
    - **Last Recount**: Time taken for the last recount operation
    - **Avg Delay**: Average debounce delay (target: <10ms)
    - **Cache Hit Rate**: Percentage of visibility checks served from cache
    - **Optimization**: Overall optimization status

4. Click "Generate Report" for detailed analysis
5. Click "Stop Monitoring" when done

#### Via Console

```javascript
// Access TileCounter instance
window.tileCounter;

// Access TileCounter debugger
window.tileCounterDebugger;

// Get current performance metrics
window.tileCounter.getPerformanceMetrics();

// Start monitoring programmatically
window.tileCounterDebugger.startMonitoring();

// Generate performance report
window.tileCounterDebugger.generateReport();

// Stop monitoring
window.tileCounterDebugger.stopMonitoring();
```

### Performance Benchmarks

Expected performance with optimizations:

- **Average recount time**: < 10ms for 100 tiles
- **Debounce delay**: 0ms for user actions, 50ms for bulk operations
- **Cache hit rate**: > 70% during rapid operations
- **Optimization status**: "Optimized" (green in UI)

## Production Safety

- Debuggers are **never loaded in production** unless explicitly enabled
- When disabled, the only overhead is a single conditional check
- All tracking calls are wrapped in existence checks to prevent errors
- Performance monitoring has minimal overhead when active

## When to Use

### Memory Debugging

Use when:

- Investigating reported memory leaks
- Testing after major refactoring
- Validating cleanup in destroy() methods
- Monitoring long-running sessions

### TileCounter Debugging

Use when:

- Investigating slow tile count updates
- Testing filter performance
- Optimizing bulk operations
- Verifying debounce behavior

## See Also

- [TileCounter Debug Settings Guide](/docs/TILECOUNTER_DEBUG_SETTINGS.md) - Detailed guide on debug settings
- [Memory Management](/docs/MEMORY_MANAGEMENT.md) - Memory optimization strategies
