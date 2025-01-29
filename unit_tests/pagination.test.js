import { Pagination } from "../scripts/Pagination.js";
const pagination = new Pagination();

var buffer = "";
pagination.setContainerGeneratorMethod(() => {
	buffer = "";
});
pagination.setPageGeneratorMethod((url, pageNo, currentPage) => {
	if (pageNo == currentPage) {
		return "[" + pageNo + "]";
	}
	return pageNo;
});
pagination.setSeparatorGeneratorMethod(() => {
	return "...";
});
pagination.setAddElementMethod((container, element) => {
	buffer += element;
});

test("Pagination - 10 items, 50 items per page, current page 1", () => {
	pagination.generatePagination("", 10, 50, 1);
	expect(buffer).toBe("[1]");
});

test("Pagination - 10 items, 50 items per page, current page 2", () => {
	pagination.generatePagination("", 10, 50, 2);
	expect(buffer).toBe("1");
});

test("Pagination - 51 items, 50 items per page, current page 1", () => {
	pagination.generatePagination("", 51, 50, 1);
	expect(buffer).toBe("[1]2");
});

test("Pagination - 51 items, 50 items per page, current page 2", () => {
	pagination.generatePagination("", 51, 50, 2);
	expect(buffer).toBe("1[2]");
});

test("Pagination - 99 items, 50 items per page, current page 1", () => {
	pagination.generatePagination("", 99, 50, 1);
	expect(buffer).toBe("[1]2");
});

test("Pagination - 99 items, 50 items per page, current page 2", () => {
	pagination.generatePagination("", 99, 50, 2);
	expect(buffer).toBe("1[2]");
});

test("Pagination - 99 items, 50 items per page, current page 3", () => {
	pagination.generatePagination("", 99, 50, 3);
	expect(buffer).toBe("12");
});

test("Pagination - 99 items, 10 items per page, current page 9", () => {
	pagination.generatePagination("", 99, 10, 9);
	expect(buffer).toBe("1...678[9]10");
});
test("Pagination - 100 items, 10 items per page, current page 9", () => {
	pagination.generatePagination("", 100, 10, 9);
	expect(buffer).toBe("1...678[9]10");
});
test("Pagination - 101 items, 10 items per page, current page 9", () => {
	pagination.generatePagination("", 101, 10, 9);
	expect(buffer).toBe("1...678[9]1011");
});
test("Pagination - 100 items, 5 items per page, current page 9", () => {
	pagination.generatePagination("", 100, 5, 9);
	expect(buffer).toBe("1...678[9]101112...20");
});
