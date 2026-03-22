import React, { useEffect, useState } from 'react';

interface Props { progress: number; label: string; status: string; }

const FACTS = [
  'Your documents never leave this device — ever.',
  'No account needed. No API key. No cloud.',
  'Once loaded, your Brain works with zero internet.',
  'WebGPU runs the entire AI on your own hardware.',
  'Your knowledge stays completely private.',
  'No server sees your data. Not even ours.',
];

export default function LoadingScreen({ progress, label }: Props) {
  const [fact, setFact] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => { setFact(v => (v + 1) % FACTS.length); setTipVisible(true); }, 300);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  const pct = Math.max(4, progress);

  return (
    <div className="pb-loading dark">
      <div className="pb-loading-blob pb-blob-1" />
      <div className="pb-loading-blob pb-blob-2" />

      <div className="pb-loading-card loading-card-enter">
        <div className="pb-loading-logo">
          <div className="pb-loading-rings">
            <div className="pb-ring pb-ring-1" />
            <div className="pb-ring pb-ring-2" />
            <div className="pb-ring pb-ring-3" />
          </div>
          <div className="pb-loading-brain">🧠</div>
        </div>

        <h1 className="pb-loading-title">Private<strong>Brain</strong></h1>
        <p className="pb-loading-subtitle">Waking up your on-device AI…</p>

        <div className="pb-progress-track">
          <div className="pb-progress-fill" style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}>
            <div className="pb-progress-shimmer" />
          </div>
        </div>

        <div className="pb-progress-row">
          <span className="pb-progress-label">{label || 'Loading knowledge engine…'}</span>
          <span className="pb-progress-pct">{progress}%</span>
        </div>

        <div className="pb-loading-tip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span className={`pb-tip-text ${tipVisible ? 'tip-visible' : 'tip-hidden'}`}>
            {FACTS[fact]}
          </span>
        </div>

        <div className="pb-loading-chips">
          {['🔒 Private','✈️ Offline','⚡ On-Device','🆓 Free Forever'].map((c, i) => (
            <span key={c} className="pb-loading-chip" style={{ animationDelay: `${0.4 + i * 0.07}s` }}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}