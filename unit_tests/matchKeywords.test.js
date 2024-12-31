import { keywordMatch } from "../scripts/service_worker/keywordMatch.js";

test("match array of string", () => {
	const arrKWs = ["aaa", "bbb", "ccc"];
	expect(keywordMatch(arrKWs, "bbb")).toBe("bbb");
});
