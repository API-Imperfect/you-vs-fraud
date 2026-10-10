import type { Scenario } from './engine';

/** The ten transactions, in play order. All amounts in RWF. */
export const SCENARIOS: Scenario[] = [
  {
    kind: 'Incoming payments',
    amount: 230000,
    route: '<b>47 customers</b> &rarr; <b>Mama Chantal&rsquo;s produce stall</b>',
    clues: [
      { icon: '\u{1F4C8}', text: '<b>47 small payments</b> in 3 hours, an unusually high velocity' },
      { icon: '\u{1F3EA}', text: 'Recipient is a <b>market merchant account</b>' },
      { icon: '\u{1F4C5}', text: 'Same pattern <b>every market day</b> for 14 months' },
    ],
    truth: 'legit',
    why: 'A busy market stall on market day. High velocity alone is not fraud. Context is everything.',
    rules: [
      { id: '011', band: '.02', wght: 100, reason: 'Incoming volume above baseline but within this merchant’s 14-month profile' },
      { id: '021', band: '.01', wght: 50, reason: 'Many small similar amounts, consistent with retail takings' },
    ],
  },
  {
    kind: 'Three outgoing transfers',
    amount: 999000,
    route: '<b>J. Habimana</b> &rarr; <b>same new recipient</b>, 3 times in 55 min',
    clues: [
      { icon: '\u{1F522}', text: 'Each transfer is <b>RWF 999,000</b>, just under the 1M reporting threshold' },
      { icon: '⏱️', text: 'All three within <b>one hour</b>' },
      { icon: '\u{1F464}', text: 'Recipient account is <b>three weeks old</b>' },
    ],
    truth: 'fraud',
    why: 'Classic structuring: splitting a large sum to slip under the reporting threshold.',
    rules: [
      { id: '006', band: '.03', wght: 300, reason: 'Three near-identical outgoing amounts within one hour' },
      { id: '091', band: '.02', wght: 300, reason: 'Amounts calibrated just below the regulatory reporting threshold' },
    ],
  },
  {
    kind: 'Outgoing transfer',
    amount: 480000,
    route: '<b>A. Uwera</b> &rarr; <b>unknown recipient</b>',
    clues: [
      { icon: '\u{1F319}', text: 'Initiated at <b>2:47 AM</b>' },
      { icon: '\u{1F4F1}', text: 'From a <b>device never seen</b> on this account' },
      { icon: '\u{1F4B8}', text: 'Amount is the <b>entire wallet balance</b>' },
    ],
    truth: 'fraud',
    why: 'Account takeover: new device, dead of night, drain the full balance.',
    rules: [
      { id: '018', band: '.03', wght: 300, reason: 'Exceptionally large outgoing transfer vs this account’s history' },
      { id: '030', band: '.02', wght: 150, reason: 'Creditor account never paid before' },
      { id: '076', band: '.02', wght: 100, reason: 'Activity far outside this debtor’s habitual hours' },
    ],
  },
  {
    kind: 'Incoming remittance',
    amount: 350000,
    route: '<b>E. Mukiza (Belgium)</b> &rarr; <b>his mother, Rusizi</b>',
    clues: [
      { icon: '\u{1F30D}', text: 'International transfer from a <b>sender in Belgium</b>' },
      { icon: '\u{1F4C5}', text: 'Arrives around the <b>28th of every month</b>, 3 years running' },
      { icon: '\u{1F4CA}', text: 'Amount within the usual range' },
    ],
    truth: 'legit',
    why: 'The monthly remittance home. It is the heartbeat transaction of financial inclusion.',
    rules: [
      { id: '020', band: '.01', wght: 50, reason: 'Amount within the creditor’s 3-year receiving pattern' },
    ],
  },
  {
    kind: 'Fan-out after dormancy',
    amount: 1200000,
    route: '<b>Dormant account</b> &rarr; <b>6 new recipients</b> in 10 min',
    clues: [
      { icon: '\u{1F4A4}', text: 'Account was <b>dormant for 11 months</b>' },
      { icon: '⚡', text: 'Receives 1.2M, then <b>fans out to 6 accounts</b>, all opened this week' },
      { icon: '\u{1F517}', text: 'Those 6 accounts show the <b>same pattern</b> from other senders' },
    ],
    truth: 'fraud',
    why: 'A money mule: dormant account wakes up, receives, and sprays funds onward.',
    rules: [
      { id: '004', band: '.03', wght: 250, reason: 'Debtor account dormant for 11 months before this burst' },
      { id: '017', band: '.03', wght: 250, reason: 'Rapid divergence: funds fan out to many recipients' },
      { id: '001', band: '.03', wght: 100, reason: 'Creditor accounts all derived as days old' },
    ],
  },
  {
    kind: 'Outgoing transfer',
    amount: 200000,
    route: '<b>D. Ingabire</b> &rarr; <b>G.S. Kacyiru school account</b>',
    clues: [
      { icon: '\u{1F3EB}', text: 'Recipient is a <b>school’s registered collection account</b>' },
      { icon: '\u{1F4C5}', text: 'Account\u2019s incoming volume is <b>100x normal</b> this week (term start)' },
      { icon: '\u{1F4B0}', text: 'Amount matches the published fee' },
    ],
    truth: 'legit',
    why: 'School fees at term start. It is as legitimate as payments get.',
    rules: [
      { id: '011', band: '.01', wght: 50, reason: 'Seasonal volume to a known institutional collection account' },
    ],
  },
  {
    kind: 'PIN reset, then transfer',
    amount: 300000,
    route: '<b>C. Niyigena</b> &rarr; <b>new recipient</b>',
    clues: [
      { icon: '\u{1F4DF}', text: 'SIM card was <b>swapped 20 minutes ago</b>' },
      { icon: '\u{1F510}', text: 'PIN was <b>reset immediately after</b> the swap' },
      { icon: '➡️', text: 'First action: transfer out to a recipient never paid before' },
    ],
    truth: 'fraud',
    why: 'SIM-swap attack: hijack the number, reset the PIN, drain the account.',
    rules: [
      { id: '030', band: '.03', wght: 250, reason: 'First-ever transfer to this creditor, right after credential changes' },
      { id: '018', band: '.02', wght: 150, reason: 'Large outgoing transfer vs recent history' },
      { id: '076', band: '.03', wght: 150, reason: 'Burst of sensitive actions within minutes of a SIM change' },
    ],
  },
  {
    kind: 'First transaction ever',
    amount: 180000,
    route: '<b>New user, new phone</b> &rarr; <b>her brother</b>',
    clues: [
      { icon: '\u{1F195}', text: 'Account opened <b>this week</b>: her first phone, her first wallet' },
      { icon: '\u{1F4F1}', text: 'Device unknown (naturally: it’s brand new)' },
      { icon: '\u{1F465}', text: 'Recipient is an established account with a clean history' },
    ],
    truth: 'legit',
    why: 'A first-time user, exactly the person an inclusive payment system exists for. Decline her, and you teach her to stay in cash.',
    rules: [
      { id: '001', band: '.03', wght: 200, reason: 'Debtor account derived as brand new' },
      { id: '030', band: '.01', wght: 100, reason: 'Creditor is established with a clean history' },
    ],
  },
  {
    kind: 'Burst of small payouts',
    amount: 75000,
    route: '<b>A. Mukandori</b> &rarr; <b>15 members</b>, RWF 5,000 each',
    clues: [
      { icon: '⚡', text: '<b>15 transfers in 4 minutes</b> to 15 different people' },
      { icon: '\u{1F465}', text: 'Recipients are the <b>same group every month</b>' },
      { icon: '\u{1F4C5}', text: 'Always at <b>month end</b>' },
    ],
    truth: 'legit',
    why: 'An ikimina, a savings group, paying out its members. Burst velocity, perfectly legitimate.',
    rules: [
      { id: '017', band: '.02', wght: 150, reason: 'Fan-out matches a recurring monthly payout circle' },
      { id: '010', band: '.02', wght: 100, reason: 'Burst volume consistent with month-end profile' },
    ],
  },
  {
    kind: 'Online purchase',
    amount: 90000,
    route: '<b>F. Mugenzi</b> &rarr; <b>&ldquo;Kigali Deals Online&rdquo;</b>',
    clues: [
      { icon: '\u{1F4F1}', text: 'Sender’s usual device, normal daytime hours' },
      { icon: '⚠️', text: 'Merchant account has <b>3 unresolved complaints</b> this month' },
      { icon: '\u{1F6D2}', text: 'Merchant demands <b>payment before any delivery</b>, no returns' },
    ],
    truth: 'fraud',
    why: 'A scam storefront. The sender looks normal. The risk is the counterparty.',
    efrup: true,
    rules: [
      { id: 'EFRuP', band: 'overridable-block', wght: 0, reason: 'An entity condition is in effect on the creditor: unresolved complaint cluster' },
    ],
  },
];
