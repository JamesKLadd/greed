/** A player's public card: what they've done, and whether you're friends. */

import { useEffect, useState, type CSSProperties } from "react";
import { Die } from "./Die.js";
import { Button, Modal } from "../ui/index.js";
import { ACHIEVEMENTS } from "../game/profile.js";
import { DICE_SKINS } from "../game/cosmetics.js";
import { ApiError } from "../net/auth.js";
import { fetchProfile, requestFriend, type PublicProfile } from "../net/social.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

interface ProfileCardProps {
  username: string;
  onClose: () => void;
  /** Called after a friend request succeeds, so lists can refresh. */
  onChanged?: () => void;
}

export function ProfileCard({ username, onClose, onChanged }: ProfileCardProps) {
  const t = useT();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(username)
      .then((p) => !cancelled && setProfile(p))
      .catch(
        (err) =>
          !cancelled && setError(err instanceof ApiError ? err.message : t("social.loadFailed")),
      );
    return () => {
      cancelled = true;
    };
  }, [username, t]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestFriend(username);
      setProfile((p) => (p ? { ...p, relation: "outgoing" } : p));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("social.addFailed"));
    } finally {
      setBusy(false);
    }
  };

  // Show their equipped dice, so the card feels like *their* card.
  const skin = DICE_SKINS.find((s) => s.id === profile?.dice) ?? DICE_SKINS[0];
  const earned = ACHIEVEMENTS.filter((a) => profile?.achievements.includes(a.id)).slice(0, 8);

  return (
    <Modal
      onClose={onClose}
      title={profile?.username ?? username}
      scroll
      actions={
        <>
          {profile?.relation === "none" && (
            <Button variant="roll" disabled={busy} onClick={add}>
              {t("social.addFriend")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </>
      }
    >
      {error && <div className="banner banner--sd">{error}</div>}
      {!profile && !error && <p className="daily__note">{t("daily.loading")}</p>}

      {profile && (
        <div className="profile">
          <div className="profile__dice" style={skin.vars as CSSProperties}>
            <Die value={5} size={38} />
            <Die value={3} size={38} />
          </div>

          <p className="profile__status">
            {profile.online ? t("social.online") : t("social.offline")}
            {profile.relation === "friends" && ` · ${t("social.isFriend")}`}
            {profile.relation === "outgoing" && ` · ${t("social.requestSent")}`}
            {profile.relation === "incoming" && ` · ${t("social.wantsToBeFriends")}`}
          </p>

          <div className="stats-grid profile__stats">
            <div className="stat-tile">
              <span className="stat-tile__value">{profile.gamesPlayed}</span>
              <span className="stat-tile__label">{t("stats.games")}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">{profile.wins}</span>
              <span className="stat-tile__label">{t("stats.wins")}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">{profile.bestTurn}</span>
              <span className="stat-tile__label">{t("stats.bestTurn")}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">{profile.dailyBest ?? "—"}</span>
              <span className="stat-tile__label">{t("social.dailyBest")}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">{profile.dailyWins}</span>
              <span className="stat-tile__label">{t("social.dailyWins")}</span>
            </div>
          </div>

          {earned.length > 0 && (
            <div className="profile__badges">
              {earned.map((a) => (
                <span
                  key={a.id}
                  className="unlocks__icon profile__badge"
                  title={t(`ach.${a.id}.title` as MsgKey)}
                >
                  {a.icon}
                </span>
              ))}
              {profile.achievements.length > earned.length && (
                <span className="profile__more">
                  +{profile.achievements.length - earned.length}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
