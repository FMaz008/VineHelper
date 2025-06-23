import { jest } from "@jest/globals";
import { keywordMatcher } from "../scripts/core/utils/KeywordMatch.js";

describe("Keyword Data Synchronization", () => {
	beforeEach(() => {
		keywordMatcher.clearKeywordCache();
	});

	describe("Keyword Object Structure", () => {
		it("should maintain synchronization between contains, without, and ETV values", () => {
			const keywords = [
				{
					contains: "phone",
					without: "case",
					etv_min: "10",
					etv_max: "100",
				},
				{
					contains: "laptop",
					without: "bag",
					etv_min: "50",
					etv_max: "500",
				},
				{
					contains: "tablet",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];

			// Test that each keyword maintains its paired data
			keywords.forEach((keyword, index) => {
				const compiled = keywordMatcher.compileKeyword(keyword);
				expect(compiled).toBeTruthy();

				// Verify the compiled object has the correct structure
				expect(compiled.regex).toBeDefined();

				if (keyword.without) {
					expect(compiled.withoutRegex).toBeDefined();
					expect(compiled.withoutRegex).toBeInstanceOf(RegExp);
				} else {
					expect(compiled.withoutRegex).toBeNull();
				}

				if (keyword.etv_min || keyword.etv_max) {
					expect(compiled.hasEtvCondition).toBe(true);
				}
			});
		});

		it("should correctly match keywords with their associated data", () => {
			const keywords = [
				{
					contains: "phone",
					without: "case",
					etv_min: "10",
					etv_max: "100",
				},
				{
					contains: "laptop",
					without: "bag",
					etv_min: "50",
					etv_max: "500",
				},
			];

			// Mark keywords with type for proper caching
			keywords.__keywordType = "general.highlightKeywords";

			// Test 1: Should match "phone" but not with "case"
			const match1 = keywordMatcher.keywordMatchReturnFullObject(keywords, "New phone available", 20, 80);
			expect(match1).toEqual(keywords[0]);

			// Test 2: Should NOT match "phone case"
			const match2 = keywordMatcher.keywordMatchReturnFullObject(keywords, "New phone case available", 20, 80);
			expect(match2).toBeUndefined();

			// Test 3: Should match "laptop" with correct ETV
			const match3 = keywordMatcher.keywordMatchReturnFullObject(keywords, "Gaming laptop on sale", 100, 200);
			expect(match3).toEqual(keywords[1]);

			// Test 4: Should NOT match "laptop" with low ETV
			const match4 = keywordMatcher.keywordMatchReturnFullObject(keywords, "Gaming laptop on sale", 10, 20);
			expect(match4).toBeUndefined();

			// Test 5: Should NOT match "laptop bag"
			const match5 = keywordMatcher.keywordMatchReturnFullObject(keywords, "Laptop bag clearance", 100, 200);
			expect(match5).toBeUndefined();
		});

		it("should maintain index alignment during compilation", () => {
			const keywords = [
				{ contains: "valid1", without: "exclude1", etv_min: "10", etv_max: "100" },
				{ contains: "[invalid regex", without: "", etv_min: "", etv_max: "" }, // This will fail compilation
				{ contains: "valid2", without: "exclude2", etv_min: "20", etv_max: "200" },
			];

			keywords.__keywordType = "general.highlightKeywords";

			// Pre-compile keywords
			const stats = keywordMatcher.precompileKeywords("general.highlightKeywords", keywords);
			expect(stats.total).toBe(3);
			expect(stats.compiled).toBe(2);
			expect(stats.failed).toBe(1);

			// Verify that indices are preserved
			const compiled0 = keywordMatcher.getCompiledRegex("general.highlightKeywords", 0);
			const compiled1 = keywordMatcher.getCompiledRegex("general.highlightKeywords", 1);
			const compiled2 = keywordMatcher.getCompiledRegex("general.highlightKeywords", 2);

			expect(compiled0).toBeTruthy();
			expect(compiled1).toBeFalsy(); // Failed compilation (returns undefined or null)
			expect(compiled2).toBeTruthy();

			// Test matching - should still work with correct indices
			const match1 = keywordMatcher.keywordMatchReturnFullObject(keywords, "This is valid1 text", 50, 75);
			expect(match1).toEqual(keywords[0]);

			const match2 = keywordMatcher.keywordMatchReturnFullObject(keywords, "This is valid2 text", 50, 150);
			expect(match2).toEqual(keywords[2]); // Index 2, not 1
		});
	});

	describe("Settings Integration", () => {
		it("should store keywords as unified objects", () => {
			// This simulates how keywords are stored in settings
			const keywordsFromSettings = [
				{
					contains: "smartphone",
					without: "broken",
					etv_min: "25",
					etv_max: "250",
				},
				{
					contains: "headphones",
					without: "",
					etv_min: "5",
					etv_max: "",
				},
			];

			// Each keyword object contains all its data together
			expect(keywordsFromSettings[0]).toHaveProperty("contains");
			expect(keywordsFromSettings[0]).toHaveProperty("without");
			expect(keywordsFromSettings[0]).toHaveProperty("etv_min");
			expect(keywordsFromSettings[0]).toHaveProperty("etv_max");

			// The data is inherently synchronized because it's in the same object
			const firstKeyword = keywordsFromSettings[0];
			expect(firstKeyword.contains).toBe("smartphone");
			expect(firstKeyword.without).toBe("broken");
			expect(firstKeyword.etv_min).toBe("25");
			expect(firstKeyword.etv_max).toBe("250");
		});
	});

	describe("Caching and Synchronization", () => {
		it("should maintain data pairing through caching operations", () => {
			const keywords = [
				{
					contains: "camera",
					without: "lens",
					etv_min: "30",
					etv_max: "300",
				},
			];

			keywords.__keywordType = "general.highlightKeywords";

			// First compilation and match
			const match1 = keywordMatcher.keywordMatchReturnFullObject(keywords, "Digital camera sale", 50, 200);
			expect(match1).toEqual(keywords[0]);

			// Clear cache
			keywordMatcher.clearKeywordCache();

			// Second match after cache clear - should still work
			const match2 = keywordMatcher.keywordMatchReturnFullObject(keywords, "Digital camera sale", 50, 200);
			expect(match2).toEqual(keywords[0]);

			// Verify exclusion still works
			const match3 = keywordMatcher.keywordMatchReturnFullObject(keywords, "Camera lens only", 50, 200);
			expect(match3).toBeUndefined();
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty arrays correctly", () => {
			const keywords = [];
			const match = keywordMatcher.keywordMatchReturnFullObject(keywords, "Any text", 10, 100);
			expect(match).toBeUndefined();
		});

		it("should handle keywords with partial data", () => {
			const keywords = [
				{
					contains: "partial",
					without: "",
					etv_min: "10",
					etv_max: "", // Only min specified
				},
			];

			keywords.__keywordType = "general.highlightKeywords";

			// Should match when etv_max >= 10
			const match1 = keywordMatcher.keywordMatchReturnFullObject(keywords, "partial match", 5, 15);
			expect(match1).toEqual(keywords[0]);

			// Should not match when etv_max < 10
			const match2 = keywordMatcher.keywordMatchReturnFullObject(keywords, "partial match", 1, 5);
			expect(match2).toBeUndefined();
		});
	});
});
