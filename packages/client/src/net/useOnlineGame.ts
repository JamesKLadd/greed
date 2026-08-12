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

  // ---- display queue -------------------------------------------------------
  // Snapshots arrive from the server the instant they happen, but showing them
  // that way meant a roll's RESULT — the newly locked dice, the higher turn
  // score — appeared while the dice were still tumbling. So arrivals are queued
  // and released on a schedule instead: a roll's snapshot is held back until its
  // animation has run, and a finished turn is guaranteed its full time on screen.
  // Everything downstream (sounds, toasts, the table) reads the displayed state,
  // so they all stay in step with what the player is actually looking at.
  const displayQueueRef = useRef<{ state: GameState; showAt: number }[]>([]);
  const drainTimerRef = useRef<number | null>(null);
  /** Earliest the currently displayed snapshot may be replaced. */
  const holdUntilRef = useRef(0);
  /** Last snapshot ACCEPTED (not necessarily shown) — the queue's own tail. */
  const lastQueuedRef = useRef<GameState | null>(null);
  const queuedLogLen = useRef(0);

  /** Show a queued snapshot and decide how long it must stay up. */
  const showSnapshot = useCallback((next: GameState) => {
    setIsRolling(false);
    setRollingIndices([]);
    setRollingDice(null);
    setGame(next);
    // A finished turn (bust or bank) earns a pause; anything else may be
    // replaced as soon as the next snapshot is due.
    holdUntilRef.current = performance.now() + (next.turn.outcome ? OUTCOME_HOLD_MS : 0);
  }, []);

  const drain = useCallback(() => {
    if (drainTimerRef.current != null) return;
    const head = displayQueueRef.current[0];
    if (!head) return;
    const wait = Math.max(head.showAt, holdUntilRef.current) - performance.now();
    if (wait > 0) {
      drainTimerRef.current = window.setTimeout(() => {
        drainTimerRef.current = null;
        drain();
      }, wait);
      return;
    }
    displayQueueRef.current.shift();
    showSnapshot(head.state);
    drain();
  }, [showSnapshot]);

  /**
   * Accept a snapshot for display. A snapshot carrying a fresh roll starts the
   * dice tumbling straight away but is itself withheld until the tumble ends —
   * that gap is the whole point, and it's why the queue exists.
   */
  const enqueueGame = useCallback(
    (next: GameState) => {
      const prev = lastQueuedRef.current;
      // A shorter log than last time means a new game (rematch) — resync and
      // drop anything still waiting, which belongs to the game just ended.
      if (next.log.length < queuedLogLen.current) {
        displayQueueRef.current = [];
        queuedLogLen.current = 0;
        holdUntilRef.current = 0;
      }
      const fresh = next.log.slice(queuedLogLen.current);
      queuedLogLen.current = next.log.length;

      let showAt = performance.now();
      if (fresh.some((e) => e.type === "roll")) {
        // Tumble the dice this throw actually put in the air: the ones that were
        // unlocked before it, or all five after hot dice.
        const indices =
          prev && prev.turn.playerIndex === next.turn.playerIndex && !prev.turn.hotDice
            ? prev.turn.locked.map((locked, i) => (locked ? -1 : i)).filter((i) => i >= 0)
            : diceToRoll(next.turn);
        setRollingIndices(indices);
        // The snapshot being withheld already holds the thrown faces, so the
        // dice can turn straight to them while the rest of it waits.
        setRollingDice(next.turn.dice);
        setIsRolling(true);
        showAt += ROLL_ANIM_MS;
      }
      lastQueuedRef.current = next;
      displayQueueRef.current.push({ state: next, showAt });
      drain();
    },
    [drain],
  );

  /** Drop anything waiting to be shown — the game it belonged to is gone. */
  const clearQueue = useCallback(() => {
    displayQueueRef.current = [];
    if (drainTimerRef.current != null) window.clearTimeout(drainTimerRef.current);
    drainTimerRef.current = null;
    holdUntilRef.current = 0;
    lastQueuedRef.current = null;
    queuedLogLen.current = 0;
    setIsRolling(false);
    setRollingIndices([]);
    setRollingDice(null);
  }, []);

  const resetToMenu = useCallback(() => {
    clearQueue();
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
  }, [clearQueue]);

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
          localStorage.setItem(TOKEN_KEY, msg.token);
          break;
        case "spectating":
          // A watcher holds no seat: no youId, no reconnect token. The lobby/game
          // snapshot that follows drives the status.
          setIsSpectator(true);
          setCode(msg.code);
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
          setStatus((s) => (s === "connecting" ? "menu" : s));
          break;
        case "left":
          localStorage.removeItem(TOKEN_KEY);
          resetToMenu();
          break;
        case "pong":
          break;
      }
    },
    [resetToMenu, clearQueue, enqueueGame],
  );

  const ensureSocket = useCallback(() => {
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return existing;
    }
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;
    ws.onmessage = (e) => handleMessage(e.data.toString());
    ws.onopen = () => {
      for (const m of queueRef.current) ws.send(encode(m));
      queueRef.current = [];
    };
    ws.onerror = () => {
      setError("Cannot reach the server. Is it running?");
      setStatus((s) => (s === "connecting" ? "menu" : s));
    };
    return ws;
  }, [handleMessage]);

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
    startGame: () => send({ type: "start-game" }),
    roll: () => send({ type: "game-action", action: { type: "ROLL" } }),
    bank: () => send({ type: "game-action", action: { type: "BANK" } }),
    rematch: () => send({ type: "rematch" }),
    toLobby: () => send({ type: "to-lobby" }),
    leave,
    dismissError: () => setError(null),
  };
}
