// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url"; // <--- CORRECTED LINE HERE
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/app/ludo/page.tsx"], // Apply these overrides only to page.tsx
    rules: {
      "prefer-const": "warn",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
];

export default eslintConfig;