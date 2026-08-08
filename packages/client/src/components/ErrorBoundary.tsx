import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
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
          <h1 className="crash__title">Something went wrong</h1>
          <p className="crash__msg">
            The game hit an unexpected error. Reloading usually fixes it — your stats and unlocks
            are saved.
          </p>
          <details className="crash__details">
            <summary>Technical details</summary>
            <pre>{error.message}</pre>
          </details>
          <div className="crash__actions">
            <button className="btn btn--roll" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
