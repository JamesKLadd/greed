/**
 * Friends: add by username, answer requests, see who's online, challenge them
 * to a game.
 *
 * Adding someone is a request they must accept, so nobody ends up on a stranger's
 * list without agreeing to it. A challenge only reaches a friend who currently
 * has the game open (the green dot), because it is delivered over their live
 * notification socket rather than stored and pushed at them later.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Icon, Screen, TextField } from "../ui/index.js";
import { ProfileCard } from "../components/ProfileCard.js";
import {
  acceptFriend,
  fetchFriends,
  removeFriend,
  requestFriend,
  type FriendSummary,
  type FriendsView,
} from "../net/social.js";
import { useChallenges } from "../net/challenges.js";
import { ONLINE_ENABLED } from "../game/online.js";
import { useAuth } from "../game/auth.js";
import { useI18n, useT } from "../i18n/i18n.js";
import { apiErrorText } from "../i18n/apiError.js";

/** How often the list refreshes itself while the screen is open. */
const REFRESH_MS = 5000;

interface FriendsScreenProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function FriendsScreen({ onBack, onSignIn }: FriendsScreenProps) {
  const t = useT();
  const { status: authStatus } = useAuth();
  const challenges = useChallenges();
  const [view, setView] = useState<FriendsView | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);

  /** A refresh nobody asked for reports nothing: a blip must not throw an error
   *  card over a list that is still perfectly good. */
  const inFlight = useRef(false);
  const load = useCallback(
    async (quiet = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        setView(await fetchFriends());
      } catch (err) {
        if (!quiet) setError(apiErrorText(t, err, "social.loadFailed"));
      } finally {
        inFlight.current = false;
        if (!quiet) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (authStatus !== "authed") return;
    void load();
    // Sitting on this screen, the interesting things happen on someone else's
    // device: a request you sent gets accepted, a friend comes online. Waiting
    // for those meant leaving the screen and coming back to find out, so the
    // list keeps itself up to date instead.
    const id = window.setInterval(() => {
      // Nothing to see on a screen nobody is looking at, and a phone in a
      // pocket should not be polling every five seconds.
      if (document.visibilityState === "visible") void load(true);
    }, REFRESH_MS);
    // Coming back to a backgrounded tab is the one moment the list is most
    // likely to be stale, so it refreshes then rather than up to five seconds
    // later.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authStatus, load]);

  const run = async (fn: () => Promise<FriendsView>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setView(await fn());
    } catch (err) {
      setError(apiErrorText(t, err, "social.addFailed"));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const u = name.trim();
    if (!u || busy) return;
    void run(async () => {
      const next = await requestFriend(u);
      setName("");
      return next;
    });
  };

  return (
    <>
      <FriendsScreenView
        authStatus={authStatus}
        view={view}
        name={name}
        error={error}
        busy={busy}
        loading={loading}
        onlineEnabled={ONLINE_ENABLED}
        challengesConnected={challenges.connected}
        onBack={onBack}
        onSignIn={onSignIn}
        onNameChange={setName}
        onDismissError={() => setError(null)}
        onRetry={() => void load()}
        onAdd={add}
        onAccept={(username) => void run(() => acceptFriend(username))}
        onRemove={(username) => void run(() => removeFriend(username))}
        onChallenge={(username) => challenges.challenge(username)}
        onViewProfile={setViewing}
      />
      {authStatus === "authed" && viewing && (
        <ProfileCard username={viewing} onClose={() => setViewing(null)} onChanged={load} />
      )}
    </>
  );
}

/** Presentation only: no polling, social mutations, profile fetches, or notification socket. */
export interface FriendsScreenViewProps {
  authStatus: "loading" | "anon" | "authed";
  view: FriendsView | null;
  name: string;
  error: string | null;
  busy: boolean;
  loading: boolean;
  onlineEnabled: boolean;
  challengesConnected: boolean;
  onBack: () => void;
  onSignIn: () => void;
  onNameChange: (name: string) => void;
  onDismissError: () => void;
  onRetry: () => void;
  onAdd: () => void;
  onAccept: (username: string) => void;
  onRemove: (username: string) => void;
  onChallenge: (username: string) => void;
  onViewProfile: (username: string) => void;
}

export function FriendsScreenView({
  authStatus,
  view,
  name,
  error,
  busy,
  loading,
  onlineEnabled,
  challengesConnected,
  onBack,
  onSignIn,
  onNameChange,
  onDismissError,
  onRetry,
  onAdd,
  onAccept,
  onRemove,
  onChallenge,
  onViewProfile,
}: FriendsScreenViewProps) {
  const { t, n } = useI18n();

  const row = (f: FriendSummary, actions: ReactNode) => (
    <li key={f.id} className="friend">
      <button className="friend__main" onClick={() => onViewProfile(f.username)}>
        <span className={`friend__dot${f.online ? " friend__dot--on" : ""}`} aria-hidden="true" />
        <span className="friend__identity">
          <span className="friend__name">{f.username}</span>
          <span className="friend__presence">
            {f.online ? t("social.online") : t("social.offline")}
          </span>
          <span className="friend__meta">
            {t("social.record", { wins: n(f.wins), games: n(f.gamesPlayed) })}
          </span>
        </span>
      </button>
      <span className="friend__actions">{actions}</span>
    </li>
  );

  return (
    <Screen
      className="support-screen"
      panelClassName="support-panel support-friends"
      hero={false}
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={onBack}>
            {t("bar.home")}
          </Button>
          {authStatus === "anon" && (
            <Button variant="roll" onClick={onSignIn}>
              {t("home.signIn")}
            </Button>
          )}
        </>
      }
    >
      <header className="support-panel__heading">
        <h1>{t("social.home")}</h1>
        <p className="support-panel__intro">{t("social.tagline")}</p>
      </header>
      {authStatus !== "authed" ? (
        <p className="support-panel__intro" role="status">
          {authStatus === "loading" ? t("board.loading") : t("social.signInRequired")}
        </p>
      ) : (
        <>
          {error && view && (
            <div className="support-auth__message support-auth__message--error" role="alert">
              <span>{error}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("common.close")}
                onClick={onDismissError}
              >
                <Icon name="close" />
              </Button>
            </div>
          )}

          <form
            className="friends__add"
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && name.trim()) onAdd();
            }}
          >
            <TextField
              label={t("auth.username")}
              value={name}
              maxLength={16}
              placeholder={t("social.addPlaceholder")}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              onChange={(e) => onNameChange(e.target.value)}
            />
            <Button type="submit" variant="roll" disabled={busy || !name.trim()}>
              {t("social.add")}
            </Button>
          </form>

          {!view && (
            <div className="support-friends__state" role="status">
              <p>{loading ? t("board.loading") : (error ?? t("social.loadFailed"))}</p>
              {!loading && (
                <Button disabled={busy} onClick={onRetry}>
                  {t("social.retry")}
                </Button>
              )}
            </div>
          )}
          {onlineEnabled && view && !challengesConnected && (
            <p className="support-friends__connection" role="status">
              {t("social.connecting")}
            </p>
          )}

          {view && view.incoming.length > 0 && (
            <>
              <h2 className="friends__head">{t("social.requests")}</h2>
              <ul className="friends">
                {view.incoming.map((f) =>
                  row(
                    f,
                    <>
                      <Button
                        size="md"
                        variant="bank"
                        disabled={busy}
                        aria-label={`${t("social.accept")} · ${f.username}`}
                        title={t("social.accept")}
                        onClick={() => onAccept(f.username)}
                      >
                        <Icon name="check" />
                      </Button>
                      <Button
                        size="md"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`${t("social.decline")} · ${f.username}`}
                        title={t("social.decline")}
                        onClick={() => onRemove(f.username)}
                      >
                        <Icon name="close" />
                      </Button>
                    </>,
                  ),
                )}
              </ul>
            </>
          )}

          {view && <h2 className="friends__head">{t("social.friends")}</h2>}
          {view && view.friends.length === 0 && (
            <p className="daily__note">{t("social.noFriends")}</p>
          )}
          <ul className="friends">
            {view?.friends.map((f) =>
              row(
                f,
                <>
                  {onlineEnabled && (
                    // Only a friend who has the game open can be reached, so the
                    // button is offered exactly when it can actually work.
                    <Button
                      size="md"
                      variant="roll"
                      disabled={busy || !f.online || !challengesConnected}
                      title={f.online ? t("challenge.send") : t("challenge.offline")}
                      aria-label={`${t("challenge.play")} · ${f.username}`}
                      onClick={() => onChallenge(f.username)}
                    >
                      {t("challenge.play")}
                    </Button>
                  )}
                  <Button
                    size="md"
                    variant="ghost"
                    disabled={busy}
                    title={t("social.remove")}
                    aria-label={`${t("social.remove")} · ${f.username}`}
                    onClick={() => onRemove(f.username)}
                  >
                    <Icon name="minus" />
                  </Button>
                </>,
              ),
            )}
          </ul>

          {view && view.outgoing.length > 0 && (
            <>
              <h2 className="friends__head">{t("social.pending")}</h2>
              <ul className="friends">
                {view.outgoing.map((f) =>
                  row(
                    f,
                    <Button
                      size="md"
                      variant="ghost"
                      disabled={busy}
                      title={t("social.cancel")}
                      aria-label={`${t("social.cancel")} · ${f.username}`}
                      onClick={() => onRemove(f.username)}
                    >
                      <Icon name="close" />
                    </Button>,
                  ),
                )}
              </ul>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
