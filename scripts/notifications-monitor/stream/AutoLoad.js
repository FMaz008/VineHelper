/*global chrome*/

import { isPageLogin, isPageCaptcha, isPageDog } from "/scripts/core/utils/DOMHelper.js";

class AutoLoad {
	static #instance = null;

	_monitor = null;
	#ws = null;

	#displayTimer = null;
	#reloadTimer = null;
	#channelMessageHandler = null;

	constructor(monitor, ws) {
		if (AutoLoad.#instance) {
			return AutoLoad.#instance;
		}
		AutoLoad.#instance = this;

		this._monitor = monitor;
		this.#ws = ws;
		this.#setReloadTimer();
		this.#createListener();
	}

	resetReloadTimer(interval) {
		this.#reloadTimer = setTimeout(
			() => {
				clearTimeout(this.#reloadTimer);
				this.#reloadTimer = null;
				this.#setReloadTimer();
			},
			interval //in ms
		);
	}

	#createListener() {
		// Store reference to handler for cleanup
		this.#channelMessageHandler = (event) => {
			this.processMessage(event.data);
		};

		//The SW is reporting that a tab was detected to be a dog page, delay the auto-load timer for 24 hours.
		this._monitor._channel.addEventListener("message", this.#channelMessageHandler);
	}

	processMessage(message) {
		if (message.type === "dogpage") {
			this.resetReloadTimer(1000 * 60 * 60 * 24); //24 hours
		}
		//The SW is reporting that a tab was detected to be a captcha page, delay the auto-load timer for 1 hour.
		if (message.type === "captchapage") {
			this.resetReloadTimer(1000 * 60 * 60); //1 hour
		}
		//The SW is reporting that a tab was detected to be a login page, delay the auto-load timer for 1 hour.
		if (message.type === "loginpage") {
			this.resetReloadTimer(1000 * 60 * 60); //1 hour
		}
	}

	async #setReloadTimer() {
		// Clear any existing timers first
		if (this.#displayTimer) {
			clearTimeout(this.#displayTimer);
			this.#displayTimer = null;
		}
		if (this.#reloadTimer) {
			clearTimeout(this.#reloadTimer);
			this.#reloadTimer = null;
		}

		if (!this.#isTimeWithinRange()) {
			console.log(`${new Date().toLocaleString()} - Auto-load is not active at this time`);
			this.resetReloadTimer(1000 * 60 * 15); //15 minutes
			return;
		}

		//Send a websocket request
		if (
			this.#ws.isConnected() &&
			this._monitor._i13nMgr.getCountryCode() &&
			!this._monitor._settings.get("thorvarium.mobileandroid") &&
			!this._monitor._settings.get("thorvarium.mobileios")
		) {
			console.log("sending Reload request");
			this.#ws.emit("reloadRequest", {
				uuid: this._monitor._settings.get("general.uuid", false),
				fid: this._monitor._settings.get("general.fingerprint.id", false),
				countryCode: this._monitor._i13nMgr.getCountryCode(),
			});
		}

		//Create an interval between 5 and 10 minutes to check with the server if a page needs to be refreshed
		let min = this._monitor._settings.get("notification.autoload.min");
		let max = this._monitor._settings.get("notification.autoload.max");
		if (!min || min > 5) {
			min = 5;
		}
		if (!max || max > 10) {
			max = 10;
		}
		//const timer = 30 * 1000; //30 seconds
		const timer = Math.floor(Math.random() * (max * 60 * 1000 - min * 60 * 1000 + 1) + min * 60 * 1000); //In milliseconds

		this.#displayTimer = setTimeout(() => {
			const timerInMinutes = Math.floor(timer / 60 / 1000);
			const secondsLeft = Math.floor((timer - timerInMinutes * 60 * 1000) / 1000);
			console.log(
				`${new Date().toLocaleString()} - Setting reload timer to ${timerInMinutes} minutes and ${secondsLeft} seconds`
			);
		}, 500);

		this.#reloadTimer = setTimeout(async () => {
			this.#setReloadTimer(); //Create a new timer
		}, timer);
	}

	#isTimeWithinRange() {
		//Check if the current time is within the auto-load time range
		const now = new Date();
		const start = new Date();
		const startTime = this._monitor._settings.get("notification.autoload.hourStart"); //03:00
		let [startHour, startMinute] = startTime.split(":").map(Number);
		if (startHour < 0 || startHour > 24) {
			console.log(`${new Date().toLocaleString()} - Invalid start hour: ${startHour}, setting to 3am`);
			startHour = 3;
		}
		if (startMinute < 0 || startMinute > 59) {
			console.log(`${new Date().toLocaleString()} - Invalid start minute: ${startMinute}, setting to 0`);
			startMinute = 0;
		}

		start.setHours(startHour);
		start.setMinutes(startMinute);
		start.setSeconds(0);

		const end = new Date();
		const endTime = this._monitor._settings.get("notification.autoload.hourEnd"); //17:00
		let [endHour, endMinute] = endTime.split(":").map(Number);
		if (endHour < 0 || endHour > 24) {
			console.log(`${new Date().toLocaleString()} - Invalid end hour: ${endHour}, setting to 17pm`);
			endHour = 17;
		}
		if (endMinute < 0 || endMinute > 59) {
			console.log(`${new Date().toLocaleString()} - Invalid end minute: ${endMinute}, setting to 0`);
			endMinute = 0;
		}
		end.setHours(endHour);
		end.setMinutes(endMinute);
		end.setSeconds(0);

		//Calculate the number of hours between the start and end times
		const hoursBetween = end.getTime() - start.getTime();
		const hours = Math.abs(hoursBetween / (1000 * 60 * 60));
		if (hours < 8) {
			console.log(
				`${new Date().toLocaleString()} - Auto-load time range is less than 8 hours, setting to 3am to 17hrs`
			);
			//Make the start time 3am and the end time 17hrs
			start.setHours(3);
			end.setHours(17);
		}

		// Handle case where start time is in the previous day (e.g., 23:00 to 09:00)
		if (start > end) {
			// If current time is before end time, we're in the next day
			if (now < end) {
				start.setDate(start.getDate() - 1);
			}
			// If current time is after start time, we're still in the same day
			else if (now >= start) {
				end.setDate(end.getDate() + 1);
			}
		}

		if (now < start || now > end) {
			return false;
		}
		return true;
	}

	async fetchAutoLoadUrl(url, queue, page) {
		//Fetch the url
		const userAgent = navigator.userAgent;
		const acceptLanguage = navigator.language || navigator.languages?.join(",") || "en-US,en;q=0.9";
		const headers = {
			"User-Agent": userAgent,
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
			"Accept-Language": acceptLanguage,
			"Accept-Encoding": "gzip, deflate, br",
			"Cache-Control": "no-cache",
			Pragma: "no-cache",
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "none",
			"Sec-Fetch-User": "?1",
			"Upgrade-Insecure-Requests": "1",
		};
		const response = await fetch(url, { headers: headers });
		const html = await response.text();

		//Parse the HTML
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		//check if the page is a dogpage
		if (isPageDog(doc)) {
			console.log(`${new Date().toLocaleString()} - Dog page detected.`);
			this.resetReloadTimer(1000 * 60 * 60 * 24); //24 hours
			return;
		}

		//Check if the page is a captchapage
		if (isPageCaptcha(doc)) {
			console.log(`${new Date().toLocaleString()} - Captcha page detected.`);
			this.resetReloadTimer(1000 * 60 * 60); //1 hour
			return;
		}

		//Check if the page is a loginpage
		if (isPageLogin(doc)) {
			console.log(`${new Date().toLocaleString()} - Login page detected.`);
			this.resetReloadTimer(1000 * 60 * 60); //1 hour
			return;
		}

		//Get all the tiles
		const tiles = doc.querySelectorAll("#vvp-items-grid .vvp-item-tile");
		const items = [];
		for (const tile of tiles) {
			const input = tile.querySelector("input");
			const recommendationId = input.dataset.recommendationId;
			//Match the string following vine.enrollment.
			const enrollment_guid = recommendationId.match(/vine\.enrollment\.(.*)/)[1];
			const asin = input.dataset.asin;
			const title = tile.querySelector(".a-truncate-full").textContent;
			const is_parent_asin = input.dataset.isParentAsin;
			const thumbnail = tile.querySelector("img").src;

			items.push({
				asin: asin,
				title: title,
				is_parent_asin: is_parent_asin,
				enrollment_guid: enrollment_guid,
				thumbnail: thumbnail,
			});
		}

		//Forward the items to the server
		if (items.length > 0) {
			const arrQueue = { AI: "encore", RFY: "potluck", AFA: "last_chance", ALL: "all_items" };

			const content = {
				api_version: 5,
				app_version: chrome.runtime.getManifest().version,
				country: this._monitor._i13nMgr.getCountryCode(),
				uuid: await this._monitor._settings.get("general.uuid", false),
				fid: await this._monitor._settings.get("general.fingerprint.id", false),
				action: "get_info",
				tier: this._monitor._tierMgr.getTier(),
				queue: arrQueue[queue],
				items: items,
				request_variants: false,
				s2: await this._monitor._cryptoKeys.signData(items),
			};
			content.s = await this._monitor._cryptoKeys.signData(content);
			content.pk = await this._monitor._cryptoKeys.getExportedPublicKey();
			fetch(this._monitor._env.getAPIUrl(), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(content),
			}).finally(() => {
				console.log(
					`${new Date().toLocaleString()} - ${items.length} items from ${queue}:${page} sent to the server.`
				);
			});
		}
	}

	/**
	 * Clean up resources to prevent memory leaks
	 */
	destroy() {
		// Clear timers
		if (this.#displayTimer) {
			clearTimeout(this.#displayTimer);
			this.#displayTimer = null;
		}

		if (this.#reloadTimer) {
			clearTimeout(this.#reloadTimer);
			this.#reloadTimer = null;
		}

		// Remove event listener
		if (this.#channelMessageHandler && this._monitor._channel) {
			this._monitor._channel.removeEventListener("message", this.#channelMessageHandler);
			this.#channelMessageHandler = null;
		}

		// Clear static instance reference
		AutoLoad.#instance = null;
	}
}

export { AutoLoad };
