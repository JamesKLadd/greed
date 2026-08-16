import { useCallback, useEffect, useRef, useState } from "react";
import type { BotPersonality, DieValue, GameState } from "@greed/core";
import type { EmoteId } from "@greed/protocol";
import {
  decode,
  encode,
  type ClientMessage,
  type LobbyView,
  type RematchState,
  type RollOffRow,
  type ServerMessage,
} from "@greed/protocol";
import { diceToRoll } from "@greed/core";
import { toastFor, type ToastMessage } from "../game/toasts.js";
import { SERVER_URL } from "../game/online.js";
import { loadProfile } from "../game/profile.js";
import { getToken } from "./auth.js";

const TOKEN_KEY = "greed-token";

/** How long the dice tumble before their result is revealed. */
const ROLL_ANIM_MS = 600;

/**
 * Minimum time a finished turn stays on screen before the next snapshot may
 * replace it. The server schedules its ADVANCE on the same interval, but it
 * measures from the moment it BROADCAST the outcome, whereas a client only
 * displays that outcome once the dice have finished tumbling. Enforcing the hold
 * here too is what stops that animation time from being eaten out of the pause.
 */
const OUTCOME_HOLD_MS = 2100;

/**
 * How many snapshots may be waiting before the board stops queuing and jumps to
 * the newest one.
 *
 * Every held-back snapshot is time the player is looking at a position the table
 * has already left, and the gap only closes when the server goes quiet. A busy
 * table — five people, nobody hesitating — can hand out positions faster than
 * they can be animated, and once that happens the board drifts further behind
 * with every throw. Dropping an animation is a smaller price than watching dice
 * nobody else can see.
 */
const MAX_PENDING = 3;

/** Backoff between reconnection attempts, in ms (the last value repeats). */
const RECONNECT_DELAYS = [400, 1000, 2000, 4000, 8000, 15000];

/**
 * How often a live connection says something.
 *
 * A websocket that carries no traffic looks abandoned to everything it passes
 * through, and proxies close it. Nothing about that reaches the game: the socket
 * simply stops delivering, and the first anyone knows is a board that has
 * stopped moving. The server pings for the same reason from its end.
 */
const KEEPALIVE_MS = 20000;

/**
 * Everything about a snapshot that the board can actually show.
 *
 * Snapshots are re-broadcast for things the board cannot see — someone
 * dropping, a rematch vote, the turn clock ticking down — and two that agree on
 * this key differ only in those. Showing the second one again would restart the
 * pause on a finished turn every time one arrived.
 */
function boardKey(s: GameState): string {
  const t = s.turn;
  return [
    s.log.length,
    s.phase,
    t.playerIndex,
    t.rollCount,
    t.turnScore,
    t.outcome ?? "",
    t.dice.join(""),
    t.locked.map(Number).join(""),
    t.hotDice ? 1 : 0,
  ].join("|");
}

export type OnlineStatus = "menu" | "connecting" | "lobby" | "roll-off" | "in-game";

