import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

export default [
  { files: ["**/*.{js,mjs,cjs,jsx}"] },
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser globals
        document: true,
        window: true,
        fetch: true,
        AbortController: true,
        URL: true,
        setTimeout: true,
        clearTimeout: true,

        // CRA/webpack-style env access
        process: true,

        // Tests
        test: true,
        expect: true,
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "React|App" }],
    },
  },
  pluginJs.configs.recommended,
  {
    plugins: { react: pluginReact, "react-hooks": pluginReactHooks },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/jsx-uses-vars": "error",

      // Keep enabled by default; individual files may still opt out with eslint-disable.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
