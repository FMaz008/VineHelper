# Keyword Matching Fixes

This document summarizes the fixes made to address keyword matching issues in the notification monitor.

## Issues Fixed

### 1. Count Mismatch Issue (RESOLVED)

**Problem**: The count verification was incorrectly counting hidden items as visible, causing a mismatch between `actualVisibleCount` and `reportedCount`.

**Root Cause**: The `_verifyCount` method in `NotificationMonitor.js` was only checking for the `hidden` class but not verifying the actual CSS `display` property.

**Fix**: Updated the visibility check to use `window.getComputedStyle(tile).display !== "none"` instead of just checking for the `hidden` class.

```javascript
// Before
const isVisible = !tile.classList.contains("hidden");

// After
const isVisible = window.getComputedStyle(tile).display !== "none";
```

### 2. Keyword "undefined" Display Issue (RESOLVED)

**Problem**: When no keyword match was found, the UI was displaying "undefined" instead of an empty string.

**Root Cause**: In `UnifiedTransformHandler.js`, when no match was found, the keyword values were being set to `undefined`.

**Fix**: Added proper handling to set empty strings when no match is found:

```javascript
// Highlight keyword fix
data.item.data.KW =
	highlightMatch !== undefined ? (typeof highlightMatch === "object" ? highlightMatch.contains : highlightMatch) : "";

// Blur keyword fix
data.item.data.BlurKW = blurMatch !== undefined ? (typeof blurMatch === "object" ? blurMatch.contains : blurMatch) : "";
```

### 3. Debug Logging Enhancements (COMPLETED)

**Added**: Comprehensive debug logging to track keyword matching issues:

- Added logging in `KeywordMatch.js` to track:

    - Which keyword index matches
    - "But without" exclusions
    - ETV exclusions
    - Final match results

- Added logging in `VisibilityStateManager.js` to track:

    - Visibility state changes
    - Uncached element warnings
    - Count updates

- Added logging in `NotificationMonitor.js` to track:
    - New items being added
    - Count verification results

## Debug Settings

All debug logging is controlled by the following settings:

- `general.debugKeywords`: Controls keyword matching debug logs
- `general.debugTabTitle`: Controls count verification and tab title update logs

## Testing Recommendations

1. **Count Verification**:

    - Enable `debugTabTitle` setting
    - Monitor console for count verification logs every 30 seconds
    - Verify that hidden items are not counted as visible

2. **Keyword Matching**:

    - Enable `debugKeywords` setting
    - Add test items with various keyword patterns
    - Verify correct keyword is reported in debug logs
    - Check that "undefined" no longer appears in UI

3. **"But without" Conditions** (CRITICAL - Known Issue):
    - Create keywords with "but without" conditions
    - Look for these debug logs:
        - `[KeywordMatch] Checking 'without' condition` - Shows if without regex was compiled
        - `[KeywordMatch] 'Without' regex test result` - Shows if exclusion should happen
        - `[KeywordMatch] WARNING: 'without' specified but no regex compiled` - Indicates compilation failure
    - The enhanced logging will help identify why items aren't being excluded

## Known Issues Under Investigation

1. **Off-by-One Error**: Wrong keyword being displayed (doesn't match the item)
2. **"But Without" Not Working**: Items matching both main and exclusion patterns are not being excluded

The enhanced debug logging should reveal:

- Whether the "without" regex is being compiled
- Whether the regex test is returning the correct result
- The exact keyword object that matched vs what's displayed

## Deep Analysis Results

After thorough investigation of the keyword matching system:

### Index Alignment is Correct

- Both runtime and pre-compiled paths maintain proper index alignment
- Failed compilations are stored as `null` to preserve indices
- The "but without" logic is correctly associated with parent keywords

### Enhanced Debug Logging Added

- Full keyword object logging in match results
- Pre-compiled vs runtime path tracking
- Length mismatch detection between keywords and compiled arrays
- Missing compiled regex warnings

### Potential Root Causes

If wrong keywords are still being reported:

1. **Display Issue**: The matched keyword object might be correct, but displayed incorrectly
2. **Cache Staleness**: Pre-compiled keywords might be out of sync with current keywords
3. **Keyword Type Detection**: The `__keywordType` property might not be set correctly

See [`KEYWORD_MATCHING_ANALYSIS.md`](KEYWORD_MATCHING_ANALYSIS.md) for detailed analysis.

## Related Files Modified

1. `scripts/notifications-monitor/core/NotificationMonitor.js`

    - Fixed `_verifyCount` method
    - Added debug logging for new items

2. `scripts/notifications-monitor/stream/UnifiedTransformHandler.js`

    - Fixed keyword undefined issue for both highlight and blur keywords

3. `scripts/core/utils/KeywordMatch.js`

    - Added comprehensive debug logging for keyword matching process
    - Enhanced logging for pre-compiled keyword path
    - Added full keyword object logging in matches

4. `scripts/notifications-monitor/services/VisibilityStateManager.js`
    - Added debug logging for visibility state changes
