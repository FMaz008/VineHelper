import { defineConfig, globalIgnores } from "eslint/config";
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
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores(["**/scripts/vendor/**/*"]), {
    extends: compat.extends("eslint:recommended", "prettier"),

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
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
}, {
    files: ["**/*.test.js", "**/tests/**/*.js", "**/unit_tests/**/*.js"],

    languageOptions: {
        globals: {
            ...globals.jest,
        },
    },
}, {
    files: ["**/scripts/vendor/**/*.js"],

    rules: {
        "no-console": "off",
        "no-undef": "off",
        "no-unsafe-finally": "off",
        "no-unused-vars": "off",
        "no-self-assign": "off",
        "no-empty": "off",
        "no-fallthrough": "off",
    },
}]);