export interface OnlineController {
  status: OnlineStatus;
  lobby: LobbyView | null;
  game: GameState | null;
  youId: string | null;
  code: string | null;
  error: string | null;
  toast: ToastMessage | null;
  rollOff: RollOffRow[] | null;
  isRolling: boolean;
  rollingIndices: number[];
  /** Faces the throw in flight will land on — see the same field on useGreed. */
  rollingDice: DieValue[] | null;
  /** Live connection status per player id (bots always true). */
  presence: Record<string, boolean>;
  /** Equipped dice-skin id per player id (for rendering the current player's dice). */
  skins: Record<string, string>;
  /** Equipped avatar id per player id. Missing/empty means "derive from name". */
  avatars: Record<string, string>;
  /**
   * The active seat's countdown to START their turn, or null when no clock is
   * running. `endsAt` is on performance.now()'s monotonic clock, not the wall
   * clock, so a device with the wrong time still counts down correctly.
   */
  turnTimer: { endsAt: number; total: number } | null;
  /** True when this client is a read-only watcher (no seat). */
  isSpectator: boolean;
  /**
   * True while the connection is down and being re-established. The board keeps
   * showing the last position it had, which is why this has to be visible: an
   * unannounced dead socket is indistinguishable from a table thinking.
   */
  reconnecting: boolean;
  /** Most recent reaction per player id, with a nonce so repeats re-animate. */
  emotes: Record<string, { emote: EmoteId; at: number }>;
  /** Rematch tally once the game is over, or null while playing. */
  rematchState: RematchState | null;
  sendEmote: (emote: EmoteId) => void;
  createRoom: (name: string, opts?: { isPublic?: boolean; goal?: number }) => void;
  joinRoom: (code: string, name: string) => void;
  quickMatch: (name: string) => void;
  spectate: (code: string) => void;
  setReady: (ready: boolean) => void;
  setGoal: (goal: number) => void;
  addBot: (personality?: BotPersonality) => void;
  removeSeat: (seatId: string) => void;
  setTeams: (teams: boolean) => void;
  setSeatTeam: (seatId: string, team: number) => void;
  /** Host: put seats on the clock to start their turn, or let the table wait. */
  setTurnTimerEnabled: (enabled: boolean) => void;
  startGame: () => void;
  roll: () => void;
  bank: () => void;
  /** Toggle your vote to run it back with the same table. */
  rematch: () => void;
  /** Host only: take the table back to the lobby to change the setup. */
  toLobby: () => void;
  leave: () => void;
  dismissError: () => void;
}

/**
 * `autoJoin` sends the client straight into a room on mount — accepting a
 * friend's challenge. It deliberately takes precedence over (and discards) any
 * stored reconnect token: going to the room you were just invited to is an
 * explicit choice, and rejoining an old game as well would seat you twice.
 */
