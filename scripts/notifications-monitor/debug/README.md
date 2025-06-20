# Memory Debugging Tools

This directory contains debugging utilities for tracking memory usage and detecting memory leaks in the notification monitor.

## Files

- **MemoryDebugger.js**: Main debugging class that tracks memory usage, event listeners, and DOM nodes
- **HeapSnapshotHelper.js**: Utility for taking and comparing heap snapshots
- **expose-debugger.js**: Helper script for exposing debugger in console (development only)

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

## Production Safety

- The debugger is **never loaded in production** unless explicitly enabled
- When disabled, the only overhead is a single conditional check
- All tracking calls are wrapped in existence checks to prevent errors

## When to Use

Use memory debugging when:

- Investigating reported memory leaks
- Testing after major refactoring
- Validating cleanup in destroy() methods
- Monitoring long-running sessions
