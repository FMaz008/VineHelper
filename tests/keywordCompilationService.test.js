const { DIContainer } = require("../scripts/infrastructure/DIContainer.js");
const { MemoryStorageAdapter } = require("../scripts/infrastructure/StorageAdapter.js");

// Mock chrome runtime API
global.chrome = {
	runtime: {
		sendMessage: jest.fn(),
		onMessage: {
			addListener: jest.fn(),
			removeListener: jest.fn(),
		},
		lastError: null,
		getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
		getManifest: jest.fn(() => ({ version: "1.0.0" })),
	},
};

// Mock the modules that use ES6 imports
jest.mock("../scripts/core/utils/KeywordMatch.js", () => ({
	precompileKeywords: jest.fn((keywords) => ({
		total: keywords.length,
		compiled: keywords.length,
		failed: 0,
		cached: false,
	})),
	compileKeyword: jest.fn((word) => {
		if (typeof word === "string" && word === "test[") {
			return null; // Invalid regex
		}
		const pattern = typeof word === "string" ? `\\b${word}\\b` : `\\b${word.contains}\\b`;
		return {
			regex: new RegExp(pattern, "iu"),
			withoutRegex: word.without ? new RegExp(`\\b${word.without}\\b`, "iu") : null,
			hasEtvCondition: word.etv_min || word.etv_max ? true : false,
		};
	}),
	createRegexPattern: jest.fn((keyword) => {
		return /^[\x20-\x7E]+$/.test(keyword) ? `\\b${keyword}\\b` : `(?<![\\p{L}\\p{N}])${keyword}(?![\\p{L}\\p{N}])`;
	}),
}));

describe("KeywordCompilationService", () => {
	let service;
	let storage;
	let runtimeAdapter;
	let logger;

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks();

		storage = new MemoryStorageAdapter();
		logger = {
			add: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
		};

		// Create a mock runtime adapter
		runtimeAdapter = {
			sendMessage: jest.fn().mockResolvedValue(null),
			onMessage: jest.fn(() => jest.fn()), // Return unsubscribe function
			isServiceWorker: jest.fn(() => false),
			getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
			getManifest: jest.fn(() => ({ version: "1.0.0" })),
		};

		// Import and create service
		const { KeywordCompilationService } = require("../scripts/core/services/KeywordCompilationService.js");
		service = new KeywordCompilationService(storage, logger, runtimeAdapter);
	});

	describe("initialization", () => {
		it("should initialize successfully", async () => {
			await service.initialize();
			expect(logger.add).not.toHaveBeenCalledWith(expect.stringContaining("Failed"));
		});

		it("should load cached compilations on initialization", async () => {
			// Store some cached data
			const cachedData = {
				version: "1.0.0",
				compilations: {
					highlight_12345: [
						{
							index: 0,
							keyword: "test",
							pattern: "\\btest\\b",
							flags: "iu",
						},
					],
				},
			};
			await storage.set("vh_compiled_keywords", cachedData);

			// Initialize service
			await service.initialize();

			// Verify it loaded the cache
			expect(logger.add).toHaveBeenCalledWith(expect.stringContaining("Loaded 1 cached compilations"));
		});
	});

	describe("compileAndShare", () => {
		it("should compile simple string keywords", async () => {
			await service.initialize();

			const keywords = ["laptop", "phone", "tablet"];
			const stats = await service.compileAndShare("highlight", keywords);

			expect(stats.total).toBe(3);
			expect(stats.compiled).toBe(3);
			expect(stats.failed).toBe(0);
			expect(stats.cached).toBe(false);
		});

		it("should compile object keywords with conditions", async () => {
			await service.initialize();

			const keywords = [
				{
					contains: "laptop",
					without: "gaming",
					etv_min: "50",
					etv_max: "200",
				},
				{
					contains: "phone",
					without: "",
					etv_min: "",
					etv_max: "100",
				},
			];
			const stats = await service.compileAndShare("highlight", keywords);

			expect(stats.total).toBe(2);
			expect(stats.compiled).toBe(2);
			expect(stats.failed).toBe(0);
		});

		it("should return cached results on second compilation", async () => {
			await service.initialize();

			const keywords = ["test1", "test2"];

			// First compilation
			const stats1 = await service.compileAndShare("highlight", keywords);
			expect(stats1.cached).toBe(false);

			// Second compilation - should be cached
			const stats2 = await service.compileAndShare("highlight", keywords);
			expect(stats2.cached).toBe(true);
			expect(stats2.total).toBe(stats1.total);
			expect(stats2.compiled).toBe(stats1.compiled);
		});

		it("should persist compilations to storage", async () => {
			await service.initialize();

			const keywords = ["test"];
			await service.compileAndShare("highlight", keywords);

			// Check storage
			const stored = await storage.get("vh_compiled_keywords");
			expect(stored).toBeDefined();
			expect(stored.version).toBe("1.0.0");
			expect(Object.keys(stored.compilations).length).toBeGreaterThan(0);
		});
	});

	describe("getCompiled", () => {
		it("should retrieve compiled keywords from cache", async () => {
			await service.initialize();

			const keywords = ["laptop", "phone"];
			await service.compileAndShare("highlight", keywords);

			const compiled = await service.getCompiled("highlight", keywords);
			expect(compiled).toBeInstanceOf(Map);
			expect(compiled.size).toBe(2);
		});

		it("should return null for non-existent compilations", async () => {
			await service.initialize();

			const keywords = ["nonexistent"];
			const compiled = await service.getCompiled("highlight", keywords);
			expect(compiled).toBeNull();
		});
	});

	describe("clearCache", () => {
		it("should clear all cached compilations", async () => {
			await service.initialize();

			// Add some compilations
			const keywords = ["test1", "test2"];
			await service.compileAndShare("highlight", keywords);

			// Clear cache
			await service.clearCache();

			// Verify cache is empty
			const compiled = await service.getCompiled("highlight", keywords);
			expect(compiled).toBeNull();

			// Verify storage is cleared
			const stored = await storage.get("vh_compiled_keywords");
			expect(stored).toBeUndefined();
		});

		it("should send clear message to other contexts", async () => {
			await service.initialize();
			await service.clearCache();

			expect(runtimeAdapter.sendMessage).toHaveBeenCalledWith({
				action: "clearKeywordCache",
			});
		});
	});
});
