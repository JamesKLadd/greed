import { useLayoutEffect, useState } from "react";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import { BetaLockerView } from "../../beta/BetaLocker.js";
import { DEFAULT_APPEARANCE, type Appearance } from "../../beta/appearance.js";
import type { Profile } from "../../game/profile.js";
import { useI18n } from "../../i18n/i18n.js";
import type { AccountUser } from "../../net/auth.js";
import type { FriendsView } from "../../net/social.js";
import { AccountScreenView } from "../../screens/AccountScreen.js";
import { FriendsScreenView } from "../../screens/FriendsScreen.js";
import { SettingsScreen } from "../../screens/SettingsScreen.js";
import { StatsScreenView } from "../../screens/StatsScreen.js";
import { Button } from "../../ui/index.js";
import "./supportReview.css";

const SCREENS = ["account", "friends", "stats", "locker", "settings"] as const;
type ReviewScreen = (typeof SCREENS)[number];
const STATES: Record<ReviewScreen, readonly string[]> = {
  account: ["unverified", "verified", "cooldown", "delete-panel", "guest", "loading"],
  friends: ["full", "empty", "loading", "error", "guest", "busy", "reconnecting"],
  stats: ["populated", "empty"],
  locker: ["basic", "earned"],
  settings: ["preferences"],
};

const EMPTY_PROFILE: Profile = {
  gamesPlayed: 0,
  wins: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTurn: 0,
  bestTotal: 0,
  totalBanks: 0,
  totalBankedPoints: 0,
  hotDiceTotal: 0,
  dailyWins: 0,
  weeklyWins: 0,
  achievements: [],
  dice: "ivory",
  table: "classic",
  avatar: "",
};
const POPULATED_PROFILE: Profile = {
  ...EMPTY_PROFILE,
  gamesPlayed: 60,
  wins: 38,
  currentStreak: 3,
  bestStreak: 7,
  bestTurn: 2100,
  bestTotal: 3950,
  totalBanks: 240,
  totalBankedPoints: 121550,
  hotDiceTotal: 92,
  dailyWins: 12,
  weeklyWins: 3,
  achievements: ["first-win", "hot-hand", "big-turn", "hat-trick", "veteran"],
};
const ACCOUNT: AccountUser = {
  id: "support-review-account",
  username: "LongPlayerName16",
  email: "a.very.long.testing.address.for.layout.review@fixture.invalid",
  emailVerified: false,
  createdAt: "2026-01-01T00:00:00Z",
};
const FRIENDS: FriendsView = {
  friends: [
    { id: "friend-a", username: "FriendlyPlayer16", online: true, wins: 753, gamesPlayed: 1234 },
    { id: "friend-b", username: "ChallengeFan2026", online: false, wins: 8, gamesPlayed: 23 },
  ],
  incoming: [
    { id: "incoming-a", username: "TableChampion123", online: true, wins: 0, gamesPlayed: 0 },
  ],
  outgoing: [
    { id: "outgoing-a", username: "LongRequestName1", online: false, wins: 12, gamesPlayed: 36 },
  ],
};
const NO_FRIENDS: FriendsView = { friends: [], incoming: [], outgoing: [] };

