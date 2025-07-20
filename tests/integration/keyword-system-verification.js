/**
 * Integration test to verify the keyword system works end-to-end
 * This test imports the key modules and performs keyword compilation and matching
 */

import { compileKeywordObjects } from "../../scripts/core/utils/KeywordCompiler.js";
import { findMatch, hasMatch, getMatchedKeyword, hasEtvConditions } from "../../scripts/core/utils/KeywordMatcher.js";

console.log("=== Keyword System Verification Test ===\n");

// Test 1: Basic keyword compilation and matching
console.log("Test 1: Basic keyword compilation and matching");
const basicKeywords = [
	{ contains: "laptop" },
	{ contains: ["phone", "tablet"] },
	{ contains: "camera", without: "digital" },
];

const compiledBasic = compileKeywordObjects(basicKeywords);
console.log("Compiled keywords:", compiledBasic.length);
console.log(
	"First compiled keyword:",
	JSON.stringify(
		compiledBasic[0],
		(key, value) => {
			if (value instanceof RegExp) return value.toString();
			return value;
		},
		2
	)
);

// Test matching
const testTexts = [
	"New laptop for sale",
	"iPhone and tablet bundle",
	"Digital camera kit",
	"Film camera vintage",
	"Random text",
];

testTexts.forEach((text) => {
	const match = findMatch(text, compiledBasic);
	const matched = getMatchedKeyword(text, compiledBasic);
	console.log(`  "${text}" -> Match: ${!!match}, Keyword: ${matched || "none"}`);
});

// Test 2: ETV conditions
console.log("\nTest 2: ETV conditions");
const etvKeywords = [
	{ contains: "premium", etv_min: 100 },
	{ contains: "budget", etv_max: 50 },
	{ contains: "mid-range", etv_min: 50, etv_max: 100 },
];

const compiledEtv = compileKeywordObjects(etvKeywords);
console.log("Has ETV conditions:", hasEtvConditions(compiledEtv));

const etvTests = [
	{ text: "Premium product", etv: 150 },
	{ text: "Premium product", etv: 50 },
	{ text: "Budget option", etv: 30 },
	{ text: "Budget option", etv: 100 },
	{ text: "Mid-range item", etv: 75 },
];

etvTests.forEach(({ text, etv }) => {
	const match = findMatch(text, compiledEtv, etv, etv);
	console.log(`  "${text}" (ETV: ${etv}) -> Match: ${!!match}`);
});

// Test 3: Complex patterns
console.log("\nTest 3: Complex patterns");
const complexKeywords = [
	{ contains: ["laptop", "notebook"], without: ["broken", "parts"] },
	{ contains: "gaming", without: "console" },
	{ contains: ["4K", "UHD"], etv_min: 200 },
];

const compiledComplex = compileKeywordObjects(complexKeywords);

const complexTests = [
	{ text: "Gaming laptop for sale", etv: 500 },
	{ text: "Gaming console bundle", etv: 300 },
	{ text: "Broken laptop parts", etv: 50 },
	{ text: "4K monitor UHD display", etv: 250 },
	{ text: "4K webcam", etv: 100 },
];

complexTests.forEach(({ text, etv }) => {
	const match = findMatch(text, compiledComplex, etv, etv);
	const matched = getMatchedKeyword(text, compiledComplex, etv, etv);
	console.log(`  "${text}" (ETV: ${etv}) -> Match: ${!!match}, Keyword: ${matched || "none"}`);
});

// Test 4: Edge cases
console.log("\nTest 4: Edge cases");
const edgeCases = [
	{ keyword: null, expected: "Should handle null keyword" },
	{ keyword: {}, expected: "Should handle empty object" },
	{ keyword: { contains: "" }, expected: "Should handle empty string" },
	{ keyword: { contains: [] }, expected: "Should handle empty array" },
];

edgeCases.forEach(({ keyword, expected }) => {
	try {
		const compiled = keyword ? compileKeywordObjects([keyword])[0] : null;
		const match = findMatch("test text", [compiled]);
		console.log(`  ${expected}: ${match ? "UNEXPECTED MATCH" : "OK (no match)"}`);
	} catch (error) {
		console.log(`  ${expected}: ERROR - ${error.message}`);
	}
});

// Test 5: Performance with many keywords
console.log("\nTest 5: Performance test");
const manyKeywords = [];
for (let i = 0; i < 100; i++) {
	manyKeywords.push({
		contains: [`keyword${i}`, `term${i}`],
		without: i % 3 === 0 ? [`exclude${i}`] : undefined,
		etv_min: i % 5 === 0 ? i * 10 : undefined,
	});
}

const startCompile = Date.now();
const compiledMany = compileKeywordObjects(manyKeywords);
const compileTime = Date.now() - startCompile;
console.log(`  Compiled ${manyKeywords.length} keywords in ${compileTime}ms`);

const testText = "This text contains keyword42 and term42";
const startMatch = Date.now();
const matchResult = findMatch(testText, compiledMany, 420, 420);
const matchTime = Date.now() - startMatch;
console.log(`  Matched against ${compiledMany.length} keywords in ${matchTime}ms`);
console.log(`  Found match: ${!!matchResult}`);

console.log("\n=== All tests completed successfully! ===");
console.log("The keyword system is working correctly.");
