/** Tiny API client. In dev, vite proxies /api to the Express server. */

export interface Call { choice: 'approve' | 'decline'; correct: boolean }

export interface ScoreResult { rank: number; players: number }

export interface LeaderboardData {
  top: { name: string; score: number; total: number; durationMs: number; at: string }[];
  recent: { name: string; score: number; total: number }[];
  perQuestion: {
    q: number; n: number;
    approvePct: number; declinePct: number; correctPct: number;
    correctChoice: 'approve' | 'decline' | null;
  }[];
  totals: { players: number; avgScore: number };
}

export async function postScore(payload: {
  name: string; score: number; total: number; durationMs: number; calls: Call[];
}): Promise<ScoreResult | null> {
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function getLeaderboard(): Promise<LeaderboardData | null> {
  try {
    const res = await fetch('/api/leaderboard');
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function getConfig(): Promise<{ publicUrl: string } | null> {
  try {
    const res = await fetch('/api/config');
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/** Wall-screen reset (hidden red button). Returns rows cleared, or null on failure. */
export async function resetBoard(): Promise<number | null> {
  try {
    const res = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'x-wall-reset': 'chalkdust' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.cleared === 'number' ? data.cleared : 0;
  } catch { return null; }
}
