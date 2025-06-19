import { jest } from "@jest/globals";
import { keywordMatch, hasAnyEtvConditions, precompileKeywords } from "../scripts/core/utils/KeywordMatch.js";

describe("ETV Optimization", () => {
	describe("hasEtvCondition flag", () => {
		it("should set hasEtvCondition flag for keywords with ETV conditions", () => {
			const keywords = [
				{ contains: "laptop", etv_min: "100" },
				{ contains: "phone", etv_max: "50" },
				{ contains: "tablet", etv_min: "200", etv_max: "500" },
			];

			// Pre-compile to populate cache
			precompileKeywords(keywords);

			// Check that hasAnyEtvConditions returns true
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});

		it("should not set hasEtvCondition flag for keywords without ETV conditions", () => {
			const keywords = [
				{ contains: "laptop" },
				{ contains: "phone" },
				"tablet", // string format
			];

			// Pre-compile to populate cache
			precompileKeywords(keywords);

			// Check that hasAnyEtvConditions returns false
			expect(hasAnyEtvConditions(keywords)).toBe(false);
		});

		it("should correctly identify mixed keywords (some with ETV, some without)", () => {
			const keywords = [
				{ contains: "laptop" }, // no ETV
				{ contains: "phone", etv_min: "50" }, // has ETV
				"tablet", // no ETV
			];

			// Pre-compile to populate cache
			precompileKeywords(keywords);

			// Should return true because at least one keyword has ETV conditions
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});
	});

	describe("ETV condition matching", () => {
		it("should match keyword when ETV conditions are satisfied", () => {
			const keywords = [{ contains: "laptop", etv_min: "100", etv_max: "500" }];

			// Pre-compile
			precompileKeywords(keywords);

			// Should match when ETV is within range
			expect(keywordMatch(keywords, "laptop computer", 150, 150)).toBe("laptop");
			expect(keywordMatch(keywords, "laptop computer", 100, 100)).toBe("laptop");
			expect(keywordMatch(keywords, "laptop computer", 500, 500)).toBe("laptop");
		});

		it("should not match keyword when ETV conditions are not satisfied", () => {
			const keywords = [{ contains: "laptop", etv_min: "100", etv_max: "500" }];

			// Pre-compile
			precompileKeywords(keywords);

			// Should not match when ETV is outside range
			expect(keywordMatch(keywords, "laptop computer", 50, 50)).toBe(false);
			expect(keywordMatch(keywords, "laptop computer", 600, 600)).toBe(false);
			expect(keywordMatch(keywords, "laptop computer", null, null)).toBe(false);
		});

		it("should match keyword with only etv_min condition", () => {
			const keywords = [{ contains: "phone", etv_min: "50" }];

			// Pre-compile
			precompileKeywords(keywords);

			// Should match when ETV is above minimum
			expect(keywordMatch(keywords, "phone case", 100, 100)).toBe("phone");
			expect(keywordMatch(keywords, "phone case", 50, 50)).toBe("phone");

			// Should not match when ETV is below minimum
			expect(keywordMatch(keywords, "phone case", 25, 25)).toBe(false);
		});

		it("should match keyword with only etv_max condition", () => {
			const keywords = [{ contains: "tablet", etv_max: "300" }];

			// Pre-compile
			precompileKeywords(keywords);

			// Should match when ETV is below maximum
			expect(keywordMatch(keywords, "tablet stand", 200, 200)).toBe("tablet");
			expect(keywordMatch(keywords, "tablet stand", 300, 300)).toBe("tablet");

			// Should not match when ETV is above maximum
			expect(keywordMatch(keywords, "tablet stand", 400, 400)).toBe(false);
		});
	});

	describe("hasAnyEtvConditions function", () => {
		it("should return false for empty keywords array", () => {
			expect(hasAnyEtvConditions([])).toBe(false);
		});

		it("should return false for null/undefined keywords", () => {
			expect(hasAnyEtvConditions(null)).toBe(false);
			expect(hasAnyEtvConditions(undefined)).toBe(false);
		});

		it("should work correctly without pre-compilation", () => {
			const keywords = [{ contains: "laptop", etv_min: "100" }, { contains: "phone" }];

			// Should still work even without explicit pre-compilation
			// (will compile on first use)
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});

		it("should handle string-format keywords", () => {
			const keywords = ["laptop", "phone", "tablet"];

			// String format keywords don't have ETV conditions
			expect(hasAnyEtvConditions(keywords)).toBe(false);
		});
	});

	describe("Performance optimization", () => {
		it("should use cached compiled keywords", () => {
			const keywords = [
				{ contains: "laptop", etv_min: "100" },
				{ contains: "phone", etv_max: "50" },
			];

			// Pre-compile
			const stats1 = precompileKeywords(keywords);
			expect(stats1.cached).toBe(false);

			// Second call should use cache
			const stats2 = precompileKeywords(keywords);
			expect(stats2.cached).toBe(true);

			// hasAnyEtvConditions should also use cached data
			expect(hasAnyEtvConditions(keywords)).toBe(true);
		});
	});
});
