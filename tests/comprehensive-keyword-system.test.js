import { jest } from "@jest/globals";
import {
	keywordMatch,
	precompileKeywords,
	clearKeywordCache,
	keywordMatcher,
} from "../scripts/core/utils/KeywordMatch.js";
import { sharedKeywordMatcher } from "../scripts/core/utils/SharedKeywordMatcher.js";

describe("Comprehensive Keyword System Tests", () => {
	beforeEach(() => {
		clearKeywordCache();
		// SharedKeywordMatcher uses the KeywordMatcher singleton internally
		// so clearing the KeywordMatcher cache is sufficient
	});

	describe("Basic String Keywords", () => {
		test("should match exact string keywords", () => {
			const keywords = ["laptop", "phone", "tablet"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "I need a laptop")).toBe("laptop");
			expect(keywordMatch(keywords, "New phone arrived")).toBe("phone");
			expect(keywordMatch(keywords, "tablet for sale")).toBe("tablet");
			expect(keywordMatch(keywords, "desktop computer")).toBe(false);
		});

		test("should match with word boundaries", () => {
			const keywords = ["led", "oled"];
			precompileKeywords(keywords);

			// Should NOT match partial words
			expect(keywordMatch(keywords, "knowledge")).toBe(false);
			expect(keywordMatch(keywords, "soled shoes")).toBe(false);

			// Should match whole words
			expect(keywordMatch(keywords, "led lights")).toBe("led");
			expect(keywordMatch(keywords, "oled tv")).toBe("oled");
		});

		test("should be case insensitive", () => {
			const keywords = ["iPhone", "MacBook"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "IPHONE 15")).toBe("iPhone");
			expect(keywordMatch(keywords, "macbook pro")).toBe("MacBook");
			expect(keywordMatch(keywords, "Macbook Air")).toBe("MacBook");
		});
	});

	describe("Regex Pattern Keywords", () => {
		test("should match simple regex patterns", () => {
			const keywords = [".*phone", "tablet.*", ".*laptop.*"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "smartphone")).toBe(".*phone");
			expect(keywordMatch(keywords, "tablet pro")).toBe("tablet.*");
			expect(keywordMatch(keywords, "gaming laptop computer")).toBe(".*laptop.*");
		});

		test("should match complex regex patterns", () => {
			const keywords = ["smart[- ]?ring", "Mini[- ]?PC|gaming[- ]?pc", "\\b(GPU|RTX|GTX)\\b"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "smart ring tracker")).toBe("smart[- ]?ring");
			expect(keywordMatch(keywords, "smart-ring device")).toBe("smart[- ]?ring");
			expect(keywordMatch(keywords, "smartring")).toBe("smart[- ]?ring");
			expect(keywordMatch(keywords, "Mini-PC setup")).toBe("Mini[- ]?PC|gaming[- ]?pc");
			expect(keywordMatch(keywords, "gaming pc build")).toBe("Mini[- ]?PC|gaming[- ]?pc");
			expect(keywordMatch(keywords, "RTX 4090")).toBe("\\b(GPU|RTX|GTX)\\b");
		});

		test("should match patterns with special characters", () => {
			// Original behavior: keywords are regex patterns, special chars must be escaped
			// Word boundaries don't work with non-word chars, so use patterns that work
			const keywords = [".*\\$50", ".*test\\(\\).*", "email@example\\.com"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "price is $50")).toBe(".*\\$50");
			expect(keywordMatch(keywords, "test() function")).toBe(".*test\\(\\).*");
			expect(keywordMatch(keywords, "email@example.com here")).toBe("email@example\\.com");
		});
	});

	describe("Keywords with 'without' conditions", () => {
		test("should exclude matches when 'without' condition is present", () => {
			const keywords = [{ contains: "laptop", without: "refurbished", etv_min: "", etv_max: "" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "New laptop for sale")).toBe("laptop");
			expect(keywordMatch(keywords, "Refurbished laptop available")).toBe(false);
			expect(keywordMatch(keywords, "REFURBISHED LAPTOP")).toBe(false);
		});

		test("should handle multiple 'without' conditions with OR logic", () => {
			const keywords = [{ contains: "laptop", without: "refurbished|used|open box", etv_min: "", etv_max: "" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "Brand new laptop")).toBe("laptop");
			expect(keywordMatch(keywords, "Refurbished laptop")).toBe(false);
			expect(keywordMatch(keywords, "Used laptop for sale")).toBe(false);
			expect(keywordMatch(keywords, "Open box laptop deal")).toBe(false);
		});

		test("should handle complex regex in 'without' conditions", () => {
			const keywords = [{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: "", etv_max: "" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "Super glue bottle")).toBe("glue|tape");
			expect(keywordMatch(keywords, "Duct tape roll")).toBe("glue|tape");
			expect(keywordMatch(keywords, "Phone case with glue")).toBe(false);
			expect(keywordMatch(keywords, "Tape patches kit")).toBe(false);
			expect(keywordMatch(keywords, "Glue on nails set")).toBe(false);
		});

		test("should handle regex patterns in both contains and without", () => {
			const keywords = [{ contains: "smart[- ]?ring", without: "charger|cable|sizer", etv_min: "", etv_max: "" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "Smart Ring health tracker")).toBe("smart[- ]?ring");
			expect(keywordMatch(keywords, "smart-ring fitness")).toBe("smart[- ]?ring");
			expect(keywordMatch(keywords, "Smart Ring charger")).toBe(false);
			expect(keywordMatch(keywords, "smart ring cable")).toBe(false);
		});
	});

	describe("Keywords with ETV conditions", () => {
		test("should match when ETV is within range", () => {
			const keywords = [{ contains: "laptop", without: "", etv_min: "100", etv_max: "500" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "Gaming laptop", 300, 400)).toBe("laptop");
			expect(keywordMatch(keywords, "Gaming laptop", 100, 500)).toBe("laptop");
			expect(keywordMatch(keywords, "Gaming laptop", 50, 600)).toBe("laptop"); // max (600) >= min requirement (100)
			expect(keywordMatch(keywords, "Gaming laptop", 600, 700)).toBe(false); // min (600) > max requirement (500)
		});

		test("should handle ETV min only", () => {
			const keywords = [{ contains: ".*phone", without: "", etv_min: "200", etv_max: "" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "iPhone", 300, 400)).toBe(".*phone");
			expect(keywordMatch(keywords, "iPhone", 200, 250)).toBe(".*phone");
			expect(keywordMatch(keywords, "iPhone", 100, 150)).toBe(false);
		});

		test("should handle ETV max only", () => {
			const keywords = [{ contains: ".*[Pp]ad", without: "", etv_min: "", etv_max: "300" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "iPad", 100, 200)).toBe(".*[Pp]ad");
			expect(keywordMatch(keywords, "iPad", 250, 300)).toBe(".*[Pp]ad");
			expect(keywordMatch(keywords, "iPad", 350, 400)).toBe(false);
		});

		test("should handle exact ETV match (min = max = 0)", () => {
			const keywords = [{ contains: "beer", without: "", etv_min: "0", etv_max: "0" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "beer", 0, 0)).toBe("beer");
			// Original behavior: null/undefined/empty string are treated as "no value" and don't match
			expect(keywordMatch(keywords, "beer", null, null)).toBe(false);
			expect(keywordMatch(keywords, "beer", undefined, undefined)).toBe(false);
			expect(keywordMatch(keywords, "beer", "", "")).toBe(false);
			expect(keywordMatch(keywords, "beer", 1, 5)).toBe(false);
		});

		test("should handle ETV ranges with null/undefined values", () => {
			const keywords = [{ contains: ".*", without: "", etv_min: "500", etv_max: "20000" }];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "anything", 1000, 5000)).toBe(".*");
			expect(keywordMatch(keywords, "anything", null, null)).toBe(false);
			expect(keywordMatch(keywords, "anything", undefined, undefined)).toBe(false);
		});
	});

	describe("Complex combinations", () => {
		test("should handle keywords with all conditions", () => {
			const keywords = [
				{
					contains: "laptop|notebook",
					without: "refurbished|used",
					etv_min: "500",
					etv_max: "2000",
				},
			];
			precompileKeywords(keywords);

			// Should match
			expect(keywordMatch(keywords, "New laptop computer", 1000, 1500)).toBe("laptop|notebook");
			expect(keywordMatch(keywords, "Gaming notebook", 500, 2000)).toBe("laptop|notebook");

			// Should not match - wrong ETV
			expect(keywordMatch(keywords, "New laptop", 100, 400)).toBe(false);
			expect(keywordMatch(keywords, "Gaming notebook", 2500, 3000)).toBe(false);

			// Should not match - has excluded words
			expect(keywordMatch(keywords, "Refurbished laptop", 1000, 1500)).toBe(false);
			expect(keywordMatch(keywords, "Used notebook for sale", 800, 1200)).toBe(false);
		});

		test("should match first matching keyword in array", () => {
			const keywords = [
				{ contains: "phone", without: "case", etv_min: "100", etv_max: "500" },
				{ contains: "phone", without: "", etv_min: "", etv_max: "" },
				"tablet",
			];
			precompileKeywords(keywords);

			// Matches first keyword (no "case", right ETV)
			expect(keywordMatch(keywords, "New phone", 200, 300)).toBe("phone");

			// Doesn't match first (has "case"), matches second
			expect(keywordMatch(keywords, "Phone case", 200, 300)).toBe("phone");

			// Doesn't match first (wrong ETV), matches second
			expect(keywordMatch(keywords, "New phone", 600, 700)).toBe("phone");

			// Matches third keyword
			expect(keywordMatch(keywords, "tablet device", 100, 200)).toBe("tablet");
		});
	});

	describe("Production-like usage with keyword types", () => {
		test("should work with hideKeywords type", () => {
			const hideKeywords = [
				"spam",
				{ contains: "adult", without: "", etv_min: "", etv_max: "" },
				{ contains: ".*casino.*", without: "", etv_min: "", etv_max: "" },
			];

			// Mark as hideKeywords type for production-like usage
			Object.defineProperty(hideKeywords, "_keywordType", {
				value: "general.hideKeywords",
				writable: false,
				enumerable: false,
			});

			precompileKeywords(hideKeywords);

			expect(keywordMatch(hideKeywords, "spam message")).toBe("spam");
			expect(keywordMatch(hideKeywords, "adult content")).toBe("adult");
			expect(keywordMatch(hideKeywords, "online casino games")).toBe(".*casino.*");
			expect(keywordMatch(hideKeywords, "legitimate email")).toBe(false);
		});

		test("should work with highlightKeywords type", () => {
			const highlightKeywords = [
				{ contains: "deal|discount", without: "expired", etv_min: "", etv_max: "100" },
				"free shipping",
				{ contains: "limited time", without: "", etv_min: "0", etv_max: "50" },
			];

			// Mark as highlightKeywords type
			Object.defineProperty(highlightKeywords, "_keywordType", {
				value: "general.highlightKeywords",
				writable: false,
				enumerable: false,
			});

			precompileKeywords(highlightKeywords);

			expect(keywordMatch(highlightKeywords, "Great deal today", 50, 80)).toBe("deal|discount");
			expect(keywordMatch(highlightKeywords, "Expired deal", 50, 80)).toBe(false);
			expect(keywordMatch(highlightKeywords, "Free shipping available")).toBe("free shipping");
			expect(keywordMatch(highlightKeywords, "Limited time offer", 0, 30)).toBe("limited time");
		});
	});

	describe("SharedKeywordMatcher integration", () => {
		test("should work through SharedKeywordMatcher", () => {
			const keywords = ["laptop", { contains: "phone", without: "case", etv_min: "", etv_max: "" }];

			// First match - returns full object from keywordMatchReturnFullObject
			const result1 = sharedKeywordMatcher.match(keywords, "New laptop");
			expect(result1).toBe("laptop");

			// Second match - "Phone stand" doesn't contain "case" so it should match
			const result2 = sharedKeywordMatcher.match(keywords, "Phone stand");
			expect(result2).toEqual({ contains: "phone", without: "case", etv_min: "", etv_max: "" });

			// No match - "Phone case" contains "case" so it should not match
			const result3 = sharedKeywordMatcher.match(keywords, "Phone case");
			expect(result3).toBe(undefined);
		});
	});

	describe("Unicode and special characters", () => {
		test("should handle unicode characters", () => {
			const keywords = ["café", "naïve", "日本語", "🎮gaming"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "Visit the café")).toBe("café");
			expect(keywordMatch(keywords, "naïve approach")).toBe("naïve");
			// Unicode boundaries prevent matching when followed by another letter
			expect(keywordMatch(keywords, "日本語のテキスト")).toBe(false);
			// But it matches when surrounded by non-letters
			expect(keywordMatch(keywords, "これは 日本語 です")).toBe("日本語");
			expect(keywordMatch(keywords, "🎮gaming console")).toBe("🎮gaming");
		});

		test("should handle special regex characters in literal strings", () => {
			// Original behavior: keywords are regex patterns, special chars must be escaped
			// Use patterns that work with word boundaries
			const keywords = ["price: \\$50", "email@domain\\.com", "C\\+\\+ programming", ".*\\(parentheses\\).*"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "price: $50 today")).toBe("price: \\$50");
			expect(keywordMatch(keywords, "contact email@domain.com")).toBe("email@domain\\.com");
			expect(keywordMatch(keywords, "C++ programming guide")).toBe("C\\+\\+ programming");
			expect(keywordMatch(keywords, "text (parentheses) here")).toBe(".*\\(parentheses\\).*");
		});
	});

	describe("Edge cases and error handling", () => {
		test("should handle empty arrays", () => {
			const keywords = [];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "any text")).toBe(false);
		});

		test("should handle null/undefined in arrays", () => {
			const keywords = ["laptop", null, undefined, "phone"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "laptop for sale")).toBe("laptop");
			expect(keywordMatch(keywords, "phone available")).toBe("phone");
		});

		test("should handle malformed keyword objects", () => {
			const keywords = [
				{ contains: "laptop" }, // Missing without, etv_min, etv_max
				{ contains: "", without: "", etv_min: "", etv_max: "" }, // Empty contains
				{ without: "case", etv_min: "", etv_max: "" }, // Missing contains
				"valid keyword",
			];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "laptop computer")).toBe("laptop");
			expect(keywordMatch(keywords, "valid keyword here")).toBe("valid keyword");
		});

		test("should handle very long strings", () => {
			const longString = "laptop ".repeat(1000);
			const keywords = ["laptop"];
			precompileKeywords(keywords);

			expect(keywordMatch(keywords, longString)).toBe("laptop");
		});
	});

	describe("Performance and caching", () => {
		test("should use cached compiled patterns", () => {
			const keywords = ["laptop", "phone", "tablet"];

			// First compilation
			const stats1 = precompileKeywords(keywords);
			expect(stats1.compiled).toBe(3);
			expect(stats1.cached).toBe(false);

			// Clear instance cache but patterns should remain compiled
			clearKeywordCache();

			// Match should still work using pre-compiled patterns
			expect(keywordMatch(keywords, "laptop for sale")).toBe("laptop");
		});

		test("should handle concurrent matches efficiently", () => {
			const keywords = Array.from({ length: 100 }, (_, i) => `keyword${i}`);
			precompileKeywords(keywords);

			// Simulate concurrent matching
			const promises = Array.from({ length: 50 }, (_, i) => {
				const text = `This text contains keyword${i} somewhere`;
				return Promise.resolve(keywordMatch(keywords, text));
			});

			return Promise.all(promises).then((results) => {
				results.forEach((result, i) => {
					expect(result).toBe(`keyword${i}`);
				});
			});
		});
	});

	describe("Real-world test cases from failing tests", () => {
		test("Practical case 1 - glue/tape with exclusions", () => {
			const keywords = [{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: 0, etv_max: 0 }];
			precompileKeywords(keywords);

			const testStr = "Glitter Nude Press on Nails Medium Short Square Fake Nails with Sparkly Rhinestones";
			expect(keywordMatch(keywords, testStr, null, null)).toBe(false);
		});

		test("Complex patterns from keywordPrecompile.test.js", () => {
			const complexKeywords = [
				"ETL[- ]Cert|ETL[- ]Listed|UL[- ]Cert|UL[- ]Listed",
				"linux|\\bubuntu\\b|\\bdebian\\b",
				"Mini[- ]?PC|gaming[- ]?pc",
				"smart[- ]?ring|Activity[- ]Tracker Ring",
			];

			const keywords = complexKeywords.map((pattern) => ({
				contains: pattern,
				without: "",
				etv_min: "",
				etv_max: "",
			}));

			precompileKeywords(keywords);

			expect(keywordMatch(keywords, "ETL Certified product")).toBeTruthy();
			expect(keywordMatch(keywords, "Ubuntu linux server")).toBeTruthy();
			expect(keywordMatch(keywords, "Mini-PC for gaming")).toBeTruthy();
			expect(keywordMatch(keywords, "Smart Ring tracker")).toBeTruthy();
		});
	});

	describe("Pre-compiled Keywords with Index Mapping", () => {
		test("should handle pre-compiled keywords with originalIndex correctly", () => {
			// This test verifies the fix for the off-by-one error where
			// pre-compiled patterns in a different order than the original keywords
			// would return the wrong keyword

			const keywords = [
				"\\bS80UD\\b|ViewFinity S8",
				"\\bSAE\\b|\\bAnderson\\b|battery connectors?",
				"ETL[- ]Cert|ETL[- ]Listed|UL[- ]Cert|UL[- ]Listed",
			];

			// Mock settings manager that returns pre-compiled patterns in different order
			const mockSettingsMgr = {
				get: () => null,
				getCompiledKeywords: (type) => {
					if (type === "test.keywords") {
						// Return patterns in different order with originalIndex
						return [
							{
								regex: /\bSAE\b|\bAnderson\b|battery connectors?/iu,
								withoutRegex: null,
								hasEtvCondition: false,
								originalIndex: 1, // Maps to keywords[1]
							},
							{
								regex: /\bS80UD\b|ViewFinity S8/iu,
								withoutRegex: null,
								hasEtvCondition: false,
								originalIndex: 0, // Maps to keywords[0]
							},
							{
								regex: /ETL[- ]Cert|ETL[- ]Listed|UL[- ]Cert|UL[- ]Listed/iu,
								withoutRegex: null,
								hasEtvCondition: false,
								originalIndex: 2, // Maps to keywords[2]
							},
						];
					}
					return null;
				},
			};

			// Set type to help matcher identify it
			keywords.__type = "test.keywords";

			// Test that correct keywords are returned despite different order
			const result1 = keywordMatcher.keywordMatchReturnFullObject(
				keywords,
				"SAE battery connectors for solar",
				null,
				null,
				mockSettingsMgr
			);
			expect(result1).toBe("\\bSAE\\b|\\bAnderson\\b|battery connectors?");

			const result2 = keywordMatcher.keywordMatchReturnFullObject(
				keywords,
				"Samsung ViewFinity S8 Monitor",
				null,
				null,
				mockSettingsMgr
			);
			expect(result2).toBe("\\bS80UD\\b|ViewFinity S8");

			const result3 = keywordMatcher.keywordMatchReturnFullObject(
				keywords,
				"Product with ETL-Certified label",
				null,
				null,
				mockSettingsMgr
			);
			expect(result3).toBe("ETL[- ]Cert|ETL[- ]Listed|UL[- ]Cert|UL[- ]Listed");
		});

		test("should maintain backward compatibility when originalIndex is not present", () => {
			const keywords = ["laptop", "phone", "tablet"];

			// Mock settings manager without originalIndex
			const mockSettingsMgr = {
				get: () => null,
				getCompiledKeywords: (type) => {
					if (type === "test.simple") {
						return [
							{ regex: /\blaptop\b/iu, withoutRegex: null, hasEtvCondition: false },
							{ regex: /\bphone\b/iu, withoutRegex: null, hasEtvCondition: false },
							{ regex: /\btablet\b/iu, withoutRegex: null, hasEtvCondition: false },
						];
					}
					return null;
				},
			};

			keywords.__type = "test.simple";

			const result = keywordMatcher.keywordMatchReturnFullObject(
				keywords,
				"I need a new phone",
				null,
				null,
				mockSettingsMgr
			);
			expect(result).toBe("phone");
		});
	});
});
