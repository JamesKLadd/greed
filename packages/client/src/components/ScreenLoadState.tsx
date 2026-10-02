import { useT } from "../i18n/i18n.js";
import { Button } from "../ui/Button.js";
import { Screen } from "../ui/Screen.js";

/** A pending/failed screen leaves app-level invitations and Home available. */
export function ScreenLoadState({
  failed = false,
  onBack,
}: {
  failed?: boolean;
  onBack: () => void;
}) {
  const t = useT();
  return (
    <Screen title={failed ? t("screen.unavailable") : "GREED"}>
      <p role={failed ? "alert" : "status"}>
        {t(failed ? "screen.recoverHint" : "screen.loading")}
      </p>
      <div className="setup__actions">
        <Button onClick={onBack}>{t("bar.home")}</Button>
        {failed && (
          <Button variant="roll" onClick={() => location.reload()}>
            {t("crash.reload")}
          </Button>
        )}
      </div>
    </Screen>
  );
}
