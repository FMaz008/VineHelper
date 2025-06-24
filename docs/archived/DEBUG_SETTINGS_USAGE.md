# Debug Settings Usage Guide

This document provides a comprehensive overview of all debug settings in VineHelper and where they are used throughout the codebase.

## Debug Settings Overview

### 1. **Debug Tab Title Updates** (`general.debugTabTitle`)

- **Purpose**: Logs detailed information about tab title count updates to help diagnose count mismatch issues
- **Default**: `false`
- **Features**:
    - Logs all tab title count updates
    - **Periodic Count Verification**: When enabled, automatically verifies count every 30 seconds
    - Auto-fixes count mismatches when detected
    - Logs count verification results with timestamps
- **Used in**:
    - `NotificationMonitor.js`:
        - Console logging for count updates
        - `_setupCountVerification()`: Sets up 30-second interval timer
        - `_verifyCount()`: Checks actual vs reported count
    - `NotificationMonitorV3.js`: Debug initialization and count updates
    - `MonitorCore.js`: Tab title update logging

### 2. **Debug Placeholder Calculations** (`general.debugPlaceholders`)

- **Purpose**: Logs detailed information about placeholder tile calculations and grid layout adjustments
- **Default**: `false`
- **Used in**:
    - `NotificationMonitor.js`: Placeholder creation and management
    - `MonitorCore.js`: Grid layout calculations
    - `NoShiftGrid.js`: Multiple locations for grid adjustments
    - `GridEventManager.js`: Event handling for grid operations

### 3. **Debug WebSocket Messages** (`general.debugWebsocket`)

- **Purpose**: Logs WebSocket relay messages including newPreprocessedItem, unavailableItem, and newETV events
- **Default**: `false`
- **Used in**:
    - `Websocket.js`: Message handling and relay operations

### 4. **Debug ServerCom Messages** (`general.debugServercom`)

- **Purpose**: Logs ServerCom processing messages including newPreprocessedItem and newItem events with item details
- **Default**: `false`
- **Used in**:
    - `ServerCom.js`: Item processing and event handling

### 5. **Debug Service Worker Messages** (`general.debugServiceWorker`)

- **Purpose**: Logs service worker messages including tab communication, notification creation, and URL handling
- **Default**: `false`
- **Used in**:
    - `vh_service_worker_di.js`: Multiple locations for notification handling and tab communication

### 6. **Debug Bulk Operations** (`general.debugBulkOperations`)

- **Purpose**: Logs detailed information about bulk item removal operations, including item counts, processing steps, and performance metrics
- **Default**: `false`
- **Used in**:
    - `NotificationMonitor.js`: Bulk removal operations

### 7. **Debug Keyword Operations** (`general.debugKeywords`)

- **Purpose**: Logs information about keyword compilation, caching, and pattern matching operations
- **Default**: `false`
- **Used in**:
    - `SettingsMgrDI.js`: Keyword compilation and caching
    - `KeywordMatch.js`: Pattern matching operations

### 8. **Debug Settings Operations** (`general.debugSettings`)

- **Purpose**: Logs information about settings loading, saving, and migration operations
- **Default**: `false`
- **Used in**:
    - `SettingsMgrDI.js`: Settings management operations

### 9. **Debug Storage Operations** (`general.debugStorage`)

- **Purpose**: Logs detailed information about Chrome storage read/write operations
- **Default**: `false`
- **Used in**:
    - `SettingsMgrDI.js`: Storage operations

### 10. **Enable Memory Debugging** (`general.debugMemory`)

- **Purpose**: Enables memory debugging tools in the notification monitor. When enabled, you can use `window.md` to access the MemoryDebugger instance
- **Default**: `false`
- **Used in**:
    - `NotificationMonitor.js`: Memory debugger initialization
    - Provides access to memory analysis tools via console

### 11. **Debug Memory Auto Snapshot** (`general.debugMemoryAutoSnapshot`)

- **Purpose**: Automatically takes memory snapshots at intervals when memory debugging is enabled
- **Default**: `false`
- **Used in**:
    - Memory debugging tools (when `debugMemory` is enabled)

## Settings Configuration

### Default Values (SettingsMgrDI.js)

```javascript
debugTabTitle: false,
debugPlaceholders: false,
debugWebsocket: false,
debugServercom: false,
debugServiceWorker: false,
debugBulkOperations: false,
debugKeywords: false,
debugSettings: false,
debugStorage: false,
debugMemory: false,
debugMemoryAutoSnapshot: false,
```

### Settings Initialization (settings_loadsave.js)

```javascript
manageCheckboxSetting("general.debugTabTitle");
manageCheckboxSetting("general.debugPlaceholders");
manageCheckboxSetting("general.debugMemory");
manageCheckboxSetting("general.debugMemoryAutoSnapshot");
manageCheckboxSetting("general.debugKeywords", false);
manageCheckboxSetting("general.debugBulkOperations", false);
manageCheckboxSetting("general.debugWebsocket", false);
manageCheckboxSetting("general.debugServercom", false);
manageCheckboxSetting("general.debugServiceWorker", false);
manageCheckboxSetting("general.debugSettings", false);
manageCheckboxSetting("general.debugStorage", false);
```

### HTML Checkboxes (settings_general.tpl.html)

All debug checkboxes are located in the "Debugging" fieldset, organized into subsections:

- Notification Monitor
- WebSocket & Stream Debugging
- Performance & Operations
- Memory Analysis

## Usage Examples

### Checking Debug Settings in Code

```javascript
// Example from Websocket.js
if (this._monitor._settings.get("general.debugWebsocket")) {
	console.log("[Websocket] Relay message:", message);
}

// Example from NotificationMonitor.js
if (this._settings.get("general.debugTabTitle")) {
	console.log("[NotificationMonitor] Tab title update:", {
		visibleCount,
		totalCount,
		title: newTitle,
	});
}
```

### Enabling Debug Mode

1. Go to VineHelper settings
2. Navigate to the "General" tab
3. Scroll to the "Debugging" section
4. Check the desired debug options
5. Save settings
6. Open browser console to see debug logs

## Notes

- Debug logs only appear when the respective debug setting is enabled
- Most debug settings use `console.log` with eslint-disable comments for intentional logging
- Debug settings are persisted across browser sessions
- Some debug features (like memory debugging) provide additional tools accessible via the console
