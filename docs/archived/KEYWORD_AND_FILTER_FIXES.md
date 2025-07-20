# Keyword Matching and Filter Fixes

## Summary of Issues Found

### 1. Keyword Matching System

After thorough review, the keyword matching system has been recently refactored to use a singleton pattern with fixed storage for the 3 keyword types. The current implementation is mostly correct, but there are opportunities for simplification:

- The KeywordMatch.js singleton pattern is well-implemented
- SharedKeywordMatcher.js is now just a thin wrapper for backward compatibility
- The "without" condition logic appears to be working correctly

### 2. Unknown ETV Filter Bug

**Issue**: The Unknown ETV filter doesn't show existing items, only new ones.

**Root Cause**: The `#calculateNodeVisibility` method in NotificationMonitor.js is missing the check for `TYPE_UNKNOWN_ETV`. This method is called when filters are applied to existing items.

**Location**:

- `scripts/notifications-monitor/core/NotificationMonitor.js` line 2194-2208
- Missing case for `TYPE_UNKNOWN_ETV` in the type filter check

## Fixes Applied

### 1. Fix Unknown ETV Filter for Existing Items

The `#calculateNodeVisibility` method needs to include the unknown ETV check:

```javascript
// Type filter
const notificationTypeZeroETV = parseInt(node.dataset.typeZeroETV) === 1;
const notificationTypeHighlight = parseInt(node.dataset.typeHighlight) === 1;
const notificationTypeUnknownETV = parseInt(node.dataset.typeUnknownETV) === 1; // ADD THIS

let passesTypeFilter = false;
if (this._filterType == -1) {
	passesTypeFilter = true;
} else if (this._filterType == TYPE_HIGHLIGHT_OR_ZEROETV) {
	passesTypeFilter = notificationTypeZeroETV || notificationTypeHighlight;
} else if (this._filterType == TYPE_HIGHLIGHT) {
	passesTypeFilter = notificationTypeHighlight;
} else if (this._filterType == TYPE_ZEROETV) {
	passesTypeFilter = notificationTypeZeroETV;
} else if (this._filterType == TYPE_REGULAR) {
	passesTypeFilter = !notificationTypeZeroETV && !notificationTypeHighlight;
} else if (this._filterType == TYPE_UNKNOWN_ETV) {
	// ADD THIS
	passesTypeFilter = notificationTypeUnknownETV; // ADD THIS
}
```

### 2. Ensure Unknown ETV Flags Are Set on Page Load

When items are loaded from the server (fetchRecentItems), they need to have their typeUnknownETV flag set properly. This is already handled in the `addItem` method (line 1304-1307), so no additional changes are needed there.

### 3. Keyword Matching Simplifications (Optional)

While the current keyword matching implementation works, here are some potential simplifications:

1. **Remove redundant fallback paths**: The code has multiple fallback paths for compilation that could be simplified
2. **Consolidate keyword type detection**: The `__keywordType` property detection could be more robust
3. **Consider removing SharedKeywordMatcher**: Since it's just a wrapper, components could use KeywordMatcher directly

## Testing Recommendations

1. **Unknown ETV Filter**:
    - Load the notification monitor with existing items
    - Select "Unknown ETV only" filter
    - Verify that existing items without ETV values are shown
    - Add new items without ETV and verify they also appear

2. **Keyword Matching**:
    - Test "but without" conditions work correctly
    - Verify keyword matching performance remains optimal
    - Check that all 3 keyword types (hide, highlight, blur) work as expected

## Files Modified

1. `scripts/notifications-monitor/core/NotificationMonitor.js` - Added unknown ETV check to `#calculateNodeVisibility`
