import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { I18nProvider } from "./i18n/i18n.js";
import { AuthProvider } from "./game/auth.js";
import { ChallengeProvider } from "./net/challenges.js";
import { primeAudioOnFirstGesture, installUiClicks } from "./game/sfx.js";
import { applySettings, loadSettings } from "./game/settings.js";
import { registerServiceWorker, initInstallPrompt } from "./game/pwa.js";
import "./styles.css";
import { BetaProvider } from "./beta/BetaContext.js";

// Apply saved accessibility/display preferences before first paint.
applySettings(loadSettings());

// Browsers keep audio suspended until the first interaction — arm it once,
// and give every button a soft click.
primeAudioOnFirstGesture();
installUiClicks();

// Progressive-web-app: offline caching + install prompt.
registerServiceWorker();
initInstallPrompt();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <AuthProvider>
          <ChallengeProvider>
            <BetaProvider>
              <App />
            </BetaProvider>
          </ChallengeProvider>
        </AuthProvider>
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
