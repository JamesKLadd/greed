import { useEffect, useState } from "react";
import { useOnlineGame } from "../net/useOnlineGame.js";
import { OnlineMenu } from "./OnlineMenu.js";
import { LobbyScreen } from "./LobbyScreen.js";
import { OnlineGameScreen } from "./OnlineGameScreen.js";
import { RollOffView } from "../components/RollOffView.js";
import { useAuth } from "../game/auth.js";
import { useT } from "../i18n/i18n.js";

/** After this long, a slow connect is almost certainly a sleeping free-tier
 *  server waking up rather than a network problem — say so instead of hanging. */
const COLD_START_HINT_MS = 4000;

interface OnlineScreenProps {
  onExit: () => void;
  /** Room code to join straight away (a friend's challenge). */
  autoJoin?: string | null;
  /** Development network fixtures must not award progression. */
  recordResults?: boolean;
}

export function OnlineScreen({ onExit, autoJoin, recordResults = true }: OnlineScreenProps) {
  const t = useT();
  const { user } = useAuth();
  // Only a signed-in player can be challenged, so the account name is the name.
  const net = useOnlineGame(
    autoJoin ? { code: autoJoin, name: user?.username ?? t("common.playerDefault") } : undefined,
  );
  const connecting = net.status === "connecting";
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!connecting) {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), COLD_START_HINT_MS);
    return () => window.clearTimeout(id);
  }, [connecting]);

  if (connecting) {
    return (
      <div className="setup">
        <div className="setup__hero">
          <h1 className="setup__logo">GREED</h1>
          <p className="setup__tagline">{t("lobby.reconnecting")}</p>
        </div>
        {slow && (
          <div className="setup__panel waking">
            <div className="waking__spinner" aria-hidden="true" />
            <p className="waking__title">{t("online.waking")}</p>
            <p className="waking__note">{t("online.wakingNote")}</p>
          </div>
        )}
      </div>
    );
  }

  if (net.status === "in-game" && net.game)
    return <OnlineGameScreen net={net} recordResults={recordResults} />;
  if (net.status === "roll-off" && net.rollOff) return <RollOffView entries={net.rollOff} />;
  if (net.status === "lobby" && net.lobby) return <LobbyScreen net={net} />;
  return <OnlineMenu net={net} onBack={onExit} />;
}
