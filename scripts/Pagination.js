class Pagination {
	#container = "";
	#separator = "";
	#page = "";
	#addElement = "";
	#startPagePadding = 1;

	constructor() {
		this.#container = this.generatePaginationContainer;
		this.#separator = this.generatePageSeparator;
		this.#page = this.generatePageItem;
		this.#addElement = this.addElement;
	}

	setContainerGeneratorMethod(method) {
		this.#container = method;
	}

	setSeparatorGeneratorMethod(method) {
		this.#separator = method;
	}

	setPageGeneratorMethod(method) {
		this.#page = method;
	}

	setAddElementMethod(method) {
		this.#addElement = method;
	}

	setStartPagePadding(value) {
		this.#startPagePadding = value;
	}

	generatePagination(url, totalItems, itemsPerPage, currentPage, showPreviousAndNext = false) {
		const LAST_PAGE = Math.ceil(totalItems / itemsPerPage);
		const START_PAGE_PADDING = this.#startPagePadding;
		const CURRENT_PAGE_PADDING = 3;
		const END_PAGE_PADDING = 0;

		//Generate the pagination container
		var pagination = this.#container();

		if (showPreviousAndNext && currentPage > 1) {
			this.#addElement(pagination, this.#page(url, currentPage - 1, currentPage, "Prev."));
		}

		//First "10" pages links
		for (let i = 1; i <= START_PAGE_PADDING && i <= LAST_PAGE; i++) {
			this.#addElement(pagination, this.#page(url, i, currentPage));
		}

		//Generate the current page padding links
		const start = Math.max(START_PAGE_PADDING + 1, currentPage - CURRENT_PAGE_PADDING);
		const end = Math.min(LAST_PAGE - END_PAGE_PADDING - 1, currentPage + CURRENT_PAGE_PADDING);

		//Add a ... separator if there is a gap between the beginning of the current range and
		//the end of the start page padding.
		if (start > START_PAGE_PADDING + 1) {
			this.#addElement(pagination, this.#separator());
		}

		//Generate the padding pages before and after the current page.
		for (let i = start; i <= end; i++) {
			this.#addElement(pagination, this.#page(url, i, currentPage));
		}

		//Add ... separator if there is a gap between the end of the current range and
		//the beginning of the end page padding.
		if (end < LAST_PAGE - END_PAGE_PADDING - 1) {
			this.#addElement(pagination, this.#separator());
		}

		//Generate the last
		if (LAST_PAGE > 1) {
			for (let i = LAST_PAGE - END_PAGE_PADDING; i <= LAST_PAGE; i++) {
				this.#addElement(pagination, this.#page(url, i, currentPage));
			}
		}

		if (showPreviousAndNext && currentPage < LAST_PAGE) {
			this.#addElement(pagination, this.#page(url, currentPage + 1, currentPage, "Next"));
		}

		return pagination;
	}

	generatePageLink(url, pageNo) {
		if (url.includes("&page=")) {
			const regex = /^(.+)(&page=[0-9]+)(.*?)$/gm;
			const result = url.replace(regex, "$1&page=" + pageNo + "$3");
			return result;
		} else {
			//No replacement took place because &page was not part of the url
			return url + "&page=" + pageNo;
		}
	}

	generatePageItem(url, pageNo, currentPage, caption = null) {
		let li = document.createElement("li");
		if (pageNo == currentPage) {
			li.classList.add("a-selected");
		}
		let a = document.createElement("a");
		a.href = this.generatePageLink(url, pageNo);
		a.innerText = caption ? caption : pageNo;
		li.appendChild(a);

		return li;
	}

	generatePageSeparator() {
		let li = document.createElement("li");
		li.classList.add("a-disabled");
		li.innerText = "...";

		return li;
	}

	generatePaginationContainer() {
		let div = document.createElement("div");
		div.classList.add("a-text-center");
		div.classList.add("topPaginationVerbose");
		div.role = "navigation";
		div.style.marginTop = "10px;";

		let ul = document.createElement("ul");
		ul.classList.add("a-pagination");
		div.appendChild(ul);

		return div;
	}

	addElement(container, element) {
		container.querySelector("ul").appendChild(element);
	}
}
export { Pagination };
