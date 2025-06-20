import { keywordMatch, precompileKeywords } from "../scripts/core/utils/KeywordMatch.js";

describe("Keyword Cache Invalidation Tests", () => {
	test("Cache is invalidated when keywords array is replaced", () => {
		// Initial keywords
		let keywords = ["laptop", "phone"];

		// First match - will trigger auto pre-compilation
		expect(keywordMatch(keywords, "This is a laptop")).toBe("laptop");

		// Create a new array (simulating what happens when settings are updated)
		keywords = [...keywords, "tablet"];

		// This should work with the new array and auto pre-compile again
		expect(keywordMatch(keywords, "This is a tablet")).toBe("tablet");
		expect(keywordMatch(keywords, "This is a laptop")).toBe("laptop");
	});

	test("Cache invalidation with right-click keyword addition simulation", () => {
		// Simulate initial keywords from settings
		let keywords = [
			{ contains: "phone", without: "", etv_min: "", etv_max: "" },
			{ contains: "laptop", without: "", etv_min: "", etv_max: "" },
		];

		// First use
		expect(keywordMatch(keywords, "This is a phone")).toBe("phone");

		// Simulate right-click context menu addition (creates new array)
		const newKeyword = { contains: "tablet", without: "", etv_min: "", etv_max: "" };
		keywords = [...keywords, newKeyword].sort((a, b) =>
			a.contains.toLowerCase().localeCompare(b.contains.toLowerCase())
		);

		// Should work with new keyword
		expect(keywordMatch(keywords, "This is a tablet")).toBe("tablet");
		expect(keywordMatch(keywords, "This is a phone")).toBe("phone");
	});

	test("Manual pre-compilation is replaced when array changes", () => {
		let keywords = ["laptop", "phone"];

		// Manually pre-compile
		precompileKeywords(keywords);
		expect(keywordMatch(keywords, "This is a laptop")).toBe("laptop");

		// Replace array
		keywords = ["desktop", "monitor"];

		// Should work with new keywords (auto pre-compile)
		expect(keywordMatch(keywords, "This is a desktop")).toBe("desktop");
		expect(keywordMatch(keywords, "This is a laptop")).toBe(false);
	});

	test("Same array reference uses cached compilation", () => {
		const keywords = ["laptop", "phone"];
		const consoleSpy = jest.spyOn(console, "log").mockImplementation();

		// First call - will pre-compile
		keywordMatch(keywords, "This is a laptop");

		// Clear spy to check if it compiles again
		consoleSpy.mockClear();

		// Second call with same array reference - should use cache
		keywordMatch(keywords, "This is a phone");

		// Should not log pre-compilation message again
		expect(consoleSpy).not.toHaveBeenCalled();

		consoleSpy.mockRestore();
	});
});
