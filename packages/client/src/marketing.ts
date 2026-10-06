import {
  flushGrowthEvents,
  initGrowth,
  recordGrowthEvent,
  setUsageEnabled,
  usageEnabled,
} from "./game/growth.js";
import { GROWTH_CAMPAIGNS } from "@greed/protocol";
import "./styles/marketing.css";

if (window.location.pathname.startsWith("/welcome")) {
  initGrowth(true);
  const campaign =
    GROWTH_CAMPAIGNS.find((c) => c === new URLSearchParams(location.search).get("utm_campaign")) ??
    "none";
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-play]")) {
    const url = new URL(link.href);
    url.searchParams.set("source", "landing");
    url.searchParams.set("utm_campaign", campaign);
    link.href = url.toString();
    link.addEventListener("click", () => {
      recordGrowthEvent(
        url.searchParams.get("practice") === "1"
          ? "landing_practice_selected"
          : "landing_daily_selected",
      );
      flushGrowthEvents();
    });
  }
}
const version = document.querySelector("[data-app-version]");
if (version) version.textContent = `GREED · v${__APP_VERSION__}`;
const toggle = document.querySelector<HTMLButtonElement>("#usage-toggle");
const status = document.querySelector("#usage-status");
function update() {
  if (toggle) {
    toggle.textContent = usageEnabled()
      ? "Turn usage measurements off"
      : "Turn usage measurements on";
    toggle.setAttribute("aria-pressed", String(usageEnabled()));
  }
  if (status)
    status.textContent = usageEnabled()
      ? "Usage measurements are on for this browser."
      : "Usage measurements are off for this browser. Browser privacy signals take priority.";
}
toggle?.addEventListener("click", () => {
  setUsageEnabled(!usageEnabled());
  update();
});
update();
