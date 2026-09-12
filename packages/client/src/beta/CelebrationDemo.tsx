import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import { Die } from "../components/Die.js";
import { CelebrationArt } from "./Celebration.js";
import { CELEBRATION_MS, type CelebrationKind } from "./celebrations.js";
import { playBetaCue } from "../game/sfx.js";

/** A presentation-only stage. It never creates a game or touches progression. */
export function CelebrationDemo({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [effect, setEffect] = useState<{ kind: CelebrationKind; nonce: number } | null>(null);
  const [sound, setSound] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Modal title={t("beta.previewEffects")} onClose={onClose} scroll>
      <p className="beta-gate__intro">{t("beta.demoIntro")}</p>
      <div className="beta-demo-stage">
        <div className="beta-demo-dice">
          {[0, 1, 2, 3, 4].map((i) => (
            <Die key={i} value={5} size={38} dimensional />
          ))}
        </div>
        {effect && <CelebrationArt cue={{ kind: effect.kind }} nonce={effect.nonce} />}
      </div>
      <div className="beta-demo-buttons">
        {(["hot", "five", "bank", "bigBank", "bust", "win"] as const).map((kind) => (
          <button
            className="btn"
            key={kind}
            onClick={() => {
              clearTimeout(timer.current);
              setEffect({ kind, nonce: Date.now() });
              if (sound) playBetaCue(kind);
              timer.current = setTimeout(() => setEffect(null), CELEBRATION_MS[kind]);
            }}
          >
            {t(`beta.event.${kind}`)}
          </button>
        ))}
      </div>
      <label className="beta-demo-sound">
        <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
        {t("beta.demoSound")}
      </label>
      <button className="btn btn--ghost" onClick={onClose}>
        {t("beta.close")}
      </button>
    </Modal>
  );
}
