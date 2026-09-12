import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const uiRoot = fileURLToPath(new URL("../../apps/n8n/ui/", import.meta.url));

function developmentIdentityPlugin(sourceIdentity, backendIdentity) {
  const mode = backendIdentity.startsWith("local candidate ") ? "backend" : "pinned backend";
  const label = `HMR UI · source ${sourceIdentity} · ${mode} ${backendIdentity}`;
  return {
    name: "scholarserver-n8n-development-identity",
    transformIndexHtml() {
      return [
        {
          tag: "style",
          injectTo: "head",
          children:
            ".ss-dev-identity{position:fixed;right:12px;bottom:12px;z-index:10000;max-width:calc(100vw - 24px);padding:6px 9px;border:1px solid #527966;border-radius:6px;background:#f4faf6;color:#17392b;box-shadow:0 2px 8px #17392b2b;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}"
        },
        {
          tag: "aside",
          injectTo: "body-prepend",
          attrs: { class: "ss-dev-identity", "aria-label": "n8n development source identity" },
          children: label
        }
      ];
    }
  };
}

export function createN8nDevelopmentConfig({
  sourceIdentity = "unknown",
  backendIdentity = "package selection unavailable"
} = {}) {
  return {
    root: uiRoot,
    base: "./",
    plugins: [react(), developmentIdentityPlugin(sourceIdentity, backendIdentity)],
    resolve: { preserveSymlinks: true },
    server: {
      host: "127.0.0.1",
      port: 18320,
      strictPort: true,
      cors: false,
      fs: {
        // Keep Vite's defaults when adding app-development secret paths.
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.dev/**", "**/secrets/**", "**/*.token"]
      },
      proxy: {
        "/api": {
          target: "http://127.0.0.1:18321",
          changeOrigin: false
        }
      }
    }
  };
}

export default defineConfig(
  createN8nDevelopmentConfig({
    sourceIdentity: process.env.SCHOLARSERVER_N8N_DEV_SOURCE,
    backendIdentity: process.env.SCHOLARSERVER_N8N_DEV_BACKEND
  })
);
