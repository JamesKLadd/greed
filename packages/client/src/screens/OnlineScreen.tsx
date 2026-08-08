import { useOnlineGame } from "../net/useOnlineGame.js";
import { OnlineMenu } from "./OnlineMenu.js";
import { LobbyScreen } from "./LobbyScreen.js";
import { OnlineGameScreen } from "./OnlineGameScreen.js";
import { RollOffView } from "../components/RollOffView.js";
import { useT } from "../i18n/i18n.js";

export function OnlineScreen({ onExit }: { onExit: () => void }) {
  const t = useT();
  const net = useOnlineGame();

  if (net.status === "connecting") {
    return (
      <div className="setup">
        <div className="setup__hero">
          <h1 className="setup__logo">GREED</h1>
          <p className="setup__tagline">{t("lobby.reconnecting")}</p>
        </div>
      </div>
    );
  }

  if (net.status === "in-game" && net.game) return <OnlineGameScreen net={net} />;
  if (net.status === "roll-off" && net.rollOff) return <RollOffView entries={net.rollOff} />;
  if (net.status === "lobby" && net.lobby) return <LobbyScreen net={net} />;
  return <OnlineMenu net={net} onBack={onExit} />;
}
