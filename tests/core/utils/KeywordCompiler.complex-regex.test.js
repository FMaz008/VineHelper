const { createKeywordPattern, compileKeyword } = require("../../../scripts/core/utils/KeywordCompiler.js");

describe("KeywordCompiler - Complex Regex Pattern Handling", () => {
	describe("Pattern 1: Grouped alternatives with spaces", () => {
		const pattern = "\\b87139- (YZZ82 | 50100 | 07020 | 48030 | 50130 | 11010 ) \\b";

		it("should show how current implementation breaks the pattern", () => {
			const result = createKeywordPattern(pattern);
			console.log("Original pattern:", pattern);
			console.log("Transformed pattern:", result);

			// The current implementation will split on ALL pipes, breaking the group
			// Expected to produce something like: \b\b87139- (YZZ82 \b|\b 50100 \b|\b 07020 \b|\b 48030 \b|\b 50130 \b|\b 11010 ) \b\b
			expect(result).toContain("|");
			expect(result.split("|").length).toBe(6); // Split into 6 parts

			// Show the actual broken pattern
			console.log("Pattern parts after split:", result.split("|"));
		});

		it("should test strings that SHOULD match the original pattern", () => {
			const testStrings = [
				"87139- YZZ82 ",
				"87139- 50100 ",
				"87139- 07020 ",
				"87139- 48030 ",
				"87139- 50130 ",
				"87139- 11010 ",
			];

			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern:", compiledPattern);

			testStrings.forEach((str) => {
				console.log(`\nTesting "${str}" against transformed pattern`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				// These likely won't match properly due to broken grouping
				// The pattern is broken because it adds \b inside the parentheses
				if (!matches) {
					console.log("FAILED: Should have matched but didn't");
				}
			});
		});

		it("should test strings that should NOT match", () => {
			const testStrings = [
				"87139-YZZ82", // No space after dash
				"87139- 99999 ", // Different number
				"prefix 87139- 50100 ", // Has prefix (original has \\b at start)
			];

			const compiledPattern = compileKeyword(pattern);
			testStrings.forEach((str) => {
				console.log(`\nTesting "${str}" - should not match`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				if (matches) {
					console.log("FAILED: Should NOT have matched but did");
				}
			});
		});
	});

	describe("Pattern 2: Case-insensitive flag with grouped alternatives", () => {
		const pattern = "\\b(?i)(910(XL)?|916XL)\\b";

		it("should show how current implementation breaks the pattern", () => {
			const result = createKeywordPattern(pattern);
			console.log("\nOriginal pattern:", pattern);
			console.log("Transformed pattern:", result);

			// Will split on the pipe inside the group, breaking the pattern
			expect(result).toContain("|");
			expect(result.split("|").length).toBe(2); // Split into 2 parts

			console.log("Pattern parts:", result.split("|"));
		});

		it("should test strings that SHOULD match", () => {
			const testStrings = [
				"910",
				"910XL",
				"916XL",
				"910xl", // Should match with (?i) flag
				"916xl",
			];

			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern:", compiledPattern);

			testStrings.forEach((str) => {
				console.log(`\nTesting "${str}"`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				// The (?i) flag won't work because it's not properly handled
				if (!matches && (str === "910" || str === "910XL" || str === "916XL")) {
					console.log("FAILED: Should have matched");
				}
			});
		});
	});

	describe("Pattern 3: Positive lookaheads", () => {
		const pattern = "(?=.*android[- ]?auto)(?=.*wireless)(?=.*adapter)";

		it("should show how current implementation handles lookaheads", () => {
			const result = createKeywordPattern(pattern);
			console.log("\nOriginal pattern:", pattern);
			console.log("Transformed pattern:", result);

			// Lookahead patterns should NOT have word boundaries added
			expect(result).not.toContain("\\b");

			// The pattern should remain unchanged
			expect(result).toBe(pattern);
		});

		it("should test strings that SHOULD match (all conditions met)", () => {
			const testStrings = [
				"android auto wireless adapter",
				"wireless android-auto adapter",
				"adapter for wireless android auto",
				"androidauto wireless charging adapter",
			];

			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern:", compiledPattern);

			testStrings.forEach((str) => {
				console.log(`\nTesting "${str}"`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				// Original pattern requires ALL three terms to be present
				// But the transformed pattern won't work as a lookahead
				if (!matches) {
					console.log("FAILED: Should match (contains all required terms)");
				}
			});
		});

		it("should test strings that should NOT match (missing conditions)", () => {
			const testStrings = [
				"android auto adapter", // Missing 'wireless'
				"wireless adapter", // Missing 'android auto'
				"android auto wireless", // Missing 'adapter'
			];

			const compiledPattern = compileKeyword(pattern);
			testStrings.forEach((str) => {
				console.log(`\nTesting "${str}" - should not match`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);
			});
		});
	});

	describe("Pattern 4: Simple alternation with word boundaries", () => {
		const pattern = "\\bketo\\b|ketosis|low[- ]?carb";

		it("should show how current implementation modifies the pattern", () => {
			const result = createKeywordPattern(pattern);
			console.log("\nOriginal pattern:", pattern);
			console.log("Transformed pattern:", result);

			// Will add word boundaries to each alternative
			const parts = result.split("|");
			expect(parts.length).toBe(3);

			console.log("Pattern parts:", parts);
			// First part already has \\b, will it be doubled?
			expect(parts[0]).toContain("\\b");

			// Check that we don't have double word boundaries
			expect(parts[0]).not.toContain("\\b\\b");
		});

		it("should test edge cases with word boundaries", () => {
			const testStrings = [
				{ str: "keto diet", shouldMatch: true },
				{ str: "ketosis state", shouldMatch: true },
				{ str: "low-carb food", shouldMatch: true },
				{ str: "low carb diet", shouldMatch: true },
				{ str: "ketogenic", shouldMatch: false }, // Should NOT match 'keto' due to \\b
				{ str: "lowcarb", shouldMatch: true }, // Original pattern should match this
			];

			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern:", compiledPattern);

			testStrings.forEach(({ str, shouldMatch }) => {
				console.log(`\nTesting "${str}" - should${shouldMatch ? "" : " NOT"} match`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				if (shouldMatch && !matches) {
					console.log("FAILED: Should have matched");
				} else if (!shouldMatch && matches) {
					console.log("FAILED: Should NOT have matched");
				}
			});
		});
	});

	describe("Pattern 5: Complex product names with various separators", () => {
		const pattern = "Mini[- ]?PC|gaming[- ]?pc|wo-we|beelink|acemagic|GK3Plus|KAMRUI|GMKtec|BOSGAME|\\bmele\\b";

		it("should show pattern transformation", () => {
			const result = createKeywordPattern(pattern);
			console.log("\nOriginal pattern:", pattern);
			console.log("Transformed pattern:", result);

			const parts = result.split("|");
			expect(parts.length).toBe(10); // 10 alternatives

			console.log("Number of parts:", parts.length);
			console.log("Last part (mele with boundaries):", parts[parts.length - 1]);
		});

		it("should test various product name formats", () => {
			const testStrings = [
				{ str: "Mini PC setup", shouldMatch: true },
				{ str: "MiniPC review", shouldMatch: true },
				{ str: "Mini-PC unboxing", shouldMatch: true },
				{ str: "gaming pc build", shouldMatch: true },
				{ str: "Gaming-PC specs", shouldMatch: true },
				{ str: "wo-we device", shouldMatch: true },
				{ str: "beelink mini", shouldMatch: true },
				{ str: "mele stick", shouldMatch: true }, // Has \\b boundaries in original
				{ str: "homeland", shouldMatch: false }, // Should NOT match 'mele' due to \\b
			];

			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern:", compiledPattern);

			testStrings.forEach(({ str, shouldMatch }) => {
				console.log(`\nTesting "${str}" - should${shouldMatch ? "" : " NOT"} match`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				if (shouldMatch && !matches) {
					console.log("FAILED: Should have matched");
				} else if (!shouldMatch && matches) {
					console.log("FAILED: Should NOT have matched");
				}
			});
		});
	});

	describe("Pattern 6: Technical terms with mixed case", () => {
		const pattern = "node[- ]?mcu|esp32|esp32c3|esp32c6|ESP8266|esphome|espressif";

		it("should show pattern transformation", () => {
			const result = createKeywordPattern(pattern);
			console.log("\nOriginal pattern:", pattern);
			console.log("Transformed pattern:", result);

			const parts = result.split("|");
			console.log("Number of alternatives:", parts.length);
		});

		it("should test case sensitivity handling", () => {
			const testStrings = [
				"node mcu board",
				"nodemcu v3",
				"node-mcu",
				"ESP32 chip",
				"esp32 module", // Different case
				"ESP8266 wifi",
				"esp8266 board", // Different case
			];

			// Test with default flags (giu - case insensitive)
			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern (with giu flags):", compiledPattern);

			testStrings.forEach((str) => {
				console.log(`\nTesting "${str}"`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				// All should match due to case-insensitive flag
				if (!matches) {
					console.log("FAILED: Should have matched (case-insensitive)");
				}
			});
		});
	});

	describe("Pattern 7: Electronic components with word boundaries", () => {
		const pattern = "OCXO|TCXO\\b|crystal oscillator|OSC112|ds1307|\\bRTC\\b|DS3231|AT24C32";

		it("should show pattern transformation", () => {
			const result = createKeywordPattern(pattern);
			console.log("\nOriginal pattern:", pattern);
			console.log("Transformed pattern:", result);

			// Some alternatives already have \\b boundaries
			const parts = result.split("|");
			console.log("Pattern parts:");
			parts.forEach((part, i) => {
				console.log(`  ${i}: ${part}`);
			});
		});

		it("should test boundary handling", () => {
			const testStrings = [
				{ str: "OCXO module", shouldMatch: true },
				{ str: "TCXO chip", shouldMatch: true }, // Has \\b at end in original
				{ str: "TCXO25", shouldMatch: false }, // Should NOT match due to \\b
				{ str: "RTC module", shouldMatch: true }, // Has \\b on both sides
				{ str: "myRTC", shouldMatch: false }, // Should NOT match due to \\b
				{ str: "RTClock", shouldMatch: false }, // Should NOT match due to \\b
			];

			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern:", compiledPattern);

			testStrings.forEach(({ str, shouldMatch }) => {
				console.log(`\nTesting "${str}" - should${shouldMatch ? "" : " NOT"} match`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				if (shouldMatch && !matches) {
					console.log("FAILED: Should have matched");
				} else if (!shouldMatch && matches) {
					console.log("FAILED: Should NOT have matched");
				}
			});
		});
	});

	describe("Pattern 8: Thunderbolt versions with optional parts", () => {
		const pattern = "thunderbolt[- ]?[345]?[- ]?dock|thunderbolt[- ]?[345]?[- ]?hub";

		it("should show pattern transformation", () => {
			const result = createKeywordPattern(pattern);
			console.log("\nOriginal pattern:", pattern);
			console.log("Transformed pattern:", result);

			expect(result.split("|").length).toBe(2);

			const parts = result.split("|");
			console.log("Pattern parts:");
			parts.forEach((part, i) => {
				console.log(`  ${i}: ${part}`);
			});
		});

		it("should test various thunderbolt formats", () => {
			const testStrings = [
				{ str: "thunderbolt dock", shouldMatch: true },
				{ str: "thunderbolt 3 dock", shouldMatch: true },
				{ str: "thunderbolt-4-dock", shouldMatch: true },
				{ str: "thunderbolt3dock", shouldMatch: true },
				{ str: "thunderbolt 5 hub", shouldMatch: true },
				{ str: "thunderbolt-hub", shouldMatch: true },
				{ str: "thunderbolt2 dock", shouldMatch: false }, // Should NOT match (only 3,4,5)
			];

			const compiledPattern = compileKeyword(pattern);
			console.log("Compiled pattern:", compiledPattern);

			testStrings.forEach(({ str, shouldMatch }) => {
				console.log(`\nTesting "${str}" - should${shouldMatch ? "" : " NOT"} match`);
				const matches = str.match(compiledPattern);
				console.log("Match result:", matches);

				if (shouldMatch && !matches) {
					console.log("FAILED: Should have matched");
				} else if (!shouldMatch && matches) {
					console.log("FAILED: Should NOT have matched");
				}
			});
		});
	});

	describe("Contains/Without patterns (negative lookaheads)", () => {
		it("should demonstrate how negative lookaheads should work", () => {
			// Example: Match "wireless" but not if "mouse" is present
			const positivePattern = "wireless";
			const negativePattern = "mouse";

			// Ideal pattern would be: (?=.*\bwireless\b)(?!.*\bmouse\b).*
			// But the current implementation doesn't handle this

			const testStrings = [
				{ text: "wireless keyboard", shouldMatch: true },
				{ text: "wireless mouse", shouldMatch: false },
				{ text: "bluetooth wireless adapter", shouldMatch: true },
				{ text: "wireless gaming mouse", shouldMatch: false },
			];

			console.log("\nTesting contains/without logic:");
			testStrings.forEach(({ text, shouldMatch }) => {
				console.log(`"${text}" should${shouldMatch ? "" : " NOT"} match`);
				// Current implementation would need separate matching logic
			});
		});
	});

	describe("User-reported patterns with issues", () => {
		describe("Pattern: (?i)\\baerat\\w*", () => {
			const pattern = "(?i)\\baerat\\w*";

			it("should show how inline flags are broken", () => {
				const result = createKeywordPattern(pattern);
				console.log("\nOriginal pattern:", pattern);
				console.log("Transformed pattern:", result);

				// The (?i) flag will be treated as literal text
				expect(result).toContain("(?i)");
			});

			it("should test matching behavior", () => {
				const compiledPattern = compileKeyword(pattern);
				const testStrings = [
					{ str: "aerat", shouldMatch: true },
					{ str: "aerating", shouldMatch: true },
					{ str: "AERAT", shouldMatch: true }, // Should match with (?i)
					{ str: "Aerator", shouldMatch: true },
				];

				testStrings.forEach(({ str, shouldMatch }) => {
					console.log(`Testing "${str}"`);
					const matches = str.match(compiledPattern);
					console.log("Match result:", matches);
				});
			});
		});

		describe("Pattern: \\b87139-(YZZ82|50100|07020|48030|50130|11010)\\b", () => {
			const pattern = "\\b87139-(YZZ82|50100|07020|48030|50130|11010)\\b";

			it("should show how grouped alternatives without spaces are broken", () => {
				const result = createKeywordPattern(pattern);
				console.log("\nOriginal pattern:", pattern);
				console.log("Transformed pattern:", result);

				// Will split the group
				expect(result.split("|").length).toBe(6);
			});

			it("should test matching", () => {
				const compiledPattern = compileKeyword(pattern);
				const testStrings = ["87139-YZZ82", "87139-50100", "87139-11010"];

				testStrings.forEach((str) => {
					console.log(`Testing "${str}"`);
					const matches = str.match(compiledPattern);
					console.log("Match result:", matches);
					if (!matches) {
						console.log("FAILED: Should have matched");
					}
				});
			});
		});

		describe("Pattern: Pool regex with complex alternation", () => {
			const pattern =
				"/\\b(twelve|12('|\\s*(ft|foot|feet)))\\s*pool\\b|\\bpool\\s*(twelve|12('|\\s*(ft|foot|feet)))\\b/i";

			it("should show issues with complex nested groups", () => {
				// Remove the /.../ delimiters and flags for testing
				const cleanPattern = pattern.slice(1, -2);
				const result = createKeywordPattern(cleanPattern);
				console.log("\nOriginal pattern:", cleanPattern);
				console.log("Transformed pattern:", result);

				// This will be completely mangled
				const parts = result.split("|");
				console.log("Number of parts after split:", parts.length);
			});
		});

		describe("Pattern: Mazda CX-9 complex lookahead", () => {
			const pattern =
				"\\b((?=.*?\\bmazda\\b)(?=.*?\\bcx[- ]?9\\b)(?=.*?\\bcabin\\b)(?=.*?\\bfilter\\b)(?=.*?\\b(201[6-9]|202[0-3])\\b).*?|tk48[- ]?61[- ]?j6x)\\b";

			it("should show how complex lookaheads are broken", () => {
				const result = createKeywordPattern(pattern);
				console.log("\nOriginal pattern:", pattern);
				console.log("Transformed pattern:", result);

				// The lookaheads will be wrapped with word boundaries
				// But we should NOT have double word boundaries
				expect(result).not.toContain("\\b\\b");
			});
		});

		describe("Pattern: Type-D Pool Filter variations", () => {
			const pattern = "\\b(Type\\s*-?D\\s*Pool\\s*Filter|Type\\s*-?D.*Pool.*Filter|Pool.*Type\\s*-?D.*Filter)\\b";

			it("should show how alternatives with .* are handled", () => {
				const result = createKeywordPattern(pattern);
				console.log("\nOriginal pattern:", pattern);
				console.log("Transformed pattern:", result);

				// Will split on pipes inside the group
				const parts = result.split("|");
				expect(parts.length).toBe(3);
				console.log("Parts:", parts);
			});
		});

		describe("Pattern: Shampoo with character class", () => {
			const pattern = "\\bs(hampoo(s)?)\\b";

			it("should show how nested groups are handled", () => {
				const result = createKeywordPattern(pattern);
				console.log("\nOriginal pattern:", pattern);
				console.log("Transformed pattern:", result);

				// Should NOT add double word boundaries
				expect(result).not.toContain("\\b\\b");
			});

			it("should test matching", () => {
				const compiledPattern = compileKeyword(pattern);
				const testStrings = [
					{ str: "shampoo", shouldMatch: true },
					{ str: "shampoos", shouldMatch: true },
					{ str: "shampooing", shouldMatch: false }, // Word boundary should prevent this
				];

				testStrings.forEach(({ str, shouldMatch }) => {
					console.log(`Testing "${str}" - should${shouldMatch ? "" : " NOT"} match`);
					const matches = str.match(compiledPattern);
					console.log("Match result:", matches);

					if (shouldMatch && !matches) {
						console.log("FAILED: Should have matched");
					} else if (!shouldMatch && matches) {
						console.log("FAILED: Should NOT have matched");
					}
				});
			});
		});

		describe("Pattern: Spider with \\S*", () => {
			const pattern = "\\bspider\\S*\\b";

			it("should show how \\S* with word boundaries behaves", () => {
				const result = createKeywordPattern(pattern);
				console.log("\nOriginal pattern:", pattern);
				console.log("Transformed pattern:", result);

				// Should NOT add double word boundaries
				expect(result).not.toContain("\\b\\b");
			});

			it("should test matching behavior", () => {
				const compiledPattern = compileKeyword(pattern);
				const testStrings = [
					{ str: "spider", shouldMatch: true },
					{ str: "spiderman", shouldMatch: true },
					{ str: "spider-web", shouldMatch: true }, // \\S* matches any non-whitespace including hyphen
					{ str: "spiders", shouldMatch: true },
				];

				testStrings.forEach(({ str, shouldMatch }) => {
					console.log(`Testing "${str}" - should${shouldMatch ? "" : " NOT"} match`);
					const matches = str.match(compiledPattern);
					console.log("Match result:", matches);

					if (shouldMatch && !matches) {
						console.log("FAILED: Should have matched");
					} else if (!shouldMatch && matches) {
						console.log("FAILED: Should NOT have matched");
					}
				});
			});
		});
	});

	describe("Summary of issues", () => {
		it("should document the main problems", () => {
			console.log("\n=== MAIN ISSUES WITH createKeywordPattern ===\n");
			console.log("1. Splits on ALL pipes (|), even inside groups like (a|b)");
			console.log("2. Adds word boundaries to patterns that already have them");
			console.log("3. Doesn't respect regex constructs:");
			console.log("   - Lookaheads (?=...) and (?!...)");
			console.log("   - Non-capturing groups (?:...)");
			console.log("   - Inline flags (?i)");
			console.log("   - Character classes [...]");
			console.log("   - Quantifiers like ? + * {n,m}");
			console.log("4. Treats complex patterns as simple keywords");
			console.log("\nRECOMMENDATION: Add a check to detect if a pattern is already");
			console.log("a complex regex and skip transformation for those cases.");

			// Force test to pass so we can see all the output
			expect(true).toBe(true);
		});
	});
});
