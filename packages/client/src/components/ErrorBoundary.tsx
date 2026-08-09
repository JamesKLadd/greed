import { Component, type ErrorInfo, type ReactNode } from "react";
import { translate } from "../i18n/translate.js";
import type { Locale, MsgKey } from "../i18n/catalog.js";

interface Props {
  children: ReactNode;
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
  let locale: Locale = "en";
  try {
    if (localStorage.getItem("greed:locale") === "es") locale = "es";
  } catch {
    /* storage can throw in private mode; English is a fine fallback */
  }
  return translate(locale, key);
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
            <button className="btn btn--roll" onClick={() => location.reload()}>
              {crashT("crash.reload")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
