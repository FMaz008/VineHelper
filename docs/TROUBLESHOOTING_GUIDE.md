# VineHelper Notification System - Troubleshooting Guide

This guide provides practical troubleshooting procedures for common issues in the VineHelper notification system. Use the debug flags and procedures below to diagnose and resolve problems.

## Table of Contents

1. [Quick Debug Flag Reference](#quick-debug-flag-reference)
2. [Common Issues and Solutions](#common-issues-and-solutions)
3. [Step-by-Step Debugging Procedures](#step-by-step-debugging-procedures)
4. [Where to Find Debug Output](#where-to-find-debug-output)
5. [Known Limitations](#known-limitations)

## Quick Debug Flag Reference

| Issue Type            | Debug Flags to Enable                                       | Console to Check         |
| --------------------- | ----------------------------------------------------------- | ------------------------ |
| Count Inaccuracy      | `debugTabTitle`, `debugPlaceholders`, `debugBulkOperations` | Browser Console          |
| Missing Notifications | `debugNotifications`, `debugCoordination`                   | Browser + Service Worker |
| Performance Issues    | `debugBulkOperations`, `debugMemory`                        | Browser Console          |
| Multi-tab Problems    | `debugCoordination`, `debugTabTitle`                        | All Tab Consoles         |
| Keyword Matching      | `debugKeywords`                                             | Browser Console          |
| WebSocket Issues      | `debugWebsocket`, `debugServercom`                          | Browser Console          |

### Enabling Debug Flags

**Via Settings UI:**

1. Open VineHelper settings
2. Navigate to the Debug tab
3. Check the desired debug options
4. Save settings
5. Refresh the page

**Via Console (Temporary):**

```javascript
// Enable specific debug flags
Settings.set("general.debugTabTitle", true);
Settings.set("general.debugNotifications", true);
Settings.set("general.debugCoordination", true);

// Enable all debug flags at once
const debugFlags = [
	"debugTabTitle",
	"debugPlaceholders",
	"debugNotifications",
	"debugWebsocket",
	"debugServercom",
	"debugCoordination",
	"debugBulkOperations",
	"debugKeywords",
	"debugMemory",
];
debugFlags.forEach((flag) => Settings.set(`general.${flag}`, true));
```

## Common Issues and Solutions

### 1. Count Mismatches

**Symptoms:**

- Tab title count doesn't match visible items
- Count changes unexpectedly
- Pause button count differs from tab title

**Debug Steps:**

1. Enable debug flags:

    ```javascript
    Settings.set("general.debugTabTitle", true);
    Settings.set("general.debugPlaceholders", true);
    ```

2. Look for these log patterns:

    ```
    [NotificationMonitor] COUNT MISMATCH DETECTED
    [VisibilityStateManager] Count recalculated
    [NotificationMonitor] Tab title update: {count: X, actualVisible: Y}
    ```

3. Common causes and fixes:
    - **Filter changes**: Count should update when switching filters
    - **Bulk operations**: Count suspension during "Fetch last 300" is normal
    - **Auto-correction**: System verifies count every 30 seconds when debug enabled

### 2. Missing or Duplicate Notifications

**Symptoms:**

- No sound when new items appear
- Multiple sounds for same item
- OS notifications not appearing

**Debug Steps:**

1. Enable debug flags:

    ```javascript
    Settings.set("general.debugNotifications", true);
    Settings.set("general.debugCoordination", true);
    ```

2. Check BOTH consoles:
    - **Browser Console**: Main tab notifications
    - **Service Worker Console**: OS notifications
3. Look for these patterns:

    ```
    [NotificationMonitor] Playing notification sound
    [NotificationMonitor] Sound already played for ASIN: XXX
    [MasterSlave] Current role: master/slave
    [NewItemStreamProcessing] OS notification created
    ```

4. Common issues:
    - **No master tab**: Check for "[MasterSlave] Elected as master"
    - **Permissions**: Verify browser notification permissions
    - **Sound files**: Check Network tab for 404 errors on audio files

### 3. Performance Issues

**Symptoms:**

- UI freezes during bulk operations
- Slow response to filter changes
- High memory usage

**Debug Steps:**

1. Enable performance debugging:

    ```javascript
    Settings.set("general.debugBulkOperations", true);
    Settings.set("general.debugMemory", true);
    ```

2. Monitor these metrics:

    ```
    [NotificationMonitor] Bulk fetch started
    [VisibilityStateManager] Count updates suspended
    [NotificationMonitor] Processing time: Xms for Y items
    ```

3. Performance indicators:
    - **Normal**: 1ms per item processing
    - **Problem**: >10ms per item
    - **Bulk operations**: Count suspension prevents UI freezes

### 4. Multi-tab Coordination Issues

**Symptoms:**

- Different counts in different tabs
- Notifications playing in multiple tabs
- Master/slave conflicts

**Debug Steps:**

1. Enable in ALL tabs:

    ```javascript
    Settings.set("general.debugCoordination", true);
    ```

2. Check each tab's console for:

    ```
    [MasterSlave] Elected as master
    [MasterSlave] Operating as slave
    [MasterSlave] Master keepalive received
    ```

3. Troubleshooting:
    - Only ONE tab should show "Elected as master"
    - Slaves should show "Operating as slave"
    - If no master, refresh the oldest tab

## Step-by-Step Debugging Procedures

### Procedure 1: Diagnosing Count Issues

1. **Enable debug logging:**

    ```javascript
    Settings.set("general.debugTabTitle", true);
    Settings.set("general.debugBulkOperations", true);
    ```

2. **Trigger count verification:**

    - Wait 30 seconds for automatic verification
    - Or switch filters to force recalculation

3. **Analyze logs:**

    - Look for "COUNT MISMATCH DETECTED"
    - Check "expectedCount" vs "actualVisible"
    - Note any "Count corrected" messages

4. **If mismatch persists:**
    - Clear browser cache
    - Disable other extensions
    - Report issue with console logs

### Procedure 2: Debugging Notification Sounds

1. **Verify settings:**

    - Ensure notification sounds are enabled in settings
    - Check volume is not muted

2. **Enable debug mode:**

    ```javascript
    Settings.set("general.debugNotifications", true);
    ```

3. **Test with new items:**

    - Add items that match your keywords
    - Watch for "Playing notification sound" logs

4. **Check for errors:**
    - Look for "Failed to play sound" messages
    - Verify audio files load in Network tab

### Procedure 3: Analyzing Keyword Matching

1. **Enable keyword debugging:**

    ```javascript
    Settings.set("general.debugKeywords", true);
    ```

2. **Add test items:**

    - Items with keywords that should match
    - Items with "but without" conditions

3. **Analyze match logs:**
    ```
    [KeywordMatcher] Testing keyword: "your keyword"
    [KeywordMatcher] Match found/not found
    [KeywordMatcher] Excluded by 'without' condition
    ```

## Where to Find Debug Output

### Browser Console

- **Access**: F12 → Console tab
- **Filter**: Type component name (e.g., "NotificationMonitor")
- **Contains**: Main application logs, count updates, visibility changes

### Service Worker Console

- **Access**: chrome://extensions → VineHelper → Service Worker link
- **Contains**: OS notifications, background operations
- **Note**: Separate from main browser console

### Debug UI Elements

- **Pause button**: Shows current visible count
- **Tab title**: Displays synchronized count
- **Settings page**: Debug checkboxes and status

## Known Limitations

### 1. OS Notifications for Keywords

- **Issue**: Some users report OS notifications not working for keyword matches
- **Likely cause**: Browser permissions or user settings
- **Workaround**: Verify notification permissions in browser settings

### 2. Count Sync Delay

- **Issue**: Brief delay when switching between filters
- **Expected**: 100-500ms delay is normal
- **Note**: System prioritizes accuracy over speed

### 3. Memory Debugging

- **Limitation**: Memory debugger only available when explicitly enabled
- **Access**: Enable `debugMemory` setting and reload page
- **Usage**: `window.MEMORY_DEBUGGER` in console

## Quick Diagnostic Commands

```javascript
// Get current visibility state
document.querySelectorAll('.vvp-item-tile:not([style*="display: none"])').length;

// Check master/slave status
localStorage.getItem("vh-master-tab-id");

// Force count recalculation
window.notificationMonitor?.updateTabTitleAndPauseButton();

// View current settings
Settings.get("general");

// Export debug logs (if using debug logger)
window.DEBUG_LOGGER?.exportLogs();
```

## When to Report Issues

Report issues when:

1. Count mismatches persist after verification
2. Consistent errors appear in console
3. Performance degrades significantly
4. Features stop working after updates

Include in your report:

1. Browser and version
2. Console logs with debug enabled
3. Steps to reproduce
4. Screenshots if applicable

## Summary

Most issues can be diagnosed using the appropriate debug flags. The system includes self-healing mechanisms (count verification, master election) that resolve many problems automatically. When in doubt, enable relevant debug flags and check both browser and service worker consoles for detailed logging.
