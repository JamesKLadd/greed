import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { offlineShellPlugin } from "./build/offline.js";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

const coreSrc = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));
const botsSrc = fileURLToPath(new URL("../bots/src/index.ts", import.meta.url));
const protocolSrc = fileURLToPath(new URL("../protocol/src/index.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), offlineShellPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@greed/core": coreSrc,
      "@greed/bots": botsSrc,
      "@greed/protocol": protocolSrc,
    },
  },
  optimizeDeps: {
    exclude: ["@greed/core", "@greed/bots", "@greed/protocol"],
  },
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL("./index.html", import.meta.url)),
        welcome: fileURLToPath(new URL("./welcome/index.html", import.meta.url)),
        privacy: fileURLToPath(new URL("./privacy/index.html", import.meta.url)),
      },
    },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
