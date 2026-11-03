import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/dist/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    "**/*.tsbuildinfo",
    ".agents/**",
    ".codex/**",
    ".claude/**",
    ".migration-backups/**",
    "supabase/.temp/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { "no-empty": ["error", { allowEmptyCatch: true }] },
  },
  {
    files: ["apps/**/*.{js,mjs,jsx,ts,tsx}", "packages/{ui,i18n}/**/*.{ts,tsx}"],
    extends: [nextVitals],
    settings: { next: { rootDir: ["apps/web/", "apps/auth/"] } },
    // Adopt effect refactoring incrementally in the existing React code.
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // Existing code can migrate incrementally; TypeScript still checks types.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Formatting is owned by Prettier, not ESLint.
  prettier,
]);
