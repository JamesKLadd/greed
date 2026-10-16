import type { SeasonalTheme } from "./seasonal.js";

export const SHARE_PALETTES: Record<
  SeasonalTheme,
  { from: string; to: string; frame: string; text: string; accent: string }
> = {
  classic: {
    from: "#215b48",
    to: "#091c22",
    frame: "#d5b773",
    text: "#fff4d6",
    accent: "#f7d782",
  },
  halloween: {
    from: "#382346",
    to: "#130e22",
    frame: "#c58d55",
    text: "#fff4df",
    accent: "#ffbc78",
  },
  christmas: {
    from: "#214e40",
    to: "#101e21",
    frame: "#d8b77a",
    text: "#fff4df",
    accent: "#f5d997",
  },
  summer: {
    from: "#125d67",
    to: "#102e42",
    frame: "#e6c48b",
    text: "#fff5e4",
    accent: "#ffd792",
  },
};

/** Ornament stays at the edges so long translated labels and scores keep their space. */
export function drawSeasonalShareArt(ctx: CanvasRenderingContext2D, theme: SeasonalTheme): void {
  if (theme === "classic") return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (theme === "halloween") drawHauntedParlor(ctx);
  else if (theme === "christmas") drawFiresideLodge(ctx);
  else drawBoardwalkClub(ctx);
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width: number): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke();
}

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.fillStyle = fill;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function bat(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.fillStyle = "#c9ddc9";
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-12, -14, -35, -22, -47, -12);
  ctx.bezierCurveTo(-36, -7, -36, 2, -31, 9);
  ctx.quadraticCurveTo(-20, 1, -16, 16);
  ctx.quadraticCurveTo(-6, 9, 0, 22);
  ctx.quadraticCurveTo(6, 9, 16, 16);
  ctx.quadraticCurveTo(20, 1, 31, 9);
  ctx.bezierCurveTo(36, 2, 36, -7, 47, -12);
  ctx.bezierCurveTo(35, -22, 12, -14, 0, 3);
  ctx.fill();
  circle(ctx, 0, 7, 7, "#c9ddc9");
  line(ctx, [-5, 4, -6, -6, 0, 0, 6, -6, 5, 4], "#c9ddc9", 3);
  ctx.restore();
}

function drawHauntedParlor(ctx: CanvasRenderingContext2D): void {
  // The corner webs and lantern are deliberately outside every text baseline.
  for (const mirror of [false, true]) {
    ctx.save();
    if (mirror) {
      ctx.translate(1080, 0);
      ctx.scale(-1, 1);
    }
    for (const reach of [66, 104, 146]) {
      line(
        ctx,
        [42, reach, 42 + (reach - 42) * 0.7, 42 + (reach - 42) * 0.7, reach, 42],
        "#8b7891",
        1.5,
      );
    }
    line(ctx, [42, 42, 152, 152], "#8b7891", 1.5);
    ctx.restore();
  }
  bat(ctx, 975, 117, 0.85);
  bat(ctx, 112, 990, 0.55);
  line(ctx, [100, 71, 100, 97], "#c58d55", 3);
  ctx.strokeStyle = "#c58d55";
  ctx.lineWidth = 3;
  ctx.strokeRect(79, 104, 42, 55);
  line(ctx, [74, 104, 100, 92, 126, 104], "#c58d55", 3);
  const glow = ctx.createRadialGradient(100, 138, 1, 100, 138, 35);
  glow.addColorStop(0, "#ffcb7d80");
  glow.addColorStop(1, "#ffcb7d00");
  ctx.fillStyle = glow;
  ctx.fillRect(65, 103, 70, 70);
  line(ctx, [100, 122, 100, 149], "#ffcb7d", 6);
  line(ctx, [78, 164, 122, 164], "#c58d55", 3);
  circle(ctx, 978, 984, 17, "#ffbc78");
  circle(ctx, 985, 977, 15, "#171024");
}

function pine(ctx: CanvasRenderingContext2D, x: number, y: number, flip = false): void {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  line(ctx, [0, 0, 104, 76], "#d8b77a", 2.5);
  for (let i = 0; i < 6; i++) {
    const tipX = i * 16;
    const tipY = i * 12;
    line(ctx, [tipX - 6, tipY + 26, tipX + 8, tipY + 5, tipX + 32, tipY], "#72a68a", 4);
    line(ctx, [tipX + 1, tipY + 36, tipX + 16, tipY + 12, tipX + 42, tipY + 9], "#4c806a", 3);
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.fillStyle = "#f5d997";
  ctx.moveTo(x, y - radius);
  ctx.quadraticCurveTo(x + radius * 0.2, y - radius * 0.2, x + radius, y);
  ctx.quadraticCurveTo(x + radius * 0.2, y + radius * 0.2, x, y + radius);
  ctx.quadraticCurveTo(x - radius * 0.2, y + radius * 0.2, x - radius, y);
  ctx.quadraticCurveTo(x - radius * 0.2, y - radius * 0.2, x, y - radius);
  ctx.fill();
}

function drawFiresideLodge(ctx: CanvasRenderingContext2D): void {
  pine(ctx, 57, 59);
  pine(ctx, 1023, 59, true);
  line(ctx, [111, 86, 111, 149], "#d8b77a", 2);
  line(ctx, [969, 86, 969, 149], "#d8b77a", 2);
  for (const x of [111, 969]) {
    circle(ctx, x, 158, 18, "#a94953");
    circle(ctx, x - 5, 152, 4, "#f4c1b0");
    line(ctx, [x - 5, 139, x + 5, 139], "#d8b77a", 4);
  }
  star(ctx, 89, 983, 18);
  star(ctx, 990, 985, 14);
  star(ctx, 966, 960, 6);
  line(ctx, [69, 1018, 138, 1018], "#a94953", 4);
  line(ctx, [942, 1018, 1011, 1018], "#a94953", 4);
}

function drawBoardwalkClub(ctx: CanvasRenderingContext2D): void {
  // Two fine lines make a rope-like inner frame without covering the score area.
  ctx.strokeStyle = "#e6c48b70";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 7]);
  ctx.strokeRect(47, 47, 986, 986);
  ctx.setLineDash([]);
  circle(ctx, 103, 107, 23, "#ffd792");
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * i) / 4;
    line(
      ctx,
      [
        103 + Math.cos(angle) * 33,
        107 + Math.sin(angle) * 33,
        103 + Math.cos(angle) * 43,
        107 + Math.sin(angle) * 43,
      ],
      "#e8b57e",
      2.5,
    );
  }
  ctx.beginPath();
  ctx.strokeStyle = "#ef9685";
  ctx.lineWidth = 4;
  ctx.arc(972, 119, 30, Math.PI, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    line(
      ctx,
      [932 + i * 5, 124 + i * 11, 1012 - i * 5, 124 + i * 11],
      i === 0 ? "#ef9685" : "#86c9c5",
      2.5,
    );
  }
  for (const x of [92, 988]) {
    ctx.beginPath();
    ctx.strokeStyle = "#86c9c5";
    ctx.lineWidth = 2.5;
    ctx.moveTo(x - 33, 982);
    ctx.bezierCurveTo(x - 22, 970, x - 11, 994, x, 982);
    ctx.bezierCurveTo(x + 11, 970, x + 22, 994, x + 33, 982);
    ctx.stroke();
  }
}
