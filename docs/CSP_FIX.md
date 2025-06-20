# Content Security Policy Fix

## Issue

The extension failed to load in Chrome with the following error:

```
'content_security_policy.extension_pages': Insecure CSP value "https://appleid.cdn-apple.com" in directive 'script-src'.
```

This was caused by the upstream Apple Store subscription changes that added `https://appleid.cdn-apple.com` to the CSP script-src directive.

## Root Cause

Chrome extensions have strict security requirements and do not allow external script sources in the Content Security Policy for security reasons. Only 'self' is allowed for script-src in extension pages.

## Solution

Implemented a platform-specific approach to handle Apple Sign-In:

### 1. **Platform-Specific CSP**

- **Chrome/Firefox manifests**: Removed `https://appleid.cdn-apple.com` from script-src
- **Safari/iOS manifest**: Kept `https://appleid.cdn-apple.com` in script-src since Safari allows it

### Chrome/Firefox (manifest_chrome.json, manifest_firefox.json):

```json
"script-src 'self';"
```

### Safari/iOS (manifest_ios.json):

```json
"script-src 'self' https://appleid.cdn-apple.com;"
```

### 2. **Dynamic Script Loading**

Added conditional loading in settings.html to only load Apple SDK for Safari:

```javascript
if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
	const script = document.createElement("script");
	script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
	document.head.appendChild(script);
}
```

## Testing

Added `tests/manifest-csp.test.js` to validate:

1. No external script sources are present in CSP
2. script-src only contains 'self'
3. All manifest files have valid JSON structure

## Impact

This fix allows the extension to load properly in Chrome while maintaining security. The Apple Store subscription functionality that required the external script will need to be implemented differently if needed.

## Code Changes Made

### 1. **Graceful Fallback in settings.js**

Added a check for AppleID availability before attempting to use it:

```javascript
// Check if AppleID is available (only in Safari with proper CSP)
if (typeof AppleID !== 'undefined' && AppleID.auth) {
    AppleID.auth.init({...});
    AppleID.auth.signIn();
} else {
    // Fallback for when AppleID SDK is not available
    alert("Apple Sign-In is not available. Please use the receipt validation method instead.");
    document.getElementById("receiptData")?.focus();
}
```

This ensures that:

- Safari users can still use Apple Sign-In if the SDK loads
- Chrome/Firefox users get a clear message to use the receipt validation method
- The extension doesn't crash due to undefined AppleID object

## Alternative Approaches for Apple Store Integration

Since Chrome extensions cannot load external scripts for security reasons, here are alternative approaches for implementing Apple Store purchasing in a cross-browser extension:

### 1. **External Web App Approach (Recommended)**

- Host the Apple Store integration on a separate web application
- Use `chrome.tabs.create()` or `window.open()` to open the payment page
- Communicate back to the extension using:
    - URL parameters on a redirect page
    - PostMessage API with proper origin validation
    - Server-side webhook that updates user status

```javascript
// Example: Opening external payment page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "openApplePayment") {
		chrome.tabs.create({
			url: "https://your-domain.com/apple-payment?userId=" + userId,
		});
	}
});
```

### 2. **Native Messaging Approach**

- Create a native host application that handles Apple Store integration
- Use Chrome's Native Messaging API to communicate
- Requires separate installation but provides full system access

### 3. **Platform-Specific Builds**

- Maintain separate manifest files for different platforms
- Safari extensions have different CSP rules and can use Apple's APIs
- Use build scripts to generate platform-specific packages:

```json
// manifest_safari.json - Safari allows Apple domains
"content_security_policy": {
  "extension_pages": "script-src 'self' https://appleid.cdn-apple.com; ..."
}
```

### 4. **OAuth/Server-Side Integration**

- Implement Apple Sign-In and payment processing server-side
- Extension authenticates with your server
- Server handles Apple Store API calls and validates purchases

### 5. **Conditional Loading Based on Browser**

- Detect the browser/platform at runtime
- Load different payment flows based on capabilities:

```javascript
// Detect Safari and use native Apple integration
if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
	// Safari-specific Apple Store code
} else {
	// Alternative payment method for other browsers
}
```

## Best Practices for Cross-Browser Payment Integration

1. **Always validate purchases server-side** - Never trust client-side validation
2. **Use feature detection** - Check for API availability before using
3. **Provide fallback options** - Offer alternative payment methods
4. **Clear user communication** - Explain why external pages open for payments
5. **Secure communication** - Use HTTPS and validate origins for all communication

## Example Implementation Pattern

```javascript
class PaymentManager {
	constructor() {
		this.platform = this.detectPlatform();
	}

	detectPlatform() {
		if (typeof browser !== "undefined" && browser.runtime) {
			return "firefox";
		} else if (typeof safari !== "undefined") {
			return "safari";
		} else {
			return "chrome";
		}
	}

	async initiatePurchase(productId) {
		switch (this.platform) {
			case "safari":
				// Use native Apple Store integration
				return this.applePurchase(productId);
			case "chrome":
			case "firefox":
				// Use external web app
				return this.externalPurchase(productId);
		}
	}

	async externalPurchase(productId) {
		const userId = await this.getUserId();
		const purchaseUrl =
			`https://payments.your-domain.com/purchase?` +
			`product=${productId}&userId=${userId}&platform=${this.platform}`;

		chrome.tabs.create({ url: purchaseUrl });

		// Listen for completion
		return new Promise((resolve) => {
			chrome.runtime.onMessage.addListener(function listener(message) {
				if (message.type === "purchaseComplete") {
					chrome.runtime.onMessage.removeListener(listener);
					resolve(message.success);
				}
			});
		});
	}
}
```

This approach maintains security while providing a path forward for Apple Store integration across different browsers.
