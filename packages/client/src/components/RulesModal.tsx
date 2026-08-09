import type { DieValue } from "@greed/core";
import { Die } from "./Die.js";
import { Button, Modal } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

interface RulesModalProps {
  onClose: () => void;
}

interface Example {
  dice: DieValue[];
  points: string;
  whyKey: MsgKey;
}

const EXAMPLES: Example[] = [
  { dice: [1, 3, 2, 4, 6], points: "100", whyKey: "rules.ex.one" },
  { dice: [5, 2, 3, 4, 6], points: "50", whyKey: "rules.ex.five" },
  { dice: [1, 1, 5, 3, 2], points: "250", whyKey: "rules.ex.onesFives" },
  { dice: [6, 6, 6, 2, 3], points: "600", whyKey: "rules.ex.triple" },
  { dice: [1, 2, 3, 4, 5], points: "500", whyKey: "rules.ex.straight" },
];

export function RulesModal({ onClose }: RulesModalProps) {
  const t = useT();
  return (
    <Modal
      onClose={onClose}
      title={t("rules.title")}
      size="wide"
      scroll
      actions={
        <Button variant="roll" onClick={onClose}>
          {t("rules.gotIt")}
        </Button>
      }
    >
      <div className="rules">
        <p>
          <strong>{t("rules.goalLead")}</strong>
          {t("rules.goalText")}
        </p>
        <ul>
          <li>{t("rules.li.autoLock")}</li>
          <li>
            <strong>{t("rules.li.rerollLead")}</strong>
            {t("rules.li.rerollText")}
          </li>
          <li>
            <strong>{t("rules.li.hotLead")}</strong>
            {t("rules.li.hotText")}
          </li>
        </ul>

        <h3 className="rules__subhead">{t("rules.scoring")}</h3>
        <ul className="rules__examples">
          {EXAMPLES.map((ex, i) => (
            <li key={i} className="rules__example">
              <span className="rules__dice">
                {ex.dice.map((d, j) => (
                  <Die key={j} value={d} size={30} />
                ))}
              </span>
              <span className="rules__points">= {ex.points}</span>
              <span className="rules__why">{t(ex.whyKey)}</span>
            </li>
          ))}
        </ul>
        <p className="rules__note">{t("rules.note")}</p>

        <h3 className="rules__subhead">{t("rules.finishHead")}</h3>
        <p>{t("rules.finishText")}</p>
      </div>
    </Modal>
  );
}
