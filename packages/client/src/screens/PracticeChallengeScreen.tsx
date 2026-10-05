import { useState, useEffect, useRef } from "react";
import { ChallengeRun } from "../components/ChallengeRun.js";
import { ChallengeSummaryStats } from "../components/ChallengeLobby.js";
import {
  practiceChallenge,
  markChallengePracticed,
  PRACTICE_TURNS,
} from "../game/practiceChallenge.js";
import { loadSettings } from "../game/settings.js";
import { recordGrowthEvent } from "../game/growth.js";
import { useI18n } from "../i18n/i18n.js";
import { Button } from "../ui/index.js";

export function PracticeChallengeScreen({
  onBack,
  onDaily,
}: {
  onBack: () => void;
  onDaily: () => void;
}) {
  const { t, n } = useI18n();
  const [practice] = useState(() =>
    practiceChallenge(crypto.getRandomValues(new Uint32Array(1))[0]),
  );
  const [complete, setComplete] = useState(false);
  const measured = useRef(false);
  useEffect(() => {
    if (!measured.current) {
      measured.current = true;
      recordGrowthEvent("practice_started");
    }
  }, []);
  return (
    <div className="setup setup--challenge challenge-lobby growth-practice">
      <header className="setup__hero">
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
        <h1 className="setup__logo">{t("growth.practiceTitle")}</h1>
        <p className="setup__tagline">{t("growth.practiceIntro", { turns: PRACTICE_TURNS })}</p>
      </header>
      <div className="setup__panel daily">
        {complete ? (
          <section className="growth-practice__finished">
            <h2>{t("growth.practiceDone")}</h2>
            <div className="daily__score">{n(practice.result().score)}</div>
            <p>{t("growth.practiceNext")}</p>
            <Button variant="roll" size="lg" onClick={onDaily}>
              {t("growth.tryDaily")}
            </Button>
            <ChallengeSummaryStats result={practice.result()} />
          </section>
        ) : (
          <ChallengeRun
            initial={practice.view()}
            dice3d={loadSettings().dice3d}
            playMove={practice.play}
            practice
            onFinished={() => {
              markChallengePracticed();
              recordGrowthEvent("practice_completed");
              setComplete(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
