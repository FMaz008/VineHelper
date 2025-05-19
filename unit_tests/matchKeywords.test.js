import { keywordMatch } from "../scripts/service_worker/keywordMatch.js";

//Text based keywords
test("match array of string", () => {
	const arrKWs = ["aaa", "bbb", "ccc"];
	expect(keywordMatch(arrKWs, "bbb")).toBe("bbb");
});

test("Do not match partial string", () => {
	const arrKWs = ["aaa", "darkoled", "ccc"];
	expect(keywordMatch(arrKWs, "big oled tv")).toBe(false);
});

test("Support regex .*", () => {
	const arrKWs = ["aaa", ".*oled", "ccc"];
	expect(keywordMatch(arrKWs, "big darkoled tv")).toBe(".*oled");
});

test("Support Japanese characters 1", () => {
	const arrKWs = ["aaa", "犬", "ccc"];
	expect(
		keywordMatch(
			arrKWs,
			"ERHAOG エリザベスカラー 犬 - 首周り 42-46cm エリザベスカラー 猫 - 猫 エリザベスカラー 柔らかい 犬調節可能なペット猫と犬用プロテクター、噛み付き防止、なめる怪我、小型犬 中型犬 大型犬 【XXL】 (【XXL】首周り 42-46cm)"
		)
	).toBe("犬");
});

test("Support Japanese characters 2", () => {
	const arrKWs = ["aaa", "トヨタ", "ccc"];
	expect(
		keywordMatch(
			arrKWs,
			"GIMUYA トヨタ 新型 アルファード 40系 キックガード 後部座席 ヴェルファイア フットサイド プロテクター ALPHARD VELLFIRE 40系 AGH4#W AAHH4#W TAHA4#W 2023年6月～ 専用 キズ・汚れ防止 内装 カスタムパーツ アクセサリー シールタイプ PUレザー製 カーボン調 2PCSセット (カーボン調, 運転席/助手席 フットサイドキックガード 2P)"
		)
	).toBe("トヨタ");
});

test("Support regex with multiple wildcards", () => {
	const arrKWs = ["aaa", ".*led.*tv", "ccc"];
	expect(keywordMatch(arrKWs, "big oled smart tv")).toBe(".*led.*tv");
});

test("Support regex at end of string", () => {
	const arrKWs = ["aaa", "smart.*", "ccc"];
	expect(keywordMatch(arrKWs, "very smart")).toBe("smart.*");
});

test("Support regex with special characters", () => {
	const arrKWs = ["aaa", ".*[$].*", "ccc"];
	expect(keywordMatch(arrKWs, "price is $100")).toBe(".*[$].*");
});

test("No match for partial regex pattern", () => {
	const arrKWs = ["aaa", "smart.*tv", "ccc"];
	expect(keywordMatch(arrKWs, "smart phone")).toBe(false);
});

test("Match exact regex pattern", () => {
	const arrKWs = ["aaa", ".*inch", "ccc"];
	expect(keywordMatch(arrKWs, "55 inch")).toBe(".*inch");
	expect(keywordMatch(arrKWs, "55 inches")).toBe(false);
});

test("Case insensitive regex match", () => {
	const arrKWs = ["aaa", ".*TV.*", "ccc"];
	expect(keywordMatch(arrKWs, "Smart tv Box")).toBe(".*TV.*");
});

//Object based keywords
test("match array of string", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: "bbb", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "bbb")).toBe("bbb");
});

test("Do not match partial string", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: "darkoled", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "big oled tv")).toBe(false);
});

test("Support regex .*", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: ".*oled", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "big darkoled tv")).toBe(".*oled");
});

test("Support Japanese characters 1", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: "犬", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(
		keywordMatch(
			arrKWs,
			"ERHAOG エリザベスカラー 犬 - 首周り 42-46cm エリザベスカラー 猫 - 猫 エリザベスカラー 柔らかい 犬調節可能なペット猫と犬用プロテクター、噛み付き防止、なめる怪我、小型犬 中型犬 大型犬 【XXL】 (【XXL】首周り 42-46cm)"
		)
	).toBe("犬");
});

