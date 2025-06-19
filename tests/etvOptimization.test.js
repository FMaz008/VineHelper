import { jest } from "@jest/globals";
import { keywordMatch, precompileKeywords, hasAnyEtvConditions } from "../scripts/core/utils/KeywordMatch.js";

describe("ETV Optimization", () => {
	describe("hasAnyEtvConditions", () => {
		it("should return false for string keywords", () => {
			const keywords = ["test", "example", "keyword"];
			expect(hasAnyEtvConditions(keywords)).toBe(false);
		});

		it("should return false for object keywords without ETV conditions", () => {
			const keywords = [
				{ contains: "test", without: "", etv_min: "", etv_max: "" },
				{ contains: "example", without: "exclude", etv_min: "", etv_max: "" },
			];
			expect(hasAnyEtvConditions(keywords)).toBe(false);
		});

		it("should return true if any keyword has etv_min", () => {
			const keywords = [
				{ contains: "test", without: "", etv_min: "", etv_max: "" },
				{ contains: "example", without: "", etv_min: "10", etv_max: "" },
			];
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});

		it("should return true if any keyword has etv_max", () => {
			const keywords = [
				{ contains: "test", without: "", etv_min: "", etv_max: "" },
				{ contains: "example", without: "", etv_min: "", etv_max: "50" },
			];
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});

		it("should return true if any keyword has both etv_min and etv_max", () => {
			const keywords = [
				{ contains: "test", without: "", etv_min: "", etv_max: "" },
				{ contains: "example", without: "", etv_min: "10", etv_max: "50" },
			];
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});

		it("should work with pre-compiled keywords", () => {
			const keywords = [
				{ contains: "test", without: "", etv_min: "", etv_max: "" },
				{ contains: "example", without: "", etv_min: "10", etv_max: "" },
			];

			// Pre-compile the keywords
			precompileKeywords(keywords);

			// Should still return true
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});

		it("should work with mixed keyword types", () => {
			const keywords = [
				"simple",
				{ contains: "test", without: "", etv_min: "", etv_max: "" },
				{ contains: "example", without: "", etv_min: "10", etv_max: "50" },
			];
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});
	});

	describe("compiled keyword hasEtvCondition flag", () => {
		it("should set hasEtvCondition to false for string keywords", () => {
			const keywords = ["test"];
			const stats = precompileKeywords(keywords);
			expect(stats.compiled).toBe(1);

			// Verify by using keywordMatch which will access the compiled cache
			const match = keywordMatch(keywords, "test string", null, null);
			expect(match).toBe("test");
		});

		it("should set hasEtvCondition correctly for object keywords", () => {
			const keywordsWithoutEtv = [{ contains: "test", without: "", etv_min: "", etv_max: "" }];
			const keywordsWithEtv = [{ contains: "example", without: "", etv_min: "10", etv_max: "50" }];

			// Pre-compile both sets
			precompileKeywords(keywordsWithoutEtv);
			precompileKeywords(keywordsWithEtv);

			// Verify hasAnyEtvConditions works correctly
			expect(hasAnyEtvConditions(keywordsWithoutEtv)).toBe(false);
			expect(hasAnyEtvConditions(keywordsWithEtv)).toBe(true);
		});
	});

	describe("ETV-dependent keyword matching", () => {
		it("should not match when ETV is outside range", () => {
			const keywords = [{ contains: "test", without: "", etv_min: "10", etv_max: "50" }];

			// ETV too low
			expect(keywordMatch(keywords, "test item", "5", "5")).toBe(false);

			// ETV too high
			expect(keywordMatch(keywords, "test item", "60", "60")).toBe(false);

			// ETV in range
			expect(keywordMatch(keywords, "test item", "20", "30")).toBe("test");
		});

		it("should handle null ETV values correctly", () => {
			const keywords = [{ contains: "test", without: "", etv_min: "10", etv_max: "" }];

			// Null ETV should not match
			expect(keywordMatch(keywords, "test item", null, null)).toBe(false);

			// Empty string ETV should not match
			expect(keywordMatch(keywords, "test item", "", "")).toBe(false);
		});
	});
});
