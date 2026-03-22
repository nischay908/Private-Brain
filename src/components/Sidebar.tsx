import React, { useState } from 'react';
import type { Tab } from '../App';
import type { ModelState } from '../hooks/useModelLoader';
import DemoMode from './DemoMode';

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  model: ModelState;
}

const NAV: { id: Tab; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: 'pdf',
    label: 'PDF Research',
    sub: 'Upload · Analyze · Chat',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    id: 'notes',
    label: 'Smart Notes',
    sub: 'Capture & summarize',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
  },
];

const STATUS_COLOR: Record<string, string> = {
  ready: '#10B981', error: '#EF4444',
  downloading: '#F59E0B', loading: '#F59E0B',
  initializing: '#F59E0B', idle: '#6B7280',
};

export default function Sidebar({ activeTab, onTabChange, darkMode, onToggleDark, model }: Props) {
  const [showDemo, setShowDemo] = useState(false);

  return (
    <>
      <aside className="pb-sidebar">

        {/* Brand */}
        <div className="pb-logo">
          <div className="pb-logo-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="url(#pbg)" strokeWidth="2"/>
              <path d="M8 12h8M12 8v8" stroke="url(#pbg)" strokeWidth="2" strokeLinecap="round"/>
              <defs>
                <linearGradient id="pbg" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0%" stopColor="#818CF8"/>
                  <stop offset="100%" stopColor="#22D3EE"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <div className="pb-logo-text">Private<strong>Brain</strong></div>
            <div className="pb-logo-tagline">Private AI Research</div>
          </div>
        </div>

        {/* Model pill */}
        <div className="pb-model-pill">
          <span className="pb-model-dot" style={{ background: STATUS_COLOR[model.status] ?? '#6B7280' }} />
          <span className="pb-model-label">
            {model.status === 'ready' ? '🔒 On-device · Llama 3.2' : model.progressLabel || 'Loading AI…'}
          </span>
        </div>

        {/* Nav */}
        <nav className="pb-nav">
          <span className="pb-nav-section">Tools</span>
          {NAV.map(item => (
            <button
              key={item.id}
              className={`pb-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="pb-nav-icon">{item.icon}</span>
              <span className="pb-nav-text">
                <span className="pb-nav-label">{item.label}</span>
                <span className="pb-nav-sub">{item.sub}</span>
              </span>
              {activeTab === item.id && <span className="pb-nav-active-bar" />}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ padding: '0 0 10px' }}>
          <button className="demo-trigger-btn" onClick={() => setShowDemo(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Demo Mode
            <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>Hackathon</span>
          </button>
        </div>

        <div className="pb-sidebar-bottom">
          <div className="pb-privacy-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Zero Cloud · Your data stays here
          </div>
          <button className="pb-dark-toggle" onClick={onToggleDark}>
            {darkMode ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
            <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </aside>

      {showDemo && (
        <DemoMode
          onClose={() => setShowDemo(false)}
          onNavigate={(tab) => { onTabChange(tab as Tab); setShowDemo(false); }}
        />
      )}
    </>
  );
}