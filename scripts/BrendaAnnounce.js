class BrendaAnnounceQueue {
	constructor() {
		this.MAX_QUEUE_LENGTH = 5;
		this.DEFAULT_RATE_LIMIT_SECS = 10;

		this.queue = [];
		this.url = "https://api.llamastories.com/brenda/product";
		this.responseStatusTemplates = {
			200: "{asin} has been successfully announced to Brenda.",
			401: "API Token invalid, please go in the extension settings to correct it.",
			422: "Unprocessable entity. The request was malformed and rejected.",
			429: "Hit rate limit, backing off, will retry.",
			default: "The announce has failed for an unknown reason.",
		};
		this.rateLimitSecs = this.DEFAULT_RATE_LIMIT_SECS;
		this.lastProcessTime = 0;
		this.queueTimer = null;
		this.isProcessing = false;
	}

	async announce(asin, etv, queue) {
		if (this.queue.length >= this.MAX_QUEUE_LENGTH) {
			if (!Settings.get("notification.reduce")) {
				await Notifications.pushNotification(
					new ScreenNotification({
						title: "Announce to Brenda",
						lifespan: 10,
						content:
							"The announcement queue is full, not everything should be shared. Please be selective.",
					})
				);
			}
			return;
		}

		this.queue.push({ asin, etv, queue });

		if (this.queueTimer !== null || this.isProcessing) {
			return;
		}

		const queueTimeout =
			this.lastProcessTime && this.lastProcessTime + this.rateLimitSecs * 1000 > Date.now()
				? Date.now() - this.lastProcessTime + this.rateLimitSecs * 1000
				: 0;
		this.queueTimer = setTimeout(this.process.bind(this), queueTimeout);
	}

	async process() {
		if (this.queue.length == 0) {
			this.queueTimer = null;
			return;
		}
		this.isProcessing = true;

		const item = this.queue.shift();
		let message = this.responseStatusTemplates.default;
		try {
			const { status } = await fetch(this.url, {
				method: "PUT",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					version: 1,
					token: Settings.get("discord.guid", false),
					domain: "amazon." + vineDomain,
					tab: item.queue,
					asin: item.asin,
					etv: stripCurrency(item.etv),
				}),
			});

			if (status === 429) {
				this.queue.unshift(item);
				this.rateLimitCount++;
			} else {
				this.rateLimitCount = this.rateLimitCount > 0 ? this.rateLimitCount - 1 : 0;
			}
			this.rateLimitSecs = (this.rateLimitCount + 1) * this.DEFAULT_RATE_LIMIT_SECS;
			message = this.responseStatusTemplates[status] || this.responseStatusTemplates.default;
		} catch (error) {
			console.error(error);
			this.queue.unshift(item);
		}

		this.queueTimer = setTimeout(this.process.bind(this), this.rateLimitSecs * 1000);
		this.isProcessing = false;
		this.lastProcessTime = Date.now();

		// Replace placeholders in the message
		if (!Settings.get("notification.reduce")) {
			message = message.replace("{asin}", item.asin);
			await Notifications.pushNotification(
				new ScreenNotification({
					title: "Announce to Brenda",
					lifespan: 10,
					content: message,
				})
			);
		}
	}
}

if (typeof window.BrendaAnnounceQueue === "undefined") {
	window.BrendaAnnounceQueue = new BrendaAnnounceQueue();
}

function stripCurrency(value) {
	// Use a regular expression to replace currency symbols and commas
	return parseFloat(value.replace(/[^0-9.-]+/g, ""));
}
