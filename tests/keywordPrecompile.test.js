import { keywordMatch, precompileKeywords } from "../scripts/core/utils/KeywordMatch.js";

describe("Keyword Pre-compilation Tests", () => {
	let consoleWarnSpy;
	let consoleLogSpy;

	beforeEach(() => {
		// Suppress console output during tests
		consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
		consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

		// Clear any existing cache before each test
		precompileKeywords([]);
	});

	afterEach(() => {
		// Restore console
		consoleWarnSpy.mockRestore();
		consoleLogSpy.mockRestore();
	});

	test("Pre-compilation with string keywords", () => {
		const keywords = ["laptop", "phone", "tablet"];

		// Pre-compile keywords
		precompileKeywords(keywords);

		// Test matching
		expect(keywordMatch(keywords, "This is a laptop computer")).toBe("laptop");
		expect(keywordMatch(keywords, "My phone is ringing")).toBe("phone");
		expect(keywordMatch(keywords, "No match here")).toBe(false);
	});

	test("Pre-compilation with object keywords", () => {
		const keywords = [
			{ contains: "laptop", without: "gaming", etv_min: "", etv_max: "" },
			{ contains: "phone", without: "", etv_min: "10", etv_max: "50" },
		];

		// Pre-compile keywords
		precompileKeywords(keywords);

		// Test matching without ETV
		expect(keywordMatch(keywords, "This is a laptop computer")).toBe("laptop");
		expect(keywordMatch(keywords, "This is a gaming laptop")).toBe(false);

		// Test matching with ETV
		expect(keywordMatch(keywords, "New phone available", 15, 30)).toBe("phone");
		expect(keywordMatch(keywords, "New phone available", 5, 8)).toBe(false);
	});

	test("Pre-compilation with Unicode keywords", () => {
		const keywords = ["日本語", "café", "naïve"];

		// Pre-compile keywords
		precompileKeywords(keywords);

		// Test matching - Unicode boundary detection works differently
		expect(keywordMatch(keywords, "日本語")).toBe("日本語");
		expect(keywordMatch(keywords, "Visit the café today")).toBe("café");
		expect(keywordMatch(keywords, "How naïve of me")).toBe("naïve");
	});

	test("Multiple pre-compilations should clear previous cache", () => {
		const keywords1 = ["laptop", "phone"];
		const keywords2 = ["tablet", "watch"];

		// First pre-compilation
		precompileKeywords(keywords1);
		expect(keywordMatch(keywords1, "This is a laptop")).toBe("laptop");

		// Second pre-compilation should clear the first
		precompileKeywords(keywords2);
		expect(keywordMatch(keywords2, "This is a tablet")).toBe("tablet");

		// Old keywords should not match anymore (will trigger re-compilation)
		expect(keywordMatch(keywords1, "This is a laptop")).toBe("laptop");
	});

	test("Pre-compilation with contains/without patterns", () => {
		const keywords = [
			{
				contains: "laptop",
				without: "refurbished|used|open box",
				etv_min: "",
				etv_max: "",
			},
			{
				contains: "smart[- ]?ring",
				without: "charger|cable|sizer",
				etv_min: "10",
				etv_max: "50",
			},
			{
				contains: "Mini[- ]?PC|gaming[- ]?pc",
				without: "",
				etv_min: "",
				etv_max: "",
			},
		];

		// Pre-compile keywords
		precompileKeywords(keywords);

		// Test contains/without logic
		expect(keywordMatch(keywords, "New laptop with warranty")).toBe("laptop");
		expect(keywordMatch(keywords, "Refurbished laptop in good condition")).toBe(false);
		expect(keywordMatch(keywords, "Used laptop for sale")).toBe(false);
		expect(keywordMatch(keywords, "Open box laptop deal")).toBe(false);

		// Test with ETV values
		expect(keywordMatch(keywords, "Smart Ring health tracker", 20, 40)).toBe("smart[- ]?ring");
		expect(keywordMatch(keywords, "Smart Ring health tracker", 5, 8)).toBe(false); // ETV too low
		expect(keywordMatch(keywords, "Smart Ring charger cable", 20, 40)).toBe(false); // has "charger"

		// Test without "without" clause
		expect(keywordMatch(keywords, "Mini-PC with Windows 11")).toBe("Mini[- ]?PC|gaming[- ]?pc");
		expect(keywordMatch(keywords, "Gaming PC with RTX 4090")).toBe("Mini[- ]?PC|gaming[- ]?pc");
	});

	test("Pre-compilation handles invalid regex patterns gracefully", () => {
		const keywords = [
			"valid",
			"[invalid", // Invalid regex
			"another valid",
		];

		// Pre-compile keywords - should not throw
		expect(() => precompileKeywords(keywords)).not.toThrow();

		// Valid patterns should still work
		expect(keywordMatch(keywords, "This is valid")).toBe("valid");
		expect(keywordMatch(keywords, "another valid test")).toBe("valid"); // 'valid' matches first

		// Invalid pattern should not match
		expect(keywordMatch(keywords, "[invalid test")).toBe(false);
	});

	test("Automatic pre-compilation when cache is empty", () => {
		const keywords = ["laptop", "phone"];

		// Don't pre-compile, let it happen automatically
		expect(keywordMatch(keywords, "This is a laptop")).toBe("laptop");

		// The automatic pre-compilation should happen silently without warnings
		expect(consoleWarnSpy).not.toHaveBeenCalled();

		// Verify that subsequent calls use the pre-compiled cache
		expect(keywordMatch(keywords, "This is a phone")).toBe("phone");
	});

	test("Pre-compilation prevents repeated regex creation", () => {
		// This test verifies that pre-compilation actually works by checking
		// that the same compiled regex objects are reused
		const keywords = ["laptop", { contains: "phone", without: "case", etv_min: "10", etv_max: "50" }, "tablet"];

		// Pre-compile keywords
		precompileKeywords(keywords);

		// Spy on RegExp constructor
		const regExpSpy = jest.spyOn(global, "RegExp");

		// Call keywordMatch multiple times
		for (let i = 0; i < 100; i++) {
			keywordMatch(keywords, "Looking for a laptop");
			keywordMatch(keywords, "New phone available", 20, 40);
			keywordMatch(keywords, "Tablet on sale");
		}

		// RegExp constructor should NOT have been called (using pre-compiled)
		expect(regExpSpy).not.toHaveBeenCalled();

		regExpSpy.mockRestore();
	});

	test("Without pre-compilation, regex objects are created on first call", () => {
		const keywords = ["laptop", { contains: "phone", without: "case", etv_min: "10", etv_max: "50" }];

		// Use different keyword arrays to avoid caching
		const keywords1 = [...keywords];
		const keywords2 = [...keywords];

		// Spy on RegExp constructor
		const regExpSpy = jest.spyOn(global, "RegExp");

		// First call with keywords1 should create regex objects
		keywordMatch(keywords1, "Looking for a laptop");

		// Count how many times RegExp was called
		const firstCallCount = regExpSpy.mock.calls.length;
		expect(firstCallCount).toBeGreaterThan(0);

		// Clear the spy
		regExpSpy.mockClear();

		// Call with keywords2 (different array reference) should create regex objects again
		keywordMatch(keywords2, "Looking for a laptop");

		// Should have created regex objects again since it's a different array
		expect(regExpSpy.mock.calls.length).toBeGreaterThan(0);

		regExpSpy.mockRestore();
	});

	test("Correctness: Complex patterns with real-world keywords", () => {
		// Use realistic complex keywords similar to actual user patterns
		const complexKeywords = [
			// Complex regex patterns with special characters
			"ETL[- ]Cert|ETL[- ]Listed|UL[- ]Cert|UL[- ]Listed",
			"linux|\\bubuntu\\b|\\bdebian\\b|\\bredhat\\b|\\bcentos\\b",
			"Mini[- ]?PC|gaming[- ]?pc|beelink|acemagic|GK3Plus|KAMRUI|GMKtec|BOSGAME|\\bmele\\b",
			"smart[- ]?ring|Activity[- ]Tracker Ring|Smart[- ]?Health Ring",
			"Ring Size kit|Replacement Charger|Ring Chargers?|Ring Sizer|Measuring Tool|Sizing Kit|Compatible with|Cable for",
			// Patterns with word boundaries
			"\\bGPU\\b|\\bRTX\\b|\\bGTX\\b|graphics[- ]?card",
			"\\biPhone\\b|\\biPad\\b|\\bMacBook\\b|\\bAirPods\\b",
			// Unicode patterns
			"日本語|にほんご|ニホンゴ",
			"café|naïve|résumé|über",
			// Simple keywords
			"laptop",
			"phone",
			"tablet",
			"monitor",
			"keyboard",
			"mouse",
			"headphones",
			"speaker",
			"camera",
			"printer",
			"router",
			"modem",
		];

		// Generate many keywords with various configurations
		const keywords = [];
		for (let i = 0; i < 50; i++) {
			// Add each complex pattern multiple times with variations
			complexKeywords.forEach((pattern, j) => {
				keywords.push({
					contains: pattern,
					without: (i + j) % 7 === 0 ? "refurbished|used|open box" : "",
					etv_min: (i + j) % 5 === 0 ? "10" : "",
					etv_max: (i + j) % 5 === 0 ? "100" : "",
				});
			});

			// Add simple keywords
			keywords.push({
				contains: `product${i}`,
				without: i % 8 === 0 ? `exclude${i}` : "",
				etv_min: i % 6 === 0 ? "5" : "",
				etv_max: i % 6 === 0 ? "50" : "",
			});
		}

		const testStrings = [
			// Strings that match complex patterns
			"ETL Certified product with UL Listed components",
			"Gaming PC with RTX 4090 GPU and liquid cooling",
			"Ubuntu linux server with debian compatibility",
			"Smart Ring Activity Tracker with health monitoring",
			"Ring Size kit and Replacement Charger bundle",
			"Mini-PC beelink with acemagic features",
			"iPhone 15 Pro Max with AirPods included",
			"日本語のキーボード (Japanese keyboard)",
			"Visit the café for a naïve résumé review",
			// Strings with "without" patterns
			"Refurbished laptop with new battery",
			"Open box phone in perfect condition",
			"Used tablet with minor scratches",
			// Simple matches
			"This text contains product25 somewhere",
			"Another text with product123 and product456",
			"No matches in this one at all",
			"product999 at the beginning",
			"At the end is product0",
		];

		// Pre-compile keywords
		precompileKeywords(keywords);

		// Test various complex patterns
		testStrings.forEach((str) => {
			// Just verify correctness - no performance assertions
			const result = keywordMatch(keywords, str, 15, 45);
			// We're not asserting specific results, just that it doesn't throw
			expect(() => keywordMatch(keywords, str)).not.toThrow();
		});

		// Verify specific pattern matches
		expect(keywordMatch(keywords, "ETL Certified product")).toBeTruthy();
		expect(keywordMatch(keywords, "Ubuntu linux server")).toBeTruthy();
		expect(keywordMatch(keywords, "Mini-PC for gaming")).toBeTruthy();
		expect(keywordMatch(keywords, "Smart Ring tracker")).toBeTruthy();
		expect(keywordMatch(keywords, "日本語のテキスト")).toBeTruthy();

		// Verify "without" patterns work
		const refurbishedKeywords = [
			{
				contains: "laptop",
				without: "refurbished|used",
				etv_min: "",
				etv_max: "",
			},
		];
		precompileKeywords(refurbishedKeywords);
		expect(keywordMatch(refurbishedKeywords, "New laptop")).toBe("laptop");
		expect(keywordMatch(refurbishedKeywords, "Refurbished laptop")).toBe(false);
	});
});
