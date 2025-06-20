# Count and Placeholder Synchronization Fixes

## Overview

This document consolidates all fixes related to count synchronization and placeholder positioning issues in the VineHelper notification monitor.

## Issues Fixed

### 1. New Item Placement Before Placeholders

**Problem**: New items from the server were being placed before placeholder tiles instead of after them.

**Solution**: Modified insertion logic to find the first non-placeholder tile:

```javascript
// For date descending (default), insert after placeholders
let insertPosition = this._gridContainer.firstChild;
while (insertPosition && insertPosition.classList.contains("vh-placeholder-tile")) {
	insertPosition = insertPosition.nextSibling;
}
if (insertPosition) {
	this._gridContainer.insertBefore(fragment, insertPosition);
} else {
	// All children are placeholders or container is empty
	this._gridContainer.appendChild(fragment);
}
```

### 2. Zero ETV Items Not Being Counted

**Problem**: Zero ETV items weren't counted in tab title when filter was set to "Zero ETV or KW match only".

**Root Cause**: Type flags (`typeZeroETV`, `typeHighlight`) were set AFTER `processNotificationFiltering` was called and count was emitted.

**Solution**: Set type flags BEFORE filtering:

```javascript
// Set type flags BEFORE filtering so visibility is calculated correctly
if (KWsMatch) {
	tileDOM.dataset.typeHighlight = 1;
} else if (parseFloat(etv_min) === 0) {
	tileDOM.dataset.typeZeroETV = 1;
}

// Now apply filters with correct type flags
const isVisible = this.#processNotificationFiltering(tileDOM);
```

### 3. Count Not Updating After Unpause

**Problem**: Tab title count wasn't updating properly after unpausing feed.

**Root Cause**: During paused fetch, items are added but may not be visible due to filters. The incremental count was incorrect.

**Solution**: Always recount visible items after unpause:

```javascript
// We need to recount because items added during pause might not have been counted
const newCount = this._countVisibleItems();
if (this._visibilityStateManager) {
	this._visibilityStateManager.setCount(newCount);
}
this._updateTabTitle(newCount);
```

### 4. Truncation Count Issues

**Problem**: Count not updating properly during "Fetch 300" with truncation limit of 100.

**Solution**:

- Always recount after fetch completion
- Added proper count updates when truncation occurs
- Ensured VisibilityStateManager is synchronized

### 5. Safari Display Style Check Bug

**Problem**: In `processNotificationFiltering`, Safari was getting the entire computed style object instead of just the display property.

**Solution**: Fixed to properly extract the display property:

```javascript
if (this._env.isSafari()) {
	const computedStyle = window.getComputedStyle(node);
	styleDisplay = computedStyle.display;
} else {
	styleDisplay = node.style.display;
}
```

### 6. Count Mismatch After Filter Changes

**Problem**: Tab title showing incorrect count (e.g., 50 when 51 tiles visible) after filter changes.

**Solution**: Enhanced `updateVisibleCountAfterFiltering` to:

- Update tab title after recounting
- Force placeholder recalculation
- Use requestAnimationFrame for visual stability

```javascript
#updateVisibleCountAfterFiltering() {
    requestAnimationFrame(() => {
        if (this._env.isSafari()) {
            this.#invalidateComputedStyleCache();
        }

        const newCount = this._countVisibleItems();
        this._visibilityStateManager?.setCount(newCount);
        this._updateTabTitle(newCount);
        this.#emitGridEvent("grid:items-filtered", { visibleCount: newCount });

        if (this._noShiftGrid) {
            this._noShiftGrid.insertPlaceholderTiles();
        }
    });
}
```

### 7. Debug Settings Not Persisting

**Problem**: Debug checkboxes for "Debug Tab Title Updates" and "Debug Placeholder Calculations" were not persisting when leaving and returning to settings.

**Root Cause**:

1. Default values for these settings were not defined in SettingsMgrDI.js
2. The settings were not being managed in the settings loader

**Solution**:

1. Added default values in `SettingsMgrDI.js`:

```javascript
// In #getDefaultSettings() method, within the general section:
debugTabTitle: false,
debugPlaceholders: false,
```

2. Added checkbox management in `settings_loadsave.js`:

```javascript
manageCheckboxSetting("general.debugTabTitle");
manageCheckboxSetting("general.debugPlaceholders");
```

### 8. Placeholders Appearing at End Instead of Beginning

**Problem**: Placeholder tiles were appearing at the very end of the grid instead of at the beginning.

