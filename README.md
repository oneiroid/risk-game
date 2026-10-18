# Risk — World Conquest

Browser implementation of the classic Risk board game. Runs on phones and desktops, 2–4 players:
against the computer, pass-and-play on one device, or online.

**Play:** https://oneiroid.github.io/risk-game/

## Modes

- **Play vs computer** — you plus 1–3 computer opponents. Seats can also be set to *Human (same device)* for pass-and-play. The game autosaves; *Resume game* continues it.
- **Host online game** — creates a room code and share link. Joining players fill *Open* seats; other seats can be *Computer* or *Closed*. The host's browser runs the game.
- **Join online game** — enter the room code or open the share link.

Online details:
- Messages go through a public MQTT broker over secure WebSockets (HiveMQ, EMQX or Mosquitto public brokers, whichever the host reaches first; the last digit of the room code selects it). No server or account needed.
- The host must keep the page open. If the host reloads, *Resume hosted game* restores the room; players reconnect automatically.
- A player who disconnects can rejoin (*Rejoin online game*). If they stay away for 30 s on their turn, the computer plays for them until they return.
- Public brokers are unauthenticated: anyone who knows a room code can read that room's traffic.

## Rules implemented

Standard rules: 42 territories, 6 continents (bonuses NA 5, SA 2, EU 5, AF 3, AS 7, AU 2), random territory deal,
starting armies 40/35/30 for 2/3/4 players placed 3 per turn (or randomly), reinforcements = territories ÷ 3 (min 3) + continent bonuses,
attack dice 3 vs 2 with ties to the defender, blitz, minimum occupation = dice rolled, one card per turn with a conquest,
card sets (escalating 4, 6, 8, 10, 12, 15, +5 or fixed 4/6/8/10) with +2 for owned pictured territories,
forced trade at 5+ cards, taking an eliminated player's cards, one fortify move per turn (through connected territories or adjacent only).

## Development

No build step — plain ES modules.

```bash
python3 -m http.server 8765
```

```bash
npm test
```

`npm test` runs rule checks and 300 computer-vs-computer games with invariant checks.
`node tools/check-map.mjs /tmp/map.svg` reports board geometry issues and writes a preview.

| File | Purpose |
| --- | --- |
| `js/map.js` | Territories, adjacency, generated hex-board geometry |
| `js/engine.js` | Rules engine (serializable state, seeded RNG) |
| `js/ai.js` | Computer player |
| `js/net.js` | Online rooms over MQTT |
| `js/board.js` | SVG board, pan / pinch-zoom |
| `js/app.js` | Screens, controls, game flow |
