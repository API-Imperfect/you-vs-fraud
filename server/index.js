/**
 * You vs Fraud Detection - the whole backend.
 *
 * One Express process: serves the built frontend from dist/ and exposes
 * three JSON endpoints. SQLite (or in-memory fallback) via store.js.
 *
 *   POST /api/score        save a finished game, returns {rank, players}
 *   GET  /api/leaderboard  top 10, recent players, per-question room stats
 *   GET  /api/config       {publicUrl} for the wall screen's QR code
 *
 * PUBLIC_URL env sets the QR target for production
 * (e.g. PUBLIC_URL=https://games.risa.gov.rw/fraud). When unset, the
 * machine's LAN IP is used so phones on the venue Wi-Fi work untouched.
 */
import express from 'express';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { openStore, saveScore, leaderboard, clearScores } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const QUESTION_COUNT = 10;

const store = openStore(process.env.DB_FILE || path.join(__dirname, '..', 'fraud-game.sqlite'));
const app = express();
// Behind Caddy/nginx on the same box: trust the local proxy so req.ip is the real client
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '32kb' }));

// ── Rate limit score submissions (vandalism control, not capacity) ───────────
// Generous on purpose: a whole venue can sit behind ONE NAT'd IP, so the limit
// must never touch a burst of real players finishing together. 30/min per IP
// still stops scripted spam cold (a script posts hundreds per minute).
const SCORE_LIMIT = 30;
const SCORE_WINDOW_MS = 60_000;
const scoreHits = new Map(); // ip -> [timestamps]
function scoreLimited(ip) {
  const now = Date.now();
  const hits = (scoreHits.get(ip) ?? []).filter(t => now - t < SCORE_WINDOW_MS);
  if (hits.length >= SCORE_LIMIT) { scoreHits.set(ip, hits); return true; }
  hits.push(now);
  scoreHits.set(ip, hits);
  if (scoreHits.size > 5000) scoreHits.clear(); // cheap memory guard
  return false;
}

// A real 10-card game cannot finish faster than this (duration is the rank tiebreak)
const MIN_GAME_MS = 15_000;

// Permissive CORS for the vite dev server and LAN phones; same-origin in production
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function lanIp() {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

app.get('/api/config', (_req, res) => {
  const publicUrl = process.env.PUBLIC_URL || `http://${lanIp()}:${PORT}`;
  res.json({ publicUrl: publicUrl.replace(/\/$/, '') });
});

app.post('/api/score', (req, res) => {
  if (scoreLimited(req.ip)) {
    res.status(429).json({ error: 'Too many scores from this address. Take a breath.' });
    return;
  }
  const body = req.body ?? {};
  if (!(Number(body.durationMs) >= MIN_GAME_MS)) {
    res.status(422).json({ error: 'Implausibly fast game.' });
    return;
  }
  try {
    const result = saveScore(store, body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'Invalid score' });
  }
});

// ── Facilitator reset: wipe the leaderboard between sessions ────────────────
// Deliberately localhost-only: SSH into the server, then
//   curl -X POST localhost:4000/api/admin/reset
app.post('/api/admin/reset', (req, res) => {
  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  if (!isLocal) {
    res.status(403).json({ error: 'Not allowed' });
    return;
  }
  const cleared = clearScores(store);
  console.log(`[admin] leaderboard reset: ${cleared} scores removed`);
  res.json({ cleared });
});

app.get('/api/leaderboard', (_req, res) => {
  res.json(leaderboard(store, QUESTION_COUNT));
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Static frontend (production build) ───────────────────────────────────────
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
// The app has two client-side routes: / (play) and /wall (facilitator screen)
app.get(['/wall', '/wall/*'], (_req, res) => res.sendFile(path.join(dist, 'index.html')));
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(dist, 'index.html'), err => { if (err) next(); });
});

app.listen(PORT, () => {
  console.log(`You vs Fraud Detection server on http://localhost:${PORT}`);
  console.log(`  Wall screen: http://localhost:${PORT}/wall`);
  console.log(`  QR target:   ${process.env.PUBLIC_URL || `http://${lanIp()}:${PORT}`}`);
});
