/** Join class names, dropping falsy entries. Replaces the hand-rolled
 * `[...].filter(Boolean).join(" ")` blocks scattered across the components. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
