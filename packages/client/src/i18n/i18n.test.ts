import { describe, expect, it } from "vitest";
import { en, es } from "./catalog.js";
import { translate } from "./translate.js";

describe("catalog", () => {
  it("every English key has a Spanish translation", () => {
    for (const key of Object.keys(en)) {
      expect(es[key as keyof typeof en], `missing es for ${key}`).toBeTruthy();
    }
  });
});

describe("translate", () => {
  it("returns the localized string", () => {
    expect(translate("en", "controls.bank")).toBe("Bank");
    expect(translate("es", "controls.bank")).toBe("Guardar");
  });

  it("interpolates named params", () => {
    expect(translate("en", "controls.banked", { name: "You", points: 300 })).toBe(
      "You banked 300.",
    );
    expect(translate("es", "controls.banked", { name: "Tú", points: 300 })).toBe("Tú guardó 300.");
  });

  it("leaves unknown placeholders intact", () => {
    expect(translate("en", "controls.waiting", {})).toBe("Waiting for {name}…");
  });
});
