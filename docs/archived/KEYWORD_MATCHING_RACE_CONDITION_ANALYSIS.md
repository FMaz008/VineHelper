# Keyword Matching Race Condition Analysis

## Issue Summary

Item B0F995HBZV ("Boobrie SMA Male to Male Coaxial Cable...") was initially shown in the UI and triggered an OS notification, then was subsequently hidden. This creates a poor user experience where items flash on screen before disappearing.

## Root Cause

The current implementation has a **logic bug** in `NotificationMonitor.js` at line 1681:

```javascript
// Check hide keywords separately (not dependent on highlight keywords)
```

This comment and the subsequent code directly contradict the intended behavior described in the settings:

> "If the item title does not match one of the highlighted keywords, then check the auto-hide keywords."

### What Actually Happens:

1. **Stage 1**: Item arrives and is checked against highlight keywords
    - Item matched `wi[- ]?fi` keyword
    - Item was marked as highlighted and shown
    - OS notification was sent

2. **Stage 2**: Hide keywords are ALWAYS checked (regardless of highlight match)
    - Item matched `boobs?` pattern (from "Boobrie" in title)
    - Item was then hidden, despite having a highlight match

### What Should Happen:

1. Check if item matches any highlight keywords
2. If YES → Show the item and SKIP hide keyword check
3. If NO → Check hide keywords and hide if matched

## Why This Bug Exists

The code explicitly states it checks hide keywords "not dependent on highlight keywords", which is incorrect behavior according to the feature specification.

## Impact

- **User Confusion**: Items appear then disappear
- **Notification Spam**: Users get notified about items that are immediately hidden
- **Poor UX**: Creates a "flashing" effect in the UI

## Solution in Simplified System

Our new simplified keyword matching system addresses this by:

1. **Single Evaluation Point**: All keywords (highlight, hide, blur) are evaluated together
2. **Atomic Decision**: Visibility is determined once with all factors considered
3. **Pre-compiled Patterns**: Each component compiles and stores its patterns locally
4. **Pure Functions**: No side effects or timing dependencies

### Example Usage Pattern (Correct Implementation)

```javascript
// Component initialization
class ItemProcessor {
	constructor() {
		// Compile all patterns once
		this.highlightPatterns = compile(Settings.get("general.highlightKeywords"));
		this.hidePatterns = compile(Settings.get("general.hideKeywords"));
	}

	processItem(item) {
		// FIRST: Check highlight keywords
		const highlightMatch = findMatch(item.title, this.highlightPatterns, item.etv_min, item.etv_max);

		// If item matches highlight keyword, show it (skip hide check)
		if (highlightMatch) {
			return {
				visible: true,
				highlighted: true,
				keyword: highlightMatch.contains || null,
			};
		}

		// ONLY check hide keywords if NO highlight match
		const hideMatch = findMatch(item.title, this.hidePatterns, item.etv_min, item.etv_max);

		if (hideMatch) {
			return { visible: false, reason: "hidden" };
		}

		// No keyword matches
		return {
			visible: true,
			highlighted: false,
			keyword: null,
		};
	}
}
```

This ensures the correct priority order:

1. Highlight keywords take precedence
2. Hide keywords are only checked if no highlight match exists
3. All decisions are made atomically in one pass

## Benefits of New Approach

1. **Predictable Behavior**: Items are either shown or hidden, never both
2. **Better Performance**: Single pass evaluation
3. **No Race Conditions**: All decisions made atomically
4. **Cleaner Code**: Clear separation of concerns

## Implementation Priority

This issue reinforces the importance of our keyword matching simplification:

- Prevents user frustration
- Reduces notification noise
- Improves overall system reliability
- Makes debugging easier

## Next Steps

1. Complete implementation of simplified keyword matching utilities
2. Update components to use the new atomic evaluation pattern
3. Ensure hide keywords are always evaluated before highlight keywords
4. Add tests to prevent regression of this issue
