import type { ReactNode } from "react";
import { cx } from "./cx.js";

/**
 * The standard page shell: wordmark + tagline over a card panel.
 *
 * This markup was copy-pasted across ten screens and had already drifted into
 * three partial variants — Home dropped the panel, the signed-out Account view
 * dropped the hero, and the online "connecting" state dropped both. The `hero`
 * and `panel` flags express those cases instead of duplicating the wrapper.
 */

export interface ScreenProps {
  /** Wordmark text. Defaults to the game title. */
  title?: ReactNode;
  tagline?: ReactNode;
  /** Show the wordmark/tagline block (default true). */
  hero?: boolean;
  /** Wrap children in a `.setup__panel` card (default true). */
  panel?: boolean;
  /** Corner slot above the hero — the account chip on Home. */
  headerRight?: ReactNode;
  /** Full-width notice between hero and content. */
  banner?: ReactNode;
  /** Row of actions at the foot of the panel. */
  actions?: ReactNode;
  /** Rendered after the panel (version string, install prompt). */
  footer?: ReactNode;
  /** Extra class on the panel, for screens with bespoke styling hooks. */
  panelClassName?: string;
  children: ReactNode;
}

export function Screen({
  title = "GREED",
  tagline,
  hero = true,
  panel = true,
  headerRight,
  banner,
  actions,
  footer,
  panelClassName,
  children,
}: ScreenProps) {
  const body = (
    <>
      {children}
      {actions != null && <div className="setup__actions">{actions}</div>}
    </>
  );

  // A long wordmark cannot take the short one's size on a phone: LEADERBOARDS
  // at the 48px floor runs off the side of the screen, and Spanish
  // (CLASIFICACIONES) is longer still. Sized by how long the word actually is,
  // so every locale is covered by one rule rather than one being noticed and
  // hand-fixed at a time.
  const letters = typeof title === "string" ? title.length : 0;
  const logoClass = cx(
    "setup__logo",
    letters >= 13 ? "setup__logo--xlong" : letters >= 9 ? "setup__logo--long" : null,
  );

  return (
    <div className="setup">
      {headerRight != null && <div className="home-account">{headerRight}</div>}

      {hero && (
        <div className="setup__hero">
          <h1 className={logoClass}>{title}</h1>
          {tagline != null && <p className="setup__tagline">{tagline}</p>}
        </div>
      )}

      {banner}

      {panel ? <div className={cx("setup__panel", panelClassName)}>{body}</div> : body}

      {footer}
    </div>
  );
}
