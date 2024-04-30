function generatePagination(url, totalItems, itemsPerPage, currentPage) {
	const LAST_PAGE = Math.ceil(totalItems / itemsPerPage);
	const START_PAGE_PADDING = 10;
	const CURRENT_PAGE_PADDING = 5;
	const END_PAGE_PADDING = 3;

	//Generate the pagination container
	var pagination = generatePaginationContainer();

	//First 10 pages links
	for (let i = 1; i <= START_PAGE_PADDING; i++) {
		pagination.querySelector("ul").appendChild(generatePageItem(url, i, currentPage));
	}

	pagination.querySelector("ul").appendChild(generatePageSeparator());

	//Generate the current page padding links
	start = Math.max(11, currentPage - CURRENT_PAGE_PADDING);
	end = Math.min(LAST_PAGE, currentPage + CURRENT_PAGE_PADDING);
	//Generate up to 5 pages before the current page
	for (let i = start; i <= end; i++) {
		pagination.querySelector("ul").appendChild(generatePageItem(url, i, currentPage));
	}

	if (start < end) {
		pagination.querySelector("ul").appendChild(generatePageSeparator());
	}

	//Generate the last
	for (let i = LAST_PAGE - END_PAGE_PADDING; i <= LAST_PAGE; i++) {
		pagination.querySelector("ul").appendChild(generatePageItem(url, i, currentPage));
	}

	return pagination;
}

function generatePageLink(url, pageNo) {
	const regex = /^(.+)(&page=[0-9]+)(.*?)$/gm;
	const result = url.replace(regex, "$1&page=" + pageNo + "$3");
	return result;
}

function generatePageItem(url, pageNo, currentPage) {
	let li = document.createElement("li");
	if (pageNo == currentPage) {
		li.classList.add("a-selected");
	}
	let a = document.createElement("a");
	a.href = generatePageLink(url, pageNo);
	a.innerText = pageNo;
	li.appendChild(a);

	return li;
}

function generatePageSeparator() {
	let li = document.createElement("li");
	li.classList.add("a-disabled");
	li.innerText = "...";

	return li;
}

function generatePaginationContainer() {
	let div = document.createElement("div");
	div.classList.add("a-text-center");
	div.classList.add("topPagination");
	div.role = "navigation";
	div.style.marginTop = "10px;";

	let ul = document.createElement("ul");
	ul.classList.add("a-pagination");
	div.appendChild(ul);

	return div;
}
