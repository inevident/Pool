import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "artifacts/**",
    "cache/**",
    "ignition/deployments/**",
    "next-env.d.ts",
    // The browser extension is a standalone MV3 bundle with its own runtime
    // (chrome.*, service worker, content scripts) — not part of the Next app.
    "extension/**",
  ]),
]);

export default eslintConfig;
