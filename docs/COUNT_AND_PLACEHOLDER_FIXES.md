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

## Debug Mode

Enable debug logging to troubleshoot count issues:

```javascript
window.DEBUG_TAB_TITLE = true;
```

This logs:

- All tab title updates with count values
- VisibilityStateManager count changes with stack traces
- Truncation start/end with item counts

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
