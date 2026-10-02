import { loadProfile, replaceProfile } from "../game/profile.js";
import { syncProfileUp } from "../net/auth.js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_APPEARANCE,
  profileWithAppearance,
  readAppearance,
  resolveEquippedAppearance,
  writeAppearance,
  type Appearance,
} from "./appearance.js";

const Context = createContext({ appearance: DEFAULT_APPEARANCE, equip: (_a: Appearance) => {} });
export const useAppearance = () => useContext(Context);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(() => {
    try {
      return resolveEquippedAppearance(loadProfile(), readAppearance(sessionStorage));
    } catch {
      return resolveEquippedAppearance(loadProfile());
    }
  });
  useEffect(() => {
    const update = () => setAppearance((a) => resolveEquippedAppearance(loadProfile(), a));
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
    const profile = profileWithAppearance(a, loadProfile());
    if (!profile) return;
    const clean = resolveEquippedAppearance(profile, a);
    setAppearance(clean);
    replaceProfile(profile);
    void syncProfileUp();
    try {
      writeAppearance(sessionStorage, clean);
    } catch {
      /* memory fallback */
    }
  };
  return <Context.Provider value={{ appearance, equip }}>{children}</Context.Provider>;
}
