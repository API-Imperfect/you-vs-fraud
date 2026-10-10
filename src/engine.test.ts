/** Engine sanity checks: run with `npx tsx src/engine.test.ts` */
import { engineOutcome, engineCorrect, playerCorrect } from './engine';
import { SCENARIOS } from './scenarios';

let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✕ ' + msg); }
}

console.log('engine.test.ts');
check(SCENARIOS.length === 10, '10 scenarios');

const expected: Array<[string, number | null]> = [
  ['allow', 150], ['block', 600], ['block', 550], ['allow', 50], ['block', 600],
  ['allow', 50], ['block', 550], ['review', 300], ['allow', 250], ['block', null],
];
SCENARIOS.forEach((s, i) => {
  const o = engineOutcome(s);
  check(o.verdict === expected[i][0] && o.score === expected[i][1],
    `#${i + 1} ${s.kind}: ${o.verdict} (${o.score ?? 'EFRuP'})`);
});

check(SCENARIOS.every(engineCorrect), 'engine is correct on all 10 (review on legit counts as correct)');
check(SCENARIOS.filter(s => s.truth === 'fraud').length === 5, '5 fraud / 5 legit');
check(playerCorrect(SCENARIOS[0], 'approve') && !playerCorrect(SCENARIOS[0], 'decline'), 'player scoring works');

if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('all engine checks passed');
