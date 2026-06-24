/** @type {import('eslint').Linter.Config} */
export default [
  {
    ignores: ["dist/", "node_modules/", "data/"],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "no-console": "warn",
      "no-unused-vars": "off", // TypeScript 已处理
      "prefer-const": "error",
    },
  },
];
