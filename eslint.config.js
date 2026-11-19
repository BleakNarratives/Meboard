import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
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
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  /*
   * Vendored shadcn primitives.
   *
   * These were copied from shadcn and are not hand-maintained, and several of
   * them predate the React Compiler lint rules these configs enable: the
   * carousel calls `onSelect` from an effect, the sidebar picks a random
   * skeleton width during render. "Fixing" either one means forking the
   * component and owning it forever, which is a worse trade than not applying
   * rules they were never written against.
   *
   * The scope is deliberately narrow: `src/components/ui/**` only. App code in
   * `src/components/*.tsx` stays under the full ruleset, because that is code
   * we actually wrote and can fix.
   */
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: Object.fromEntries(
      // Only the React Compiler rules. `rules-of-hooks` and
      // `exhaustive-deps` are deliberately absent: a hook called
      // conditionally, or a missing dependency, is a real bug in vendored code
      // too, and the fix is a one-line call site rather than a fork.
      [
        "component-hook-factories",
        "error-boundaries",
        "globals",
        "immutability",
        "incompatible-library",
        "preserve-manual-memoization",
        "purity",
        "refs",
        "set-state-in-effect",
        "set-state-in-render",
        "static-components",
        "unsupported-syntax",
        "use-memo",
      ]
        // Guard against a rule name that this version of the plugin does not
        // define, which would otherwise be a config error that breaks lint
        // entirely rather than just one file.
        .filter((rule) => rule in (reactHooks.rules ?? {}))
        .map((rule) => [`react-hooks/${rule}`, "off"]),
    ),
  },
);