**Root Cause**: In `GridEventManager.js`, the `#handleSortNeeded` method was appending placeholder tiles after items in the document fragment.

**Solution**: Modified the order in `GridEventManager.js` to add placeholders first:

```javascript
// Create a DocumentFragment for better performance
const fragment = document.createDocumentFragment();

// Add placeholder tiles at the beginning
placeholderTiles.forEach((placeholder) => {
	if (placeholder.parentNode) {
		placeholder.remove();
	}
	fragment.appendChild(placeholder);
});

// Add items to fragment in sorted order after placeholders
validItems.forEach((item) => {
	if (item.element.parentNode) {
		item.element.remove();
	}
	fragment.appendChild(item.element);
});
```

## Debug Mode

Enable debug logging to troubleshoot count issues:

### Using Settings (Recommended)

1. Go to VineHelper Settings > General tab
2. Scroll to the bottom "Debugging" section
3. The debugging options are organized into subsections:

#### Notification Monitor

- **Debug Tab Title Updates** - Logs tab title count updates
- **Debug Placeholder Calculations** - Logs placeholder tile calculations

#### Memory Analysis

- **Enable Memory Debugging** - Enables memory debugging tools in the notification monitor
    - When enabled, you can use `window.md` or `window.MEMORY_DEBUGGER` to access the MemoryDebugger
    - Common commands: `md.takeSnapshot("name")`, `md.compareSnapshots("before", "after")`
- **Auto Heap Snapshots** - Automatically takes heap snapshots at key moments

4. Save settings and reload the notification monitor

### Viewing Debug Logs

1. Open the notification monitor window
2. Right-click in the window and select "Inspect"
3. Go to the Console tab in DevTools
4. Look for logs with these prefixes:
    - `[MonitorCore]` - Count calculations and mismatches
    - `[NoShiftGrid]` - Placeholder calculations
    - `[TabTitle]` - Tab title updates
    - `[Truncation]` - Item truncation events
    - `[NotificationMonitor]` - Visibility changes

### What Gets Logged

- All tab title updates with count values
- VisibilityStateManager count changes with stack traces
- Truncation start/end with item counts
- Placeholder calculations with grid dimensions
- Item visibility changes during filtering
- Count comparisons between different methods

### Debug Output Examples

```javascript
// Placeholder calculation
[NoShiftGrid] Starting placeholder calculation {
    visibleItemsCount: 51,
    visibilityStateCount: 50,
    allTilesCount: 51,
    hiddenTilesCount: 0,
    domVisibleCount: 51,
    endPlaceholdersCount: 0,
    gridWidth: 1360
}

// Count mismatch detection
[MonitorCore] Final count {
    count: 51,
    visibilityStateCount: 50,
    mismatch: true
}

// Visibility change
[NotificationMonitor] Item visibility changed {
    asin: "B0XXXXX",
    beforeDisplay: "none",
    afterDisplay: "flex",
    typeZeroETV: true,
    currentFilter: 1,
    filterName: "Zero ETV or KW match only"
}
```

## Test Plan

### Basic Functionality Tests

1. **Zero ETV Counting**: Clear grid, let zero ETV items arrive, verify count
2. **Placeholder Position**: Verify new items appear before placeholders
3. **Filter Changes**: Switch filters and verify count updates
4. **Truncation**: Fetch 300 with limit 100, verify final count is 100

### Edge Cases

1. **Rapid Item Arrival**: Multiple items arriving quickly should all be counted
2. **Concurrent Operations**: Filter change while fetching should maintain correct count
3. **Empty Grid**: Placeholders should appear correctly when no items present

### Regression Tests

1. Sort order changes don't break counting
2. Hide/unhide items updates count
3. Clear all/clear unavailable updates count
4. Search filter works with type filters

## Implementation Details

### Files Modified

1. `scripts/notifications-monitor/core/NotificationMonitor.js` - Main fixes
2. `scripts/notifications-monitor/core/MonitorCore.js` - Debug logging
3. `scripts/notifications-monitor/services/VisibilityStateManager.js` - Debug logging

### Key Principles

- **Accuracy over performance**: Recount when accuracy is critical
- **Set flags before filtering**: Ensure visibility calculation is correct
- **Respect visual hierarchy**: Placeholders always at the end
- **Debug support**: Comprehensive logging for troubleshooting

## Performance Considerations

- Chose full recount over detecting visibility changes in `processNotificationFiltering`
- Recounting only happens at specific points (unpause, fetch complete)
- Avoids continuous visibility checks which are resource-intensive on Safari
