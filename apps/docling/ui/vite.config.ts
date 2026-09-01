import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { preserveSymlinks: true },
  build: { outDir: "dist", emptyOutDir: true }
});
