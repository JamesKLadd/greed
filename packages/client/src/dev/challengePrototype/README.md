# Challenge gameplay review

Run `npm run dev`, then open `http://127.0.0.1:5173/?challenge-play`.
This DEV-only lazy-loaded route renders the ordinary `ChallengeRun` component
and controller against a seeded in-memory endpoint. It never calls the real
challenge API or records scores, achievements, attempts or profile changes.

Query options:

- `scenario=initial|five|straight|hot|bust|final`: fresh run, resumed rare hand,
  resumed hot dice/bust, or the start of turn ten. Rare hands are found by
  replaying actual opening rolls; no scoring state is fabricated.
- `mode=weekly`: weekly heading; daily and weekly use the same run board.
- `classic`: classic presentation; visual beta is the default here.
- `flat`: flat dice, without changing saved settings.
- `delay=2500`: delay both play and recovery responses, capped at 10 seconds.
- `fail=lost`: the next move is accepted, then its reply is lost. Recovery reads
  the accepted position without sending the move again.
- `fail=before`: the next move fails before acceptance.
- `read-fail`: the next recovery request also fails; retry it through the real
  board's recovery action.
- `tools`: open the otherwise collapsed fixture controls below the board.

The controls let you change scenario, delay, presentation and the next failure
without editing saved preferences. Language, accessibility and sound follow
the ordinary app settings. Roll, Bank and held dice remain interactive through
all ten turns. The fixture result remains visible until Restart is pressed.

For mobile layout review, open the route in a real narrow browser viewport;
there is no scaled iframe hiding clipping or touch-target problems.
