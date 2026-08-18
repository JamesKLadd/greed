/**
 * What has changed, release by release.
 *
 * Versions down the left, the selected release's notes down the right. The list
 * is the navigation AND the history — how long the game has been going is worth
 * seeing at a glance — so it stays on screen rather than being a dropdown. On a
 * phone it becomes a row of chips above the notes, because a two-column split at
 * 375px leaves neither column readable.
 */

import { useState } from "react";
import { RELEASES } from "../game/changelog.js";
import { Button, Screen } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";

/** A release date in the reader's own timezone. Built from the parts: parsing
 *  "2026-08-18" as a Date reads it as UTC, which prints a day early out west. */
function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function UpdateLogScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  // Opens on the newest release, which is the one people came to read.
  const [selected, setSelected] = useState(RELEASES[0]?.version ?? "");
  const release = RELEASES.find((r) => r.version === selected) ?? RELEASES[0];

  return (
    <Screen
      title={t("updates.title")}
      tagline={t("updates.tagline")}
      panelClassName="updates"
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      }
    >
      <div className="updates__split">
        <nav className="updates__versions" aria-label={t("updates.title")}>
          {RELEASES.map((r, i) => (
            <button
              key={r.version}
              className={`updates__version${r.version === selected ? " updates__version--on" : ""}`}
              aria-current={r.version === selected ? "true" : undefined}
              onClick={() => setSelected(r.version)}
            >
              <span className="updates__versionNo">v{r.version}</span>
              {/* The newest release is the one you are playing — worth saying,
                  since the list gives no other clue which that is. */}
              {i === 0 && <span className="updates__latest">{t("updates.latest")}</span>}
            </button>
          ))}
        </nav>

        {release && (
          <article className="updates__detail">
            <h2 className="updates__heading">v{release.version}</h2>
            <p className="updates__date">{formatDate(release.date)}</p>
            <ul className="updates__notes">
              {release.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>
        )}
      </div>
    </Screen>
  );
}
