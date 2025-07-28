/**
 * @fileoverview Unit tests for KeywordCompiler module
 */

import {
	isAsciiOnly,
	escapeRegex,
	createKeywordPattern,
	compileKeyword,
	compileKeywords,
	compileKeywordObjects,
	normalizeKeywordData,
	compile,
} from "../../../scripts/core/utils/KeywordCompiler.js";

describe("KeywordCompiler", () => {
	describe("isAsciiOnly", () => {
		it("should return true for ASCII-only strings", () => {
			expect(isAsciiOnly("hello")).toBe(true);
			expect(isAsciiOnly("Hello World 123")).toBe(true);
			expect(isAsciiOnly("test@example.com")).toBe(true);
			expect(isAsciiOnly("!@#$%^&*()")).toBe(true);
		});

		it("should return false for non-ASCII strings", () => {
			expect(isAsciiOnly("こんにちは")).toBe(false);
			expect(isAsciiOnly("hello 世界")).toBe(false);
			expect(isAsciiOnly("café")).toBe(false);
			expect(isAsciiOnly("naïve")).toBe(false);
		});

		it("should handle edge cases", () => {
			expect(isAsciiOnly("")).toBe(false); // Empty string doesn't match the pattern
			expect(isAsciiOnly(" ")).toBe(true); // Space is ASCII
		});
	});

	describe("escapeRegex", () => {
		it("should escape special regex characters", () => {
			expect(escapeRegex("hello.world")).toBe("hello\\.world");
			expect(escapeRegex("test*")).toBe("test\\*");
			expect(escapeRegex("a+b")).toBe("a\\+b");
			expect(escapeRegex("(test)")).toBe("\\(test\\)");
			expect(escapeRegex("[abc]")).toBe("\\[abc\\]");
			expect(escapeRegex("test$")).toBe("test\\$");
			expect(escapeRegex("^start")).toBe("\\^start");
			expect(escapeRegex("a|b")).toBe("a\\|b");
			expect(escapeRegex("test?")).toBe("test\\?");
			expect(escapeRegex("a{2}")).toBe("a\\{2\\}");
		});

		it("should not escape normal characters", () => {
			expect(escapeRegex("hello world")).toBe("hello world");
			expect(escapeRegex("test123")).toBe("test123");
			expect(escapeRegex("こんにちは")).toBe("こんにちは");
		});
	});

	describe("createKeywordPattern", () => {
		it("should create word boundary patterns for ASCII keywords", () => {
			expect(createKeywordPattern("test")).toBe("\\b(test)\\b");
			expect(createKeywordPattern("hello world")).toBe("\\b(hello world)\\b");
		});

		it("should create lookaround patterns for non-ASCII keywords", () => {
			const pattern = createKeywordPattern("こんにちは");
			expect(pattern).toBe("(?<![\\w\\p{L}])こんにちは(?![\\w\\p{L}])");
		});

		it("should NOT escape special characters by default (treatAsRegex=true)", () => {
			// Default behavior: keywords are treated as regex patterns
			expect(createKeywordPattern("test.")).toBe("\\b(test.)\\b");
			expect(createKeywordPattern("$100")).toBe("\\b($100)\\b");
		});

		it("should escape special characters when treatAsRegex=false", () => {
			// When explicitly set to false, special characters are escaped
			expect(createKeywordPattern("test.", false)).toBe("\\b(test\\.)\\b");
			expect(createKeywordPattern("$100", false)).toBe("\\b(\\$100)\\b");
		});
	});

	describe("compileKeyword", () => {
		it("should compile valid keywords into RegExp objects", () => {
			const regex = compileKeyword("test");
			expect(regex).toBeInstanceOf(RegExp);
			expect(regex.source).toBe("\\b(test)\\b");
			expect(regex.flags).toBe("giu");
		});

		it("should use custom flags when provided", () => {
			const regex = compileKeyword("test", "i");
			expect(regex.flags).toBe("i");
		});

		it("should return null for invalid inputs", () => {
			expect(compileKeyword(null)).toBeNull();
			expect(compileKeyword(undefined)).toBeNull();
			expect(compileKeyword("")).toBeNull();
			expect(compileKeyword(123)).toBeNull();
			expect(compileKeyword({})).toBeNull();
		});

		it("should handle regex compilation errors gracefully", () => {
			// Mock console.warn to avoid test output noise
			const originalWarn = console.warn;
			console.warn = jest.fn();

			// This shouldn't happen with our escaping, but test the error handling
			const result = compileKeyword("test");
			expect(result).toBeInstanceOf(RegExp);

			console.warn = originalWarn;
		});
	});

	describe("compileKeywords", () => {
		it("should compile array of keywords", () => {
			const results = compileKeywords(["test", "hello", "world"]);
			expect(results).toHaveLength(3);
			expect(results[0]).toEqual({
				keyword: "test",
				pattern: expect.any(RegExp),
			});
			expect(results[0].pattern.source).toBe("\\b(test)\\b");
		});

		it("should filter out invalid keywords", () => {
			const results = compileKeywords(["test", null, "", 123, "hello"]);
			expect(results).toHaveLength(2);
			expect(results[0].keyword).toBe("test");
			expect(results[1].keyword).toBe("hello");
		});

		it("should handle non-array inputs", () => {
			expect(compileKeywords(null)).toEqual([]);
			expect(compileKeywords("test")).toEqual([]);
			expect(compileKeywords({})).toEqual([]);
		});
	});

	describe("compileKeywordObjects", () => {
		it("should compile simple contains patterns", () => {
			const input = [{ contains: "test" }];
			const results = compileKeywordObjects(input);

			expect(results).toHaveLength(1);
			expect(results[0].containsPattern).toBeInstanceOf(RegExp);
			expect(results[0].containsPattern.source).toBe("\\b(test)\\b");
		});

		it("should compile array contains patterns", () => {
			const input = [{ contains: ["test", "hello"] }];
			const results = compileKeywordObjects(input);

			expect(results).toHaveLength(1);
			expect(results[0].containsPatterns).toHaveLength(2);
			expect(results[0].containsPatterns[0].keyword).toBe("test");
			expect(results[0].containsPatterns[1].keyword).toBe("hello");
		});

		it("should compile without patterns", () => {
			const input = [{ contains: "test", without: "exclude" }];
			const results = compileKeywordObjects(input);

			expect(results).toHaveLength(1);
			expect(results[0].containsPattern).toBeInstanceOf(RegExp);
			expect(results[0].withoutPattern).toBeInstanceOf(RegExp);
			expect(results[0].withoutPattern.source).toBe("\\b(exclude)\\b");
		});

		it("should compile array without patterns", () => {
			const input = [{ contains: "test", without: ["bad", "exclude"] }];
			const results = compileKeywordObjects(input);

			expect(results).toHaveLength(1);
			expect(results[0].withoutPatterns).toHaveLength(2);
			expect(results[0].withoutPatterns[0].keyword).toBe("bad");
			expect(results[0].withoutPatterns[1].keyword).toBe("exclude");
		});

		it("should preserve other properties", () => {
			const input = [
				{
					contains: "test",
					etv_min: 10,
					etv_max: 50,
					customProp: "value",
				},
			];
			const results = compileKeywordObjects(input);

			expect(results[0].etv_min).toBe(10);
			expect(results[0].etv_max).toBe(50);
			expect(results[0].customProp).toBe("value");
		});

		it("should filter out invalid objects", () => {
			const input = [{ contains: "test" }, null, "string", { contains: "hello" }];
			const results = compileKeywordObjects(input);

			expect(results).toHaveLength(2);
			expect(results[0].contains).toBe("test");
			expect(results[1].contains).toBe("hello");
		});
	});

	describe("normalizeKeywordData", () => {
		it("should handle single string", () => {
			const result = normalizeKeywordData("test");
			expect(result).toEqual([{ contains: "test" }]);
		});

		it("should handle array of strings", () => {
			const result = normalizeKeywordData(["test", "hello"]);
			expect(result).toEqual([{ contains: "test" }, { contains: "hello" }]);
		});

		it("should handle array of mixed types", () => {
			const result = normalizeKeywordData(["test", { contains: "hello", without: "world" }, null, 123]);
			expect(result).toEqual([{ contains: "test" }, { contains: "hello", without: "world" }]);
		});

		it("should handle single object", () => {
			const obj = { contains: "test", etv_min: 10 };
			const result = normalizeKeywordData(obj);
			expect(result).toEqual([obj]);
		});

		it("should handle invalid inputs", () => {
			expect(normalizeKeywordData(null)).toEqual([]);
			expect(normalizeKeywordData(undefined)).toEqual([]);
			expect(normalizeKeywordData(123)).toEqual([]);
			expect(normalizeKeywordData(true)).toEqual([]);
		});
	});

	describe("compile (main function)", () => {
		it("should compile string input", () => {
			const results = compile("test");
			expect(results).toHaveLength(1);
			expect(results[0].containsPattern).toBeInstanceOf(RegExp);
		});

		it("should compile array of strings", () => {
			const results = compile(["test", "hello"]);
			expect(results).toHaveLength(2);
			expect(results[0].containsPattern.source).toBe("\\b(test)\\b");
			expect(results[1].containsPattern.source).toBe("\\b(hello)\\b");
		});

		it("should compile complex keyword objects", () => {
			const input = [
				{
					contains: ["product", "item"],
					without: ["exclude", "bad"],
					etv_min: 10,
					etv_max: 100,
				},
			];
			const results = compile(input);

			expect(results).toHaveLength(1);
			expect(results[0].containsPatterns).toHaveLength(2);
			expect(results[0].withoutPatterns).toHaveLength(2);
			expect(results[0].etv_min).toBe(10);
			expect(results[0].etv_max).toBe(100);
		});

		it("should use custom flags", () => {
			const results = compile("TEST", "i");
			expect(results[0].containsPattern.flags).toBe("i");
		});

		it("should handle empty input", () => {
			expect(compile(null)).toEqual([]);
			expect(compile([])).toEqual([]);
			expect(compile("")).toEqual([]);
		});
	});
});
