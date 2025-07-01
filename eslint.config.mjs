import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all,
});

// Filter out globals with leading/trailing whitespace
const cleanGlobals = (globalsObj) => {
	const cleaned = {};
	for (const [key, value] of Object.entries(globalsObj)) {
		const cleanKey = key.trim();
		if (cleanKey && cleanKey === key) {
			cleaned[cleanKey] = value;
		}
	}
	return cleaned;
};

export default [
	{
		...compat.extends("eslint:recommended", "prettier")[0],

		languageOptions: {
			globals: {
				...cleanGlobals(globals.browser),
				...cleanGlobals(globals.node),
			},

			ecmaVersion: 2022,
			sourceType: "module",
		},

		rules: {
			"no-console": "warn",
			"no-undef": "warn",
			"no-unsafe-finally": "warn",
			"no-unused-vars": "warn",
		},
	},
];
