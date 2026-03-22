import React, { useState, useEffect } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import LoadingScreen from './components/LoadingScreen';
import PDFWorkspace from './components/PDFWorkspace';
import SmartNotes from './components/SmartNotes';
import OfflineBanner from './components/OfflineBanner';
import DemoMode from './components/DemoMode';

export type Tab = 'pdf' | 'notes';

export default function App() {
  const model = useModelLoader();
  const [activeTab, setActiveTab] = useState<Tab>('pdf');
  const [darkMode, setDarkMode]   = useState(true);
  const [showDemo, setShowDemo]   = useState(false);
  const [pwaReady, setPwaReady]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setPwaReady(true)).catch(() => {});
    }
  }, []);

  if (['idle','initializing','downloading','loading'].includes(model.status)) {
    return <LoadingScreen progress={model.progress} label={model.progressLabel} status={model.status} />;
  }

  const statusColor = model.status === 'ready' ? '#34D399' : '#F59E0B';

  return (
    <div className={`app-shell ${darkMode ? 'dark' : 'light'}`}>
      {/* Animated background */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="bg-orb bg-orb-1"/><div className="bg-orb bg-orb-2"/><div className="bg-orb bg-orb-3"/>
      </div>
      <div className="bg-grid" aria-hidden="true"/>

      {/* ═══ TOP NAVIGATION BAR ═══ */}
      <header className="topnav">
        {/* Left — Brand */}
        <div className="topnav-brand">
          <div className="brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="url(#bgi)" strokeWidth="2"/>
              <path d="M8 12h8M12 8v8" stroke="url(#bgi)" strokeWidth="2.5" strokeLinecap="round"/>
              <defs><linearGradient id="bgi" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stopColor="#6C8EF5"/><stop offset="100%" stopColor="#38BDF8"/>
              </linearGradient></defs>
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">Private<strong>Brain</strong></span>
            <span className="brand-tag">Private AI Research</span>
          </div>
        </div>

        {/* Center — Tab navigation */}
        <nav className="topnav-tabs">
          {([
            { id: 'pdf'   as Tab, icon: '📄', label: 'Knowledge Base', sub: 'PDF · Analyze · Chat' },
            { id: 'notes' as Tab, icon: '✏️', label: 'Brain Notes',    sub: 'Capture · Summarize' },
          ]).map(t => (
            <button
              key={t.id}
              className={`topnav-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="topnav-tab-icon">{t.icon}</span>
              <div className="topnav-tab-text">
                <span className="topnav-tab-label">{t.label}</span>
                <span className="topnav-tab-sub">{t.sub}</span>
              </div>
              {activeTab === t.id && <span className="topnav-tab-bar"/>}
            </button>
          ))}
        </nav>

        {/* Right — Status + controls */}
        <div className="topnav-right">
          {/* AI Status */}
          <div className="status-pill">
            <span className="status-dot" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}88` }}/>
            <span className="status-text">
              {model.status === 'ready' ? 'Brain Ready' : 'Loading Brain…'}
            </span>
            {pwaReady && <span className="offline-chip">✈️</span>}
          </div>

          {/* Demo button */}
          <button className="topnav-btn demo-btn" onClick={() => setShowDemo(true)} title="Hackathon Demo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Demo
          </button>

          {/* Dark mode */}
          <button className="topnav-btn icon-btn" onClick={() => setDarkMode(v => !v)} title="Toggle theme">
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>
      </header>

      {/* Privacy banner */}
      <OfflineBanner />

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="app-main">
        <div key={activeTab} className="page-enter">
          {activeTab === 'pdf'   && <PDFWorkspace model={model} />}
          {activeTab === 'notes' && <SmartNotes   model={model} />}
        </div>
      </main>

      {/* Demo modal */}
      {showDemo && (
        <DemoMode
          onClose={() => setShowDemo(false)}
          onNavigate={(tab) => { setActiveTab(tab as Tab); setShowDemo(false); }}
        />
      )}
    </div>
  );
}