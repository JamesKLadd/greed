/**
 * Friends: add by username, answer requests, see who's online.
 *
 * Adding someone is a request they must accept, so nobody ends up on a stranger's
 * list without agreeing to it.
 */

import { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "../game/auth.js";
import { useT } from "../i18n/i18n.js";

interface FriendsScreenProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function FriendsScreen({ onBack, onSignIn }: FriendsScreenProps) {
  const t = useT();
  const { status: authStatus } = useAuth();
  const [view, setView] = useState<FriendsView | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await fetchFriends());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("social.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    if (authStatus === "authed") void load();
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
            <Button
              size="md"
              variant="ghost"
              disabled={busy}
              title={t("social.remove")}
              onClick={() => void run(() => removeFriend(f.username))}
            >
              <Icon name="minus" />
            </Button>,
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
