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
import { useAuth } from "../game/auth.js";
import { useI18n } from "../i18n/i18n.js";
import { Button } from "../ui/index.js";

export function PracticeChallengeScreen({
  onBack,
  onDaily,
  onCreateAccount,
  onSignIn,
}: {
  onBack: () => void;
  onDaily: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const { t, n } = useI18n();
  const { status } = useAuth();
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
  const selectDaily = (next: () => void) => {
    recordGrowthEvent("practice_daily_selected");
    next();
  };
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
            <p className="growth-practice__score-label">{t("growth.practiceScore")}</p>
            <div className="daily__score">{n(practice.result().score)}</div>
            <p>{t("growth.practiceNext")}</p>
            <div className="growth-practice__next">
              <Button
                variant="roll"
                size="lg"
                disabled={status === "loading"}
                onClick={() => selectDaily(status === "authed" ? onDaily : onCreateAccount)}
              >
                {t(status === "authed" ? "growth.tryDaily" : "growth.createForDaily")}
              </Button>
              {status === "anon" && (
                <Button variant="ghost" onClick={() => selectDaily(onSignIn)}>
                  {t("growth.signInForDaily")}
                </Button>
              )}
            </div>
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
