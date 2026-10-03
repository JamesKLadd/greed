/*
 * Keep the desktop and web app icons aligned with src/beta/Brand.tsx.
 * `npm run desktop:icon` also regenerates every platform icon format.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const desktop = join(root, "packages/client/src-tauri");
const web = join(root, "packages/client/public");
const background = "#10221e";
const gold = "#ffd783";

// Exact path, die and pip geometry from the main-menu mark.
const mark = `    <path d="M50 3 97 50 50 97 3 50 32 21" fill="none" stroke="${gold}" stroke-width="3" />
    <rect x="23" y="23" width="54" height="54" rx="13" fill="${gold}" />
    <g fill="${background}">
${[
  [35, 35],
  [65, 35],
  [50, 50],
  [35, 65],
  [65, 65],
]
  .map(([x, y]) => `      <circle cx="${x}" cy="${y}" r="5" />`)
  .join("\n")}
    </g>`;

function icon(scale) {
  const inset = (100 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${background}" />
  <g transform="translate(${inset} ${inset}) scale(${scale})">
${mark}
  </g>
</svg>
`;
}

const source = join(desktop, "icon-source.svg");
writeFileSync(source, icon(0.84));
writeFileSync(join(web, "favicon.svg"), icon(0.84));
// All foreground content fits inside the central 80% maskable safe circle.
writeFileSync(join(web, "icon-maskable.svg"), icon(0.7));

// Use Tauri's SVG renderer for antialiasing rather than a second drawing engine.
const temporary = mkdtempSync(join(tmpdir(), "greed-icon-"));
try {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/@tauri-apps/cli/tauri.js"),
      "icon",
      source,
      "--output",
      temporary,
      "--png",
      "1024",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Tauri icon generation failed (${result.status})`);
  copyFileSync(join(temporary, "1024x1024.png"), join(desktop, "icon-source.png"));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log("Updated Greed desktop and web icon sources.");
