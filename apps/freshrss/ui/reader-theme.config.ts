import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: { preserveSymlinks: true },
  build: {
    outDir: "reader-dist",
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      input: "src/reader-theme.ts",
      output: {
        format: "iife",
        entryFileNames: "theme.js",
        assetFileNames: (asset) => {
          if (asset.names.some((name) => name.endsWith(".css"))) return "theme.css";
          return "assets/[name][extname]";
        }
      }
    }
  }
});
