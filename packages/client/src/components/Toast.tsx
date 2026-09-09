import type { ToastMessage } from "../game/toasts.js";
import { useT } from "../i18n/i18n.js";

export function Toast({ toast }: { toast: ToastMessage | null }) {
  const t = useT();
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.tone}`} role="status" key={toast.id}>
      {toast.key ? t(toast.key, toast.params) : toast.text}
    </div>
  );
}
