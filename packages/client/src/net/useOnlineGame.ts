import { useCallback, useEffect, useRef, useState } from "react";
import type { BotDifficulty, BotPersonality, GameState } from "@greed/core";
import {
  decode,
  encode,
  type ClientMessage,
  type LobbyView,
  type RollOffRow,
  type ServerMessage,
} from "@greed/protocol";
import { diceToRoll } from "@greed/core";
import { toastFor, type ToastMessage } from "../game/toasts.js";
import { SERVER_URL } from "../game/online.js";

const TOKEN_KEY = "greed-token";

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
  /** Live connection status per player id (bots always true). */
  presence: Record<string, boolean>;
  /** True when this client is a read-only watcher (no seat). */
  isSpectator: boolean;
  createRoom: (name: string, opts?: { isPublic?: boolean; goal?: number }) => void;
  joinRoom: (code: string, name: string) => void;
  quickMatch: (name: string) => void;
  spectate: (code: string) => void;
  setReady: (ready: boolean) => void;
  setGoal: (goal: number) => void;
  addBot: (difficulty: BotDifficulty, personality?: BotPersonality) => void;
  removeSeat: (seatId: string) => void;
  startGame: () => void;
  roll: () => void;
  bank: () => void;
  rematch: () => void;
  leave: () => void;
  dismissError: () => void;
}

export function useOnlineGame(): OnlineController {
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);

  const [status, setStatus] = useState<OnlineStatus>("menu");
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [rollOff, setRollOff] = useState<RollOffRow[] | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollTick, setRollTick] = useState(0);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [isSpectator, setIsSpectator] = useState(false);
  const lastLogLen = useRef(0);
  const rollSeen = useRef(0);
  const prevGameRef = useRef<GameState | null>(null);
  const prevPresenceRef = useRef<Record<string, boolean>>({});
  const youIdRef = useRef<string | null>(null);

  const resetToMenu = useCallback(() => {
    setStatus("menu");
    setLobby(null);
    setGame(null);
    setRollOff(null);
    setYouId(null);
    setCode(null);
    setPresence({});
    setIsSpectator(false);
    prevPresenceRef.current = {};
  }, []);

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
          setLobby(msg.lobby);
          setGame(null);
          setRollOff(null);
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
          setGame(msg.state);
          setStatus("in-game");
          break;
        }
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
    [resetToMenu],
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

  // Attempt to rejoin an in-progress game after a refresh.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      setStatus("connecting");
      send({ type: "reconnect", token });
    }
    return () => wsRef.current?.close();
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

  // Detect a new roll in the broadcast state and briefly tumble the thrown dice.
  useEffect(() => {
    const prev = prevGameRef.current;
    if (!game) {
      rollSeen.current = 0;
      prevGameRef.current = null;
      return;
    }
    const fresh = game.log.slice(rollSeen.current);
    rollSeen.current = game.log.length;
    if (fresh.some((e) => e.type === "roll")) {
      let indices: number[];
      if (prev && prev.turn.playerIndex === game.turn.playerIndex && !prev.turn.hotDice) {
        indices = prev.turn.locked.map((locked, i) => (locked ? -1 : i)).filter((i) => i >= 0);
      } else {
        indices = diceToRoll(game.turn);
      }
      setRollingIndices(indices);
      setRollTick((t) => t + 1);
    }
    prevGameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (rollTick === 0) return;
    setIsRolling(true);
    const t = window.setTimeout(() => {
      setIsRolling(false);
      setRollingIndices([]);
    }, 600);
    return () => clearTimeout(t);
  }, [rollTick]);

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
    isRolling,
    rollingIndices,
    presence,
    isSpectator,
    createRoom: (name, opts) =>
      send({ type: "create-room", name, isPublic: opts?.isPublic, goal: opts?.goal }),
    joinRoom: (roomCode, name) => send({ type: "join-room", code: roomCode, name }),
    quickMatch: (name) => send({ type: "quick-match", name }),
    spectate: (roomCode) => {
      setIsSpectator(true);
      setStatus("connecting");
      send({ type: "spectate", code: roomCode });
    },
    setReady: (ready) => send({ type: "set-ready", ready }),
    setGoal: (goal) => send({ type: "set-goal", goal }),
    addBot: (difficulty, personality) => send({ type: "add-bot", difficulty, personality }),
    removeSeat: (seatId) => send({ type: "remove-seat", seatId }),
    startGame: () => send({ type: "start-game" }),
    roll: () => send({ type: "game-action", action: { type: "ROLL" } }),
    bank: () => send({ type: "game-action", action: { type: "BANK" } }),
    rematch: () => send({ type: "rematch" }),
    leave,
    dismissError: () => setError(null),
  };
}
