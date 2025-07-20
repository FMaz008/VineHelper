# Recent Changes and Fixes

## Session: June 22, 2025

### Unknown ETV Filter Fix ✅

**Problem**: The "Unknown ETV only" filter wasn't showing existing items with unknown ETV values, only newly added ones.

**Root Cause**: The `#calculateNodeVisibility` method in NotificationMonitor.js was missing the check for `TYPE_UNKNOWN_ETV`. This method is called when filters are applied to existing items during filter changes.

**Solution**:

- Added `notificationTypeUnknownETV` check to the `#calculateNodeVisibility` method
- Added the missing case for `TYPE_UNKNOWN_ETV` in the filter type check

**Key Code**:

```javascript
// In NotificationMonitor.js #calculateNodeVisibility method
const notificationTypeUnknownETV = parseInt(node.dataset.typeUnknownETV) === 1;

// Added missing case
} else if (this._filterType == TYPE_UNKNOWN_ETV) {
    passesTypeFilter = notificationTypeUnknownETV;
}
```

### Keyword Matching System Review ✅

**Findings**:

- The KeywordMatch.js singleton pattern with fixed storage is well-implemented
- SharedKeywordMatcher.js is now just a thin wrapper for backward compatibility
- The "without" condition logic is working correctly
- The cache key generation issue mentioned in the summary was already fixed

**Recommendations**:

- Consider removing redundant fallback paths in keyword compilation
- Components could migrate directly to KeywordMatcher singleton instead of using SharedKeywordMatcher
- The current implementation is functional and performant

### Keyword Matching and Count Verification Fixes

#### 1. Count Mismatch in Verification ✅

**Problem**: Count verification was showing mismatches (e.g., actualVisibleCount: 2613, reportedCount: 84) because hidden items were being counted as visible.

**Root Cause**: The `_verifyCount` method was only checking for the `hidden` class but not verifying the actual CSS `display` property.

**Solution**:

- Updated visibility check to use `window.getComputedStyle(tile).display !== "none"`
- This properly excludes items hidden by filters or other CSS rules

**Key Code**:

```javascript
// In NotificationMonitor.js _verifyCount method
const isVisible = window.getComputedStyle(tile).display !== "none";
```

#### 2. Keyword "undefined" Display ✅

**Problem**: When no keyword match was found, the UI was displaying "undefined" for both highlight and blur keywords.

**Root Cause**: In `UnifiedTransformHandler.js`, undefined values were being assigned directly to `KW` and `BlurKW` properties.

**Solution**:

- Added proper handling to set empty strings when no match is found
- Applied fix to both highlight and blur keyword handling

**Key Code**:

```javascript
// Highlight keyword fix
data.item.data.KW =
	highlightMatch !== undefined ? (typeof highlightMatch === "object" ? highlightMatch.contains : highlightMatch) : "";

// Blur keyword fix
data.item.data.BlurKW = blurMatch !== undefined ? (typeof blurMatch === "object" ? blurMatch.contains : blurMatch) : "";
```

#### 3. Enhanced Debug Logging ✅

**Added comprehensive debug logging for keyword matching**:

- Track which keyword index matches in `KeywordMatch.js`
- Log "but without" exclusions with detailed condition checking
- Log ETV exclusions
- Track visibility state changes in `VisibilityStateManager.js`
- Log new items being added in `NotificationMonitor.js`
- Enhanced "but without" condition logging to diagnose exclusion issues

**Files Modified**:

- [`KeywordMatch.js`](../scripts/core/utils/KeywordMatch.js:1)
- [`UnifiedTransformHandler.js`](../scripts/notifications-monitor/stream/UnifiedTransformHandler.js:1)
- [`VisibilityStateManager.js`](../scripts/notifications-monitor/services/VisibilityStateManager.js:1)
- [`NotificationMonitor.js`](../scripts/notifications-monitor/core/NotificationMonitor.js:1)

#### 4. Debug Settings Tab ✅

**Problem**: Debug settings were cluttering the General tab.

**Solution**:

- Created new Debug tab in settings (`settings_debug.tpl.html`)
- Moved all debugging options from General tab to dedicated Debug tab
- Updated settings navigation to include Debug tab before About tab

**Files Modified**:

- [`settings_debug.tpl.html`](../page/settings_debug.tpl.html:1) (created)
- [`settings_general.tpl.html`](../page/settings_general.tpl.html:1)
- [`settings_main.tpl.html`](../page/settings_main.tpl.html:1)
- [`settings.js`](../page/settings.js:1)

#### 5. Error Alert Scroll Prevention ✅

**Problem**: When order errors appear (e.g., "There was a problem creating your request"), the page would automatically scroll to the top.

**Solution**:

- Modified `ErrorAlertManager` to capture and restore scroll position
- Added scroll position tracking in mutation observer
- Prevents unwanted page jumps when error alerts are displayed

**Key Code**:

```javascript
// Store current scroll position to prevent jump
const currentScrollY = window.scrollY;

// ... add close button ...

// Restore scroll position if it changed
if (window.scrollY !== currentScrollY) {
	window.scrollTo({
		top: currentScrollY,
		behavior: "instant",
	});
}
```

**Files Modified**:

- [`ErrorAlertManager.js`](../scripts/notifications-monitor/services/ErrorAlertManager.js:1)

### Documentation

- Created [`KEYWORD_MATCHING_FIXES.md`](../docs/KEYWORD_MATCHING_FIXES.md:1) to document all keyword matching fixes
- Updated documentation to reflect new Debug tab and scroll prevention fix

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

**Root Cause**: The filter was checking ETV values dynamically, but items with unknown ETV weren't being consistently identified.

**Solution**:

- Added `dataset.typeUnknownETV = 1` attribute when creating items with unknown ETV values
- Updated filter logic to use dataset attribute instead of dynamic checks
- Clear the attribute when item receives an ETV value
- Consistent with existing approach for `typeZeroETV` and `typeHighlight`

**Key Code**:

```javascript
// In NotificationMonitor.js - mark unknown ETV items
if (data.etv === "" || data.etv === null) {
	newItem.dataset.typeUnknownETV = 1;
}

// Clear flag when ETV is updated
if (item.dataset.typeUnknownETV && data.etv !== "" && data.etv !== null) {
	delete item.dataset.typeUnknownETV;
}
```

### ESLint Cleanup ✅

**Problem**: Multiple ESLint warnings in core notification monitoring files.

**Solution**:

- Added `eslint-disable-line no-console` comments for intentional debug logging
- Removed unused parameters from event handlers
- Fixed unused private field `#cacheGeneration` in VisibilityStateManager
- All tests continue to pass after cleanup

**Files Cleaned**:

- [`NotificationMonitor.js`](../scripts/notifications-monitor/core/NotificationMonitor.js:1)
- [`MonitorCore.js`](../scripts/notifications-monitor/core/MonitorCore.js:1)
- [`VisibilityStateManager.js`](../scripts/notifications-monitor/services/VisibilityStateManager.js:1)

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
