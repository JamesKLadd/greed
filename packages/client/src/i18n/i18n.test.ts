import { describe, expect, it } from "vitest";
import { catalogs, en, es, fr, LOCALES, type Locale } from "./catalog.js";
import { translate } from "./translate.js";

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
