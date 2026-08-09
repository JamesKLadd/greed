/** Signed-in account overview: identity, verification status, and log out. */

import { useAuth } from "../game/auth.js";

interface AccountScreenProps {
  onBack: () => void;
}

export function AccountScreen({ onBack }: AccountScreenProps) {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="setup">
        <div className="setup__panel">
          <p>You're not signed in.</p>
          <div className="setup__actions">
            <button className="btn btn--ghost" onClick={onBack}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">Account</p>
      </div>

      <div className="setup__panel account">
        <div className="account__id">
          <div className="account__avatar">{user.username.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="account__name">{user.username}</div>
            <div className="account__email">{user.email}</div>
          </div>
        </div>

        <div className={`account__verify${user.emailVerified ? " account__verify--ok" : ""}`}>
          {user.emailVerified
            ? "✓ Email verified"
            : "⚠ Email not verified — check your inbox for the verification link."}
        </div>

        <p className="account__note">
          Your stats, achievements and locker are saved to this account and sync across every device
          you sign in on. You play as <strong>{user.username}</strong> in local and online games.
        </p>

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            ← Back
          </button>
          <button className="btn btn--bank" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
