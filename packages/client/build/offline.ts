import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const BUILD_MARKER = "__GREED_BUILD_ID__";
const ASSETS_MARKER = "/* __GREED_BUILD_ASSETS__ */ []";
export const PUBLIC_SHELL_FILES = [
  "favicon.svg",
  "icon-maskable.svg",
  "manifest.webmanifest",
  "fonts/fraunces-var-v1.woff2",
  "fonts/nunito-sans-var-v1.woff2",
] as const;

/** Every lazy chunk is available offline, even if its screen was never opened. */
export function renderOfflineWorker(
  template: string,
  files: Iterable<string>,
  html: string,
  publicFiles: ReadonlyMap<string, Uint8Array> = new Map(),
) {
  const assets = [...files]
    .filter((file) => /\.(?:js|css)$/i.test(file))
    .map((file) => `/${file}`)
    .sort();
  // Public files keep stable names, so their bytes also identify the build.
  // Otherwise an icon/font-only deploy would keep the old worker and cache.
  const publicRevisions = [...publicFiles]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, bytes]) => [file, createHash("sha256").update(bytes).digest("hex")]);
  const revision = createHash("sha256")
    .update(JSON.stringify(assets))
    .update(JSON.stringify(publicRevisions))
    .update(html)
    .update(template)
    .digest("hex")
    .slice(0, 16);
  if (!template.includes(BUILD_MARKER) || !template.includes(ASSETS_MARKER)) {
    throw new Error("The service worker is missing its build manifest markers.");
  }
  return {
    assets,
    revision,
    source: template
      .replace(BUILD_MARKER, revision)
      .replace(ASSETS_MARKER, JSON.stringify(assets, null, 2)),
  };
}

/** Runs after Vite writes index.html and copies the public worker template. */
export function offlineShellPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "greed-offline-shell",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle(output, bundle) {
      const directory = output.dir ?? resolve(config.root, config.build.outDir);
      const [template, html] = await Promise.all([
        readFile(resolve(config.publicDir, "sw.js"), "utf8"),
        readFile(resolve(directory, "index.html"), "utf8"),
      ]);
      const publicFiles = new Map(
        await Promise.all(
          PUBLIC_SHELL_FILES.map(
            async (file) => [file, await readFile(resolve(config.publicDir, file))] as const,
          ),
        ),
      );
      const worker = renderOfflineWorker(template, Object.keys(bundle), html, publicFiles);
      await writeFile(resolve(directory, "sw.js"), worker.source);
    },
  };
}
