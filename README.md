# You vs Fraud Detection

A 2-minute fraud-desk game for the **RISA DPI Demo Center**. Players approve or decline
10 real-looking transactions on their phones, then see how an automated real-time fraud
monitoring engine scored the very same ones. A projected **wall screen** shows a QR code
to join, a live leaderboard, and the room's collective judgment per transaction.

The scoring engine runs **Tazama's actual methodology** (from the open-source
[tazama-lf](https://github.com/tazama-lf) project): banded rule results from Tazama's
real rule library, weighted typology scoring, and the alert (300) and interdiction (500)
thresholds from Tazama's own sample configuration. The closing screen hands over to the
live eKash + Tazama demo.

## Architecture (deliberately simple)

- **Frontend:** Vite + React + TypeScript. Two client routes: `/` (the game) and
  `/wall` (the facilitator screen). GSAP for animation.
- **Backend:** one Express process (~100 lines) with three endpoints:
  `POST /api/score`, `GET /api/leaderboard`, `GET /api/config`.
  It also serves the built frontend, so production is **one process on one port**.
- **Storage:** SQLite (better-sqlite3), a single file, zero administration. If the
  native module is unavailable it falls back to in-memory storage automatically.
- **Realtime:** the wall polls every 2.5s. No WebSockets needed at demo scale.

## Run it

```bash
npm install

# Development (vite on :5173 with /api proxied to the server on :4000)
npm run dev

# Production (one process serves everything on :4000)
npm run build
npm start
```

- Game: http://localhost:4000 (dev: :5173)
- Wall screen: http://localhost:4000/wall

## The QR code / public URL

The wall screen's QR encodes the URL from `GET /api/config`:

- **Unset (demo floor):** the machine's LAN IP, e.g. `http://192.168.1.50:4000`,
  so phones on the venue Wi-Fi join with zero configuration.
- **Production:** set the environment variable and the same build points at your real domain:

```bash
PUBLIC_URL=https://games.risa.gov.rw/fraud npm start
```

Other env vars: `PORT` (default 4000), `DB_FILE` (default `./fraud-game.sqlite`).

## Tests

```bash
npm test    # engine verdicts/scores + store ranking/aggregation
```

## Project map

```
server/index.js    the whole backend (static + 3 API routes + LAN IP for QR)
server/store.js    SQLite (or in-memory) store, ranking, per-question aggregation
src/engine.ts      Tazama-style engine: rule bands, weights, thresholds
src/scenarios.ts   the 10 transactions (edit here to change the game content)
src/views/PlayView.tsx   the phone game (GSAP animations)
src/views/WallView.tsx   QR + leaderboard + room judgment panels
prototype/         the original single-file prototype (design spec)
```

## Content tuning

Everything facilitators might want to change lives in `src/scenarios.ts`:
transaction stories, clues, truth labels, rule bands and weights. Thresholds are in
`src/engine.ts`. The weights are illustrative calibrations; the methodology and
thresholds are Tazama's. Tuning weights and thresholds is exactly the
safety-vs-inclusion policy conversation the game is designed to start.
