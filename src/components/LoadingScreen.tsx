import React, { useEffect, useState, useRef } from 'react';

interface Props { progress: number; label: string; status: string; offlineReady?: boolean; }

const FACTS = [
  'Your documents never leave this device — ever.',
  'No account needed. No API key. No cloud.',
  'Once loaded, your Brain works with zero internet.',
  'WebGPU runs the entire AI on your own hardware.',
  'Your knowledge stays completely private.',
  'No server sees your data. Not even ours.',
];

// ── Typing animation hook ──────────────────────────────────────
function useTypingText(text: string, speed = 28) {
  const [displayed, setDisplayed] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDisplayed('');
    let i = 0;
    function tick() {
      i++;
      setDisplayed(text.slice(0, i));
      if (i < text.length) timerRef.current = setTimeout(tick, speed);
    }
    timerRef.current = setTimeout(tick, speed);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text, speed]);

  return displayed;
}

export default function LoadingScreen({ progress, label, offlineReady }: Props) {
  const [factIdx,     setFactIdx]     = useState(0);
  const [tipVisible,  setTipVisible]  = useState(true);
  const [entered,     setEntered]     = useState(false);

  // Fade-in on mount
  useEffect(() => { const t = setTimeout(() => setEntered(true), 60); return () => clearTimeout(t); }, []);

  // Rotate facts
  useEffect(() => {
    const t = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => { setFactIdx(v => (v + 1) % FACTS.length); setTipVisible(true); }, 320);
    }, 3400);
    return () => clearInterval(t);
  }, []);

  const typedLabel = useTypingText(label || 'Loading knowledge engine…', 22);
  const pct = Math.max(4, progress);

  return (
    <div className={`pb-loading dark loading-fade-in ${entered ? 'loaded' : ''}`}>
      {/* Animated gradient background */}
      <div className="pb-loading-bg-gradient" aria-hidden="true"/>
      <div className="pb-loading-blob pb-blob-1"/>
      <div className="pb-loading-blob pb-blob-2"/>

      <div className="pb-loading-card loading-card-enter">

        {/* Brain logo with rings */}
        <div className="pb-loading-logo">
          <div className="pb-loading-rings">
            <div className="pb-ring pb-ring-1"/>
            <div className="pb-ring pb-ring-2"/>
            <div className="pb-ring pb-ring-3"/>
          </div>
          <div className="pb-loading-brain">🧠</div>
        </div>

        <h1 className="pb-loading-title">Private<strong>Brain</strong></h1>
        <p className="pb-loading-subtitle">Waking up your on-device AI…</p>

        {/* Offline ready badge — shows once model is in cache */}
        {offlineReady && (
          <div className="pb-offline-ready-chip fade-in-badge">
            <span className="pb-offline-ready-dot"/>
            ✈️ Offline Ready — model cached
          </div>
        )}

        {/* Progress bar */}
        <div className="pb-progress-track">
          <div
            className="pb-progress-fill"
            style={{ width: `${pct}%`, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }}
          >
            <div className="pb-progress-shimmer"/>
          </div>
        </div>

        <div className="pb-progress-row">
          {/* Typing animation on the label */}
          <span className="pb-progress-label pb-typing-label">
            {typedLabel}
            <span className="pb-cursor">|</span>
          </span>
          <span className="pb-progress-pct">{progress}%</span>
        </div>

        {/* Rotating privacy tip */}
        <div className="pb-loading-tip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span className={`pb-tip-text ${tipVisible ? 'tip-visible' : 'tip-hidden'}`}>
            {FACTS[factIdx]}
          </span>
        </div>

        {/* Feature chips with staggered fade-in */}
        <div className="pb-loading-chips">
          {['🔒 Private','✈️ Offline','⚡ On-Device','🆓 Free Forever'].map((c, i) => (
            <span
              key={c}
              className="pb-loading-chip chip-hover"
              style={{ animationDelay: `${0.4 + i * 0.09}s` }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}