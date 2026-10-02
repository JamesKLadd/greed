import { Component, type ErrorInfo, type ReactNode } from "react";
import { translate } from "../i18n/translate.js";
import type { MsgKey } from "../i18n/catalog.js";
import { loadLocale } from "../i18n/i18n.js";
import { BETA_SESSION_KEY } from "../beta/access.js";

interface Props {
  children: ReactNode;
  /** A screen can recover to Home without taking down the app/providers. */
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * The boundary sits OUTSIDE I18nProvider (so it can catch a crash inside the
 * provider itself), which means the useT hook isn't available here. Read the
 * saved locale directly and use the pure translate() instead.
 */
function crashT(key: MsgKey): string {
  return translate(loadLocale(), key);
}

/** Catches render/runtime errors and shows a graceful crash screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it for debugging; a real deployment could report it here.
    console.error("Greed crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="crash">
        <div className="crash__card">
          <div className="crash__icon">🎲💥</div>
          <h1 className="crash__title">{crashT("crash.title")}</h1>
          <p className="crash__msg">{crashT("crash.msg")}</p>
          <details className="crash__details">
            <summary>{crashT("crash.details")}</summary>
            <pre>{error.message}</pre>
          </details>
          <div className="crash__actions">
            {document.documentElement.dataset.presentation === "beta" && (
              <button
                className="btn btn--bank"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(BETA_SESSION_KEY);
                  } catch {
                    /* reload resets in-memory access */
                  }
                  location.reload();
                }}
              >
                {crashT("beta.recover")}
              </button>
            )}
            <button className="btn btn--roll" onClick={() => location.reload()}>
              {crashT("crash.reload")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