test("Support Japanese characters 2", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: "トヨタ", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(
		keywordMatch(
			arrKWs,
			"GIMUYA トヨタ 新型 アルファード 40系 キックガード 後部座席 ヴェルファイア フットサイド プロテクター ALPHARD VELLFIRE 40系 AGH4#W AAHH4#W TAHA4#W 2023年6月～ 専用 キズ・汚れ防止 内装 カスタムパーツ アクセサリー シールタイプ PUレザー製 カーボン調 2PCSセット (カーボン調, 運転席/助手席 フットサイドキックガード 2P)"
		)
	).toBe("トヨタ");
});

test("Support regex with multiple wildcards", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: ".*led.*tv", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "big oled smart tv")).toBe(".*led.*tv");
});

test("Support regex at end of string", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: "smart.*", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "very smart")).toBe("smart.*");
});

test("Support regex with special characters", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: ".*[$].*", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "price is $100")).toBe(".*[$].*");
});

test("No match for partial regex pattern", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: "smart.*tv", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "smart phone")).toBe(false);
});

test("Match exact regex pattern", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: ".*inch", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "55 inch")).toBe(".*inch");
	expect(keywordMatch(arrKWs, "55 inches")).toBe(false);
});

test("Case insensitive regex match", () => {
	const arrKWs = [
		{ contains: "aaa", without: "", etv_min: "", etv_max: "" },
		{ contains: ".*TV.*", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	expect(keywordMatch(arrKWs, "Smart tv Box")).toBe(".*TV.*");
});

test("Practical case 1", () => {
	const arrKWs = [
		{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: 0, etv_max: 0 },
		{ contains: ".*TV.*", without: "", etv_min: "", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	const str =
		"Glitter Nude Press on Nails Medium Short Square Fake Nails with Sparkly Rhinestones Sliver Stripes Design Cute Short Coffin False Nails Bling Glue on Nails Acrylic Stick on Nails for Women 24Pcs (Sliver Glitter)";
	expect(keywordMatch(arrKWs, str, null, null)).toBe(false);
});

test("ETV_max_on_ranged_values", () => {
	const arrKWs = [
		{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: 0, etv_max: 0 },
		{ contains: ".*TV.*", without: "", etv_min: "", etv_max: "500" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	const str = "TV";
	expect(keywordMatch(arrKWs, str, 300, 700)).toBe(".*TV.*");
});

test("ETV_min_on_ranged_values", () => {
	const arrKWs = [
		{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: 0, etv_max: 0 },
		{ contains: ".*TV.*", without: "", etv_min: "500", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	const str = "TV";
	expect(keywordMatch(arrKWs, str, 300, 700)).toBe(".*TV.*");
});

test("ETV_min_max_on_ranged_values", () => {
	const arrKWs = [
		{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: 0, etv_max: 0 },
		{ contains: ".*TV.*", without: "", etv_min: "500", etv_max: "600" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	const str = "TV";
	expect(keywordMatch(arrKWs, str, 300, 700)).toBe(".*TV.*");
});

test("ETV_max_out_of_range_values", () => {
	const arrKWs = [
		{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: 0, etv_max: 0 },
		{ contains: ".*TV.*", without: "", etv_min: "", etv_max: "200" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	const str = "TV";
	expect(keywordMatch(arrKWs, str, 300, 700)).toBe(false);
});

test("ETV_min_out_of_range_values", () => {
	const arrKWs = [
		{ contains: "glue|tape", without: "case|patch(es)?|nails", etv_min: 0, etv_max: 0 },
		{ contains: ".*TV.*", without: "", etv_min: "800", etv_max: "" },
		{ contains: "ccc", without: "", etv_min: "", etv_max: "" },
	];
	const str = "TV";
	expect(keywordMatch(arrKWs, str, 300, 700)).toBe(false);
});

test("ETV_min_max_zero_values", () => {
	const arrKWs = [
		{ contains: ".*", without: "", etv_min: "500", etv_max: "20000" },
		{ contains: "nuts", without: "", etv_min: "0", etv_max: "0" },
	];
	const str =
		"1Pc Silver Mini Adjustable Wrench Adjustable Spanner,Mini Repair Maintenance Hand Tool for Tightening or Loosening,Nuts and Bolts,Wrenches,Power and Hand Tools,Small Shifting Spanner";
	expect(keywordMatch(arrKWs, str, 5.99, 5.99)).toBe(false);
});
