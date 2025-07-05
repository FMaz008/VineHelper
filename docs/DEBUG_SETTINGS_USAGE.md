# Debug Settings Usage Documentation

This document tracks where each debug setting is used in the codebase.

## Recently Added Debug Settings (4 new flags)

### 1. debugSound

- **Purpose**: Logs detailed information about sound notification decisions during item processing
- **Usage Locations**:
    - `scripts/notifications-monitor/core/NotificationMonitor.js`:
        - Line 568: Logs when bulk fetch ends
        - Line 1390: Logs item sound selection in addTileInGrid
        - Line 1432: Logs sound decision after filtering
        - Line 2133: Logs sound decision in handleItemFound
        - Line 2857: Logs when bulk fetch starts (last 100)
        - Line 2906: Logs when bulk fetch starts (filter change)

### 2. debugDuplicates

- **Purpose**: Logs detailed information about duplicate item detection
- **Usage Locations**:
    - `scripts/notifications-monitor/core/NotificationMonitor.js`:
        - Line 1104: Logs when ASIN is already being processed
        - Line 1151: Logs when item already exists
        - Line 1194: Logs when ASIN exists with different image URL
        - Line 1211: Logs duplicate prevention by image URL

### 3. debugVisibility

- **Purpose**: Logs detailed information about visibility state management
- **Usage Locations**:
    - `scripts/notifications-monitor/services/VisibilityStateManager.js`:
        - Line 93: Logs race condition detection
        - Line 143: Logs cache mismatches
        - Line 262: Logs recalculation start
        - Line 357: Logs count increment
        - Line 380: Logs count decrement

### 4. debugItemProcessing

- **Purpose**: Logs detailed information about item processing, DOM operations, and ETV styling
- **Usage Locations**:
    - `scripts/notifications-monitor/services/ItemsMgr.js`:
        - Line 204: Logs new item additions
        - Line 218: Logs updates to existing items
    - `scripts/notifications-monitor/services/VisibilityStateManager.js`:
        - Line 71: Used with debugTabTitle for visibility state changes
    - `scripts/notifications-monitor/core/NotificationMonitor.js`:
        - Line 1326: Used with debugTabTitle for count tracking
        - Line 1412: Logs count changes during filtering
        - Line 1528: Logs when new items are added
        - Line 1430: **[NEW]** Logs ETV type flags and styling settings for debugging Unknown ETV styling issues
        - Line 1890: **[NEW]** Logs when unknown ETV flag is cleared after item receives ETV data
    - `scripts/notifications-monitor/core/MonitorCore.js`:
        - Line 265: **[NEW]** Logs detailed styling decisions in \_processNotificationHighlight
        - Line 295-318: **[NEW]** Logs which specific styling was applied (striped, solid color, or none)

## Existing Debug Settings (already present)

### debugCoordination

- **Purpose**: Logs master/slave coordination messages between multiple tabs
- **Usage Locations**:
    - `scripts/notifications-monitor/coordination/MasterSlave.js`:
        - Line 80: Controls logging of coordination messages (excludes "ImAlive" messages)

## Summary

We successfully added 4 new debug settings:

1. `debugSound` - Sound notification debugging
2. `debugDuplicates` - Duplicate detection debugging
3. `debugVisibility` - Visibility state debugging
4. `debugItemProcessing` - Item processing debugging

All 4 settings are properly integrated:

- ✅ Added to default settings in `SettingsMgrDI.js`
- ✅ Added to settings initialization in `settings_loadsave.js`
- ✅ Have UI checkboxes in `settings_debug.tpl.html`
- ✅ Are actively used in the codebase

Note: `debugPerformance` was removed as it was never properly implemented - the UI and settings existed but the performance logging code was never connected or loaded.
