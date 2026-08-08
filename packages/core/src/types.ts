/**
 * Core domain types for Greed.
 *
 * The engine is intentionally pure and framework-agnostic: no rendering, no
 * networking, no globals. Every consumer (local UI, bots, future server) drives
 * the same state machine and shares these types.
 */

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

/** Number of dice each turn starts with. */
export const DICE_COUNT = 5;

/** Default banked-total needed to trigger the endgame. */
export const GOAL_DEFAULT = 3000;

export type BotDifficulty = "easy" | "medium" | "hard" | "expert";

/** A bot's risk temperament, layered on top of its difficulty. */
export type BotPersonality = "cautious" | "balanced" | "reckless";

/** How a chunk of a roll scored, for UI display / logs. */
export interface ScoreBreakdownEntry {
  kind: "ones" | "fives" | "triple" | "straight";
  /** Die face involved (absent for straights). */
  face?: DieValue;
  /** How many dice this entry consumed. */
  diceUsed: number;
  points: number;
}

/**
 * Result of scoring a single throw of dice.
 * `scoringMask` aligns index-for-index with the dice array that was scored:
 * `true` means that die contributed points and should be locked.
 */
export interface ScoreResult {
  points: number;
  scoringMask: boolean[];
  /** True when every die in the throw scored (=> "hot dice", reroll all 5). */
  isHotDice: boolean;
  breakdown: ScoreBreakdownEntry[];
}

export interface PlayerConfig {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  /** Optional risk temperament for a bot (defaults to "balanced"). */
  botPersonality?: BotPersonality;
}

export interface PlayerState extends PlayerConfig {
  /** Banked total. Only ever increases (busts lose un-banked turn points only). */
  total: number;
}

export interface GameConfig {
  goal: number;
  /** Seed for the deterministic RNG (reproducible games + server authority). */
  seed: number;
  /**
   * Optional fixed starting seat index (into the players array). When omitted a
   * random starting player is chosen from the seed.
   */
  startIndex?: number;
  /**
   * Optional explicit turn order (player indices; order[0] goes first, the last
   * entry goes last). Takes precedence over startIndex. Produced by the opening
   * roll-off.
   */
  order?: number[];
}

/** One player's opening roll-off throw (5 dice; highest pip total goes last). */
export interface RollOffEntry {
  playerIndex: number;
  dice: DieValue[];
  sum: number;
}

/** The live state of the current player's turn. */
export interface TurnState {
  /** Index into `players` of whose turn it is. */
  playerIndex: number;
  /** Points accumulated this turn but not yet banked. */
  turnScore: number;
  /** Current face of all 5 dice (locked and unlocked). */
  dice: DieValue[];
  /** Which dice are locked (already scored this sequence). */
  locked: boolean[];
  /** Number of throws made this turn. */
  rollCount: number;
  /** Result of the most recent throw (null before the first roll). */
  lastRoll: ScoreResult | null;
  /** True once a throw scored 0 and the turn is forfeited. */
  busted: boolean;
  /** True when the last throw cleared all 5 dice (next roll is a fresh 5). */
  hotDice: boolean;
  /** True after a scoring throw: the player may roll again or bank. */
  awaitingDecision: boolean;
  /**
   * Set when the turn is finished but not yet cleared. The turn (with its final
   * dice) stays on screen in this state until an ADVANCE action moves play on,
   * which lets the UI hold on the result so players see what happened.
   */
  outcome: "busted" | "banked" | null;
}

export type GamePhase = "playing" | "sudden-death" | "game-over";

export interface EndgameState {
  triggered: boolean;
  /** Player id who first banked >= goal (excluding an outright last-seat auto-win). */
  triggerPlayerId: string | null;
}

export interface SuddenDeathState {
  /** Player indices tied for the lead, in turn order. */
  contenders: number[];
  /** Pointer into `contenders` for whose sudden-death turn it is. */
  pointer: number;
}

export type GameEvent =
  | { type: "game-start"; startPlayerId: string }
  | { type: "roll"; playerId: string; dice: DieValue[]; result: ScoreResult }
  | { type: "bust"; playerId: string; lostPoints: number }
  | { type: "bank"; playerId: string; gained: number; total: number }
  | { type: "hot-dice"; playerId: string }
  | { type: "endgame-triggered"; playerId: string }
  | { type: "auto-win"; playerId: string }
  | { type: "sudden-death"; contenderIds: string[] }
  | { type: "game-over"; winnerId: string };

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  /** Player indices in turn order. `order[0]` is the starting player (P1). */
  order: number[];
  /** Pointer into `order` for whose turn it is. */
  turnPointer: number;
  /** Serializable RNG state. */
  rng: number;
  turn: TurnState;
  phase: GamePhase;
  endgame: EndgameState;
  suddenDeath: SuddenDeathState | null;
  winnerId: string | null;
  log: GameEvent[];
}

export type GameAction = { type: "ROLL" } | { type: "BANK" } | { type: "ADVANCE" };

export interface LegalActions {
  canRoll: boolean;
  canBank: boolean;
  /** True when the turn is finished and only ADVANCE (start next turn) applies. */
  canAdvance: boolean;
}
