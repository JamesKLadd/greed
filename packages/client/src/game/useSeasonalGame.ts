import { useLayoutEffect, useRef } from "react";
import type { GameState } from "@greed/core";
import { pinSeasonalGame, releaseSeasonalGame } from "./seasonal.js";

/** Own the appearance only while a table/run is mounted, leaving lobbies live. */
export function useSeasonalGame(
  identity?: unknown,
  snapshot?: Pick<GameState, "log" | "phase">,
): void {
  const owner = useRef({}).current;
  const match = useRef({
    identity,
    token: {},
    logLength: snapshot?.log.length,
    phase: snapshot?.phase,
  });
  const logLength = snapshot?.log.length;
  const phase = snapshot?.phase;
  useLayoutEffect(() => {
    const previous = match.current;
    // Online seeds are sanitized and reconnects change presentationEpoch.
    // A shorter authoritative log or leaving a finished game identifies a
    // rematch without repainting an ordinary reconnect within the same game.
    const rematch =
      logLength !== undefined &&
      previous.logLength !== undefined &&
      (logLength < previous.logLength || (previous.phase === "game-over" && phase !== "game-over"));
    if (identity !== previous.identity || rematch) previous.token = {};
    previous.identity = identity;
    previous.logLength = logLength;
    previous.phase = phase;
    pinSeasonalGame(owner, previous.token);
  }, [owner, identity, logLength, phase]);
  useLayoutEffect(() => () => releaseSeasonalGame(owner), [owner]);
}
