import type { GameState } from "@greed/core";
import type { BetaLook } from "@greed/protocol";
import { DEFAULT_APPEARANCE, MASCOTS, normalizeAppearance, type Appearance } from "./appearance.js";

/** A viewer's table stays put; only the active player's dice travel between turns. */
export function onlineAppearance(
  viewer: Appearance,
  activeId: string,
  skins: Record<string, string> = {},
  looks: Record<string, BetaLook> = {},
): Appearance {
  return normalizeAppearance({
    ...viewer,
    dice: looks[activeId]?.dice ?? skins[activeId] ?? "ivory",
  });
}

/** Never let a stale seated identity grant controls while watching or reconnecting. */
export function canActOnline(
  state: GameState,
  youId: string | null,
  spectating: boolean,
  reconnecting: boolean,
): boolean {
  return (
    !spectating &&
    !reconnecting &&
    state.phase !== "game-over" &&
    !state.players[state.turn.playerIndex].isBot &&
    state.players[state.turn.playerIndex].id === youId
  );
}

/**
 * Identity is keyed by player id, never by the viewer's visual slot. Old servers
 * and Classic seats have no beta look; their compatible avatar (or a provisional
 * mascot) keeps them readable without borrowing the viewing player's appearance.
 */
export function onlineScenePlayers(
  state: GameState,
  avatars: Record<string, string> = {},
  looks: Record<string, BetaLook> = {},
  presence: Record<string, boolean> = {},
) {
  return state.players.map((player, index) => {
    const avatar = avatars[player.id];
    const look = normalizeAppearance(
      looks[player.id] ?? {
        ...DEFAULT_APPEARANCE,
        mascot: MASCOTS.includes(avatar as (typeof MASCOTS)[number])
          ? avatar
          : MASCOTS[index % MASCOTS.length],
      },
    );
    return {
      id: player.id,
      name: player.name,
      score: player.total,
      characterId: look.mascot,
      nameplate: look.nameplate,
      team: player.team,
      connected: player.isBot || presence[player.id] !== false,
      look,
    };
  });
}
