import { describe, expect, it } from "vitest";
import { catalogs, en, es, fr, LOCALES, type Locale } from "./catalog.js";
import { loadLocale } from "./i18n.js";
import { translate } from "./translate.js";
import { DICE_SKINS, TABLE_THEMES } from "../game/cosmetics.js";
import { AVATARS } from "../game/avatars.js";
import { ACHIEVEMENTS } from "../game/profile.js";

/** Every `{param}` a string expects, so two locales can be compared. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("catalog", () => {
  it("every English key has a translation in every locale", () => {
    for (const [code, catalog] of Object.entries(catalogs)) {
      for (const key of Object.keys(en)) {
        expect(catalog[key as keyof typeof en], `missing ${code} for ${key}`).toBeTruthy();
      }
    }
  });

  it("registers every catalog in the language switcher", () => {
    // A locale that exists but isn't listed is unreachable from Settings.
    const listed = LOCALES.map((l) => l.code).sort();
    expect(listed).toEqual((Object.keys(catalogs) as Locale[]).sort());
  });

  it("keeps the same placeholders in every locale", () => {
    // A dropped {name} is invisible to the type system and silently renders a
    // sentence with a hole in it — this is the only thing that catches it.
    for (const [code, catalog] of Object.entries(catalogs)) {
      for (const [key, value] of Object.entries(en)) {
        expect(
          placeholders(catalog[key as keyof typeof en]),
          `${code} placeholders drifted for ${key}`,
        ).toEqual(placeholders(value));
      }
    }
  });

  it("has no untranslated leftovers where the languages should differ", () => {
    // Not every string SHOULD change (proper nouns, "Menu", "Bronze"), so this
    // only asserts the bulk of the catalog actually got translated.
    for (const [code, catalog] of [
      ["es", es],
      ["fr", fr],
    ] as const) {
      const identical = Object.keys(en).filter(
        (k) => catalog[k as keyof typeof en] === en[k as keyof typeof en],
      );
      expect(identical.length, `${code} has ${identical.length} untranslated strings`).toBeLessThan(
        40,
      );
    }
  });
});

/**
 * Keys built from an id at the call site, which the type system cannot see.
 *
 * The locker asks for `cosmetic.${c.id}.name` and the stats grid for
 * `ach.${a.id}.title`, both through an `as MsgKey` cast — so adding an item to
 * one of these lists and forgetting the catalog compiles, passes every other
 * test, and ships a locker that reads "cosmetic.sunrise.name". Which is exactly
 * what happened, twice over, the day the streak rewards went in.
 *
 * Only `en` is checked: the catalog test above already holds every locale to
 * the same keys.
 */
describe("keys built from ids", () => {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(en, key);

  it("names every cosmetic, and says how each locked one is earned", () => {
    for (const c of [...DICE_SKINS, ...TABLE_THEMES]) {
      expect(has(`cosmetic.${c.id}.name`), `cosmetic.${c.id}.name`).toBe(true);
      if (c.unlock) expect(has(`cosmetic.${c.id}.req`), `cosmetic.${c.id}.req`).toBe(true);
    }
  });

  it("names every avatar, and says how each locked one is earned", () => {
    for (const a of AVATARS) {
      expect(has(`cosmetic.${a.id}.name`), `cosmetic.${a.id}.name`).toBe(true);
      if (a.unlock) expect(has(`cosmetic.${a.id}.req`), `cosmetic.${a.id}.req`).toBe(true);
    }
  });

  it("titles and describes every achievement", () => {
    for (const a of ACHIEVEMENTS) {
      expect(has(`ach.${a.id}.title`), `ach.${a.id}.title`).toBe(true);
      expect(has(`ach.${a.id}.desc`), `ach.${a.id}.desc`).toBe(true);
    }
  });
});

describe("translate", () => {
  it("returns the localized string", () => {
    expect(translate("en", "controls.bank")).toBe("Bank");
    expect(translate("es", "controls.bank")).toBe("Guardar");
    expect(translate("fr", "controls.bank")).toBe("Encaisser");
  });

  it("interpolates named params", () => {
    expect(translate("en", "controls.banked", { name: "You", points: 300 })).toBe(
      "You banked 300.",
    );
    expect(translate("es", "controls.banked", { name: "Tú", points: 300 })).toBe("Tú guardó 300.");
    expect(translate("fr", "controls.banked", { name: "Vous", points: 300 })).toBe(
      "Vous a encaissé 300.",
    );
  });

  it("leaves unknown placeholders intact", () => {
    expect(translate("en", "controls.waiting", {})).toBe("Waiting for {name}…");
  });
});

describe("the saved language", () => {
  /** A localStorage stub, since vitest runs these in node. */
  function withStored(value: string | null, run: () => void) {
    const store = new Map<string, string>();
    if (value !== null) store.set("greed:locale", value);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    try {
      run();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }

  it("restores every language the switcher offers", () => {
    // The bug this guards: the check was `=== "es" ? "es" : "en"`, so French
    // could be chosen in Settings and applied live, but a reload silently put
    // the player back into English. Driven off LOCALES so a fourth language
    // cannot reintroduce it.
    for (const { code } of LOCALES) {
      withStored(code, () => expect(loadLocale(), code).toBe(code));
    }
  });

  it("falls back to English for nothing saved, or nonsense", () => {
    withStored(null, () => expect(loadLocale()).toBe("en"));
    withStored("kl", () => expect(loadLocale()).toBe("en"));
    withStored("constructor", () => expect(loadLocale()).toBe("en"));
  });
});
