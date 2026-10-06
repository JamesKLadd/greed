/** Public play links also preserve the destination while the player signs in. */
export type PlayEntry = "home" | "practice" | "daily" | "weekly";
export function readPlayEntry(search: string): PlayEntry {
  const params = new URLSearchParams(search);
  if (params.get("practice") === "1") return "practice";
  const challenge = params.get("challenge");
  return challenge === "daily" || challenge === "weekly" ? challenge : "home";
}
export function playEntryUrl(href: string, entry: PlayEntry): string {
  const url = new URL(href);
  url.searchParams.delete("practice");
  url.searchParams.delete("challenge");
  if (entry === "practice") url.searchParams.set("practice", "1");
  else if (entry !== "home") url.searchParams.set("challenge", entry);
  return url.pathname + url.search + url.hash;
}
