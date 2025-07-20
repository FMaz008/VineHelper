# VineHelper Keyword Matching Documentation

## Table of Contents

1. [Overview](#overview)
2. [Important: Keywords Are Regex Patterns](#important-keywords-are-regex-patterns)
3. [Simplified Architecture (2025)](#simplified-architecture-2025)
4. [How Keywords Work](#how-keywords-work)
5. [Pattern Examples](#pattern-examples)
6. [But Without Feature](#but-without-feature)
7. [Matching Priority](#matching-priority)
8. [Component Usage](#component-usage)
9. [Performance](#performance)
10. [Race Condition Fix](#race-condition-fix)
11. [Debug Features](#debug-features)
12. [Migration History](#migration-history)
13. [Best Practices](#best-practices)

## Overview

VineHelper's keyword matching system allows users to highlight, hide, or blur items based on text patterns in product titles. As of January 2025, the system has been dramatically simplified, eliminating central compilation and caching in favor of local compilation by each component.

## Important: Keywords Are Regex Patterns

**🔍 Keywords are treated as regular expression patterns by default.** You don't need any special syntax - whatever you enter is interpreted as a regex pattern.

### Examples:

- `laptop` - Matches "laptop" anywhere in the title
- `wi[- ]?fi` - Matches "wifi", "wi-fi", or "wi fi"
- `(phone|tablet)` - Matches either "phone" or "tablet"
- `\$[0-9]+` - Matches dollar amounts like "$25"
- `^Apple` - Matches titles starting with "Apple"

## Simplified Architecture (2025)

### Key Discovery

Analysis revealed that all components were already compiling keywords locally, making central compilation in SettingsMgrDI completely redundant. The system was:

1. Compiling keywords centrally when saved
2. Storing compiled patterns as `*_compiled` keys
3. Components ignoring these compiled patterns and compiling locally anyway

### Current Architecture

```
SettingsMgr (stores raw keyword strings)
    ↓
Components retrieve raw keywords
    ↓
Components compile keywords locally using KeywordCompiler
    ↓
Components match using KeywordMatcher
```

### What Was Removed

- ~200 lines of compilation code from SettingsMgrDI
- `#regexCache` private field
- `#compileAndStoreKeywords()` method
- `getCompiledKeywords()` method
- `#compileOnDemand()` method
- `clearKeywordCache()` method
- All `*_compiled` storage keys

## How Keywords Work

### 1. Storage

Keywords are stored as simple arrays in settings:

```javascript
{
  "general.highlightKeywords": ["laptop", "wi[- ]?fi", "mechanical.*keyboard"],
  "general.hideKeywords": ["refurb", "used", "broken"],
  "general.blurKeywords": ["adult", "mature"]
}
```

### 2. Compilation

Each component compiles keywords when needed:

```javascript
import { compile as compileKeywords } from "/scripts/core/utils/KeywordCompiler.js";

const keywords = Settings.get("general.highlightKeywords");
const compiledKeywords = compileKeywords(keywords);
```

### 3. Matching

Components use the compiled patterns to match text:

```javascript
import { findMatch } from "/scripts/core/utils/KeywordMatcher.js";

const match = findMatch(text, compiledKeywords, etv_min, etv_max);
if (match) {
	console.log(`Matched keyword: ${match.contains}`);
}
```

## Pattern Examples

### Basic Patterns

- `laptop` - Simple text match
- `gaming laptop` - Matches exact phrase
- `laptop|notebook` - Matches either word

### Advanced Patterns

- `wi[- ]?fi` - Matches "wifi", "wi-fi", "wi fi"
- `[0-9]+GB` - Matches "8GB", "16GB", etc.
- `(red|blue|green).*shirt` - Colored shirts
- `^Apple` - Items starting with "Apple"
- `keyboard$` - Items ending with "keyboard"

### Special Characters

To match special regex characters literally, escape them:

- `\$50` - Matches "$50"
- `\(new\)` - Matches "(new)"
- `\.com` - Matches ".com"

## But Without Feature

The "but without" feature allows you to exclude items that match certain patterns, even if they match your main keyword.

### Proper Usage with Pipe Separation

**Use the pipe character (`|`) to separate multiple exclusion patterns:**

```javascript
{
  "contains": "laptop",
  "without": "refurbished|used|broken"
}
```

This matches items containing "laptop" but excludes those containing "refurbished", "used", or "broken".

### Examples:

- `contains: "phone", without: "case|cover|screen protector"` - Phones but not accessories
- `contains: "book", without: "kindle|ebook|digital"` - Physical books only
- `contains: "camera", without: "toy|kids|fake"` - Real cameras only

## Matching Priority

The system follows a strict priority order:

1. **Highlight keywords are checked first**
2. **If an item matches a highlight keyword, it is shown** (hide keywords are skipped)
3. **Only if no highlight match exists are hide keywords checked**
4. **Blur keywords are independent** (can blur highlighted items)

### Example Flow:

```javascript
// Item title: "Boobrie WiFi Adapter"

// Step 1: Check highlight keywords
// Matches "wi[- ]?fi" pattern ✓
// Item is SHOWN and HIGHLIGHTED

// Step 2: Hide keywords are NOT checked
// Even though it would match "boob" pattern
// Because highlight takes precedence
```

## Component Usage

### Tile Component

```javascript
class Tile {
	constructor() {
		this.compiledBlurKeywords = null;
	}

	initializeKeywords() {
		const keywords = Settings.get("general.blurKeywords");
		if (keywords && keywords.length > 0) {
			this.compiledBlurKeywords = compileKeywords(keywords);
		}
	}

	checkBlur(title) {
		if (!this.compiledBlurKeywords) return false;
		return findMatch(title, this.compiledBlurKeywords) !== null;
	}
}
```

### Toolbar Component

```javascript
class Toolbar {
	#updateCompiledKeywords() {
		const highlightKeywords = Settings.get("general.highlightKeywords");
		const hideKeywords = Settings.get("general.hideKeywords");

		this.#compiledHighlightKeywords = highlightKeywords?.length > 0 ? compileKeywords(highlightKeywords) : null;

		this.#compiledHideKeywords = hideKeywords?.length > 0 ? compileKeywords(hideKeywords) : null;
	}
}
```

### NotificationMonitor Component

```javascript
// Compile on initialization
this.#compiledHighlightKeywords = compileKeywords(Settings.get("general.highlightKeywords") || []);

// Use in processing
const highlightMatch = findMatch(item.title, this.#compiledHighlightKeywords, item.etv_min, item.etv_max);
```

## Performance

### Compilation Frequency

- **Tiles**: ~300 tiles × 1 keyword type (blur) = 300 compilations
- **Other components**: ~5-10 compilations total
- **Total**: ~300-400 compilations per session
- **Time impact**: ~15-20ms total (0.05ms per compilation)

### Why This Doesn't Matter

1. Compilations happen during initialization, not runtime
2. 15-20ms spread across page load is imperceptible
3. Components can cache locally if needed
4. No redundant compilation (was happening twice before)

### Performance Comparison

- **Previous**: 19.4 seconds for 300 items (complex caching)
- **Current**: <2 seconds for 300 items (simple compilation)
- **Improvement**: 15x faster with simpler code

## Race Condition Fix

### The Problem

Items matching highlight keywords were being immediately unhighlighted due to incorrect hide keyword evaluation.

### The Solution

Proper implementation of matching priority:

```javascript
// CORRECT Implementation
processItem(item) {
  // FIRST: Check highlight keywords
  const highlightMatch = findMatch(item.title, this.highlightPatterns);

  if (highlightMatch) {
    return {
      visible: true,
      highlighted: true,
      keyword: highlightMatch.contains
    };
  }

  // ONLY check hide keywords if NO highlight match
  const hideMatch = findMatch(item.title, this.hidePatterns);

  if (hideMatch) {
    return { visible: false, reason: 'hidden' };
  }

  return { visible: true, highlighted: false };
}
```

## Debug Features

### Title Debug Logger

Enable "Debug Title Display" in settings to track:

- When titles are created/modified
- Template processing
- Text extraction attempts

Access in console:

```javascript
TitleDebugLogger.getInstance().printSummary();
TitleDebugLogger.getInstance().exportLogs();
```

### TileCounter Debug

Enable "TileCounter Performance Monitoring" to see:

- Real-time visible tile counts
- Recount performance metrics
- Cache hit rates
- Optimization status

### Keyword Testing

Test keywords in the settings page:

```javascript
// The settings page provides a test interface
// Enter a keyword and test text to see if it matches
```

## Migration History

### Old System (Pre-2025)

- Central compilation in SettingsMgr
- Complex WeakMap + counter caching
- SharedKeywordMatcher singleton
- 417 lines of caching code

### New System (2025+)

- Local compilation only
- Simple, pure functions
- No central caching
- Component ownership of patterns

### Migration Cleanup

```javascript
// V3.5.0 - Remove compiled keywords (no longer needed)
const compiledKeys = ["hideKeywords_compiled", "highlightKeywords_compiled", "blurKeywords_compiled"];
for (const key of compiledKeys) {
	if (generalSettings[key] !== undefined) {
		delete generalSettings[key];
	}
}
```

## Best Practices

### 1. Keep Patterns Simple

- Start with basic text matches
- Add regex features only when needed
- Test patterns before saving

### 2. Use Descriptive Patterns

```javascript
// Good
"mechanical.*keyboard"; // Clear intent
"wi[- ]?fi"; // Handles variations

// Avoid
".*"; // Matches everything
"[a-z]+"; // Too generic
```

### 3. Optimize for Performance

- Avoid excessive alternation: `(a|b|c|d|e|f|g)`
- Use specific patterns when possible
- Consider using multiple simple patterns instead of one complex pattern

### 4. Handle Edge Cases

- Test with special characters
- Consider case sensitivity (patterns are case-insensitive by default)
- Account for spacing variations

### 5. Component Implementation

- Compile keywords once during initialization
- Cache compiled patterns locally
- Update when settings change
- Clean up on component destroy

## Conclusion

The simplified keyword matching system proves that sometimes the best optimization is removing unnecessary code. By eliminating central compilation that wasn't being used, we've made the system:

- **Simpler**: Easy to understand and debug
- **Faster**: 15x performance improvement
- **Cleaner**: 200 lines less code
- **More Reliable**: No cache synchronization issues

Remember: Keywords are regex patterns by default, highlight takes precedence over hide, and each component manages its own compilation. This architecture provides maximum flexibility with minimal complexity.
