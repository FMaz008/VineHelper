/**
 * @fileoverview Unit tests for KeywordMatcher module
 */

import { findMatch } from "../../../scripts/core/utils/KeywordMatcher.js";

import { compileKeyword, compileKeywordObjects } from "../../../scripts/core/utils/KeywordCompiler.js";

describe("KeywordMatcher", () => {
	// Helper function to create a test pattern
	const createPattern = (str, flags = "giu") => new RegExp(`\\b${str}\\b`, flags);

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

	describe("originalKeyword", () => {
		//Text based keywords
		test("match array of string", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: "bbb", containsPattern: compileKeyword("bbb") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("bbb", compiledKeywords);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("bbb");
		});

		test("Do not match partial string", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: "darkoled", containsPattern: compileKeyword("darkoled") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("big oled tv", compiledKeywords);
			expect(match).toBeNull();
		});

		test("Support regex .*", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: ".*oled", containsPattern: compileKeyword(".*oled") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("big darkoled tv", compiledKeywords);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*oled");
		});

		test("Support Japanese characters 1", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: "犬", containsPattern: compileKeyword("犬") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch(
				"ERHAOG エリザベスカラー 犬 - 首周り 42-46cm エリザベスカラー 猫 - 猫 エリザベスカラー 柔らかい 犬調節可能なペット猫と犬用プロテクター、噛み付き防止、なめる怪我、小型犬 中型犬 大型犬 【XXL】 (【XXL】首周り 42-46cm)",
				compiledKeywords
			);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("犬");
		});

		test("Support Japanese characters 2", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: "トヨタ", containsPattern: compileKeyword("トヨタ") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch(
				"GIMUYA トヨタ 新型 アルファード 40系 キックガード 後部座席 ヴェルファイア フットサイド プロテクター ALPHARD VELLFIRE 40系 AGH4#W AAHH4#W TAHA4#W 2023年6月～ 専用 キズ・汚れ防止 内装 カスタムパーツ アクセサリー シールタイプ PUレザー製 カーボン調 2PCSセット (カーボン調, 運転席/助手席 フットサイドキックガード 2P)",
				compiledKeywords
			);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("トヨタ");
		});

		test("Support regex with multiple wildcards", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: ".*led.*tv", containsPattern: compileKeyword(".*led.*tv") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("big oled smart tv", compiledKeywords);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*led.*tv");
		});

		test("Support regex at end of string", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: "smart.*", containsPattern: compileKeyword("smart.*") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("very smart", compiledKeywords);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("smart.*");
		});

		test("Support regex with special characters", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: ".*[$].*", containsPattern: compileKeyword(".*[$].*") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("price is $100", compiledKeywords);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*[$].*");
		});

		test("No match for partial regex pattern", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: "smart.*tv", containsPattern: compileKeyword("smart.*tv") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("smart phone", compiledKeywords);
			expect(match).toBeNull();
		});

		test("Match exact regex pattern", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: ".*inch", containsPattern: compileKeyword(".*inch") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("55 inch", compiledKeywords);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*inch");
			const match2 = findMatch("55 inches", compiledKeywords);
			expect(match2).toBeNull();
		});

		test("Case insensitive regex match", () => {
			const compiledKeywords = [
				{ contains: "aaa", containsPattern: compileKeyword("aaa") },
				{ contains: ".*TV.*", containsPattern: compileKeyword(".*TV.*") },
				{ contains: "ccc", containsPattern: compileKeyword("ccc") },
			];
			const match = findMatch("Smart tv Box", compiledKeywords);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*TV.*");
		});

		//Object based keywords
		test("match array of string", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "bbb",
					containsPattern: compileKeyword("bbb"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("bbb", arrKWs);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("bbb");
		});

		test("Do not match partial string", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "darkoled",
					containsPattern: compileKeyword("darkoled"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("big oled tv", arrKWs);
			expect(match).toBeNull();
		});

		test("Support regex .*", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: ".*oled",
					containsPattern: compileKeyword(".*oled"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("big darkoled tv", arrKWs);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*oled");
		});

		test("Support Japanese characters 3", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{ contains: "犬", containsPattern: compileKeyword("犬"), without: "", etv_min: "", etv_max: "" },
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch(
				"ERHAOG エリザベスカラー 犬 - 首周り 42-46cm エリザベスカラー 猫 - 猫 エリザベスカラー 柔らかい 犬調節可能なペット猫と犬用プロテクター、噛み付き防止、なめる怪我、小型犬 中型犬 大型犬 【XXL】 (【XXL】首周り 42-46cm)",
				arrKWs
			);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("犬");
		});

		test("Support Japanese characters 4", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "トヨタ",
					containsPattern: compileKeyword("トヨタ"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch(
				"GIMUYA トヨタ 新型 アルファード 40系 キックガード 後部座席 ヴェルファイア フットサイド プロテクター ALPHARD VELLFIRE 40系 AGH4#W AAHH4#W TAHA4#W 2023年6月～ 専用 キズ・汚れ防止 内装 カスタムパーツ アクセサリー シールタイプ PUレザー製 カーボン調 2PCSセット (カーボン調, 運転席/助手席 フットサイドキックガード 2P)",
				arrKWs
			);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("トヨタ");
		});

		test("Support regex with multiple wildcards", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: ".*led.*tv",
					containsPattern: compileKeyword(".*led.*tv"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("big oled smart tv", arrKWs);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*led.*tv");
		});

		test("Support regex at end of string", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "smart.*",
					containsPattern: compileKeyword("smart.*"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("very smart", arrKWs);
			expect(match).toBeTruthy();
			expect(match.contains).toBe("smart.*");
		});

		test("Support regex with special characters", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: ".*[$].*",
					containsPattern: compileKeyword(".*[$].*"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("price is $100", arrKWs);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*[$].*");
		});

		test("No match for partial regex pattern", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "smart.*tv",
					containsPattern: compileKeyword("smart.*tv"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("smart phone", arrKWs);
			expect(match).toBeNull();
		});

		test("Match exact regex pattern", () => {
			const arrKWs = [
				{
					contains: "aaa",
					containsPattern: compileKeyword("aaa"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: ".*inch",
					containsPattern: compileKeyword(".*inch"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					containsPattern: compileKeyword("ccc"),
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const match = findMatch("55 inch", arrKWs);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*inch");
			const match2 = findMatch("55 inches", arrKWs);
			expect(match2).toBeNull();
		});

		test("Case insensitive regex match", () => {
			const keywordObjects = [
				{
					contains: "aaa",
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: ".*TV.*",
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const arrKWs = compileKeywordObjects(keywordObjects);
			const match = findMatch("Smart tv Box", arrKWs);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*TV.*");
		});

		test("Practical case 1", () => {
			const keywordObjects = [
				{
					contains: "glue|tape",
					without: "case|patch(es)?|nails",
					etv_min: 0,
					etv_max: 0,
				},
				{
					contains: ".*TV.*",
					without: "",
					etv_min: "",
					etv_max: "",
				},
				{
					contains: "ccc",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const arrKWs = compileKeywordObjects(keywordObjects);
			const str =
				"Glitter Nude Press on Nails Medium Short Square Fake Nails with Sparkly Rhinestones Sliver Stripes Design Cute Short Coffin False Nails Bling Glue on Nails Acrylic Stick on Nails for Women 24Pcs (Sliver Glitter)";
			const match = findMatch(str, arrKWs, null, null);
			expect(match).toBeNull();
		});

		test("ETV_max_on_ranged_values", () => {
			const keywordObjects = [
				{
					contains: "glue|tape",
					without: "case|patch(es)?|nails",
					etv_min: 0,
					etv_max: 0,
				},
				{
					contains: ".*TV.*",
					without: "",
					etv_min: "",
					etv_max: "500",
				},
				{
					contains: "ccc",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const arrKWs = compileKeywordObjects(keywordObjects);
			const str = "TV";
			const match = findMatch(str, arrKWs, 300, 700);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*TV.*");
		});

		test("ETV_min_on_ranged_values", () => {
			const keywordObjects = [
				{
					contains: "glue|tape",
					without: "case|patch(es)?|nails",
					etv_min: 0,
					etv_max: 0,
				},
				{
					contains: ".*TV.*",
					without: "",
					etv_min: "500",
					etv_max: "",
				},
				{
					contains: "ccc",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const arrKWs = compileKeywordObjects(keywordObjects);
			const str = "TV";
			const match = findMatch(str, arrKWs, 300, 700);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*TV.*");
		});

		test("ETV_min_max_on_ranged_values", () => {
			const keywordObjects = [
				{
					contains: "glue|tape",
					without: "case|patch(es)?|nails",
					etv_min: 0,
					etv_max: 0,
				},
				{
					contains: ".*TV.*",
					without: "",
					etv_min: "500",
					etv_max: "600",
				},
				{
					contains: "ccc",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const arrKWs = compileKeywordObjects(keywordObjects);
			const str = "TV";
			const match = findMatch(str, arrKWs, 300, 700);
			expect(match).toBeTruthy();
			expect(match.contains).toBe(".*TV.*");
		});

		test("ETV_max_out_of_range_values", () => {
			const keywordObjects = [
				{
					contains: "glue|tape",
					without: "case|patch(es)?|nails",
					etv_min: 0,
					etv_max: 0,
				},
				{
					contains: ".*TV.*",
					without: "",
					etv_min: "",
					etv_max: "200",
				},
				{
					contains: "ccc",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const arrKWs = compileKeywordObjects(keywordObjects);
			const str = "TV";
			const match = findMatch(str, arrKWs, 300, 700);
			expect(match).toBeNull();
		});

		test("ETV_min_out_of_range_values", () => {
			const keywordObjects = [
				{
					contains: "glue|tape",
					without: "case|patch(es)?|nails",
					etv_min: 0,
					etv_max: 0,
				},
				{
					contains: ".*TV.*",
					without: "",
					etv_min: "800",
					etv_max: "",
				},
				{
					contains: "ccc",
					without: "",
					etv_min: "",
					etv_max: "",
				},
			];
			const arrKWs = compileKeywordObjects(keywordObjects);
			const str = "TV";
			const match = findMatch(str, arrKWs, 300, 700);
			expect(match).toBeNull();
		});

		test("ETV_min_max_zero_values", () => {
			const arrKWs = [
				{
					contains: ".*",
					containsPattern: compileKeyword(".*"),
					without: "",
					etv_min: "500",
					etv_max: "20000",
				},
				{
					contains: "nuts",
					containsPattern: compileKeyword("nuts"),
					without: "",
					etv_min: "0",
					etv_max: "0",
				},
			];
			const str =
				"1Pc Silver Mini Adjustable Wrench Adjustable Spanner,Mini Repair Maintenance Hand Tool for Tightening or Loosening,Nuts and Bolts,Wrenches,Power and Hand Tools,Small Shifting Spanner";
			const match = findMatch(str, arrKWs, 5.99, 5.99);
			expect(match).toBeNull();
		});

		test("Keywords has an ETV value criteria but the item has no known ETV", () => {
			const arrKWs = [
				{
					contains: "beer",
					containsPattern: compileKeyword("beer"),
					without: "",
					etv_min: "0",
					etv_max: "0",
				},
			];
			const str = "beer";
			const match = findMatch(str, arrKWs, "", "");
			expect(match).toBeNull();
		});
		test("ETV_min_max_null_values", () => {
			const arrKWs = [
				{
					contains: "beer",
					containsPattern: compileKeyword("beer"),
					without: "",
					etv_min: "0",
					etv_max: "0",
				},
			];
			const str = "beer";
			const match = findMatch(str, arrKWs, null, null);
			expect(match).toBeNull();
		});
		test("ETV_min_max_undefined_values", () => {
			const arrKWs = [
				{
					contains: "beer",
					containsPattern: compileKeyword("beer"),
					without: "",
					etv_min: "0",
					etv_max: "0",
				},
			];
			const str = "beer";
			const match = findMatch(str, arrKWs, undefined, undefined);
			expect(match).toBeNull();
		});
	});
});
