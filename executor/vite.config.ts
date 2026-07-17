import { defineConfig } from "vitest/config";

// Single-file IIFE executor bundle, emitted to the repo root as
// ../passkey-executor.js (same layout as near-connect/near-wallets).
export default defineConfig({
  root: "./",
  build: {
    emptyOutDir: false,
    outDir: "..",
    minify: true,
    rollupOptions: {
      input: {
        main: "./src/index.ts",
      },
      output: {
        entryFileNames: "passkey-executor.js",
        assetFileNames: "passkey-executor.js",
        format: "iife",
        inlineDynamicImports: false,
        manualChunks: undefined,
      },
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
