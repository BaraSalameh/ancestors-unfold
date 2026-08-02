import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/**", "@/components/**"],
              message: "Legacy paths were removed; import a feature public API or shared module.",
            },
            {
              group: [
                "@/features/*/**",
                "!@/features/*/client",
                "!@/features/*/domain",
                "!@/features/*/server",
              ],
              message: "Cross-feature consumers must import the feature public entrypoint.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/features/**/*.{ts,tsx}",
      "src/server/**/*.{ts,tsx}",
      "src/shared/**/*.{ts,tsx}",
    ],
    ignores: ["src/routeTree.gen.ts", "src/locales/**", "src/shared/ui/**"],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 120, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 15],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}"],
    ignores: ["src/features/*/server/**", "src/shared/server/**", "src/shared/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/**", "@/components/**"],
              message: "Legacy paths were removed; import a feature public API or shared module.",
            },
            {
              group: [
                "@/features/*/**",
                "!@/features/*/client",
                "!@/features/*/domain",
                "!@/features/*/server",
              ],
              message:
                "Use relative imports inside a feature and public entrypoints across features.",
            },
            {
              group: [
                "@/server/*",
                "@/server/**",
                "@/features/*/server",
                "../../server/*",
                "../../server/**",
              ],
              message: "Browser features must not import server modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/app/server/**/*.{ts,tsx}",
      "src/features/*/server/**/*.{ts,tsx}",
      "src/shared/server/**/*.{ts,tsx}",
      "src/server/http/**/*.{ts,tsx}",
      "src/server/modules/**/*.{ts,tsx}",
      "src/server/infrastructure/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**", "@/routes/**"],
              message: "Server modules must not depend on browser composition or route modules.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
