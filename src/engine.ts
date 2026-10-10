/**
 * The fraud engine, built on Tazama's real methodology
 * (tazama-lf/tazama-stack, core/postgres/migration/config):
 *
 *  - rules emit BANDED results (.01/.02/.03), each band with a reason
 *  - a typology assigns a WEIGHT to each band and sums them ("Add" expression)
 *  - the score is compared to two workflow thresholds:
 *      alertThreshold (300)        -> alert / review
 *      interdictionThreshold (500) -> interdiction / block
 *  - the Event-Flow Rule Processor (EFRuP) applies entity/account block
 *    conditions regardless of score
 *
 * Rule ids and names below come from Tazama's published rule library.
 * Band weights per scenario are illustrative calibrations; tuning them is
 * exactly the policy conversation the game is designed to start.
 */

export const ALERT_THRESHOLD = 300;
export const INTERDICTION_THRESHOLD = 500;

export const RULE_NAMES: Record<string, string> = {
  '001': 'Derived account age',
  '004': 'Account dormancy - debtor',
  '006': 'Outgoing transfer similarity - amounts',
  '010': 'Increased account activity: volume - debtor',
  '011': 'Increased account activity: volume - creditor',
  '017': 'Transaction divergence - debtor',
  '018': 'Exceptionally large outgoing transfer - debtor',
  '020': 'Large transaction amount vs history - creditor',
  '021': 'A large number of similar transaction amounts - creditor',
  '030': 'Transfer to unfamiliar creditor account - debtor',
  '076': 'Time since last transaction - debtor',
  '091': 'Transaction amount vs regulatory threshold',
  'EFRuP': 'Event-Flow Rule Processor',
};

export interface RuleResult {
  id: string;        // Tazama rule id
  band: string;      // subRuleRef, e.g. ".03"
  wght: number;      // typology weight for this band
  reason: string;    // the band's human-readable reason
}

export interface Clue { icon: string; text: string }

export interface Scenario {
  kind: string;
  amount: number;          // RWF
  route: string;           // small HTML allowed (<b>)
  clues: Clue[];           // clue text: small HTML allowed (<b>)
  truth: 'fraud' | 'legit';
  why: string;
  rules: RuleResult[];
  efrup?: boolean;         // entity/account condition in effect -> interdiction
}

export type Verdict = 'allow' | 'review' | 'block';

export interface EngineOutcome { verdict: Verdict; score: number | null }

export function engineOutcome(s: Scenario): EngineOutcome {
  if (s.efrup) return { verdict: 'block', score: null };
  const score = s.rules.reduce((sum, r) => sum + r.wght, 0);
  const verdict: Verdict =
    score >= INTERDICTION_THRESHOLD ? 'block'
    : score >= ALERT_THRESHOLD ? 'review'
    : 'allow';
  return { verdict, score };
}

export function engineCorrect(s: Scenario): boolean {
  const v = engineOutcome(s).verdict;
  if (v === 'review') return s.truth === 'legit'; // held briefly, then released correctly
  return (v === 'block') === (s.truth === 'fraud');
}

export function playerCorrect(s: Scenario, choice: 'approve' | 'decline'): boolean {
  return (s.truth === 'fraud' && choice === 'decline') || (s.truth === 'legit' && choice === 'approve');
}

export const rwf = (n: number): string => 'RWF ' + n.toLocaleString('en-US');
