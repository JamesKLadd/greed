# Greed mobile launch experiment

## Positioning and destinations

**Bank it, or risk it?** Five dice. One more roll. Daily challenges to chase, weekly chances to improve, and an online table for your friends.

Lead with a decision people can understand in seconds. Show real points at risk, the roll, and its consequence. The first action should be three practice turns; account creation follows when someone chooses a ranked challenge or online play.

- Public landing page: https://playgreed.vercel.app/welcome/
- Daily angle: https://playgreed.vercel.app/welcome/?utm_campaign=daily
- Friends angle: https://playgreed.vercel.app/welcome/?utm_campaign=friends
- Decision clip: https://playgreed.vercel.app/welcome/?utm_campaign=bank_or_roll
- Bust clip: https://playgreed.vercel.app/welcome/?utm_campaign=bust

The landing page preserves approved campaign labels into practice and daily entry. Share links carry only their destination and a fixed source label. Each daily player has independent dice; never promise identical dice or a puzzle with one shared solution. The current release is a browser game that works on phones, not an App Store or Google Play listing.

## Ready-to-use posts

**Daily / personal channels**

> Five dice. Ten turns. One score to beat. I’m building Greed, a push-your-luck game for your phone: bank the points you have, or risk the turn for more. Try three practice turns free, then take today’s challenge. I’d love to hear where you got stuck. [Daily campaign link above]

**Friends / existing testers**

> Greed now has shareable daily score cards and private room links. Play your ten turns, send a friend your score, and see who comes out ahead. Or bring them straight to your online table. Try it here: [Friends campaign link above]

**Decision clip caption**

> Would you bank this, or roll again? Five dice can make you very greedy. Try Greed in your phone’s browser: [Decision campaign link above]

**Bust clip caption**

> 600 points. One more roll. Gone. Where would you have stopped? Try Greed: [Bust campaign link above]

Use these in your own channels and communities where promotion is allowed. Ask community moderators before posting where required. No recruitment messages have been sent as part of this release.

## Promotional assets

- `marketing/bank-or-roll.mp4`: vertical real practice gameplay; 150 points becomes 500, then banks. Caption invites the viewer to make the decision.
- `marketing/one-more-roll.mp4`: vertical real practice gameplay; 600 points is lost on the second roll.
- `../packages/client/public/marketing/greed-social.png`: 1200 × 630 link preview.
- `../packages/client/public/marketing/practice-phone.png`: actual mobile practice screenshot.
- `../packages/client/public/marketing/score-image.png`: synthetic review account’s example share card.

Clips use the actual UI and scoring engine with fixed local practice seeds (7 and 9) for reproducible shots. Outcomes are not fabricated; no ranked accounts, attempts, or progression are involved. They show practice, not a prediction of anyone’s next challenge. Video is silent so platform audio can be added without including a misleading soundtrack or requiring sound to understand it.

## First 14 days

Start with an assumed target of **20 new mobile testers**, splitting the daily and friends angles approximately evenly. This is a learning cohort, not a statistically significant advertising test. Avoid paid acquisition until the practice-to-challenge path works for these players.

1. **Before sharing:** manually review on a real iPhone and Android: practice completion; daily PNG share to a messaging app; room link → sign-in → lobby; high contrast and large text. Browser automation cannot verify a physical share sheet.
2. **Days 1–3:** publish one decision clip and the daily invitation through your existing audience. Use the same daily link wherever that angle is used. Record channel, date, angle, and clicks if the channel provides them.
3. **Days 4–6:** publish the friends invitation and invite existing testers to bring one friend. Keep a simple list of voluntary feedback; do not put personal information into analytics labels.
4. **Day 7:** review where people stop. Ask willing testers: “What made you want another run?”, “What was confusing?”, and “Would you send this to a friend?” Choose the biggest friction to fix.
5. **Days 8–14:** repeat the stronger pitch with the second clip. Compare challenge completions, day-1/day-7 return, and invitations that reached a finished game. Use the results to choose the next development task.

Suggested decision signals: most willing testers finish practice without help; at least some come back unprompted; room invitations produce actual games. With only 20 people, discuss absolute counts and feedback before treating percentages as stable benchmarks.

## Reading the report

Sign in as **James**, then open **Account → Growth report**, or visit `/?growth=1` while signed in. The server enforces ownership; another user cannot read it by guessing the URL. `GROWTH_ADMIN_USERNAME` can override the owner account when deploying a fork. No external analytics account or credential is required.

The report covers the last 30 days. Its ordered paths show welcome → practice, welcome → daily, practice → daily, the daily account step → play, and room invitation → finished game. Each path counts sessions that reached its steps in order, with drop-off counts and completion rates. It never divides unrelated action totals to estimate conversion. A measured session expires after 30 minutes of inactivity; these are browser sessions, not verified people or lifetime first-time players.

Within each path, campaign comparisons use that path’s first step as the denominator and attribute the whole path to that first step’s source and campaign. Compare completed sessions alongside volume, rather than choosing a pitch by welcome-page views alone. Paths overlap, so do not add their counts together. Someone who signs in or finishes a game in a later session will not complete the original path; reconnects, rematches, storage clearing, opt-outs, and browser privacy signals affect the counts. Events use server receipt times, so delayed or discarded batches can also affect ordering. Official game standings remain separate.

New players can go directly from practice completion or the daily entry to account creation. Returning players have a sign-in option. Their daily destination survives a refresh, and signing in does not use an attempt: they still choose when to start the ranked run. The public weekly destination `/?challenge=weekly` also survives refreshes. See [the first-run review](marketing/first-run/README.md) for the development changes and mobile screenshots.

Day-1/day-7 retention uses each browser’s first **observed** visit within this rolling window and an exact return day in America/Chicago. Only cohorts old enough to return enter the denominator. This is early launch retention, not lifetime new-user retention: a long-time player can enter the observed cohort after older records expire. The privacy page and Settings explain collection, the default, opt-out, and the 30-day limit.

`POST /api/growth` accepts bounded, fixed-vocabulary batches without account tokens. `GET /api/growth/report` requires the owner’s session. Local development records remain local unless `VITE_GROWTH_RECORDING=true` is explicitly set for a local test. Never use that override against the production database during browser reviews.

Native store packaging, notifications, and monetization remain future product work. Next store materials should use these actual gameplay assets and verified availability claims.
