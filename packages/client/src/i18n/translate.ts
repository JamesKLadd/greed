import { catalogs, en, type Locale, type MsgKey } from "./catalog.js";

export type Params = Record<string, string | number>;

/** Translate a key for a locale, falling back to English, then the key itself. */
export function translate(locale: Locale, key: MsgKey, params?: Params): string {
  const template = catalogs[locale]?.[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}
