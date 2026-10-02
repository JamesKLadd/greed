import { createContext, useContext, useState, type ReactNode } from "react";
import { BETA_AVAILABLE, readBrowserPresentation, writeBrowserPresentation } from "./access.js";
import { AppearanceProvider } from "./AppearanceContext.js";

const BetaContext = createContext({ enabled: BETA_AVAILABLE, setEnabled: (_on: boolean) => {} });
export const BetaActiveContext = createContext(false);
export const useBeta = () => useContext(BetaContext);
export const useBetaActive = () => useContext(BetaActiveContext);

export function BetaProvider({ children }: { children: ReactNode }) {
  const [enabled, update] = useState(readBrowserPresentation);
  const setEnabled = (on: boolean) => {
    update(on);
    writeBrowserPresentation(on);
  };
  return (
    <BetaContext.Provider value={{ enabled, setEnabled }}>
      <AppearanceProvider>{children}</AppearanceProvider>
    </BetaContext.Provider>
  );
}
