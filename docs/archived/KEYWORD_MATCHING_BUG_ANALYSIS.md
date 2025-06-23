# Keyword Matching Bug Analysis

## Issues Identified

### 1. Off-by-One Error

The user reports that the wrong keyword is being displayed - a keyword that doesn't actually match the item.

**Likely Cause**: There's a mismatch between:

- The keyword array used for matching
- The keyword array used for display
- Or the index being used to retrieve the keyword

### 2. "But Without" Not Being Applied

Items that should be excluded by "but without" conditions are still matching.

**Root Cause**: The matching logic appears correct in `testKeywordMatch`, but the issue might be:

- The "without" regex is not being compiled correctly
- The "without" condition is being ignored somewhere in the chain

## Current Flow

1. **UnifiedTransformHandler** calls `sharedKeywordMatcher.match()`
2. **SharedKeywordMatcher** calls `keywordMatchReturnFullObject()`
3. **KeywordMatch** iterates through keywords and returns the matched object
4. **UnifiedTransformHandler** extracts only the `contains` property for storage

## Potential Issues

1. **Pre-compiled vs Runtime Mismatch**: If pre-compiled keywords are out of sync with the current keywords array, indices could be misaligned.

2. **Array Modification**: If the keywords array is being filtered or modified between compilation and matching, indices would be off.

3. **Display Logic**: The UI might be using a different index or array to display the matched keyword.

## Debug Strategy

The enhanced logging added will help identify:

- The exact keyword object that matched
- Whether pre-compiled or runtime compilation is used
- Any length mismatches between arrays
- The full matched object including "but without" conditions

## Next Steps

1. Enable `general.debugKeywords` setting
2. Check console logs for:
    - "Using pre-compiled keywords" with `lengthMismatch: true`
    - The `wordObject` in match logs
    - The `matchedObject` in UnifiedTransformHandler logs
3. Compare the logged keyword with what's displayed in the UI
4. Check if the "without" regex is present in the compiled object
