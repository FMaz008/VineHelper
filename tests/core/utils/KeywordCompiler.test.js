/**
 * @fileoverview Unit tests for KeywordCompiler module
 */

import { compileKeywordObjects } from "../../../scripts/core/utils/KeywordCompiler.js";

describe("KeywordCompiler", () => {
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
});
