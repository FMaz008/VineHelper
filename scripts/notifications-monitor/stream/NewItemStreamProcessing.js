/*global chrome*/

import { Streamy } from "../../core/utils/Streamy.js";
import { compile as compileKeywords, compileKeywordObjects } from "../../core/utils/KeywordCompiler.js";
import { findMatch, getMatchedKeyword } from "../../core/utils/KeywordMatcher.js";
import { SettingsMgr } from "../../core/services/SettingsMgrCompat.js";
import { Item } from "../../core/models/Item.js";
import { YMDHiStoISODate, DateToUnixTimeStamp } from "../../core/utils/DateHelper.js";

const SEARCH_PHRASE_REGEX = /^([a-zA-Z0-9\s'".,]{0,40})[\s]+.*$/;

/**
 * NewItemStreamProcessing handles real-time item processing with keyword matching.
 *
 * This class uses the simplified KeywordCompiler/KeywordMatcher pattern where:
 * - Keywords are compiled once on initialization
 * - Keywords are recompiled when settings change
 * - No complex caching logic is needed
 */
class NewItemStreamProcessing {
	constructor(settingsManager = null, enableChromeListener = true) {
		this.settingsManager = settingsManager || new SettingsMgr();
		this.dataStream = new Streamy();
		this.enableChromeListener = enableChromeListener;

		this.outputFunctions = {
			broadcast: () => {},
			push: () => {},
		};

		// Compiled keywords - compiled once and reused
		this.compiledHideKeywords = null;
		this.compiledHighlightKeywords = null;
		this.compiledBlurKeywords = null;

		// Settings that affect behavior
		this.hideListEnabled = false;
		this.pushNotifications = false;
		this.pushNotificationsAFA = false;

		// Diagnostic: Track processing counts per ASIN
		this.processingCounts = new Map();

		this.setupPipeline();
		this.initialize();
	}

	async initialize() {
		await this.compileKeywords();
	}

	async compileKeywords() {
		await this.settingsManager.waitForLoad();

		// Get keywords from settings - all should be arrays
		const hideKeywords = this.settingsManager.get("general.hideKeywords") || [];
		const highlightKeywords = this.settingsManager.get("general.highlightKeywords") || [];
		const blurKeywordsRaw = this.settingsManager.get("general.blurKeywords") || [];

		// Convert blur keywords array to keyword objects
		const blurKeywords = Array.isArray(blurKeywordsRaw)
			? blurKeywordsRaw.filter((kw) => kw && kw.length > 0).map((kw) => ({ contains: kw }))
			: [];

		// Debug logging for keyword loading
		if (this.settingsManager.get("general.debugKeywords")) {
			console.log("[NewItemStreamProcessing] Loading keywords from settings:", {
				highlightKeywordsRaw: highlightKeywords,
				blurKeywordsRaw: blurKeywordsRaw,
				blurKeywordsParsed: blurKeywords,
				highlightCount: highlightKeywords.length,
				blurCount: blurKeywords.length,
				timestamp: Date.now(),
			});
		}

		// Compile keywords into arrays of compiled keyword objects
		this.compiledHideKeywords = hideKeywords.length > 0 ? compileKeywordObjects(hideKeywords) : null;
		this.compiledHighlightKeywords = highlightKeywords.length > 0 ? compileKeywordObjects(highlightKeywords) : null;
		this.compiledBlurKeywords = blurKeywords.length > 0 ? compileKeywordObjects(blurKeywords) : null;

		// Update behavior settings
		this.hideListEnabled = this.settingsManager.get("notification.hideList");
		this.pushNotifications = this.settingsManager.get("notification.pushNotifications");
		this.pushNotificationsAFA = this.settingsManager.get("notification.pushNotificationsAFA");

		// Debug logging
		if (this.settingsManager.get("general.debugKeywords")) {
			console.log("[NewItemStreamProcessing] Keywords compiled:", {
				hideKeywordsCount: hideKeywords.length,
				highlightKeywordsCount: highlightKeywords.length,
				blurKeywordsCount: blurKeywords.length,
				timestamp: Date.now(),
			});
		}
	}

	//#####################################################
	//## PIPELINE
	//#####################################################

	filterHideItem(rawData) {
		if (!rawData.item) {
			return true; //Skip this filter
		}
		const data = rawData.item.data;
		if (data.title === undefined) {
			return true; //Skip this filter
		}

		// KEYWORD PRIORITY: Only check hide keywords if the item is NOT highlighted
		// This ensures highlight keywords take precedence over hide keywords
		if (this.hideListEnabled && !data.KWsMatch && this.compiledHideKeywords) {
			const hideKeyword = getMatchedKeyword(data.title, this.compiledHideKeywords, data.etv_min, data.etv_max);
			if (hideKeyword !== false) {
				if (this.settingsManager.get("general.debugKeywords")) {
					console.log("[NewItemStreamProcessing] Item hidden by keyword:", {
						asin: data.asin,
						title: data.title,
						keyword: hideKeyword,
						timestamp: Date.now(),
					});
				}
				return false; //Do not display the notification as it matches the hide list.
			}
		}
		return true;
	}

	transformIsHighlight(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;

		if (data.title === undefined) {
			return rawData; //Skip this transformer if no title
		}

		// Diagnostic logging for duplicate processing
		if (this.settingsManager.get("general.debugDuplicates")) {
			const timestamp = Date.now();
			const asin = data.asin;

			// Track processing count
			const currentCount = this.processingCounts.get(asin) || 0;
			this.processingCounts.set(asin, currentCount + 1);

			if (this.settingsManager.get("general.debugKeywords")) {
				console.log("[NewItemStreamProcessing] transformIsHighlight called:", {
					asin: asin,
					title: data.title?.substring(0, 50) + "...",
					enrollment_guid: data.enrollment_guid,
					processingCount: currentCount + 1,
					isDuplicate: currentCount > 0,
					timestamp,
					timestampMs: timestamp,
					reason: rawData.reason || "no reason",
					callStack: new Error().stack.split("\n").slice(2, 5).join(" <- "),
				});
			}

			// Warn if this is a duplicate processing
			if (currentCount > 0) {
				console.warn(
					`[NewItemStreamProcessing] DUPLICATE PROCESSING DETECTED for ASIN ${asin} - processed ${currentCount + 1} times`,
					{
						enrollment_guid: data.enrollment_guid,
						reason: rawData.reason,
						timestamp: new Date().toISOString(),
					}
				);
			}
		}

		// Check highlight keywords using the compiled keywords
		if (this.compiledHighlightKeywords) {
			const matchedKeyword = getMatchedKeyword(
				data.title,
				this.compiledHighlightKeywords,
				data.etv_min,
				data.etv_max
			);
			rawData.item.data.KWsMatch = matchedKeyword !== false;
			rawData.item.data.KW = matchedKeyword;

			if (matchedKeyword && this.settingsManager.get("general.debugKeywords")) {
				console.log("[NewItemStreamProcessing] Item highlighted by keyword:", {
					asin: data.asin,
					title: data.title,
					keyword: matchedKeyword,
					timestamp: Date.now(),
				});
			}
		} else {
			rawData.item.data.KWsMatch = false;
			rawData.item.data.KW = false;
		}

		// ERROR logging for KW anomaly
		if (rawData.item.data.KWsMatch === true && rawData.item.data.KW === undefined) {
			console.error("[NewItemStreamProcessing] ERROR: KWsMatch is true but KW is undefined!", {
				asin: data.asin,
				title: data.title?.substring(0, 50) + "...",
				KW: rawData.item.data.KW,
				KWsMatch: rawData.item.data.KWsMatch,
				KWType: typeof rawData.item.data.KW,
				hasKWProperty: "KW" in rawData.item.data,
				compiledHighlightKeywords: !!this.compiledHighlightKeywords,
				keywordCount: this.compiledHighlightKeywords?.length || 0,
				timestamp: new Date().toISOString(),
			});
			console.trace("[NewItemStreamProcessing] Stack trace for KW undefined");
		}

		return rawData;
	}

	transformIsBlur(rawData) {
		// Always log entry to this transformer when debugging
		if (this.settingsManager.get("general.debugKeywords")) {
			console.log("[NewItemStreamProcessing] transformIsBlur called:", {
				hasItem: !!rawData.item,
				hasData: !!rawData.item?.data,
				hasTitle: !!rawData.item?.data?.title,
				asin: rawData.item?.data?.asin,
				titlePreview: rawData.item?.data?.title?.substring(0, 50) + "...",
				timestamp: Date.now(),
			});
		}

		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		if (data.title == undefined) {
			return rawData; //Skip this transformer
		}

		// Check blur keywords using the compiled keywords
		if (this.compiledBlurKeywords) {
			const blurKeyword = getMatchedKeyword(data.title, this.compiledBlurKeywords);
			rawData.item.data.BlurKWsMatch = blurKeyword !== false;
			rawData.item.data.BlurKW = blurKeyword;

			// Debug logging for blur keyword matching
			if (this.settingsManager.get("general.debugKeywords")) {
				console.log("[NewItemStreamProcessing] Blur keyword check:", {
					asin: data.asin,
					title: data.title,
					compiledBlurKeywords: this.compiledBlurKeywords,
					blurKeywordFound: blurKeyword,
					BlurKWsMatch: rawData.item.data.BlurKWsMatch,
					BlurKW: rawData.item.data.BlurKW,
					timestamp: Date.now(),
				});
			}
		} else {
			rawData.item.data.BlurKWsMatch = false;
			rawData.item.data.BlurKW = false;

			if (this.settingsManager.get("general.debugKeywords")) {
				console.log("[NewItemStreamProcessing] No blur keywords configured");
			}
		}

		return rawData;
	}

	transformSearchPhrase(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		if (data.title == undefined) {
			return rawData; //Skip this transformer
		}

		//Method no longer useful.
		const search = data.title.replace(SEARCH_PHRASE_REGEX, "$1");
		rawData.item.data.search = search;
		return rawData;
	}

	transformUnixTimestamp(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		rawData.item.data.timestamp = this.dateToUnixTimestamp(data.date);
		return rawData;
	}

	transformPostNotification(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		if (data.asin == undefined) {
			return rawData; //Skip this transformer
		}

		//If the new item match a highlight keyword, push a real notification.
		const KWNotification = this.pushNotifications && data.KWsMatch;
		const AFANotification = this.pushNotificationsAFA && data.queue == "last_chance";

		if (KWNotification || AFANotification) {
			//Create a new clean item with just the info needed to display the notification
			const item = new Item({
				asin: data.asin,
				queue: data.queue,
				is_parent_asin: data.is_parent_asin,
				is_pre_release: data.is_pre_release,
				enrollment_guid: data.enrollment_guid,
			});
			item.setTitle(data.title);
			item.setImgUrl(data.img_url);
			item.setSearch(data.search);

			if (KWNotification) {
				// Debug logging for OS notification triggered by keyword match
				if (this.settingsManager.get("general.debugKeywords")) {
					console.log("[NewItemStreamProcessing] OS notification triggered for keyword match:", {
						asin: data.asin,
						title: data.title,
						keyword: data.KW,
						KWsMatch: data.KWsMatch,
						timestamp: new Date().toISOString(),
					});
				}
				this.outputFunctions.push("Vine Helper - New item match KW!", item);
			} else if (AFANotification) {
				this.outputFunctions.push("Vine Helper - New AFA item", item);
			}
		}
		return rawData;
	}

	setupPipeline() {
		const filterHideitem = this.dataStream.filter((rawData) => this.filterHideItem(rawData));
		const transformIsHighlight = this.dataStream.transformer((rawData) => this.transformIsHighlight(rawData));
		const transformIsBlur = this.dataStream.transformer((rawData) => this.transformIsBlur(rawData));
		const transformSearchPhrase = this.dataStream.transformer((rawData) => this.transformSearchPhrase(rawData));
		const transformUnixTimestamp = this.dataStream.transformer((rawData) => this.transformUnixTimestamp(rawData));
		const transformPostNotification = this.dataStream.transformer((rawData) =>
			this.transformPostNotification(rawData)
		);

		this.dataStream
			.pipe(transformIsHighlight) //Highlight keywords first...
			.pipe(filterHideitem) // ... then figure out if we can hide the item
			.pipe(transformIsBlur)
			.pipe(transformSearchPhrase)
			.pipe(transformUnixTimestamp)
			.pipe(transformPostNotification)
			.output((data) => {
				//Broadcast the notification
				this.outputFunctions.broadcast(data, "notification");
			});
	}

	dateToUnixTimestamp(dateString) {
		// Use the proper date parsing utilities instead of Safari-incompatible string concatenation
		const date = YMDHiStoISODate(dateString);
		return DateToUnixTimeStamp(date);
	}

	setBroadcastFunction(fct) {
		this.outputFunctions.broadcast = fct;
	}

	setNotificationPushFunction(fct) {
		this.outputFunctions.push = fct;
	}

	input(data) {
		// Diagnostic logging for stream input
		if (this.settingsManager.get("general.debugKeywords") && data.item) {
			const timestamp = Date.now();
			console.log("[NewItemStreamProcessing] Stream input received:", {
				asin: data.item.data?.asin,
				title: data.item.data?.title?.substring(0, 50) + "...",
				type: data.type,
				reason: data.reason,
				timestamp,
				timestampMs: timestamp,
			});
		}
		this.dataStream.input(data);
	}

	// Expose compiled keywords for testing
	getCompiledKeywords() {
		return {
			hideKeywords: this.compiledHideKeywords,
			highlightKeywords: this.compiledHighlightKeywords,
			blurKeywords: this.compiledBlurKeywords,
		};
	}
}

export { NewItemStreamProcessing };
