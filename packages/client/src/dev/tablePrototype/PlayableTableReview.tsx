import { useLayoutEffect, useState } from "react";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import { PERSONALITIES, teamsAvailable, type MatchSetup } from "../../game/setup.js";
import { GameScreen } from "../../screens/GameScreen.js";
import { DevFrameMeter } from "./DevFrameMeter.js";

const NAMES = ["James", "Bear", "Cleo", "Pip", "Oliver", "Frankie", "Violet", "Rusty"];
const LONG_NAMES = [
  "Alexandria Vale",
  "Christopher Moss",
  "Wellington Rowan",
  "Penelope Winters",
  "Montgomery Finch",
  "Maximilian Banks",
  "Anastasia Willow",
  "Theodore Sterling",
];

function numberParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null || !raw.trim()) return fallback;
  const value = Math.trunc(Number(raw));
  return Number.isSafeInteger(value) ? value : fallback;
}

function enabled(params: URLSearchParams, key: string): boolean {
  return params.has(key) && !["0", "false"].includes(params.get(key)!.toLowerCase());
}

/** URL-controlled setup only; the ordinary controller owns all rolls, bots and match state. */
function reviewSetup(params: URLSearchParams): MatchSetup {
  const count = Math.max(2, Math.min(8, numberParam(params, "players", 4)));
  const solo = enabled(params, "solo");
  const names = enabled(params, "stress") ? LONG_NAMES : NAMES;
  return {
    seed: numberParam(params, "seed", 2525),
    goal: Math.max(100, numberParam(params, "goal", 1000)),
    teams: enabled(params, "teams") && teamsAvailable(count),
    seats: Array.from({ length: count }, (_, index) => ({
      id: `table-review-${index}`,
      name: names[index],
      isBot: solo && index > 0,
      personality: PERSONALITIES[index % PERSONALITIES.length],
      team: index % 2,
    })),
  };
}

/** Development fixture: real local gameplay with deterministic setup and no recorded results. */
export default function PlayableTableReview() {
  const [setup] = useState(() => reviewSetup(new URLSearchParams(window.location.search)));

  useLayoutEffect(() => {
    const previous = document.documentElement.dataset.presentation;
    document.documentElement.dataset.presentation = "beta";
    return () => {
      if (previous === undefined) delete document.documentElement.dataset.presentation;
      else document.documentElement.dataset.presentation = previous;
    };
  }, []);

  return (
    <BetaActiveContext.Provider value={true}>
      <GameScreen
        setup={setup}
        recordResults={false}
        onExit={() => window.location.assign("/?table-preview")}
      />
      <DevFrameMeter />
    </BetaActiveContext.Provider>
  );
}
