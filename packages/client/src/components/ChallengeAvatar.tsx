import type { BetaIdentity } from "@greed/protocol";
import { useBetaActive } from "../beta/BetaContext.js";
import { useAppearance } from "../beta/AppearanceContext.js";
import { normalizeAppearance } from "../beta/appearance.js";
import { Mascot } from "../beta/Mascot.js";
import { useAuth } from "../game/auth.js";
import { resolveAvatar } from "../game/avatars.js";

/** Reuse the Locker's equipped portrait; Classic retains its original avatar. */
export function ChallengeAvatar({
  username,
  avatar,
  visualBeta,
}: {
  username: string;
  avatar: string;
  visualBeta?: BetaIdentity;
}) {
  const beta = useBetaActive();
  const { appearance } = useAppearance();
  const { user } = useAuth();
  if (!beta) return <>{resolveAvatar(username, false, avatar)}</>;
  // The local account's latest equip is already visible even while sync or an
  // older server is catching up. Other players always use their own identity.
  const look =
    username === user?.username
      ? appearance
      : normalizeAppearance(visualBeta ?? { mascot: avatar });
  return <Mascot look={look} />;
}
