# Notification System Debug Flag

## Overview
The notification system includes a debug flag that controls diagnostic logging for notification-related operations. This helps troubleshoot issues without cluttering the console during normal operation.

## How to Enable/Disable

### Via Settings UI (Recommended)
1. Open VineHelper settings
2. Navigate to the "Debug" tab
3. Under "Notification Monitor" section, check/uncheck "Debug Notifications"
4. The setting is automatically saved and applied

### Via Console (Alternative)
```javascript
// Enable
await chrome.storage.local.set({ "general.debugNotifications": true });

// Disable
await chrome.storage.local.set({ "general.debugNotifications": false });
```

## What Gets Logged When Enabled

1. **Sound Notifications (ScreenNotifier.js)**
   - Sound delegation to NotificationsSoundPlayer
   - Sound file and volume information

2. **Sound Player State Machine (NotificationsSoundPlayer.js)**
   - Play requests with notification type
   - State transitions (READY, WAIT, PLAY, COOLDOWN)
   - Sound playback details
   - Cooldown timing
   - Queued notification handling

3. **OS Notifications (Service Worker)**
   - Push notification calls with ASIN and title
   - Duplicate prevention (both ASIN-based and time-based)
   - Notification creation confirmations

4. **Stream Processing (NewItemStreamProcessing.js)**
   - OS notification triggers with item details

5. **Server Communication (ServerCom.js)**
   - Master/slave monitor notification initialization

## Usage Example

To debug notification issues:

1. Open VineHelper settings and navigate to the Debug tab
2. Check "Debug Notifications" under the Notification Monitor section
3. Open the browser console (F12)
4. Reproduce the issue
5. Check console for detailed logs
6. Uncheck the setting when done to reduce console noise

## Note
The debug flag is stored in Chrome storage and accessed through the Settings manager, ensuring it works correctly in all contexts including service workers. The setting persists across browser restarts and is synchronized across all extension components.