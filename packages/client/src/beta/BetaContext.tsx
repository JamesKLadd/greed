import { createContext, useContext, useState, type ReactNode } from "react";
import { readBetaSession, writeBetaSession } from "./access.js";
import { AppearanceProvider } from "./AppearanceContext.js";

const BetaContext = createContext({ enabled: false, setEnabled: (_on: boolean) => {} });
export const BetaActiveContext = createContext(false);
export const useBeta = () => useContext(BetaContext);
export const useBetaActive = () => useContext(BetaActiveContext);

export function BetaProvider({ children }: { children: ReactNode }) {
  const [enabled, update] = useState(() => {
    try {
      return readBetaSession(sessionStorage);
    } catch {
      return false;
    }
  });
  const setEnabled = (on: boolean) => {
    update(on);
    try {
      writeBetaSession(sessionStorage, on);
    } catch {
      /* in-memory fallback */
    }
  };
  return (
    <BetaContext.Provider value={{ enabled, setEnabled }}>
      <AppearanceProvider>{children}</AppearanceProvider>
    </BetaContext.Provider>
  );
}
