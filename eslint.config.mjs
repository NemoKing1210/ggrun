import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["lib/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next/*", "react", "drizzle-orm", "pg"], message: "Domain (lib/engine) must not import framework/DB — keep it pure." },
            { group: ["@/lib/infrastructure/*", "@/lib/repositories/*"], message: "Domain must not import infrastructure." },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/shared/**/*.ts", "lib/shared/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/infrastructure/*", "@/lib/repositories/*", "@/lib/use-cases/*"], message: "Shared must not import app/infrastructure — keep it leaf." },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/catalog/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next/*", "@/app/*"], message: "Catalog should not import app layer." },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
