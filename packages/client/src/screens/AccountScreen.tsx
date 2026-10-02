/** Signed-in account overview: identity, verification status, and log out. */

import { useEffect, useState } from "react";
import { useAuth } from "../game/auth.js";
import { deleteAccount, resendVerification, type AccountUser } from "../net/auth.js";
import { Button, Screen, TextField } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import { apiErrorText } from "../i18n/apiError.js";
import { useBetaActive } from "../beta/BetaContext.js";
import { useAppearance } from "../beta/AppearanceContext.js";
import { Mascot } from "../beta/Mascot.js";

interface AccountScreenProps {
  onBack: () => void;
}

const RESEND_CD_KEY = "greed:verify-resent-at";
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/** Whole seconds left before the verification email may be re-sent (0 when ready). */
function resendCooldownLeft(): number {
  const last = Number(localStorage.getItem(RESEND_CD_KEY) ?? 0);
  return Math.max(0, Math.ceil((last + RESEND_COOLDOWN_MS - Date.now()) / 1000));
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AccountScreen({ onBack }: AccountScreenProps) {
  const t = useT();
  const { status, user, logout, verificationRequired } = useAuth();
  const [cooldown, setCooldown] = useState(() => resendCooldownLeft());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Deletion is two deliberate steps: arm it, then confirm with the password.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown(resendCooldownLeft()), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const resend = async () => {
    if (busy || resendCooldownLeft() > 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const { emailSent, alreadyVerified } = await resendVerification();
      if (alreadyVerified) {
        setNotice(t("account.alreadyVerified"));
      } else if (emailSent) {
        setNotice(t("account.resendSent"));
      } else {
        setNotice(t("account.resendNoEmail"));
      }
      // Start the cooldown whenever a real attempt was made.
      if (!alreadyVerified) {
        localStorage.setItem(RESEND_CD_KEY, String(Date.now()));
        setCooldown(resendCooldownLeft());
      }
    } catch (err) {
      setNotice(apiErrorText(t, err, "account.resendFailed"));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (busy || !confirmingDelete || !deletePassword) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
      // The account is gone; drop the session so nothing tries to use it again.
      // Local device stats stay — they were never the account's to delete.
      logout();
      onBack();
    } catch (err) {
      setDeleteError(apiErrorText(t, err, "account.deleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountScreenView
      user={user}
      loading={status === "loading"}
      verificationRequired={verificationRequired}
      cooldown={cooldown}
      busy={busy}
      notice={notice}
      confirmingDelete={confirmingDelete}
      deletePassword={deletePassword}
      deleteError={deleteError}
      onBack={onBack}
      onLogout={logout}
      onResend={() => void resend()}
      onBeginDelete={() => setConfirmingDelete(true)}
      onDeletePasswordChange={setDeletePassword}
      onCancelDelete={() => {
        setConfirmingDelete(false);
        setDeletePassword("");
        setDeleteError(null);
      }}
      onConfirmDelete={() => void confirmDelete()}
    />
  );
}

/** Presentation only: a review fixture can exercise this layout without an account session. */
export interface AccountScreenViewProps {
  user: AccountUser | null;
  loading?: boolean;
  verificationRequired: boolean;
  cooldown: number;
  busy: boolean;
  notice: string | null;
  confirmingDelete: boolean;
  deletePassword: string;
  deleteError: string | null;
  onBack: () => void;
  onLogout: () => void;
  onResend: () => void;
  onBeginDelete: () => void;
  onDeletePasswordChange: (password: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

export function AccountScreenView({
  user,
  loading = false,
  verificationRequired,
  cooldown,
  busy,
  notice,
  confirmingDelete,
  deletePassword,
  deleteError,
  onBack,
  onLogout,
  onResend,
  onBeginDelete,
  onDeletePasswordChange,
  onCancelDelete,
  onConfirmDelete,
}: AccountScreenViewProps) {
  const t = useT();
  const beta = useBetaActive();
  const { appearance } = useAppearance();

  return (
    <Screen
      className="support-screen"
      panelClassName="support-panel support-account account"
      hero={false}
    >
      <header className="support-panel__heading">
        <h1>{t("account.title")}</h1>
      </header>
      {!user ? (
        <>
          <p className="support-panel__intro" role="status">
            {loading ? t("board.loading") : t("account.notSignedIn")}
          </p>
          <div className="setup__actions">
            <Button variant="ghost" onClick={onBack}>
              {t("bar.home")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="account__id">
            <div className="account__avatar" aria-hidden="true">
              {beta ? <Mascot look={appearance} /> : user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="account__identity">
              <div className="account__name">{user.username}</div>
              <div className="account__email">{user.email}</div>
            </div>
          </div>

          {/* Only worth showing when this server actually asks for verification —
            otherwise it's a status about a step that doesn't exist. */}
          {verificationRequired && (
            <div className={`account__verify${user.emailVerified ? " account__verify--ok" : ""}`}>
              {user.emailVerified ? t("account.verified") : t("account.unverified")}
            </div>
          )}

          {verificationRequired && !user.emailVerified && (
            <div className="account__resend">
              <Button disabled={busy || cooldown > 0} onClick={onResend}>
                {busy && !confirmingDelete
                  ? t("account.sending")
                  : cooldown > 0
                    ? t("account.resendIn", { time: formatCountdown(cooldown) })
                    : t("account.resend")}
              </Button>
              {notice && (
                <p className="account__resend-note" role="status">
                  {notice}
                </p>
              )}
            </div>
          )}

          <section className="support-account__section">
            <p className="account__note">{t("account.note", { name: user.username })}</p>
          </section>

          {/* Said before the button, not after it: signing out clears this
            device's copy of the career so the next account to be created here
            starts from nothing. The account keeps its own, and signing back in
            brings it down again. */}
          <section className="support-account__section">
            <p className="daily__note">{t("account.logoutNote")}</p>

            <div className="setup__actions">
              <Button variant="ghost" disabled={busy} onClick={onBack}>
                {t("bar.home")}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={onLogout}>
                {t("account.logout")}
              </Button>
            </div>
          </section>

          {/* Kept apart from the ordinary actions above, and behind a second step:
            there is nothing that undoes it. */}
          <div className="danger-zone">
            {!confirmingDelete ? (
              <>
                <p className="danger-zone__note">{t("account.deleteNote")}</p>
                <button className="btn btn--danger" disabled={busy} onClick={onBeginDelete}>
                  {t("account.delete")}
                </button>
              </>
            ) : (
              <>
                <p className="danger-zone__warn">{t("account.deleteConfirm")}</p>
                <TextField
                  label={t("account.deletePassword")}
                  type="password"
                  autoComplete="current-password"
                  disabled={busy}
                  value={deletePassword}
                  onChange={(e) => onDeletePasswordChange(e.target.value)}
                />
                {deleteError && (
                  <p className="danger-zone__error" role="alert">
                    {deleteError}
                  </p>
                )}
                <div className="danger-zone__actions">
                  <Button variant="ghost" disabled={busy} onClick={onCancelDelete}>
                    {t("common.cancel")}
                  </Button>
                  <button
                    className="btn btn--danger"
                    disabled={busy || deletePassword.length === 0}
                    onClick={onConfirmDelete}
                  >
                    {busy ? t("account.deleting") : t("account.deleteForever")}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </Screen>
  );
}
