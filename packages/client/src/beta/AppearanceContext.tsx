import { loadProfile, replaceProfile } from "../game/profile.js";
import { syncProfileUp } from "../net/auth.js";
import { cleanBetaIdentity } from "@greed/protocol";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  readAppearance,
  writeAppearance,
  type Appearance,
} from "./appearance.js";

const Context = createContext({ appearance: DEFAULT_APPEARANCE, equip: (_a: Appearance) => {} });
export const useAppearance = () => useContext(Context);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(() => {
    try {
      return { ...readAppearance(sessionStorage), ...loadProfile().visualBeta };
    } catch {
      return DEFAULT_APPEARANCE;
    }
  });
  useEffect(() => {
    const update = () => setAppearance((a) => ({ ...a, ...loadProfile().visualBeta }));
    const reset = () => {
      setAppearance(DEFAULT_APPEARANCE);
      try {
        writeAppearance(sessionStorage, DEFAULT_APPEARANCE);
      } catch {
        /* memory fallback */
      }
    };
    window.addEventListener("greed:profile-changed", update);
    window.addEventListener("greed:profile-reset", reset);
    return () => {
      window.removeEventListener("greed:profile-changed", update);
      window.removeEventListener("greed:profile-reset", reset);
    };
  }, []);
  const equip = (a: Appearance) => {
    const clean = normalizeAppearance(a);
    setAppearance(clean);
    const profile = loadProfile();
    replaceProfile({ ...profile, visualBeta: cleanBetaIdentity(clean) });
    void syncProfileUp();
    try {
      writeAppearance(sessionStorage, clean);
    } catch {
      /* memory fallback */
    }
  };
  return <Context.Provider value={{ appearance, equip }}>{children}</Context.Provider>;
}
