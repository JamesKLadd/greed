import type { ToastMessage } from "../game/useGreed.js";

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.tone}`} role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}
