# Table E — online and spectator table

The beta online screen now uses the same character table as local play. Classic keeps its existing screen. No server message shape, account field or scoring rule changed.

## Implementation

- `LocalTableGame` is now the shared match adapter. Online identities come from the broadcast beta look, with compatible Classic avatars and stable provisional mascots when old snapshots omit presentation data. Detail cards retain the sender's frame, background, badge and nameplate.
- The active player's dice change with the turn; the viewing player's table theme stays fixed. Online seats stay anchored to the viewing player's ID. Spectators use the first established seat, have no “you” label, and see a watching message in place of Roll and Bank.
- Disconnection status and reactions stay beside characters, with full status in player details. The existing turn countdown remains visible. Reactions live for four seconds in both ordinary and reduced motion; CSS does not determine their lifetime.
- Menu utilities include room information, volume, rules, history, standings and reactions. The hide-room-code setting omits the code from the drawer. The scene header remains Back and Menu. Spectators have no reaction sender, rematch vote or host return-to-lobby action.
- Reconnecting disables actions and shows a connection notice. The first displayed resync snapshot advances a presentation epoch, baselining event readers, bank movement and toast history together. The dice and scene are not remounted.
- Rules, history and player details cannot compete with the mandatory game-over dialog. Existing host permissions and rematch voting stay with the online controller.
- Browser validation found that refreshing a host during a game discarded the client-side lobby metadata, hiding its host-only return-to-lobby control. Reconnect now restores the existing lobby message before the game snapshot. A host timeout also broadcasts the updated host metadata. The client defers a lobby-only transition so an accompanying game snapshot can preserve the current view. Server authorization remains authoritative.

## Repeat the checks

Run the local client and a local guest-only game server, then open `?table-online`. This development-only route uses the real online menu, lobby, game controller and server; it disables result recording. It exists because the normal Home entry correctly requires sign-in, even when the local test server has accounts disabled. Production does not include the route. Enter the existing 2525 beta through Home first for a beta client; use a separate origin or browser session for an independent Classic peer. `?old-table` still selects the old beta screen during development.

The focused command is:

```sh
npx vitest run packages/client/src/beta/onlineScene.test.ts packages/server/src/spectate.test.ts packages/server/src/teams.test.ts packages/server/src/turn-timeout.test.ts
```

## Recorded verification

**24 focused tests passed across four files.** The first combined run passed 23; the host-transfer regression was then added and the affected timeout file passed all four tests. Client TypeScript and focused ESLint passed; the final repository report includes the subsequent server changes.

- Six new client tests cover active-seat dice versus viewer-local table, missing/unknown cosmetics, per-player identity, disconnect/takeover seat stability, spectator/rematch anchors and action permissions.
- Real WebSocket tests cover mixed beta/Classic/spectator presentation, disconnect/reconnect presence and stable IDs/order, team rooms, rematch and turn timeout/takeover.
- The existing rematch tests previously accepted buffered first-game packets. They now clear that history before voting or returning to the lobby, then verify the newly received state has the same player IDs and zero totals.
- Host-reconnect coverage verifies the real lobby metadata names the original host. The new timeout test verifies the surviving player receives host status and can return the room to the lobby and change its goal.

The desktop in-app browser used the actual local server and real controls in room `DBG6`:

| Check                   | Observed result                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mixed beta/Classic room | Beta host saw the character scene; Classic peer retained the old screen and disabled actions during the host's turn. Both rolled and banked, initially 100 and 200 points.                                               |
| Dice ownership          | The beta scene changed from the host's house dice to the Classic peer's ivory dice while retaining the host's green table.                                                                                               |
| Menu and details        | Room code, volume, history, rules, standings and reaction sender were available; player details identified the final seat. A sent reaction appeared on the Classic peer's screen.                                        |
| Refresh/reconnect       | The host recovered the same foreground identity and scores without replaying the previous bank celebration. This check exposed the host-metadata bug fixed above.                                                        |
| Disconnect/takeover     | Leaving the Classic seat kept its identity, order and 200-point total. A visible offline icon appeared above the far rail; accessible character details identified autoplay.                                             |
| Spectator               | The former peer entered beta and watched without a seat. No “you” label, Roll/Bank controls or reaction sender appeared; the first established seat stayed foreground. Phone 390×844 and desktop layouts were inspected. |
| Final dialog precedence | Spectator Rules was replaced by exactly one game-over dialog. Beta host won 1,000–200. Spectator's only endgame action was Leave.                                                                                        |

The final browser rematch retry was interrupted by development hot reload after changing the controller's hook list; reloading recovered the app, but the unattended room had expired. Rematch and restored host permissions are therefore claimed from the real-socket tests, not from a completed final browser rerun. Hide-room-code behavior was code-reviewed; actual device Safari/Chrome touch, device audio and reconnect under packet loss were not tested here. These limits are separate from the desktop browser observations.

Publication is deferred to the user's release decision; this branch must not be merged or deployed as part of the checkpoint push.
