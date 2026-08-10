import { useCallback, useEffect, useRef, useState } from "react";
import type { BotPersonality, GameState } from "@greed/core";
import type { EmoteId } from "@greed/protocol";
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
import { loadProfile } from "../game/profile.js";
import { getToken } from "./auth.js";

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
  /** Equipped dice-skin id per player id (for rendering the current player's dice). */
  skins: Record<string, string>;
  /** True when this client is a read-only watcher (no seat). */
  isSpectator: boolean;
  /** Most recent reaction per player id, with a nonce so repeats re-animate. */
  emotes: Record<string, { emote: EmoteId; at: number }>;
  sendEmote: (emote: EmoteId) => void;
  createRoom: (name: string, opts?: { isPublic?: boolean; goal?: number }) => void;
  joinRoom: (code: string, name: string) => void;
  quickMatch: (name: string) => void;
  spectate: (code: string) => void;
  setReady: (ready: boolean) => void;
  setGoal: (goal: number) => void;
  addBot: (personality?: BotPersonality) => void;
  removeSeat: (seatId: string) => void;
  startGame: () => void;
  roll: () => void;
  bank: () => void;
  rematch: () => void;
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
  const [isRolling, setIsRolling] = useState(false);
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollTick, setRollTick] = useState(0);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [skins, setSkins] = useState<Record<string, string>>({});
  const [isSpectator, setIsSpectator] = useState(false);
  const [emotes, setEmotes] = useState<Record<string, { emote: EmoteId; at: number }>>({});
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
    setSkins({});
    setIsSpectator(false);
    setEmotes({});
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
          const nextSkins: Record<string, string> = {};
          for (const s of msg.skins ?? []) nextSkins[s.id] = s.dice;
          setSkins(nextSkins);
          setGame(msg.state);
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
    skins,
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
        auth: getToken() ?? undefined,
      }),
    joinRoom: (roomCode, name) =>
      send({
        type: "join-room",
        code: roomCode,
        name,
        dice: loadProfile().dice,
        auth: getToken() ?? undefined,
      }),
    quickMatch: (name) =>
      send({ type: "quick-match", name, dice: loadProfile().dice, auth: getToken() ?? undefined }),
    spectate: (roomCode) => {
      setIsSpectator(true);
      setStatus("connecting");
      send({ type: "spectate", code: roomCode });
    },
    setReady: (ready) => send({ type: "set-ready", ready }),
    setGoal: (goal) => send({ type: "set-goal", goal }),
    addBot: (personality) => send({ type: "add-bot", personality }),
    removeSeat: (seatId) => send({ type: "remove-seat", seatId }),
    startGame: () => send({ type: "start-game" }),
    roll: () => send({ type: "game-action", action: { type: "ROLL" } }),
    bank: () => send({ type: "game-action", action: { type: "BANK" } }),
    rematch: () => send({ type: "rematch" }),
    leave,
    dismissError: () => setError(null),
  };
}
