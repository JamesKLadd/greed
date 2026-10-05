import { useRef, useState } from "react";
import { Button } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import { recordGrowthEvent, type GrowthEvent } from "../game/growth.js";

export function ShareAction({
  title,
  text,
  url,
  label,
  event,
  createFile,
}: {
  title: string;
  text: string;
  url: string;
  label: string;
  event: GrowthEvent;
  createFile?: () => Promise<File>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [manual, setManual] = useState(false);
  const locked = useRef(false);
  const fullText = `${text}\n${url}`;

  const send = async (copy: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFeedback("");
    setManual(false);
    try {
      if (!copy && typeof navigator.share === "function") {
        let file: File | null = null;
        if (
          createFile &&
          navigator.canShare?.({ files: [new File([], "greed.png", { type: "image/png" })] })
        ) {
          try {
            file = await createFile();
          } catch {
            /* The message can still be shared. */
          }
        }
        await navigator.share(
          file ? { title, text: fullText, files: [file] } : { title, text, url },
        );
        setFeedback(t("growth.shared"));
      } else {
        await navigator.clipboard.writeText(fullText);
        setFeedback(t("growth.copied"));
      }
      recordGrowthEvent(event);
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) setManual(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const download = async () => {
    if (!createFile || locked.current) return;
    locked.current = true;
    setBusy(true);
    setFeedback("");
    try {
      const file = await createFile();
      const blobUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setFeedback(t("growth.imageSaved"));
    } catch {
      setFeedback(t("growth.imageFailed"));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="growth-share">
      <div className="growth-share__actions">
        <Button variant="roll" disabled={busy} onClick={() => void send(false)}>
          {label}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void send(true)}>
          {t("growth.copy")}
        </Button>
        {createFile && (
          <Button variant="ghost" disabled={busy} onClick={() => void download()}>
            {t("growth.saveImage")}
          </Button>
        )}
      </div>
      <p className="growth-share__feedback" role="status">
        {feedback}
      </p>
      {manual && (
        <label className="growth-share__manual">
          {t("growth.copyManually")}
          <textarea readOnly value={fullText} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}
