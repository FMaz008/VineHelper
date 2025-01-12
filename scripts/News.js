import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
const Settings = new SettingsMgr();

import { UnixTimeStampToDate } from "./DateHelper.js";

import { Template } from "./Template.js";
var Tpl = new Template();

export class News {
	#localNewsData = [];
	#data = [];
	#newsContainer = null;

	constructor(data) {
		if (!Array.isArray(data) || data.length <= 0) {
			return false;
		}

		this.#data = data;

		this.#createInterface();
	}

	async #loadLocalReadNewsData() {
		const localNewsData = await chrome.storage.local.get("readnews");
		this.#localNewsData = localNewsData.readnews || [];
	}

	async #createInterface() {
		//Load the local news data
		await this.#loadLocalReadNewsData();

		//If everything is read, check if HideNoNews is enabled
		if (!this.#isUnreadNews(this.#data) && Settings.get("general.hideNoNews")) {
			return false;
		}

		this.#createBasicElement();
		this.#loadNewsFeed();
	}

	async #createBasicElement() {
		//Add a news icon
		const iconTpl = await Tpl.loadFile("view/news.html");
		Tpl.setIf("isUnread", this.#isUnreadNews());
		const iconContent = Tpl.render(iconTpl, true);
		document.body.appendChild(iconContent);

		document.querySelector("#vh-news-icon").addEventListener("click", () => {
			//Toggle the news container display
			const newsContainer = document.querySelector("#vh-news-container");
			newsContainer.style.display = newsContainer.style.display == "block" ? "none" : "block";
		});

		//Create a container for the news
		this.#newsContainer = document.createElement("div");
		this.#newsContainer.id = "vh-news-container";
		this.#newsContainer.style.display = "none";
		document.body.appendChild(this.#newsContainer);
	}

	async #loadNewsFeed() {
		this.#data.forEach(async (news) => {
			const newsTpl = await Tpl.loadFile("view/news_container.html");
			Tpl.setVar("date", UnixTimeStampToDate(news.date));
			Tpl.setVar("title", news.title);
			Tpl.setVar("content", news.content.replaceAll("\n", "<br />"));
			Tpl.setVar("isUnread", !this.#isNewsRead(news.id));
			const newsContent = Tpl.render(newsTpl, news);
			this.#newsContainer.appendChild(newsContent);

			//Click handler to deploy the news
			newsContent.querySelector(".vh-news-title").addEventListener("click", () => {
				//Toggle the news content display
				const newsContainer = newsContent.querySelector(".vh-news-content");
				newsContainer.style.display = newsContainer.style.display == "block" ? "none" : "block";
			});

			//Click handler to mark the news as read
			newsContent.querySelector(".vh-news-mark-as-read").addEventListener("click", () => {
				newsContent.querySelector(".vh-news-content").style.display = "none";
				const unreadIcon = newsContent.querySelector(".vh-news-icon-new");
				if (unreadIcon) {
					unreadIcon.style.display = "none";
				}
				this.#markNewsAsRead(news.id);
			});
		});
	}

	#isNewsRead(newsId) {
		return this.#localNewsData.includes(newsId);
	}

	#markNewsAsRead(newsId) {
		//Check if the news is already in the local news data
		if (!this.#localNewsData.includes(newsId)) {
			this.#localNewsData.push(newsId);
			chrome.storage.local.set({ readnews: this.#localNewsData });
		}
	}

	#isUnreadNews() {
		return this.#data.some((news) => !this.#isNewsRead(news.id));
	}
}
