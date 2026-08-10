import { Button, Modal } from "../ui/index.js";
import type { Invite } from "../net/challenges.js";
import { useT } from "../i18n/i18n.js";

/**
 * A friend's invitation, shown wherever the player happens to be. Accepting
 * drops them into the private room the server is already holding open.
 */
export function ChallengeInvite({
  invite,
  onAccept,
  onDecline,
}: {
  invite: Invite;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useT();
  return (
    <Modal
      onClose={onDecline}
      title={t("challenge.inviteTitle", { name: invite.from })}
      actions={
        <>
          <Button variant="ghost" onClick={onDecline}>
            {t("challenge.decline")}
          </Button>
          <Button variant="roll" size="lg" onClick={onAccept}>
            {t("challenge.accept")}
          </Button>
        </>
      }
    >
      <p className="daily__note">{t("challenge.inviteNote", { name: invite.from })}</p>
    </Modal>
  );
}
