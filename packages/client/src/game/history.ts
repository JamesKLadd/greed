/**
 * Turn-history: a pure transform from the engine's flat `state.log` (a
 * `GameEvent[]`) into per-turn records the UI can render. No engine changes —
 * everything here is derived from events the engine already emits.
 *
 * A "turn" is one player's run of rolls ending in a bank or a bust. Meta events
 * (game-start, endgame-triggered, sudden-death, auto-win, game-over) don't open
 * a turn; they're surfaced separately as markers so the panel can show the
 * final round / sudden death / result inline.
 */

import type { DieValue, GameEvent, GameState } from "@greed/core";

export interface HistoryRoll {
  dice: DieValue[];
  points: number;
  /** True when this throw cleared all five dice (hot dice). */
  hot: boolean;
}

export interface TurnRecord {
  /** 1-based sequence number across the whole game. */
  index: number;
  playerId: string;
  playerName: string;
  rolls: HistoryRoll[];
  outcome: "banked" | "busted" | "in-progress";
  /** Points banked (0 unless outcome === "banked"). */
  gained: number;
  /** Points lost to a bust (0 unless outcome === "busted"). */
  lost: number;
  /** The player's running total after banking; null for busts / in-progress. */
  total: number | null;
  /** A meta marker that fired during/after this turn, if any. */
  marker?: "endgame" | "auto-win" | "sudden-death" | "game-over";
}

interface OpenTurn {
  playerId: string;
  rolls: HistoryRoll[];
}

function nameOf(state: GameState, playerId: string): string {
  return state.players.find((p) => p.id === playerId)?.name ?? playerId;
}

/**
 * Build the ordered list of turn records (oldest first). An unfinished final
 * turn (rolls with no bank/bust yet) is included as "in-progress".
 */
export function buildHistory(state: GameState): TurnRecord[] {
  const records: TurnRecord[] = [];
  let open: OpenTurn | null = null;
  let index = 0;

  const push = (rec: Omit<TurnRecord, "index" | "playerName">) => {
    index += 1;
    records.push({ ...rec, index, playerName: nameOf(state, rec.playerId) });
  };

  const tagLast = (marker: TurnRecord["marker"]) => {
    if (records.length > 0) records[records.length - 1].marker = marker;
  };

  for (const e of state.log as GameEvent[]) {
    switch (e.type) {
      case "roll": {
        if (!open || open.playerId !== e.playerId) {
          open = { playerId: e.playerId, rolls: [] };
        }
        open.rolls.push({ dice: e.dice, points: e.result.points, hot: e.result.isHotDice });
        break;
      }
      case "bank": {
        push({
          playerId: e.playerId,
          rolls: open?.rolls ?? [],
          outcome: "banked",
          gained: e.gained,
          lost: 0,
          total: e.total,
        });
        open = null;
        break;
      }
      case "bust": {
        push({
          playerId: e.playerId,
          rolls: open?.rolls ?? [],
          outcome: "busted",
          gained: 0,
          lost: e.lostPoints,
          total: null,
        });
        open = null;
        break;
      }
      case "endgame-triggered":
        tagLast("endgame");
        break;
      case "auto-win":
        tagLast("auto-win");
        break;
      case "sudden-death":
        tagLast("sudden-death");
        break;
      case "game-over":
        tagLast("game-over");
        break;
      // "game-start" and "hot-dice" carry no per-turn record of their own
      // (hot dice is already reflected on the roll it belongs to).
      default:
        break;
    }
  }

  if (open && open.rolls.length > 0) {
    push({
      playerId: open.playerId,
      rolls: open.rolls,
      outcome: "in-progress",
      gained: 0,
      lost: 0,
      total: null,
    });
  }

  return records;
}
