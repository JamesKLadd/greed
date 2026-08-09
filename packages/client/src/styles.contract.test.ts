import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DICE_SKINS, TABLE_THEMES } from "./game/cosmetics.js";

/**
 * Contract tests for the cosmetics ↔ CSS coupling.
 *
 * The 11 cosmetic custom properties are effectively a public API: `cosmetics.ts`
 * supplies them as INLINE styles (via `cosmeticVars`/`diceVarsById`) and the
 * stylesheet consumes them. Nothing else in the repo can catch a mismatch —
 * vitest runs in a node environment, so no component ever renders in a test.
 * These regex-level assertions are the only machine-checkable guard we have, so
 * they protect the highest-risk coupling during the UI overhaul.
 */

const CSS_PATH = fileURLToPath(new URL("./styles.css", import.meta.url));

/** The stylesheet, plus any files it @imports (kept flat and relative). */
function readStyles(): string {
  const root = readFileSync(CSS_PATH, "utf8");
  const imports = [...root.matchAll(/@import\s+["']([^"']+)["']/g)].map((m) => m[1]);
  if (imports.length === 0) return root;
  return imports
    .map((rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"))
    .join("\n");
}

const DIE_VARS = [
  "--die-c1",
  "--die-c2",
  "--die-c3",
  "--die-pip",
  "--die-pip2",
  "--die-lip",
] as const;

const TABLE_VARS = ["--felt-1", "--felt-2", "--felt-edge", "--rail-1", "--rail-2"] as const;

/** Colors are written inconsistently (`rgba(1, 2, 3, 0.4)` vs `rgba(1,2,3,.4)`). */
function normalizeColor(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "").replace(/0\./g, ".");
}

/**
 * Every `var(--name, fallback)` use in the sheet. A regex can't do this alone —
 * fallbacks contain nested parens (`rgba(...)`) — so scan with a depth counter.
 */
function varUsesWithFallback(css: string): { name: string; fallback: string }[] {
  const out: { name: string; fallback: string }[] = [];
  const start = /var\(\s*(--[a-z0-9-]+)\s*,/gi;
  for (let m = start.exec(css); m; m = start.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "(") depth++;
      else if (css[i] === ")") depth--;
    }
    out.push({ name: m[1].toLowerCase(), fallback: css.slice(m.index + m[0].length, i - 1) });
  }
  return out;
}

describe("cosmetics shape", () => {
  it("every dice skin defines exactly the six die vars", () => {
    for (const skin of DICE_SKINS) {
      expect(Object.keys(skin.vars).sort(), `dice skin "${skin.id}"`).toEqual([...DIE_VARS].sort());
    }
  });

  it("every table theme defines exactly the five table vars", () => {
    for (const theme of TABLE_THEMES) {
      expect(Object.keys(theme.vars).sort(), `table theme "${theme.id}"`).toEqual(
        [...TABLE_VARS].sort(),
      );
    }
  });

  it("cosmetic ids are unique within each kind", () => {
    const diceIds = DICE_SKINS.map((c) => c.id);
    const tableIds = TABLE_THEMES.map((c) => c.id);
    expect(new Set(diceIds).size).toBe(diceIds.length);
    expect(new Set(tableIds).size).toBe(tableIds.length);
  });

  it("the first entry of each kind is the always-unlocked default", () => {
    // cosmeticVars() falls back to index 0 for locked items, so it must be free.
    expect(DICE_SKINS[0].unlock).toBeUndefined();
    expect(TABLE_THEMES[0].unlock).toBeUndefined();
  });
});

describe("stylesheet ↔ cosmetics contract", () => {
  const css = readStyles();
  const known = new Set<string>([...DIE_VARS, ...TABLE_VARS]);

  it("references no unknown --die/--felt/--rail custom property", () => {
    const referenced = [...css.matchAll(/var\(\s*(--(?:die|felt|rail)[a-z0-9-]*)/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(referenced.length).toBeGreaterThan(0); // guard against a broken regex
    for (const name of new Set(referenced)) {
      expect(known.has(name), `unknown cosmetic var ${name} used in CSS`).toBe(true);
    }
  });

  it("every cosmetic var is resolvable (a :root default, or a fallback at each use)", () => {
    // A bare var() with no :root default renders as nothing when the inline
    // cosmetic styles are absent — e.g. a die shown outside the themed `.game`
    // subtree. Either mechanism is fine; having neither is a latent bug.
    const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    for (const name of known) {
      const hasRootDefault = new RegExp(`^\\s*${name}\\s*:`, "m").test(rootBlock);
      if (hasRootDefault) continue;
      const bareUse = new RegExp(`var\\(\\s*${name}\\s*\\)`).test(css);
      expect(
        bareUse,
        `${name} has no :root default, so every use needs a fallback (found a bare var(${name}))`,
      ).toBe(false);
    }
  });

  it("fallback literals match the default cosmetic values", () => {
    // Until the vars get :root defaults, the ivory/classic values are duplicated
    // as inline fallbacks. Any drift silently changes how unthemed dice render.
    const defaults: Record<string, string> = { ...DICE_SKINS[0].vars, ...TABLE_THEMES[0].vars };
    for (const { name, fallback } of varUsesWithFallback(css)) {
      const expected = defaults[name];
      if (!expected) continue;
      expect(normalizeColor(fallback), `fallback for ${name} drifted from cosmetics.ts`).toBe(
        normalizeColor(expected),
      );
    }
  });
});
