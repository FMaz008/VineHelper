# Keyword Matching Analysis - Deep Dive

## Summary

After a thorough analysis of the keyword matching system, I've found that the index alignment between keywords and their compiled patterns is properly maintained throughout the codebase. The system uses two parallel approaches:

1. **Runtime Compilation**: Uses a WeakMap + counter cache in `KeywordMatch.js`
2. **Pre-compiled Storage**: Stores compiled patterns in settings (e.g., `general.highlightKeywords_compiled`)

## Key Findings

### 1. Index Alignment is Properly Maintained

Both compilation paths maintain proper index alignment:

**Runtime Compilation** (`KeywordMatch.js`):

```javascript
keywords.forEach((word, index) => {
	const compiled = compileKeyword(word);
	if (compiled) {
		cache.set(index, compiled); // Stores by index
	}
});
```

**Pre-compiled Storage** (`SettingsMgrDI.js`):

```javascript
if (compiled && compiled.regex) {
    compiledPatterns.push({...});
} else {
    compiledPatterns.push(null);  // Maintains alignment with null
}
```

### 2. "But Without" Logic is Correctly Associated

The "without" regex is compiled and stored together with the main regex:

```javascript
const compiled = {
	regex: containsRegex,
	withoutRegex: withoutRegex, // Stored in same object
};
```

### 3. Potential Issues to Investigate

While the core logic is sound, the reported issues might be caused by:

1. **Cache Synchronization**: If keywords are modified after compilation, the pre-compiled cache might be stale
2. **Keyword Type Detection**: The `getKeywordType` function relies on a `__keywordType` property that might not always be set
3. **Length Mismatches**: The debug logging shows checks for length mismatches between keywords and compiled arrays

## Debug Enhancements Added

1. **Enhanced Match Logging**: Added full `wordObject` JSON to debug output to see exactly what's being matched
2. **Pre-compiled Path Logging**: Added logging to track when pre-compiled keywords are used and if there are length mismatches
3. **Compilation Failure Tracking**: Added logging for missing compiled regex at specific indices

## Recommendations for Testing

1. Enable `general.debugKeywords` setting
2. Monitor console for:
    - "Using pre-compiled keywords" messages
    - "lengthMismatch: true" warnings
    - "Missing compiled regex at index" errors
    - The full `wordObject` in match logs

3. Compare the logged keyword object with what's displayed in the UI to identify discrepancies

## Next Steps

If the wrong keyword is still being reported:

1. Check if the `wordObject` logged matches the displayed keyword
2. Verify no length mismatches are reported
3. Check if pre-compiled vs runtime compilation paths show different results
4. Investigate how the matched keyword is displayed in the UI (might be a display issue rather than matching issue)

The keyword matching logic itself appears correct - the issue may be in how the results are interpreted or displayed.
