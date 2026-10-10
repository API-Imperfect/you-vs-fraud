/**
 * Score store. Uses SQLite (better-sqlite3) when available: a single file,
 * zero administration, survives restarts. Falls back to in-memory storage
 * when the native module is not installed, so the game always runs.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const MAX_ROWS_SCANNED = 2000;

function nowIso() { return new Date().toISOString(); }

class MemoryStore {
  constructor() { this.rows = []; this.nextId = 1; }
  insert(row) { this.rows.push({ id: this.nextId++, ...row }); }
  all() { return this.rows.slice(-MAX_ROWS_SCANNED); }
}

class SqliteStore {
  constructor(Database, file) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      calls_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    this.insertStmt = this.db.prepare(
      'INSERT INTO scores (name, score, total, duration_ms, calls_json, created_at) VALUES (@name, @score, @total, @duration_ms, @calls_json, @created_at)'
    );
    this.allStmt = this.db.prepare(
      `SELECT id, name, score, total, duration_ms, calls_json, created_at FROM scores ORDER BY id DESC LIMIT ${MAX_ROWS_SCANNED}`
    );
  }
  insert(row) { this.insertStmt.run(row); }
  all() { return this.allStmt.all().reverse(); }
}

export function openStore(file = 'fraud-game.sqlite') {
  try {
    const Database = require('better-sqlite3');
    const store = new SqliteStore(Database, file);
    console.log(`[store] SQLite: ${file}`);
    return store;
  } catch {
    console.log('[store] better-sqlite3 not available; using in-memory store (scores reset on restart)');
    return new MemoryStore();
  }
}

// ── Domain operations (shared by both stores) ────────────────────────────────

export function saveScore(store, { name, score, total, durationMs, calls }) {
  const clean = {
    name: String(name ?? 'Anonymous').trim().slice(0, 24) || 'Anonymous',
    score: Math.max(0, Math.min(Number(score) || 0, 100)),
    total: Math.max(1, Math.min(Number(total) || 10, 100)),
    duration_ms: Math.max(0, Math.min(Number(durationMs) || 0, 3_600_000)),
    calls_json: JSON.stringify(Array.isArray(calls) ? calls.slice(0, 100).map(c => ({
      choice: c.choice === 'approve' ? 'approve' : 'decline',
      correct: !!c.correct,
    })) : []),
    created_at: nowIso(),
  };
  store.insert(clean);
  // Rank among all stored plays: better score first, faster time breaks ties
  const rows = store.all();
  const better = rows.filter(r =>
    r.score > clean.score || (r.score === clean.score && r.duration_ms < clean.duration_ms)
  ).length;
  return { rank: better + 1, players: rows.length };
}

export function leaderboard(store, questionCount = 10) {
  const rows = store.all();
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.duration_ms - b.duration_ms);
  const top = sorted.slice(0, 10).map(r => ({
    name: r.name, score: r.score, total: r.total, durationMs: r.duration_ms, at: r.created_at,
  }));
  const recent = rows.slice(-8).reverse().map(r => ({ name: r.name, score: r.score, total: r.total }));

  // Per-question room judgment: how the crowd called each transaction
  const perQuestion = Array.from({ length: questionCount }, () => ({
    n: 0, approve: 0, decline: 0, correct: 0, correctChoice: null,
  }));
  for (const r of rows) {
    let calls;
    try { calls = JSON.parse(r.calls_json); } catch { continue; }
    calls.forEach((c, i) => {
      if (i >= questionCount) return;
      const q = perQuestion[i];
      q.n++;
      if (c.choice === 'approve') q.approve++; else q.decline++;
      if (c.correct) q.correct++;
      if (q.correctChoice === null) {
        q.correctChoice = c.correct ? c.choice : (c.choice === 'approve' ? 'decline' : 'approve');
      }
    });
  }

  const avgScore = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length * 10) / 10
    : 0;

  return {
    top,
    recent,
    perQuestion: perQuestion.map((q, i) => ({
      q: i + 1,
      n: q.n,
      approvePct: q.n ? Math.round(q.approve / q.n * 100) : 0,
      declinePct: q.n ? Math.round(q.decline / q.n * 100) : 0,
      correctPct: q.n ? Math.round(q.correct / q.n * 100) : 0,
      correctChoice: q.correctChoice,
    })),
    totals: { players: rows.length, avgScore },
  };
}
