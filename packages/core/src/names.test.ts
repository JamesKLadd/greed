import { describe, it, expect } from "vitest";
import { cleanPlayerName, hasProfanity, MAX_NAME_LENGTH } from "./names.js";

describe("cleanPlayerName", () => {
  it("passes normal names through, trimmed and whitespace-collapsed", () => {
    expect(cleanPlayerName("  Alex  ")).toBe("Alex");
    expect(cleanPlayerName("Big   Joe")).toBe("Big Joe");
    expect(cleanPlayerName("Player_99")).toBe("Player_99");
  });

  it("caps length", () => {
    const long = "A".repeat(40);
    expect(cleanPlayerName(long).length).toBe(MAX_NAME_LENGTH);
  });

  it("falls back for empty / whitespace names", () => {
    expect(cleanPlayerName("")).toBe("Player");
    expect(cleanPlayerName("   ")).toBe("Player");
    expect(cleanPlayerName("", "Player 3")).toBe("Player 3");
  });

  it("replaces profane names with the fallback", () => {
    for (const bad of [
      "fuck",
      "SHIT",
      "a bitch",
      "asshole99",
      "b!tch",
      "sh1t",
      "f u c k",
      "$hit",
    ]) {
      expect(cleanPlayerName(bad), bad).toBe("Player");
    }
  });

  it("strips special characters, keeping letters, digits, spaces and simple joiners", () => {
    expect(cleanPlayerName("Alex!!!")).toBe("Alex");
    expect(cleanPlayerName("@Alex#99")).toBe("Alex99");
    expect(cleanPlayerName("<script>")).toBe("script");
    expect(cleanPlayerName("Cool😎Guy")).toBe("CoolGuy");
    // Safe joiners survive.
    expect(cleanPlayerName("Anne-Marie")).toBe("Anne-Marie");
    expect(cleanPlayerName("O'Brien")).toBe("O'Brien");
    expect(cleanPlayerName("J.R.")).toBe("J.R.");
  });

  it("keeps accented Latin letters but drops emoji and symbols", () => {
    expect(cleanPlayerName("José")).toBe("José");
    expect(cleanPlayerName("Muñoz")).toBe("Muñoz");
    expect(cleanPlayerName("Zoë")).toBe("Zoë");
  });

  it("falls back when only special characters remain", () => {
    expect(cleanPlayerName("@#%^&")).toBe("Player");
    expect(cleanPlayerName("★☆✦")).toBe("Player");
    expect(cleanPlayerName("💀🔥")).toBe("Player");
  });

  it("folds alternate-font letters so they can't dodge the profanity filter", () => {
    // Mathematical bold fraktur, bold, italic, double-struck, fullwidth, circled.
    for (const bad of ["𝖋𝖆𝖌𝖌𝖔𝖙", "𝐟𝐮𝐜𝐤", "𝘴𝘩𝘪𝘵", "𝕓𝕚𝕥𝕔𝕙", "ｆｕｃｋ", "ⓕⓤⓒⓚ"]) {
      expect(hasProfanity(bad), bad).toBe(true);
      expect(cleanPlayerName(bad), bad).toBe("Player");
    }
  });

  it("folds cross-script homoglyphs (Greek / Cyrillic / IPA look-alikes)", () => {
    for (const bad of ["ϝαɠɠσƚ", "ѕhіt", "а$$"]) {
      expect(hasProfanity(bad), bad).toBe(true);
    }
    expect(cleanPlayerName("ϝαɠɠσƚ")).toBe("Player");
  });

  it("rejects names that MIX scripts, which is what spoofing needs", () => {
    // A slur assembled out of borrowed look-alikes always reaches into more
    // than one alphabet: that is the tell, not the alphabet itself.
    for (const bad of [
      "f卂وgᗝT", // Latin + Han + Arabic + Canadian syllabics
      "Аlех", // Cyrillic А and е hiding among Latin letters
      "ѕhіt", // Cyrillic ѕ and і
      "Мoscow", // one Cyrillic М, the rest Latin
    ]) {
      expect(cleanPlayerName(bad), bad).toBe("Player");
    }
  });

  it("lets a player use their own name, whatever alphabet it is in", () => {
    // This used to reject every non-Latin letter outright, so anyone whose name
    // is not written in Latin script was renamed "Player" — which caught the
    // spoofing and a great many real people with it.
    for (const good of ["大和", "Даша", "李明", "Δήμητρα", "지민", "שרה", "आर्या", "สมชาย"]) {
      expect(cleanPlayerName(good), good).toBe(good);
    }
    // And an alphabet the game does not know is still refused, rather than
    // arriving stripped down to nothing.
    expect(cleanPlayerName("ᗝᐁᒐ")).toBe("Player");
  });

  it("folds accented letters when screening (shít -> shit)", () => {
    expect(hasProfanity("shít")).toBe(true);
    expect(hasProfanity("bìtch")).toBe(true);
  });

  it("normalises fancy-font names to plain letters", () => {
    expect(cleanPlayerName("𝔸𝕝𝕖𝕩")).toBe("Alex");
    expect(cleanPlayerName("Ｃｏｏｌ")).toBe("Cool");
    expect(cleanPlayerName("𝓙𝓸𝓼𝓮")).toBe("Jose");
  });

  it("catches leet-speak and repeated-letter obfuscation", () => {
    expect(hasProfanity("fuuuuck")).toBe(true);
    expect(hasProfanity("sh1tter")).toBe(true);
    expect(hasProfanity("b i t c h")).toBe(true);
  });

  it("blocks short ambiguous roots only as whole words (no Scunthorpe)", () => {
    // whole-word hits
    expect(hasProfanity("ass")).toBe(true);
    expect(hasProfanity("a$$")).toBe(true);
    // innocent words that merely contain a short root must pass
    for (const ok of ["assassin", "bass", "Cockburn", "Cumberland", "Dickinson", "grape"]) {
      expect(hasProfanity(ok), ok).toBe(false);
      expect(cleanPlayerName(ok), ok).toBe(ok.slice(0, MAX_NAME_LENGTH));
    }
  });
});