/** DEV-only production views with fake data and in-memory mutation receipts. */
export default function SupportReview() {
  const { t, locale, setLocale } = useI18n();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [screen, setScreen] = useState<ReviewScreen>(
    () => SCREENS.find((s) => s === params.get("screen")) ?? "account",
  );
  const [state, setState] = useState(
    () => STATES[screen].find((s) => s === params.get("state")) ?? STATES[screen][0],
  );
  const [beta, setBeta] = useState(!params.has("classic"));
  const [receipt, setReceipt] = useState("None");
  const [name, setName] = useState("");
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [statsReset, setStatsReset] = useState(false);
  const [sampleEpoch, setSampleEpoch] = useState(0);
  const [appearance, setAppearance] = useState<Appearance>({ ...DEFAULT_APPEARANCE });

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.presentation;
    root.dataset.presentation = beta ? "beta" : "classic";
    return () => {
      if (previous === undefined) delete root.dataset.presentation;
      else root.dataset.presentation = previous;
    };
  }, [beta]);

  const resetSample = () => {
    setSampleEpoch((epoch) => epoch + 1);
    setReceipt("None");
    setName("");
    setErrorDismissed(false);
    setDeleteArmed(false);
    setDeletePassword("");
    setAccountNotice(null);
    setStatsReset(false);
    setAppearance({ ...DEFAULT_APPEARANCE });
  };
  const back = () => setReceipt("Home selected (sample only)");
  const selected = (action: string, username?: string) =>
    setReceipt(username ? `${action}: ${username} (sample only)` : `${action} (sample only)`);

  let sample;
  if (screen === "account") {
    sample = (
      <AccountScreenView
        user={
          state === "guest" || state === "loading"
            ? null
            : { ...ACCOUNT, emailVerified: state === "verified" }
        }
        loading={state === "loading"}
        verificationRequired
        cooldown={state === "cooldown" ? 127 : 0}
        busy={false}
        notice={accountNotice}
        confirmingDelete={deleteArmed || state === "delete-panel"}
        deletePassword={deletePassword}
        deleteError={null}
        onBack={back}
        onLogout={() => selected("Log out selected")}
        onResend={() => {
          selected("Verification request selected");
          setAccountNotice(t("account.resendSent"));
        }}
        onBeginDelete={() => {
          selected("Delete confirmation opened");
          setDeleteArmed(true);
        }}
        onDeletePasswordChange={setDeletePassword}
        onCancelDelete={() => {
          selected("Delete cancelled");
          setDeleteArmed(false);
          setDeletePassword("");
          if (state === "delete-panel") setState("unverified");
        }}
        onConfirmDelete={() => selected("Delete confirmation selected")}
      />
    );
  } else if (screen === "friends") {
    sample = (
      <FriendsScreenView
        authStatus={state === "guest" ? "anon" : "authed"}
        view={
          state === "loading" || state === "error" ? null : state === "empty" ? NO_FRIENDS : FRIENDS
        }
        name={name}
        error={state === "error" && !errorDismissed ? t("social.loadFailed") : null}
        busy={state === "busy"}
        loading={state === "loading"}
        onlineEnabled
        challengesConnected={state !== "reconnecting"}
        onBack={back}
        onSignIn={() => selected("Sign in selected")}
        onNameChange={setName}
        onDismissError={() => {
          setErrorDismissed(true);
          selected("Error dismissed");
        }}
        onRetry={() => {
          setState("full");
          selected("Retry selected");
        }}
        onAdd={() => {
          selected("Friend request selected", name.trim());
          setName("");
        }}
        onAccept={(username) => selected("Request accepted", username)}
        onRemove={(username) => selected("Remove/decline/cancel selected", username)}
        onChallenge={(username) => selected("Play selected", username)}
        onViewProfile={(username) => selected("Profile selected", username)}
      />
    );
  } else if (screen === "stats") {
    sample = (
      <StatsScreenView
        key={`${state}-${sampleEpoch}`}
        profile={state === "empty" || statsReset ? EMPTY_PROFILE : POPULATED_PROFILE}
        onBack={back}
        onReset={() => {
          setStatsReset(true);
          selected("Sample stats reset");
        }}
      />
    );
  } else if (screen === "locker") {
    sample = (
      <BetaLockerView
        key={`${state}-${sampleEpoch}`}
        username={ACCOUNT.username}
        appearance={appearance}
        profile={state === "earned" ? POPULATED_PROFILE : EMPTY_PROFILE}
        onBack={back}
        onEquip={(look) => {
          setAppearance(look);
          selected(`Appearance equipped: ${look.dice} / ${look.table} / ${look.mascot}`);
        }}
      />
    );
  } else {
    sample = <SettingsScreen onBack={back} />;
  }

  return (
    <BetaActiveContext.Provider value={beta}>
      <aside className="support-review__notice" aria-label="Isolated support review">
        <p>DEV review: sample accounts, friends, stats and locker actions stay in memory.</p>
        <p>
          Settings and Language update this browser’s normal preferences. Restore them after review.
        </p>
        <p role="status">Selected action: {receipt}</p>
      </aside>
      {sample}
      <details className="support-review__tools">
        <summary>Support sample controls</summary>
        <div className="support-review__controls">
          <label>
            Screen
            <select
              value={screen}
              onChange={(event) => {
                const next = event.target.value as ReviewScreen;
                resetSample();
                setScreen(next);
                setState(STATES[next][0]);
              }}
            >
              {SCREENS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            State
            <select
              value={state}
              onChange={(event) => {
                resetSample();
                setState(event.target.value);
              }}
            >
              {STATES[screen].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Presentation
            <select
              value={beta ? "beta" : "classic"}
              onChange={(event) => setBeta(event.target.value === "beta")}
            >
              <option value="beta">Visual beta</option>
              <option value="classic">Classic</option>
            </select>
          </label>
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
          <Button onClick={resetSample}>Reset sample</Button>
          <a href="/">Return to game</a>
        </div>
      </details>
    </BetaActiveContext.Provider>
  );
}
