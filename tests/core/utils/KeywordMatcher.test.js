/**
 * @fileoverview Unit tests for KeywordMatcher module
 */

import {
	matchesPattern,
	matchesAnyPattern,
	matchesAllPatterns,
	satisfiesEtvConditions,
	matchKeywordObject,
	findMatch,
	findAllMatches,
	hasMatch,
	getMatchedKeyword,
} from "../../../scripts/core/utils/KeywordMatcher.js";

describe("KeywordMatcher", () => {
	// Helper function to create a test pattern
	const createPattern = (str, flags = "giu") => new RegExp(`\\b${str}\\b`, flags);

	describe("matchesPattern", () => {
		it("should match text against a pattern", () => {
			const pattern = createPattern("test");
			expect(matchesPattern("this is a test", pattern)).toBe(true);
			expect(matchesPattern("testing", pattern)).toBe(false); // Word boundary
			expect(matchesPattern("no match here", pattern)).toBe(false);
		});

		it("should handle case-insensitive matching", () => {
			const pattern = createPattern("TEST", "giu");
			expect(matchesPattern("this is a test", pattern)).toBe(true);
			expect(matchesPattern("This is a TEST", pattern)).toBe(true);
		});

		it("should reset lastIndex for global patterns", () => {
			const pattern = createPattern("test", "g");
			// Call twice to ensure lastIndex is reset
			expect(matchesPattern("test test", pattern)).toBe(true);
			expect(matchesPattern("test test", pattern)).toBe(true);
		});

		it("should handle invalid inputs", () => {
			const pattern = createPattern("test");
			expect(matchesPattern(null, pattern)).toBe(false);
			expect(matchesPattern("", pattern)).toBe(false);
			expect(matchesPattern("test", null)).toBe(false);
			expect(matchesPattern("test", "not a regex")).toBe(false);
		});
	});

	describe("matchesAnyPattern", () => {
		it("should return true if text matches any pattern", () => {
			const patterns = [
				{ keyword: "apple", pattern: createPattern("apple") },
				{ keyword: "banana", pattern: createPattern("banana") },
				{ keyword: "orange", pattern: createPattern("orange") },
			];

			expect(matchesAnyPattern("I like apple", patterns)).toBe(true);
			expect(matchesAnyPattern("banana split", patterns)).toBe(true);
			expect(matchesAnyPattern("grape juice", patterns)).toBe(false);
		});

		it("should handle empty or invalid inputs", () => {
			const patterns = [{ keyword: "test", pattern: createPattern("test") }];
			expect(matchesAnyPattern(null, patterns)).toBe(false);
			expect(matchesAnyPattern("test", null)).toBe(false);
			expect(matchesAnyPattern("test", [])).toBe(false);
		});
	});

	describe("matchesAllPatterns", () => {
		it("should return true only if text matches all patterns", () => {
			const patterns = [
				{ keyword: "apple", pattern: createPattern("apple") },
				{ keyword: "pie", pattern: createPattern("pie") },
			];

			expect(matchesAllPatterns("apple pie is good", patterns)).toBe(true);
			expect(matchesAllPatterns("apple cake", patterns)).toBe(false);
			expect(matchesAllPatterns("cherry pie", patterns)).toBe(false);
		});

		it("should handle empty or invalid inputs", () => {
			const patterns = [{ keyword: "test", pattern: createPattern("test") }];
			expect(matchesAllPatterns(null, patterns)).toBe(false);
			expect(matchesAllPatterns("test", null)).toBe(false);
			expect(matchesAllPatterns("test", [])).toBe(false);
		});
	});

	describe("satisfiesEtvConditions", () => {
		it("should return true when no ETV conditions are specified", () => {
			expect(satisfiesEtvConditions({}, null, null)).toBe(true);
			expect(satisfiesEtvConditions({}, 10, 20)).toBe(true);
		});

		it("should check minimum ETV condition", () => {
			const keyword = { etv_min: 15 };
			expect(satisfiesEtvConditions(keyword, 10, 20)).toBe(true); // itemEtvMax >= etv_min
			expect(satisfiesEtvConditions(keyword, 10, 15)).toBe(true); // Equal is OK
			expect(satisfiesEtvConditions(keyword, 10, 14)).toBe(false); // itemEtvMax < etv_min
			expect(satisfiesEtvConditions(keyword, 10, null)).toBe(false); // No max ETV
		});

		it("should check maximum ETV condition", () => {
			const keyword = { etv_max: 25 };
			expect(satisfiesEtvConditions(keyword, 20, 30)).toBe(true); // itemEtvMin <= etv_max
			expect(satisfiesEtvConditions(keyword, 25, 30)).toBe(true); // Equal is OK
			expect(satisfiesEtvConditions(keyword, 26, 30)).toBe(false); // itemEtvMin > etv_max
			expect(satisfiesEtvConditions(keyword, null, 30)).toBe(false); // No min ETV
		});

		it("should check both ETV conditions", () => {
			const keyword = { etv_min: 15, etv_max: 25 };
			expect(satisfiesEtvConditions(keyword, 20, 20)).toBe(true); // Within range
			expect(satisfiesEtvConditions(keyword, 15, 25)).toBe(true); // Exact range
			expect(satisfiesEtvConditions(keyword, 10, 30)).toBe(true); // Overlapping range
			expect(satisfiesEtvConditions(keyword, 10, 14)).toBe(false); // Below min
			expect(satisfiesEtvConditions(keyword, 26, 30)).toBe(false); // Above max
		});
	});

	describe("matchKeywordObject", () => {
		it("should match simple contains pattern", () => {
			const keyword = {
				contains: "test",
				containsPattern: createPattern("test"),
			};

			expect(matchKeywordObject("this is a test", keyword)).toBe(true);
			expect(matchKeywordObject("no match", keyword)).toBe(false);
		});

		it("should match array contains patterns (ANY match)", () => {
			const keyword = {
				containsPatterns: [
					{ keyword: "apple", pattern: createPattern("apple") },
					{ keyword: "banana", pattern: createPattern("banana") },
				],
			};

			expect(matchKeywordObject("I like apple", keyword)).toBe(true);
			expect(matchKeywordObject("banana split", keyword)).toBe(true);
			expect(matchKeywordObject("orange juice", keyword)).toBe(false);
		});

		it("should exclude based on without pattern", () => {
			const keyword = {
				containsPattern: createPattern("fruit"),
				withoutPattern: createPattern("rotten"),
			};

			expect(matchKeywordObject("fresh fruit", keyword)).toBe(true);
			expect(matchKeywordObject("rotten fruit", keyword)).toBe(false);
		});

		it("should exclude based on array without patterns (ANY match excludes)", () => {
			const keyword = {
				containsPattern: createPattern("fruit"),
				withoutPatterns: [
					{ keyword: "rotten", pattern: createPattern("rotten") },
					{ keyword: "bad", pattern: createPattern("bad") },
				],
			};

			expect(matchKeywordObject("fresh fruit", keyword)).toBe(true);
			expect(matchKeywordObject("rotten fruit", keyword)).toBe(false);
			expect(matchKeywordObject("bad fruit", keyword)).toBe(false);
		});

		it("should check ETV conditions", () => {
			const keyword = {
				containsPattern: createPattern("test"),
				etv_min: 10,
				etv_max: 20,
			};

			expect(matchKeywordObject("test item", keyword, 15, 15)).toBe(true);
			expect(matchKeywordObject("test item", keyword, 5, 8)).toBe(false); // Below min
			expect(matchKeywordObject("test item", keyword, 25, 30)).toBe(false); // Above max
		});

		it("should handle only without patterns", () => {
			const keyword = {
				withoutPattern: createPattern("exclude"),
			};

			// Should match anything that doesn't contain 'exclude'
			expect(matchKeywordObject("include this", keyword)).toBe(true);
			expect(matchKeywordObject("exclude this", keyword)).toBe(false);
		});

		it("should handle invalid inputs", () => {
			const keyword = { containsPattern: createPattern("test") };
			expect(matchKeywordObject(null, keyword)).toBe(false);
			expect(matchKeywordObject("test", null)).toBe(false);
			expect(matchKeywordObject("test", {})).toBe(false); // No patterns
		});
	});

	describe("findMatch", () => {
		const compiledKeywords = [
			{
				contains: "apple",
				containsPattern: createPattern("apple"),
				etv_min: 10,
			},
			{
				contains: "banana",
				containsPattern: createPattern("banana"),
			},
			{
				contains: "orange",
				containsPattern: createPattern("orange"),
				withoutPattern: createPattern("juice"),
			},
		];

		it("should find the first matching keyword", () => {
			const match = findMatch("I like apple pie", compiledKeywords, 15, 20);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("apple");
		});

		it("should respect ETV conditions", () => {
			const match = findMatch("I like apple pie", compiledKeywords, 5, 8);
			expect(match).toBeNull(); // apple requires etv_min: 10
		});

		it("should respect without conditions", () => {
			const match = findMatch("orange juice", compiledKeywords);
			expect(match).toBeNull(); // orange excludes 'juice'

			const match2 = findMatch("orange fruit", compiledKeywords);
			expect(match2).toBeTruthy();
			expect(match2.contains).toBe("orange");
		});

		it("should handle invalid inputs", () => {
			expect(findMatch(null, compiledKeywords)).toBeNull();
			expect(findMatch("test", null)).toBeNull();
			expect(findMatch("test", [])).toBeNull();
		});
	});

	describe("findAllMatches", () => {
		const compiledKeywords = [
			{
				contains: "fruit",
				containsPattern: createPattern("fruit"),
			},
			{
				contains: "apple",
				containsPattern: createPattern("apple"),
			},
			{
				contains: "pie",
				containsPattern: createPattern("pie"),
			},
		];

		it("should find all matching keywords", () => {
			const matches = findAllMatches("apple fruit pie", compiledKeywords);
			expect(matches).toHaveLength(3);
			expect(matches.map((m) => m.contains)).toEqual(["fruit", "apple", "pie"]);
		});

		it("should return empty array when no matches", () => {
			const matches = findAllMatches("vegetable soup", compiledKeywords);
			expect(matches).toEqual([]);
		});

		it("should handle invalid inputs", () => {
			expect(findAllMatches(null, compiledKeywords)).toEqual([]);
			expect(findAllMatches("test", null)).toEqual([]);
		});
	});

	describe("hasMatch", () => {
		const compiledKeywords = [{ contains: "test", containsPattern: createPattern("test") }];

		it("should return boolean for match existence", () => {
			expect(hasMatch("this is a test", compiledKeywords)).toBe(true);
			expect(hasMatch("no match", compiledKeywords)).toBe(false);
		});
	});

	describe("getMatchedKeyword", () => {
		it("should return the matched keyword string", () => {
			const compiledKeywords = [{ contains: "apple", containsPattern: createPattern("apple") }];

			expect(getMatchedKeyword("apple pie", compiledKeywords)).toBe("apple");
			expect(getMatchedKeyword("banana", compiledKeywords)).toBe(false);
		});

		it("should handle array contains", () => {
			const compiledKeywords = [
				{
					contains: ["fruit", "vegetable"],
					containsPatterns: [
						{ keyword: "fruit", pattern: createPattern("fruit") },
						{ keyword: "vegetable", pattern: createPattern("vegetable") },
					],
				},
			];

			expect(getMatchedKeyword("fruit salad", compiledKeywords)).toBe("fruit");
		});

		it("should fall back to keyword property", () => {
			const compiledKeywords = [
				{
					keyword: "fallback",
					containsPattern: createPattern("test"),
				},
			];

			expect(getMatchedKeyword("test case", compiledKeywords)).toBe("fallback");
		});

		it("should return false when no match or no keyword string", () => {
			const compiledKeywords = [
				{ containsPattern: createPattern("test") }, // No contains or keyword property
			];

			expect(getMatchedKeyword("test", compiledKeywords)).toBe(false);
			expect(getMatchedKeyword("no match", compiledKeywords)).toBe(false);
		});
	});
});
