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
import { Button, Icon, Screen, TextField } from "../ui/index.js";
import { ProfileCard } from "../components/ProfileCard.js";
import { ApiError } from "../net/auth.js";
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
import { useT } from "../i18n/i18n.js";

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
  const [viewing, setViewing] = useState<string | null>(null);

  /** A refresh nobody asked for reports nothing: a blip must not throw an error
   *  card over a list that is still perfectly good. */
  const inFlight = useRef(false);
  const load = useCallback(
    async (quiet = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        setView(await fetchFriends());
      } catch (err) {
        if (!quiet) setError(err instanceof ApiError ? err.message : t("social.loadFailed"));
      } finally {
        inFlight.current = false;
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
    setBusy(true);
    setError(null);
    try {
      setView(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("social.addFailed"));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const u = name.trim();
    if (!u) return;
    void run(async () => {
      const next = await requestFriend(u);
      setName("");
      return next;
    });
  };

  if (authStatus !== "authed") {
    return (
      <Screen
        title={t("social.title")}
        tagline={t("social.tagline")}
        actions={
          <>
            <Button variant="ghost" onClick={onBack}>
              {t("bar.home")}
            </Button>
            <Button variant="roll" onClick={onSignIn}>
              {t("home.signIn")}
            </Button>
          </>
        }
      >
        <p className="daily__note">{t("social.signInRequired")}</p>
      </Screen>
    );
  }

  const row = (f: FriendSummary, actions: React.ReactNode) => (
    <li key={f.id} className="friend">
      <button className="friend__main" onClick={() => setViewing(f.username)}>
        <span className={`friend__dot${f.online ? " friend__dot--on" : ""}`} aria-hidden="true" />
        <span className="friend__name">{f.username}</span>
        <span className="friend__meta">
          {t("social.record", { wins: f.wins, games: f.gamesPlayed })}
        </span>
      </button>
      <span className="friend__actions">{actions}</span>
    </li>
  );

  return (
    <Screen
      title={t("social.title")}
      tagline={t("social.tagline")}
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      }
    >
      {error && (
        <div className="banner banner--sd online-error" onClick={() => setError(null)}>
          {error} <span className="online-error__x">✕</span>
        </div>
      )}

      <div className="friends__add">
        <TextField
          value={name}
          maxLength={16}
          placeholder={t("social.addPlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="roll" disabled={busy || !name.trim()} onClick={add}>
          {t("social.add")}
        </Button>
      </div>

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
                    onClick={() => void run(() => acceptFriend(f.username))}
                  >
                    <Icon name="check" />
                  </Button>
                  <Button
                    size="md"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => removeFriend(f.username))}
                  >
                    <Icon name="close" />
                  </Button>
                </>,
              ),
            )}
          </ul>
        </>
      )}

      <h2 className="friends__head">{t("social.friends")}</h2>
      {view && view.friends.length === 0 && <p className="daily__note">{t("social.noFriends")}</p>}
      <ul className="friends">
        {view?.friends.map((f) =>
          row(
            f,
            <>
              {ONLINE_ENABLED && (
                // Only a friend who has the game open can be reached, so the
                // button is offered exactly when it can actually work.
                <Button
                  size="md"
                  variant="roll"
                  disabled={busy || !f.online || !challenges.connected}
                  title={f.online ? t("challenge.send") : t("challenge.offline")}
                  onClick={() => challenges.challenge(f.username)}
                >
                  {t("challenge.play")}
                </Button>
              )}
              <Button
                size="md"
                variant="ghost"
                disabled={busy}
                title={t("social.remove")}
                onClick={() => void run(() => removeFriend(f.username))}
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
                  onClick={() => void run(() => removeFriend(f.username))}
                >
                  <Icon name="close" />
                </Button>,
              ),
            )}
          </ul>
        </>
      )}

      {viewing && (
        <ProfileCard username={viewing} onClose={() => setViewing(null)} onChanged={load} />
      )}
    </Screen>
  );
}
