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

/**
 * Five dice showing the same face, whatever that face is.
 *
 * Flat, and worth more than any combination of the same five dice scored any
 * other way, so it always replaces what they were paying rather than adding to
 * it: three 1s and then two more is 1000, not 300 + 1000. Unlike a straight or
 * a triple it does NOT have to arrive in one throw — it is the one hand a player
 * can build up.
 */
export const FIVE_OF_A_KIND = 1000;

/** Default banked-total needed to trigger the endgame. */
export const GOAL_DEFAULT = 3000;

/**
 * The most a Best Total may be worth on the leaderboard.
 *
 * Best Total is a career best carried up from whatever games a player has
 * played, and a game's goal is a setting — so a local game to 50,000 produced a
 * "best total" that no standard game could ever approach. Eligibility is now
 * limited to games at GOAL_DEFAULT (see recordGame), and anything above this
 * ceiling is treated as coming from before that rule, or from a client that
 * doesn't honour it, and is worth nothing.
 *
 * It sits above the goal rather than at it because a standard game does not
 * stop the moment the goal is passed: the round plays out, and a last big bank
 * can carry a legitimate total past 3000. Far past 4000 it is not a dice game
 * any more, it is a setting.
 */
export const BEST_TOTAL_CEILING = 4000;

/**
 * A bot's risk temperament — the ONE thing that distinguishes one bot from
 * another. Every bot plays at the same standard skill level (there is no
 * difficulty setting); what changes is how far it pushes a turn before banking.
 */
export type BotPersonality = "cautious" | "balanced" | "reckless";

/** How a chunk of a roll scored, for UI display / logs. */
export interface ScoreBreakdownEntry {
  kind: "ones" | "fives" | "triple" | "straight" | "five-of-a-kind";
  /** Die face involved (absent for straights). */
  face?: DieValue;
  /** How many dice this entry consumed. */
  diceUsed: number;
  /**
   * Which dice it consumed, as positions in the array that was scored.
   *
   * Needed because an award now has to survive being reconsidered: a player can
   * unlock a die, and the points that die was part of have to come off with it.
   * Knowing only HOW MANY dice an award used is not enough to say whether it is
   * still standing.
   */
  indices: number[];
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

/** Supported team layouts: two equal sides. */
export const TEAM_TABLE_SIZES = [4, 6] as const;

export interface PlayerConfig {
  id: string;
  name: string;
  isBot: boolean;
  /** Optional risk temperament for a bot (defaults to "balanced"). */
  botPersonality?: BotPersonality;
  /**
   * Side index (0 or 1) in a team game. Omitted for a free-for-all — the mode is
   * decided by the seats themselves, so a game is never half in teams.
   */
  team?: number;
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

/**
 * One thing the dice paid for: a pair of fives, a triple, a straight.
 *
 * Points are attributed to the DICE that earned them rather than added to a
 * running total, because the total now has to be able to go down — see
 * TurnState.awards.
 */
export interface TurnAward {
  kind: ScoreBreakdownEntry["kind"];
  face?: DieValue;
  /** Die indices (0..4) in the current set of five. */
  dice: number[];
  points: number;
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
  /**
   * Every award granted to the dice CURRENTLY on the mat, with the dice each one
   * used. An award only counts while all of its dice are still locked, which is
   * what lets a player unlock a die and lose exactly what it was worth — and get
   * it back by locking it again, as long as it hasn't been thrown since.
   *
   * Cleared when hot dice hands out a fresh five (their points move to
   * `carried`), and when a die is re-thrown any award that used it is dropped.
   */
  awards: TurnAward[];
  /**
   * Points banked into this turn by earlier hot-dice clears, which no longer
   * belong to any die on the mat. `turnScore` is this plus whatever the dice
   * currently held are worth.
   */
  carried: number;
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

/**
 * What a throw is worth, as the LOG keeps it.
 *
 * Deliberately narrower than the ScoreResult the turn carries. The log is
 * append-only and the whole game state — log included — is broadcast to every
 * player on every action, so anything kept here is paid for again on every
 * roll, bank and advance for the rest of the game. Measured before this was
 * narrowed: an eight-player game moved 27 MB, the log was 96% of the payload,
 * and about two thirds of the log was `scoringMask` and `breakdown` that
 * nothing ever read.
 *
 * The dice that scored are still on `turn.lastRoll` in full, which is where the
 * roll-call banner reads them from; what the log is for is the turn history,
 * the sounds and the end-of-game summary, and those want a number and a flag.
 */
export interface LoggedRoll {
  points: number;
  /** True when every die in the throw scored. */
  isHotDice: boolean;
}

export type GameEvent =
  | { type: "game-start"; startPlayerId: string }
  | { type: "roll"; playerId: string; dice: DieValue[]; result: LoggedRoll }
  | { type: "bust"; playerId: string; lostPoints: number }
  | { type: "bank"; playerId: string; gained: number; total: number }
  | { type: "skip"; playerId: string }
  | { type: "hot-dice"; playerId: string }
  | { type: "endgame-triggered"; playerId: string }
  | { type: "auto-win"; playerId: string }
  | { type: "sudden-death"; contenderIds: string[] }
  | { type: "game-over"; winnerId: string; winnerTeam?: number };

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
  /**
   * Player indices grouped by side, or null in a free-for-all. Derived once at
   * setup so every score comparison can be team-aware without re-deriving it:
   * `teams[t]` are the seats on side `t`, and a side's score is their sum.
   */
  teams: number[][] | null;
  winnerId: string | null;
  /** Winning side (teams games only); null in a free-for-all or while playing. */
  winnerTeam: number | null;
  log: GameEvent[];
}

export type GameAction =
  | { type: "ROLL" }
  | { type: "BANK" }
  | { type: "ADVANCE" }
  /** Forfeit the current (not-yet-finished) turn with no points — used for time-outs. */
  | { type: "SKIP" }
  /**
   * Hold a die, or put it back in the cup. The player's call, not the engine's:
   * scoring dice still lock themselves, but a five-of-a-kind can be built over
   * several throws, and building one means being able to say "not that die".
   */
  | { type: "TOGGLE_LOCK"; index: number };

export interface LegalActions {
  canRoll: boolean;
  canBank: boolean;
  /** True when the turn is finished and only ADVANCE (start next turn) applies. */
  canAdvance: boolean;
}
