/**
 * Deep clone of plain, JSON-like state. GameState holds only arrays, numbers,
 * strings, booleans, and nulls (no functions, Dates, or Maps), so this is safe
 * and keeps the engine free of any environment-specific ambient types.
 */
export function clone<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  return sc ? sc(value) : (JSON.parse(JSON.stringify(value)) as T);
}
