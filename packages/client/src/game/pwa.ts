import { useEffect, useState } from "react";

/**
 * Progressive-web-app glue: register the service worker (production only, to keep
 * dev HMR clean) and manage the browser's install prompt.
 */

/** Register the app-shell service worker so offline play works after first load. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* install prompt / offline just won't be available */
    });
  });
}

// The captured beforeinstallprompt event (Chromium), plus subscribers for changes.
type PromptEvent = Event & { prompt: () => void; userChoice: Promise<unknown> };
let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** Start listening for install availability. Call once at startup. */
export function initInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** React hook: whether an install is offered, and a trigger for it. */
export function useInstallPrompt(): { canInstall: boolean; promptInstall: () => void } {
  const [canInstall, setCanInstall] = useState(deferred != null);

  useEffect(() => {
    const l = () => setCanInstall(deferred != null);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const promptInstall = () => {
    if (!deferred) return;
    deferred.prompt();
    void deferred.userChoice.finally(() => {
      deferred = null;
      notify();
    });
  };

  return { canInstall, promptInstall };
}