export function useOnlineGame(autoJoin?: { code: string; name: string }): OnlineController {
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const autoJoinRef = useRef(autoJoin);

  const [status, setStatus] = useState<OnlineStatus>("menu");
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [rollOff, setRollOff] = useState<RollOffRow[] | null>(null);
  const [rematchState, setRematchState] = useState<RematchState | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollingDice, setRollingDice] = useState<DieValue[] | null>(null);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [skins, setSkins] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [turnTimer, setTurnTimer] = useState<{ endsAt: number; total: number } | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [emotes, setEmotes] = useState<Record<string, { emote: EmoteId; at: number }>>({});
  const lastLogLen = useRef(0);
  const prevPresenceRef = useRef<Record<string, boolean>>({});
  const youIdRef = useRef<string | null>(null);

  // ---- connection ----------------------------------------------------------
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectingRef = useRef(false);
  /** We asked for this close, so don't chase it. */
  const closingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retriesRef = useRef(0);
  const keepaliveRef = useRef<number | null>(null);
  /** The room being watched, if this client is a spectator (it holds no token). */
  const spectateCodeRef = useRef<string | null>(null);
  /** Latest `send`, so the retry timer can reach it without a dependency cycle. */
  const sendRef = useRef<((msg: ClientMessage) => void) | null>(null);

  // ---- display queue -------------------------------------------------------
  // Snapshots arrive from the server the instant they happen, but showing them
  // that way meant a roll's RESULT — the newly locked dice, the higher turn
  // score — appeared while the dice were still tumbling. So arrivals are queued
  // and released on a schedule instead: a roll's snapshot is held back until its
  // animation has run, and a finished turn is guaranteed its full time on screen.
  // Everything downstream (sounds, toasts, the table) reads the displayed state,
  // so they all stay in step with what the player is actually looking at.
  //
  // Two rules keep the queue honest, and both were learnt the hard way. The
  // tumble begins when a snapshot reaches the FRONT of the queue, never when it
  // arrives: starting it on arrival threw dice at a board that was still showing
  // an older position, so the faces in the air belonged to a throw nobody else
  // at the table had seen yet. And the queue is capped — see MAX_PENDING — so a
  // board that falls behind jumps forward instead of drifting.
  const pendingRef = useRef<{ state: GameState; roll: boolean }[]>([]);
  const stepTimerRef = useRef<number | null>(null);
  /** Earliest the currently displayed snapshot may be replaced. */
  const holdUntilRef = useRef(0);
  /** The position on screen right now. A throw is measured against this. */
  const displayedRef = useRef<GameState | null>(null);
  /** Last snapshot ACCEPTED (not necessarily shown) — the queue's own tail. */
  const lastQueuedRef = useRef<GameState | null>(null);
  const queuedLogLen = useRef(0);

  /** Show a queued snapshot and decide how long it must stay up. */
  const showSnapshot = useCallback((next: GameState) => {
    setIsRolling(false);
    setRollingIndices([]);
    setRollingDice(null);
    setGame(next);
    displayedRef.current = next;
    // A finished turn (bust or bank) earns a pause; anything else may be
    // replaced as soon as the next snapshot is due.
    holdUntilRef.current = performance.now() + (next.turn.outcome ? OUTCOME_HOLD_MS : 0);
  }, []);

  const drain = useCallback(() => {
    if (stepTimerRef.current != null) return; // a hold or a tumble is running
    const q = pendingRef.current;
    if (q.length === 0) return;

    // Too far behind to be worth catching up politely: drop the backlog and go
    // straight to where the table actually is.
    if (q.length > MAX_PENDING) {
      q.splice(0, q.length - 1);
      holdUntilRef.current = 0;
    }

    const wait = holdUntilRef.current - performance.now();
    if (wait > 0) {
      stepTimerRef.current = window.setTimeout(() => {
        stepTimerRef.current = null;
        drain();
      }, wait);
      return;
    }

    const head = q.shift()!;
    if (!head.roll) {
      showSnapshot(head.state);
      drain();
      return;
    }

    // Throw the dice this snapshot put in the air, worked out from the board as
    // it stands NOW — the ones lying unlocked in front of the player, or all
    // five when the last throw cleared the mat. The faces are known up front so
    // the dice turn to them in one motion (see Die.tsx), while the snapshot
    // itself stays withheld until they land: that gap is what keeps the new
    // score and the new locks from appearing before the dice settle.
    const shown = displayedRef.current;
    const continues =
      shown != null &&
      shown.turn.playerIndex === head.state.turn.playerIndex &&
      shown.turn.rollCount + 1 === head.state.turn.rollCount;
    const thrown = continues ? diceToRoll(shown.turn) : head.state.turn.dice.map((_, i) => i); // out of step: throw all five
    setRollingIndices(thrown);
    setRollingDice(head.state.turn.dice);
    setIsRolling(true);
    stepTimerRef.current = window.setTimeout(() => {
      stepTimerRef.current = null;
      showSnapshot(head.state);
      drain();
    }, ROLL_ANIM_MS);
  }, [showSnapshot]);

  /** Accept a snapshot for display. */
  const enqueueGame = useCallback(
    (next: GameState) => {
      // A shorter log than last time means a new game (rematch) — resync and
      // drop anything still waiting, which belongs to the game just ended.
      if (next.log.length < queuedLogLen.current) {
        pendingRef.current = [];
        queuedLogLen.current = 0;
        holdUntilRef.current = 0;
      }
      // Nothing new to show (a presence change, a vote, the clock): keep it out
      // of the queue entirely rather than re-showing the position it repeats.
      if (lastQueuedRef.current && boardKey(lastQueuedRef.current) === boardKey(next)) return;

      const roll = next.log.slice(queuedLogLen.current).some((e) => e.type === "roll");
      queuedLogLen.current = next.log.length;
      lastQueuedRef.current = next;
      pendingRef.current.push({ state: next, roll });
      drain();
    },
    [drain],
  );

  /** Drop anything waiting to be shown — the game it belonged to is gone. */
  const clearQueue = useCallback(() => {
    pendingRef.current = [];
    if (stepTimerRef.current != null) window.clearTimeout(stepTimerRef.current);
    stepTimerRef.current = null;
    holdUntilRef.current = 0;
    lastQueuedRef.current = null;
    displayedRef.current = null;
    queuedLogLen.current = 0;
    setIsRolling(false);
    setRollingIndices([]);
    setRollingDice(null);
  }, []);

  /** Stop chasing a connection: there is nothing left to come back to. */
  const stopRetrying = useCallback(() => {
    if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    retriesRef.current = 0;
    reconnectingRef.current = false;
    setReconnecting(false);
  }, []);

  const resetToMenu = useCallback(() => {
    clearQueue();
    stopRetrying();
    spectateCodeRef.current = null;
    setStatus("menu");
    setLobby(null);
    setGame(null);
    setRollOff(null);
    setYouId(null);
    setCode(null);
    setPresence({});
    setSkins({});
    setIsSpectator(false);
    setEmotes({});
    prevPresenceRef.current = {};
  }, [clearQueue, stopRetrying]);

  /**
   * The message that puts this client back where it was, or null when there is
   * nowhere to return to (sitting in the menu, or a room we deliberately left).
   */
  const resumeMessage = useCallback((): ClientMessage | null => {
    const watching = spectateCodeRef.current;
    if (watching) return { type: "spectate", code: watching };
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { type: "reconnect", token } : null;
  }, []);

  /**
   * The connection dropped. Go back for it, on a backoff.
   *
   * Without this a dead socket was simply the end: the board froze on whatever
   * position it last had, with no error and no way back except reloading the
   * page, while the table carried on without the player. The seat is held server
   * side for exactly this, so re-announcing the token picks the game back up
   * where it is now.
   */
  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current != null) return;
    const resume = resumeMessage();
    if (!resume) {
      stopRetrying();
      return;
    }
    reconnectingRef.current = true;
    setReconnecting(true);
    const delay = RECONNECT_DELAYS[Math.min(retriesRef.current, RECONNECT_DELAYS.length - 1)];
    retriesRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      // send() opens a fresh socket and flushes this on connect; if that attempt
      // fails, its close handler brings us back here with a longer delay.
      sendRef.current?.(resume);
    }, delay);
  }, [resumeMessage, stopRetrying]);

  const handleMessage = useCallback(
    (raw: string) => {
      let msg: ServerMessage;
      try {
        msg = decode<ServerMessage>(raw);
      } catch {
        return;
      }
      switch (msg.type) {
        case "welcome":
          setYouId(msg.youId);
          youIdRef.current = msg.youId;
          setCode(msg.code);
          setIsSpectator(false);
          spectateCodeRef.current = null;
          localStorage.setItem(TOKEN_KEY, msg.token);
          // We are seated (again). Anything still queued was assembled before
          // the gap and describes a game that has moved on since; the snapshot
          // arriving behind this one is the truth.
          clearQueue();
          stopRetrying();
          break;
        case "spectating":
          // A watcher holds no seat: no youId, no reconnect token. The lobby/game
          // snapshot that follows drives the status.
          setIsSpectator(true);
          setCode(msg.code);
          spectateCodeRef.current = msg.code;
          clearQueue();
          stopRetrying();
          break;
        case "lobby":
          clearQueue();
          setLobby(msg.lobby);
          setGame(null);
          setRollOff(null);
          setRematchState(null);
          setStatus("lobby");
          break;
        case "roll-off":
          setRollOff(msg.rows);
          setStatus("roll-off");
          break;
        case "game": {
          const next: Record<string, boolean> = {};
          for (const p of msg.presence ?? []) next[p.id] = p.connected;
          // Toast when another human drops or comes back (skip the first snapshot).
          const prev = prevPresenceRef.current;
          if (Object.keys(prev).length > 0) {
            for (const p of msg.state.players) {
              if (p.isBot || p.id === youIdRef.current) continue;
              if (prev[p.id] === true && next[p.id] === false) {
                setToast({
                  id: Math.random(),
                  text: `${p.name} disconnected — autoplaying.`,
                  tone: "bad",
                });
              } else if (prev[p.id] === false && next[p.id] === true) {
                setToast({ id: Math.random(), text: `${p.name} reconnected.`, tone: "good" });
              }
            }
          }
          prevPresenceRef.current = next;
          setPresence(next);
          setRematchState(msg.rematch ?? null);
          const nextSkins: Record<string, string> = {};
          const nextAvatars: Record<string, string> = {};
          for (const s of msg.skins ?? []) {
            nextSkins[s.id] = s.dice;
            // A server that predates avatars sends none; clients then fall back
            // to deriving a face from the name, which is identical everywhere.
            nextAvatars[s.id] = s.avatar ?? "";
          }
          setSkins(nextSkins);
          setAvatars(nextAvatars);
          setTurnTimer(
            msg.turnTimerMs == null
              ? null
              : { endsAt: performance.now() + msg.turnTimerMs, total: msg.turnTimerMs },
          );
          enqueueGame(msg.state);
          setStatus("in-game");
          break;
        }
        case "emote":
          setEmotes((prev) => ({ ...prev, [msg.playerId]: { emote: msg.emote, at: Date.now() } }));
          break;
        case "error":
          setError(msg.message);
          if (reconnectingRef.current) {
            // The server turned our resume away — the room is gone, or the
            // session expired while we were away. Staying put would leave a
            // board that can never move again; say so and go back to the menu.
            localStorage.removeItem(TOKEN_KEY);
            resetToMenu();
          } else {
            setStatus((s) => (s === "connecting" ? "menu" : s));
          }
          break;
        case "left":
          localStorage.removeItem(TOKEN_KEY);
          resetToMenu();
          break;
        case "pong":
          break;
      }
    },
    [resetToMenu, clearQueue, stopRetrying, enqueueGame],
  );

  const ensureSocket = useCallback(() => {
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return existing;
    }
    // Opening a connection on purpose cancels any standing intent to close one.
    // Without this, a single deliberate hang-up — in development React mounts,
    // unmounts and remounts, so that happens on the way in — left the flag set
    // for the rest of the session, and every later drop was mistaken for one we
    // asked for and never chased.
    closingRef.current = false;
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;
    ws.onmessage = (e) => handleMessage(e.data.toString());
    ws.onopen = () => {
      for (const m of queueRef.current) ws.send(encode(m));
      queueRef.current = [];
      // Keep the line warm. The server pings too, but only one end needs to be
      // wrong about the other for a game to quietly stop arriving.
      if (keepaliveRef.current != null) window.clearInterval(keepaliveRef.current);
      keepaliveRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(encode({ type: "ping" }));
      }, KEEPALIVE_MS);
    };
    ws.onerror = () => {
      // While retrying, a failed attempt is expected and the banner already
      // says what is happening — an error card on top of it would only be noise.
      if (reconnectingRef.current) return;
      setError("Cannot reach the server. Is it running?");
      setStatus((s) => (s === "connecting" ? "menu" : s));
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return; // already replaced by a newer socket
      wsRef.current = null;
      if (keepaliveRef.current != null) window.clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
      if (closingRef.current) return; // we hung up on purpose
      scheduleRetry();
    };
    return ws;
  }, [handleMessage, scheduleRetry]);

  const send = useCallback(
    (msg: ClientMessage) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
      else {
        queueRef.current.push(msg);
        ensureSocket();
      }
    },
    [ensureSocket],
  );

  // The retry timer fires long after the render that armed it, so it reaches
  // `send` through a ref rather than closing over a stale one.
  useEffect(() => {
    sendRef.current = send;
  });

  // Join an invited room, or else attempt to rejoin an in-progress game after
  // a refresh.
  //
  // Deferred by a tick on purpose: React's development mode mounts, unmounts and
  // remounts a component immediately, and sending the entry message straight
  // from the effect body opened two sockets and seated the player twice. A
  // timeout the cleanup can cancel means only the surviving mount connects.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const invited = autoJoinRef.current;
      if (invited) {
        localStorage.removeItem(TOKEN_KEY);
        setStatus("connecting");
        send({
          type: "join-room",
          code: invited.code,
          name: invited.name,
          dice: loadProfile().dice,
          avatar: loadProfile().avatar,
          auth: getToken() ?? undefined,
        });
        return;
      }
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        setStatus("connecting");
        send({ type: "reconnect", token });
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      // Leaving the screen: this close is ours, so the socket must not be chased.
      closingRef.current = true;
      if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
      if (keepaliveRef.current != null) window.clearInterval(keepaliveRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface notable events as toasts.
  useEffect(() => {
    if (!game) {
      lastLogLen.current = 0;
      return;
    }
    const fresh = game.log.slice(lastLogLen.current);
    lastLogLen.current = game.log.length;
    for (const e of fresh) {
      const t = toastFor(e, game);
      if (t) setToast(t);
    }
  }, [game]);

  // Stop the drain timer if the component goes away mid-animation.
  useEffect(() => () => clearQueue(), [clearQueue]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(id);
  }, [toast]);

  const leave = useCallback(() => {
    send({ type: "leave" });
    localStorage.removeItem(TOKEN_KEY);
    resetToMenu();
  }, [send, resetToMenu]);

  return {
    status,
    lobby,
    game,
    youId,
    code,
    error,
    toast,
    rollOff,
    rematchState,
    isRolling,
    rollingIndices,
    rollingDice,
    presence,
    skins,
    avatars,
    turnTimer,
    isSpectator,
    reconnecting,
    emotes,
    sendEmote: (emote) => send({ type: "emote", emote }),
    createRoom: (name, opts) =>
      send({
        type: "create-room",
        name,
        isPublic: opts?.isPublic,
        goal: opts?.goal,
        dice: loadProfile().dice,
        avatar: loadProfile().avatar,
        auth: getToken() ?? undefined,
      }),
    joinRoom: (roomCode, name) =>
      send({
        type: "join-room",
        code: roomCode,
        name,
        dice: loadProfile().dice,
        avatar: loadProfile().avatar,
        auth: getToken() ?? undefined,
      }),
    quickMatch: (name) =>
      send({
        type: "quick-match",
        name,
        dice: loadProfile().dice,
        avatar: loadProfile().avatar,
        auth: getToken() ?? undefined,
      }),
    spectate: (roomCode) => {
      setIsSpectator(true);
      setStatus("connecting");
      send({ type: "spectate", code: roomCode });
    },
    setReady: (ready) => send({ type: "set-ready", ready }),
    setGoal: (goal) => send({ type: "set-goal", goal }),
    addBot: (personality) => send({ type: "add-bot", personality }),
    removeSeat: (seatId) => send({ type: "remove-seat", seatId }),
    setTeams: (teams) => send({ type: "set-teams", teams }),
    setSeatTeam: (seatId, team) => send({ type: "set-seat-team", seatId, team }),
    setTurnTimerEnabled: (enabled) => send({ type: "set-turn-timer", enabled }),
    startGame: () => send({ type: "start-game" }),
    roll: () => send({ type: "game-action", action: { type: "ROLL" } }),
    bank: () => send({ type: "game-action", action: { type: "BANK" } }),
    rematch: () => send({ type: "rematch" }),
    toLobby: () => send({ type: "to-lobby" }),
    leave,
    dismissError: () => setError(null),
  };
}
