const fs = require("fs");
const path = require("path");

describe("Manifest CSP Validation", () => {
	const manifestFiles = ["manifest.json", "manifest_chrome.json", "manifest_firefox.json", "manifest_ios.json"];

	manifestFiles.forEach((filename) => {
		test(`${filename} should have appropriate CSP for its platform`, () => {
			const manifestPath = path.join(__dirname, "..", filename);
			const manifestContent = fs.readFileSync(manifestPath, "utf8");
			const manifest = JSON.parse(manifestContent);

			if (manifest.content_security_policy) {
				let cspString;

				// Handle both MV2 (string) and MV3 (object) formats
				if (typeof manifest.content_security_policy === "string") {
					cspString = manifest.content_security_policy;
				} else if (manifest.content_security_policy.extension_pages) {
					cspString = manifest.content_security_policy.extension_pages;
				}

				if (cspString) {
					// Extract script-src directive
					const scriptSrcMatch = cspString.match(/script-src\s+([^;]+)/);

					if (scriptSrcMatch) {
						const scriptSrc = scriptSrcMatch[1];

						// Safari/iOS manifest can have Apple domains
						if (filename === "manifest_ios.json") {
							expect(scriptSrc).toContain("'self'");
							// Apple domain is allowed for Safari
							expect(scriptSrc).toContain("https://appleid.cdn-apple.com");
						} else {
							// Chrome and Firefox should only have 'self'
							expect(scriptSrc.trim()).toBe("'self'");

							// Ensure no external domains are present
							expect(scriptSrc).not.toMatch(/https?:\/\//);
							expect(scriptSrc).not.toContain("appleid.cdn-apple.com");
						}
					}
				}
			}
		});

		test(`${filename} should have valid JSON structure`, () => {
			const manifestPath = path.join(__dirname, "..", filename);
			const manifestContent = fs.readFileSync(manifestPath, "utf8");

			// This will throw if JSON is invalid
			expect(() => JSON.parse(manifestContent)).not.toThrow();
		});
	});
});
