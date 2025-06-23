# Memory Debugging UI in Settings

## Overview

The VineHelper now includes an interactive memory debugging interface directly in the settings page, eliminating the need for console commands. This provides a more user-friendly way to monitor and debug memory issues.

## Features

### Location

The memory debugging controls are located in:
**Settings → General Tab → Debug Settings → Memory Analysis**

### Prerequisites

1. Enable "Debug Memory" checkbox in settings
2. Reload the page for the debugger to initialize
3. The memory debugging controls will appear below the checkbox

### Available Controls

#### 1. Take Snapshot

- **Input field**: Enter a custom name for the snapshot (e.g., "before-changes", "after-10-minutes")
- **Button**: "Take Snapshot" - captures current memory state
- **Use case**: Compare memory usage at different points in time

#### 2. Memory Analysis Tools

- **Generate Report**: Creates a comprehensive memory usage report
- **Detect Leaks**: Checks for common memory leak patterns:
    - Multiple NotificationMonitor instances (should be 1)
    - Detached DOM nodes
    - Event listener accumulation
    - Active WebSocket connections
    - KeywordMatch instances
    - ServerCom instances
- **Check Detached Nodes**: Specifically looks for DOM elements no longer in the document
- **Run Cleanup**: Executes memory cleanup routines

#### 3. Memory Log

- **Real-time log**: Shows all memory debugging operations with timestamps
- **Color coding**:
    - Gray: Information messages
    - Green: Successful operations
    - Red: Errors or warnings
- **Auto-scroll**: Automatically scrolls to show latest entries
- **Copy Log**: 📋 button to copy the entire log contents to clipboard
- **Clear Log**: Button to clear the log display

## How It Works

### Architecture

1. **Settings Page** (page/settings.js):

    - Sends commands via Chrome extension messaging
    - Displays results in the log window
    - Only shows controls when memory debugging is enabled

2. **Content Script** (scripts/bootloader.js):

    - Receives commands from settings page
    - Executes memory debugging operations
    - Returns results to settings page

3. **Memory Debugger** (scripts/notifications-monitor/debug/MemoryDebugger.js):
    - Performs actual memory analysis
    - Tracks DOM elements, event listeners, and objects
    - Provides cleanup functionality

### Communication Flow

```
Settings Page → Chrome Message → Content Script → Memory Debugger
     ↑                                                    ↓
     ←────────────── Response with Results ──────────────
```

### Context Isolation

- Settings page runs in its own context
- Content scripts run in the page context
- Chrome messaging API bridges the contexts
- No CSP violations or security issues

## Important: Understanding Context

### Where Commands Execute

All memory debugging commands execute in the **Vine tab** (where NotificationMonitor runs), NOT in the settings page. The settings page is just a convenient UI that sends commands to the Vine tab.

### What This Means

- **Memory measurements** (heap size) → From the Vine tab ✅
- **DOM counts** (nodes, tiles, listeners) → From the Vine tab ✅
- **Leak detection** → Checks the Vine tab ✅
- **Detached nodes** → Checks the Vine tab ✅

The earlier confusion about "DOM-specific metrics reflecting settings page context" was incorrect. ALL metrics come from the Vine tab where the MemoryDebugger instance lives.

## Usage Examples

### Detecting Memory Leaks

1. Have a Vine page open (e.g., /vine/vine-items)
2. Open Settings → General → Debug Settings
3. Enable "Debug Memory" and reload the Vine page
4. Click "Detect Leaks" in settings
5. Results show the Vine tab's state:
    - "⚠️ Multiple NotificationMonitor instances detected!"
    - "⚠️ High number of detached nodes!"
    - Tile counts, listener counts, etc.

### Taking Memory Snapshots

1. Enter snapshot name: "initial"
2. Click "Take Snapshot"
3. Use the Vine page for a while (scroll, filter, etc.)
4. Take another snapshot: "after-usage"
5. Compare memory growth between snapshots

### Monitoring During Development

1. Keep the settings page open in a separate tab
2. Perform actions in the Vine page
3. Periodically click buttons in settings to check Vine tab state
4. All results reflect what's happening in the Vine tab

## Benefits

1. **No Console Required**: Accessible to non-technical users
2. **Visual Feedback**: Color-coded log makes issues obvious
3. **Persistent Log**: Can review history of operations
4. **Safe Operations**: All commands are read-only except cleanup
5. **Context Aware**: Only works when on a Vine page

## Troubleshooting

### "No Vine tab found"

- Ensure you have a Vine page open (e.g., /vine/vine-items)
- The debugger only works on Amazon Vine pages

### "Memory debugger not available"

- Enable "Debug Memory" in settings
- Reload the Vine page after enabling
- Check that VineHelper is active on the page

### Commands not responding

- Check browser console for errors
- Ensure content scripts are loaded
- Try refreshing both settings and Vine pages

## Technical Notes

- Uses Chrome extension messaging API for cross-context communication
- Memory debugger instance is singleton per page
- Log limited to 100 entries to prevent memory issues
- All operations are async but presented synchronously in UI
