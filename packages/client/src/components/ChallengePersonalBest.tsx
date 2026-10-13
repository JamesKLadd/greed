import { useI18n } from "../i18n/i18n.js";
import { Icon } from "../ui/index.js";
import "../styles/challenge-score-feedback.css";

/** An inline record marker; the normal results remain in control of focus. */
export function ChallengePersonalBest({ announce = false }: { announce?: boolean }) {
  const { t } = useI18n();
  return (
    <p className="challenge-score-record__notice" role={announce ? "status" : undefined}>
      <Icon name="trophy" />
      <span>{t("challenge.personalBest")}</span>
    </p>
  );
}
