# Greed — Steam store copy (draft)

Drop-in text for the Steamworks store page. Everything here is a first draft —
tune wording, then paste into the App Admin → Store Presence fields.

---

## Name

**Greed**

## Short description (≤ 300 chars; the box under the header capsule)

> Roll. Risk it. Bank it — before it all slips away. Greed is a fast push-your-luck
> dice game for 2–8 players. Chase hot dice for a huge turn, or bank early and play
> it safe. Play solo vs. tunable bots, pass-and-play, or online with friends.

## Long description (store "About This Game")

**Greed** is a push-your-luck dice game with a simple, vicious hook: every roll can
grow your turn — or wipe it out.

Roll five dice. Scoring dice lock; reroll the rest to stack more points. But a roll
that scores nothing **busts** you and everything unbanked is gone. Bank when you're
ahead… or press your luck for the hot streak that runs away with the game. First to
the goal starts the endgame; the highest banked total takes it.

**Features**

- **2–8 players**, any mix of humans and bots.
- **Smart bots** across four difficulties (easy → expert) with distinct risk
  personalities — cautious, balanced, or reckless.
- **Play your way:** solo vs. bots, local pass-and-play, or **online** private
  rooms and quick match.
- **Learn to play** guided tutorial with contextual coaching.
- **Stats & achievements**, plus unlockable **dice skins and table themes**.
- **Built for comfort:** large-text mode, high-contrast and colorblind-safe
  palettes, reduce-motion, and independent SFX/music volume.
- **English and Spanish**, fully localized.

Quick to learn, hard to put down. One more roll.

## Tags (suggested; pick ≤ 20 in App Admin)

Dice, Board Game, Tabletop, Casual, Multiplayer, Local Multiplayer, Online
Co-Op _(if applicable)_, PvP, Turn-Based, Family Friendly, Singleplayer, Strategy,
Card & Board Game, Colorful, Minimalist, Local Co-Op, Bots

## Categories (App Admin → checkboxes)

- Single-player
- Online PvP
- Shared/Split Screen PvP (local pass-and-play)
- Steam Achievements
- Partial Controller Support _(only if you add it)_

## Asset checklist (files in `steam/assets/`, regenerate with `npm run steam:assets`)

| File                           | Size     | Where it goes                             |
| ------------------------------ | -------- | ----------------------------------------- |
| `small_capsule_231x87.png`     | 231×87   | Small capsule (search/lists)              |
| `header_capsule_460x215.png`   | 460×215  | Header capsule (store page top, wishlist) |
| `main_capsule_616x353.png`     | 616×353  | Main capsule (front-page features)        |
| `vertical_capsule_374x448.png` | 374×448  | Vertical capsule (sales/curated)          |
| `library_capsule_600x900.png`  | 600×900  | Library capsule (client library grid)     |
| `promo_1232x706.png`           | 1232×706 | Spare promo / library header source       |

> These are **branded placeholders**. Steam also wants at least 5 screenshots
> (1920×1080 recommended), a library hero (3840×1240) and a transparent library
> logo — capture/design those from the real game before submitting for review.
