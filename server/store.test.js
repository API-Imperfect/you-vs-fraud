/** Store sanity checks (uses the in-memory fallback): `node server/store.test.js` */
import { openStore, saveScore, leaderboard, clearScores } from './store.js';

let failed = 0;
const check = (cond, msg) => {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✕ ' + msg); }
};

console.log('store.test.js');
const store = openStore('/nonexistent-dir/force-memory.sqlite');

const mk = (choice, correct) => ({ choice, correct });
const r1 = saveScore(store, { name: 'Uwase', score: 9, total: 10, durationMs: 80000,
  calls: [mk('approve', true), mk('decline', true), mk('decline', true), mk('approve', true), mk('decline', true),
          mk('approve', true), mk('decline', true), mk('decline', false), mk('approve', true), mk('decline', true)] });
check(r1.rank === 1 && r1.players === 1, 'first player ranks #1');

const r2 = saveScore(store, { name: 'Mugisha', score: 7, total: 10, durationMs: 60000,
  calls: [mk('decline', false), mk('decline', true), mk('decline', true), mk('approve', true), mk('decline', true),
          mk('approve', true), mk('decline', true), mk('decline', false), mk('decline', false), mk('decline', true)] });
check(r2.rank === 2 && r2.players === 2, 'lower score ranks #2');

const r3 = saveScore(store, { name: 'Keza', score: 9, total: 10, durationMs: 50000, calls: [mk('approve', true)] });
check(r3.rank === 1 && r3.players === 3, 'equal score, faster time ranks #1');

const lb = leaderboard(store, 10);
check(lb.top[0].name === 'Keza' && lb.top[1].name === 'Uwase', 'leaderboard sorted by score then time');
check(lb.totals.players === 3, 'player count');
check(lb.perQuestion[0].n === 3 && lb.perQuestion[0].approvePct === 67 && lb.perQuestion[0].correctChoice === 'approve',
  'per-question aggregation (q1: 2 approve / 1 decline, correct=approve)');
check(lb.perQuestion[7].correctChoice === 'approve' || lb.perQuestion[7].correctChoice === 'decline',
  'correct choice inferred');

// Hostile input is clamped, not crashed
const r4 = saveScore(store, { name: 'x'.repeat(500), score: 99999, total: -5, durationMs: 1e12, calls: 'nope' });
check(r4.players === 4, 'hostile input clamped');
const lb2 = leaderboard(store, 10);
check(lb2.top[0].score <= 100 && lb2.top.every(t => t.name.length <= 24), 'stored values within bounds');

const cleared = clearScores(store);
check(cleared === 4, 'clear() removes all rows (got ' + cleared + ')');
check(leaderboard(store, 10).totals.players === 0, 'leaderboard empty after reset');

if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all store checks passed');
