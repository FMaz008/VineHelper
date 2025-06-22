# Recent Changes and Fixes

## Session: June 21, 2025

### Issues Fixed

#### 1. Off-by-One Count Issue ✅
**Problem**: Tab showed 21 items when only 20 were displayed, persisted after clearing unavailable items.

**Solution**:
- Added count recalculation after clearing unavailable items in [`NotificationMonitor.js`](../scripts/notifications-monitor/core/NotificationMonitor.js:1)
- Fixed initial count condition to accept zero as valid in [`NotificationMonitorV3.js`](../scripts/notifications-monitor/core/NotificationMonitorV3.js:1)
- Added periodic count verification when debug enabled

**Key Code**:
```javascript
// After clearing unavailable items, recalculate the count
if (this._visibilityStateManager) {
    console.log("[clearUnavailableItems] Recalculating count after clearing unavailable items");
    const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
    this._visibilityStateManager.recalculateCount(tiles);
}
```

#### 2. Chrome OS Notification Issues ✅
**Problems**: 
- Notifications showed VH logo instead of product images
- Clicking notifications opened blank tabs

**Root Cause**: Service worker was using incorrect notification type and URL construction.

**Solutions**:
- Fixed notification type to "basic" with product image as icon
- Restored original URL construction logic using search strings instead of ASINs
- Fixed data extraction from Item instances using `getAllInfo()`

**Files Modified**:
- [`vh_service_worker_di.js`](../scripts/vh_service_worker_di.js:1)

#### 3. Debug Settings Not Persisting ✅
**Problem**: Debug checkboxes for WebSocket and ServerCom weren't saving.

**Solution**:
- Added default settings in [`SettingsMgrDI.js`](../scripts/core/services/SettingsMgrDI.js:1)
- Added initialization in [`settings_loadsave.js`](../page/settings_loadsave.js:1)
- Fixed checkbox names in [`settings_general.tpl.html`](../page/settings_general.tpl.html:1)

**Key Addition**:
```javascript
// Default settings
debugWebsocket: false,
debugServercom: false,

// Initialization
manageCheckboxSetting("general.debugWebsocket", false);
manageCheckboxSetting("general.debugServercom", false);
```

#### 4. Excessive Console Logging ✅
**Problem**: WebSocket and ServerCom messages flooding console.

**Solution**:
- Added debug checks in [`Websocket.js`](../scripts/notifications-monitor/stream/Websocket.js:1)
- Added debug checks in [`ServerCom.js`](../scripts/notifications-monitor/stream/ServerCom.js:1)
- Messages now only log when respective debug setting is enabled

### Code Changes Summary

1. **Count Management**:
   - Recalculation after bulk operations
   - Proper initial count handling
   - Debug mode for count verification

2. **Notification System**:
   - Correct notification type ("basic" not "image")
   - Proper URL construction for searches
   - Fixed Item data extraction

3. **Settings Management**:
   - Proper default values for debug settings
   - Checkbox persistence fixes
   - Consistent naming across HTML/JS

4. **Debug Controls**:
   - Granular control over console logging
   - WebSocket message debugging
   - ServerCom processing debugging
   - Service Worker message debugging (NEW)

### Service Worker Debug Control ✅
**Problem**: Excessive console logging from service worker ("Sending to tab", notification logs, etc.)

**Solution**:
- Added new debug setting: `debugServiceWorker`
- Wrapped all service worker console logs with debug checks
- Added checkbox in settings: "Debug Service Worker Messages"

**Logs now controlled**:
- "Sending to tab id" messages
- Notification image data logs
- Creating notification logs
- Notification clicked logs
- URL opening logs

### Unknown ETV Filter Fix ✅
**Problem**: Unknown ETV filter showed no items even when pink (unknown ETV) tiles were visible.

**Root Cause**: The `isUnknownETV` method was checking for empty string `""` but items with unknown ETV had their data converted to `null` in ItemsMgr.

**Solution**: Updated `isUnknownETV` to check for both empty string and null values.

### Testing Recommendations

1. **Count Accuracy**:
   - Enable debug mode and monitor count verification logs
   - Clear unavailable items and verify count updates
   - Test with filters applied

2. **Notifications**:
   - Verify product images display correctly
   - Test clicking notifications opens correct search
   - Check both AFA and keyword-triggered notifications

3. **Debug Settings**:
   - Toggle debug checkboxes and verify persistence
   - Check console output matches debug settings
   - Verify settings survive page reload

4. **Unknown ETV Filter**:
   - Select "Unknown ETV only" filter
   - Verify pink (unknown ETV) items are displayed
   - Verify filter correctly hides items with known ETV

### Notes

- Zero ETV notifications are intended behavior when AFA notifications are enabled
- The notification system triggers for both keyword matches AND AFA (last_chance) items
- Debug settings provide granular control without affecting other logging
- Unknown ETV items are those without pricing information (displayed with pink background)