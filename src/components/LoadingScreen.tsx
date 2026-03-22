import React, { useEffect, useState } from 'react';

interface Props { progress: number; label: string; status: string; }

const TIPS = [
  'Your data never leaves this device.',
  'No internet required once loaded.',
  'WebGPU powers blazing fast inference.',
  'All AI runs 100% in your browser.',
];

export default function LoadingScreen({ progress, label }: Props) {
  const [tip, setTip] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTip(v => (v + 1) % TIPS.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pb-loading">
      {/* Ambient blobs */}
      <div className="pb-loading-blob pb-blob-1" />
      <div className="pb-loading-blob pb-blob-2" />

      <div className="pb-loading-card">
        {/* Animated logo */}
        <div className="pb-loading-logo">
          <div className="pb-loading-rings">
            <div className="pb-ring pb-ring-1" />
            <div className="pb-ring pb-ring-2" />
            <div className="pb-ring pb-ring-3" />
          </div>
          <div className="pb-loading-brain">🧠</div>
        </div>

        <h1 className="pb-loading-title">Private<strong>Brain</strong></h1>
        <p className="pb-loading-subtitle">Loading on-device AI model…</p>

        {/* Progress bar */}
        <div className="pb-progress-track">
          <div className="pb-progress-fill" style={{ width: `${Math.max(4, progress)}%` }}>
            <div className="pb-progress-shimmer" />
          </div>
        </div>
        <div className="pb-progress-row">
          <span className="pb-progress-label">{label || 'Initializing…'}</span>
          <span className="pb-progress-pct">{progress}%</span>
        </div>

        {/* Rotating tip */}
        <div className="pb-loading-tip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span key={tip} className="pb-tip-text">{TIPS[tip]}</span>
        </div>

        {/* Feature chips */}
        <div className="pb-loading-chips">
          {['🔒 Private','⚡ Fast','✈️ Offline','💸 Free'].map(c => (
            <span key={c} className="pb-loading-chip">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}