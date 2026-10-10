import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { QRCodeSVG } from 'qrcode.react';
import { getConfig, getLeaderboard, type LeaderboardData } from '../api';
import { SCENARIOS } from '../scenarios';

const POLL_MS = 2500;
const reduced = typeof matchMedia !== 'undefined'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The facilitator wall screen: QR to join, live leaderboard, and the room's
 * collective judgment per transaction. Projected next to the Tazama demo.
 */
export default function WallView() {
  const [publicUrl, setPublicUrl] = useState('');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const playersRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConfig().then(c => { if (c) setPublicUrl(c.publicUrl); });
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => getLeaderboard().then(d => { if (alive && d) setData(d); });
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Pulse the leaderboard when a new score lands
  useEffect(() => {
    if (!data) return;
    if (data.totals.players > playersRef.current && playersRef.current > 0 && boardRef.current && !reduced) {
      gsap.fromTo(boardRef.current, { scale: 1.015 }, { scale: 1, duration: 0.5, ease: 'power2.out' });
    }
    playersRef.current = data.totals.players;
  }, [data]);

  const joinUrl = publicUrl || window.location.origin;

  // The room's most over-blocked legitimate transaction (the inclusion lesson)
  const overBlocked = data?.perQuestion
    .filter(q => q.n >= 3 && q.correctChoice === 'approve')
    .sort((a, b) => b.declinePct - a.declinePct)[0];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '14px 18px', gap: 12, overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>You vs Fraud Detection</h1>
          <div style={{ color: 'var(--ink-dim)', fontSize: '.9rem' }}>
            Can you beat a real-time fraud engine? Scan, play, find out. 2 minutes.
          </div>
        </div>
        {data && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Stat k="Players" v={String(data.totals.players)} />
            <Stat k="Avg score" v={`${data.totals.avgScore}/10`} />
            <Stat k="Best" v={data.top[0] ? `${data.top[0].score}/10` : '–'} />
          </div>
        )}
      </header>

      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
        {/* ── QR panel ── */}
        <div style={{ ...panel, width: 300, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: 14 }}>
            <QRCodeSVG value={joinUrl} size={220} level="M" />
          </div>
          <div className="display" style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '.04em', textAlign: 'center' }}>
            Scan to take the fraud desk
          </div>
          <div className="tabular" style={{ color: 'var(--ink-dim)', fontSize: '.8rem', textAlign: 'center', wordBreak: 'break-all' }}>
            {joinUrl.replace(/^https?:\/\//, '')}
          </div>
        </div>

        {/* ── Leaderboard ── */}
        <div ref={boardRef} className="chalkboard" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 className="chalk" style={{ margin: 0, padding: '12px 18px 6px', fontSize: '1.7rem', fontWeight: 700, borderBottom: '1px dashed rgba(243,239,226,.3)', transform: 'rotate(-0.6deg)' }}>
            Leaderboard · today
          </h3>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 18px 12px' }}>
            {!data || data.top.length === 0 ? (
              <p className="chalk" style={{ color: 'rgba(243,239,226,.75)', fontSize: '1.4rem' }}>No players yet. Be the first on the board.</p>
            ) : data.top.map((r, i) => (
              <div key={`${r.name}-${r.at}`} className="chalk chalk-row" style={{
                display: 'flex', alignItems: 'baseline', gap: 12, padding: '6px 2px',
                fontSize: i === 0 ? '1.9rem' : '1.5rem', lineHeight: 1.25,
                transform: `rotate(${((i % 3) - 1) * 0.4}deg)`,
              }}>
                <span className="tabular" style={{ width: 30, textAlign: 'right', color: i < 3 ? '#ffd98a' : 'rgba(243,239,226,.6)', fontWeight: 700 }}>{i + 1}.</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span className="tabular" style={{ color: '#a8e6c4', fontWeight: 700 }}>{r.score}/{r.total}</span>
                <span className="tabular" style={{ color: 'rgba(243,239,226,.55)', fontSize: '1.1rem', width: 52, textAlign: 'right' }}>{(r.durationMs / 1000).toFixed(0)}s</span>
              </div>
            ))}
          </div>
          {data && data.recent.length > 0 && (
            <div className="chalk" style={{ borderTop: '1px dashed rgba(243,239,226,.3)', padding: '6px 18px 10px', fontSize: '1.25rem', color: 'rgba(243,239,226,.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Just played:{' '}
              {data.recent.map((r, i) => (
                <span key={i}>{i > 0 && ' · '}<b style={{ color: '#f3efe2' }}>{r.name}</b> {r.score}/{r.total}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Room judgment per transaction ── */}
        <div style={{ ...panel, width: 420, flex: 'none', display: 'flex', flexDirection: 'column' }}>
          <PanelTitle>How the room called it</PanelTitle>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!data || data.totals.players === 0 ? (
              <p style={{ color: 'var(--ink-dim)' }}>Live after the first game: how this room approves and declines, transaction by transaction.</p>
            ) : data.perQuestion.map((q, idx) => {
              const s = SCENARIOS[idx];
              if (!s || q.n === 0) return null;
              return (
                <div key={q.q}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.74rem', color: 'var(--ink-dim)', marginBottom: 2 }}>
                    <span>#{q.q} {s.kind}{' '}
                      {s.truth === 'fraud'
                        ? <span className="pill p-bad" style={{ fontSize: '.6rem' }}>fraud</span>
                        : <span className="pill p-dim" style={{ fontSize: '.6rem' }}>legit</span>}
                    </span>
                    <span className="tabular">{q.correctPct}% right</span>
                  </div>
                  <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(34,31,26,.08)' }}>
                    <div title={`Approved: ${q.approvePct}%`} style={{ width: `${q.approvePct}%`, background: 'var(--ok)', opacity: q.correctChoice === 'approve' ? 0.95 : 0.45, transition: 'width .6s' }} />
                    <div title={`Declined: ${q.declinePct}%`} style={{ width: `${q.declinePct}%`, background: 'var(--bad)', opacity: q.correctChoice === 'decline' ? 0.95 : 0.45, transition: 'width .6s' }} />
                  </div>
                </div>
              );
            })}
          </div>
          {overBlocked && (
            <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px', fontSize: '.82rem', color: 'var(--ink-dim)' }}>
              <b style={{ color: 'var(--accent)' }}>{overBlocked.declinePct}%</b> of this room declined{' '}
              <b style={{ color: 'var(--ink)' }}>#{overBlocked.q} ({SCENARIOS[overBlocked.q - 1]?.kind})</b>, a legitimate payment.
              That is the inclusion cost of over-blocking.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }:{ k: string; v: string }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
      <div className="display" style={{ fontSize: '.58rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>{k}</div>
      <div className="display tabular" style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--accent)' }}>{v}</div>
    </div>
  );
}

function PanelTitle({ children }:{ children: React.ReactNode }) {
  return (
    <h3 className="display" style={{ margin: 0, padding: '12px 14px 8px', fontSize: '.78rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', borderBottom: '1px solid var(--line)' }}>
      {children}
    </h3>
  );
}

const panel: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', boxShadow: '0 1px 0 rgba(34,31,26,.08), 0 10px 24px rgba(74,62,36,.12)',
};
