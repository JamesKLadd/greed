/** A spoiler-free result image created on the player's device. */
export async function dailyShareImage({
  day,
  date,
  score,
  best,
  bestLabel,
  challengeLabel,
  pointsLabel,
  hook,
  portrait,
}: {
  day: string;
  date: string;
  score: string;
  best: string;
  bestLabel: string;
  challengeLabel: string;
  pointsLabel: string;
  hook: string;
  portrait?: SVGSVGElement | null;
}): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export unavailable");
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, "#215b48");
  gradient.addColorStop(1, "#091c22");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = "#d5b773";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, 1008, 1008);
  ctx.textAlign = "center";
  const line = (text: string, y: number, size: number, color = "#fff4d6") => {
    ctx.fillStyle = color;
    while (size > 16) {
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      if (ctx.measureText(text).width <= 920) break;
      size -= 2;
    }
    ctx.fillText(text, 540, y);
  };
  line("GREED", 175, 110, "#f7d782");
  line(challengeLabel, 244, 38);
  line(date, 301, 32);
  if (portrait) {
    const source = new XMLSerializer().serializeToString(portrait);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      ctx.drawImage(image, 450, 335, 180, 180);
    } catch {
      // A portrait failure must not prevent sharing the score.
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  line(score, 670, 154, "#f7d782");
  line(pointsLabel, 733, 38);
  line(`${bestLabel}: ${best}`, 826, 42);
  line(hook, 922, 46);
  line("playgreed.vercel.app", 994, 28);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Image export unavailable");
  return new File([blob], `greed-daily-${day}.png`, { type: "image/png" });
}
