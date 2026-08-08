import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale, MsgKey } from "./catalog.js";
import { translate, type Params } from "./translate.js";

export type { Locale, MsgKey } from "./catalog.js";
export type { Params } from "./translate.js";
export { LOCALES } from "./catalog.js";
export { translate } from "./translate.js";

const LOCALE_KEY = "greed:locale";

export function loadLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MsgKey, params?: Params) => string;
  /** Locale-aware number formatting (thousands separators, etc.). */
  n: (value: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale());

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* ignore */
    }
    setLocaleState(l);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      n: (v) => new Intl.NumberFormat(locale).format(v),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** Shorthand for components that only need the translate function. */
export function useT(): (key: MsgKey, params?: Params) => string {
  return useI18n().t;
}
