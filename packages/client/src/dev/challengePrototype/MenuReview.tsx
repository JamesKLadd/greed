import { useLayoutEffect, useState } from "react";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import BetaHome from "../../beta/BetaHome.js";
import type { HomeScreenProps } from "../../screens/HomeScreen.js";
import { useI18n } from "../../i18n/i18n.js";
import "./challengeLobbyReview.css";

/** Actual beta menu with local navigation feedback, never a game/account action. */
export default function MenuReview() {
  const { t, locale, setLocale } = useI18n();
  const [selection, setSelection] = useState<string | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.presentation;
    root.dataset.presentation = "beta";
    return () => {
      if (previous === undefined) delete root.dataset.presentation;
      else root.dataset.presentation = previous;
    };
  }, []);

  const props: HomeScreenProps = {
    onDaily: () => setSelection(t("daily.home")),
    onWeekly: () => setSelection(t("weekly.home")),
    onLocal: () => setSelection(t("home.local")),
    onOnline: () => setSelection(t("home.online")),
    onPractice: () => setSelection(t("home.learn")),
    onFriends: () => setSelection(t("social.home")),
    onStats: () => setSelection(t("home.stats")),
    onBoards: () => setSelection(t("board.home")),
    onLocker: () => setSelection(t("home.locker")),
    onUpdates: () => setSelection(t("home.updates")),
    onSettings: () => setSelection(t("home.settings")),
    onAuth: () => setSelection(t("home.signIn")),
    onAuthForOnline: () => setSelection(t("home.signIn")),
    onAccount: () => setSelection("Account"),
  };

  return (
    <BetaActiveContext.Provider value={true}>
      <BetaHome {...props} />
      <details className="lobby-review__tools">
        <summary>Menu fixture controls</summary>
        <p>
          This is the real beta menu. Navigation stays in this preview and does not start a
          challenge or change an account.
        </p>
        <p role="status">Selected action: {selection ?? "None"}</p>
        <label>
          Language
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <a href="?challenge-lobby">Challenge lobby preview</a>
        <a href="/">Return to game</a>
      </details>
    </BetaActiveContext.Provider>
  );
}
