import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  {
    rules: {
      // Allows `const { removed, ...rest } = object`
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
];
