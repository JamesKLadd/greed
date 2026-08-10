/**
 * Friend challenges, and the notification socket they arrive on.
 *
 * While you're signed in the app holds one small WebSocket that carries no game
 * state: it tells the server you're here (which is what "online" means in the
 * friends list) and it is how an invite reaches you wherever you are in the app,
 * rather than only while you happen to be sitting in the online menu.
 *
 * Accepting a challenge is not a handshake — the server has already made the
 * private room, so both players simply join it by code. That means there is no
 * intermediate state to get stuck in if someone closes their laptop mid-invite.
 *
 * A backgrounded tab drops the socket after a minute: a phone in a pocket
 * shouldn't hold a connection open or show its owner as available to play.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { decode, encode, type ClientMessage, type ServerMessage } from "@greed/protocol";
import { ONLINE_ENABLED, SERVER_URL } from "../game/online.js";
import { useAuth } from "../game/auth.js";
import { getToken } from "./auth.js";

/** Backoff between reconnect attempts (the last value repeats). */
const RETRY_MS = [2000, 5000, 10000, 20000, 30000];
/** How long a hidden tab keeps its notification socket. */
const IDLE_CLOSE_MS = 60_000;

export interface Invite {
  id: string;
  /** Username of the friend who sent it. */
  from: string;
  /** Private room to join to accept. */
  code: string;
}

/** A short-lived status line about a challenge you sent. */
export type ChallengeNotice =
  { kind: "waiting"; name: string } | { kind: "declined"; name: string };

interface ChallengeContextValue {
  /** True once the server has acknowledged this connection. */
  connected: boolean;
  /** The newest invite waiting on an answer. */
  invite: Invite | null;
  notice: ChallengeNotice | null;
  error: string | null;
  /** Room code to drop the player into, once they've accepted (or sent) one. */
  joinCode: string | null;
  challenge: (username: string) => void;
  accept: () => void;
  decline: () => void;
  dismissNotice: () => void;
  dismissError: () => void;
  clearJoin: () => void;
}

const ChallengeContext = createContext<ChallengeContextValue | null>(null);

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [notice, setNotice] = useState<ChallengeNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  const enabled = ONLINE_ENABLED && status === "authed";

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let attempt = 0;
    let retryTimer = 0;
    let idleTimer = 0;

    const handle = (msg: ServerMessage) => {
      switch (msg.type) {
        case "hello-ok":
          setConnected(true);
          setError(null);
          break;
        case "challenge-invite":
          setInvite({ id: msg.id, from: msg.from, code: msg.code });
          break;
        case "challenge-sent":
          // The room is already waiting: go and sit in it while they answer.
          setNotice({ kind: "waiting", name: msg.to });
          setJoinCode(msg.code);
          break;
        case "challenge-declined":
          setNotice({ kind: "declined", name: msg.from });
          break;
        case "error":
          setError(msg.message);
          break;
        default:
          break; // this socket holds no seat, so game traffic never arrives here
      }
    };

    const open = () => {
      if (stopped || document.hidden || wsRef.current) return;
      const token = getToken();
      if (!token) return;
      const ws = new WebSocket(SERVER_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        ws.send(encode({ type: "hello", auth: token } satisfies ClientMessage));
      };
      ws.onmessage = (e) => {
        try {
          handle(decode<ServerMessage>(e.data.toString()));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        scheduleRetry();
      };
      // A failed connect fires onclose too, which is where the retry lives.
      ws.onerror = () => {};
    };

    const scheduleRetry = () => {
      if (stopped || document.hidden) return;
      const delay = RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)];
      retryTimer = window.setTimeout(open, delay);
    };

    const onVisibility = () => {
      window.clearTimeout(idleTimer);
      if (document.hidden) {
        idleTimer = window.setTimeout(() => wsRef.current?.close(), IDLE_CLOSE_MS);
      } else if (!wsRef.current) {
        attempt = 0;
        open();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    open();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(idleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      setConnected(false);
    };
  }, [enabled]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(encode(msg));
    return true;
  }, []);

  const challenge = useCallback(
    (username: string) => {
      setNotice(null);
      if (!send({ type: "challenge", username })) {
        setError("Not connected to the game server yet — try again in a moment.");
      }
    },
    [send],
  );

  const accept = useCallback(() => {
    if (!invite) return;
    setJoinCode(invite.code);
    setInvite(null);
  }, [invite]);

  const decline = useCallback(() => {
    if (!invite) return;
    send({ type: "challenge-decline", id: invite.id });
    setInvite(null);
  }, [invite, send]);

  const value = useMemo<ChallengeContextValue>(
    () => ({
      connected,
      invite,
      notice,
      error,
      joinCode,
      challenge,
      accept,
      decline,
      dismissNotice: () => setNotice(null),
      dismissError: () => setError(null),
      clearJoin: () => setJoinCode(null),
    }),
    [connected, invite, notice, error, joinCode, challenge, accept, decline],
  );

  return <ChallengeContext.Provider value={value}>{children}</ChallengeContext.Provider>;
}

export function useChallenges(): ChallengeContextValue {
  const ctx = useContext(ChallengeContext);
  if (!ctx) throw new Error("useChallenges must be used within a ChallengeProvider");
  return ctx;
}
