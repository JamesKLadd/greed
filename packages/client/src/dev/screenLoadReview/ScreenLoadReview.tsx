import { Suspense, useLayoutEffect, useState } from "react";
import { ErrorBoundary } from "../../components/ErrorBoundary.js";
import { ScreenLoadState } from "../../components/ScreenLoadState.js";
import { BetaActiveContext } from "../../beta/BetaContext.js";

const pending = new Promise<never>(() => {});
function Sample({ failed }: { failed: boolean }): never {
  if (failed) throw new Error("Isolated screen-load failure");
  throw pending;
}

/** DEV only: real Suspense/boundary recovery without network/profile writes. */
export default function ScreenLoadReview() {
  const [failed] = useState(() => new URLSearchParams(window.location.search).has("failed"));
  useLayoutEffect(() => {
    const previous = document.documentElement.dataset.presentation;
    document.documentElement.dataset.presentation = "beta";
    return () => {
      if (previous === undefined) delete document.documentElement.dataset.presentation;
      else document.documentElement.dataset.presentation = previous;
    };
  }, []);
  const onBack = () => {
    window.location.href = "/";
  };
  return (
    <BetaActiveContext.Provider value={true}>
      <ErrorBoundary fallback={<ScreenLoadState failed onBack={onBack} />}>
        <Suspense fallback={<ScreenLoadState onBack={onBack} />}>
          <Sample failed={failed} />
        </Suspense>
      </ErrorBoundary>
    </BetaActiveContext.Provider>
  );
}
