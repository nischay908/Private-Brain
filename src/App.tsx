import React, { useState, useEffect } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import { useKnowledgeContext } from './hooks/useKnowledgeContext';
import LoadingScreen from './components/LoadingScreen';
import PDFWorkspace from './components/PDFWorkspace';
import SmartNotes from './components/SmartNotes';
import OfflineBanner from './components/OfflineBanner';
import DemoMode from './components/DemoMode';
import PWAInstallBanner from './components/PWAInstallBanner';

export type Tab = 'pdf' | 'notes';

// ── Error screen with retry ──────────────────────────────────
function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="pb-loading dark" style={{ flexDirection: 'column', gap: 0 }}>
      <div className="pb-loading-blob pb-blob-1"/>
      <div className="pb-loading-blob pb-blob-2"/>
      <div className="pb-loading-card loading-card-enter" style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--font-display,sans-serif)', fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.5px', textAlign: 'center' }}>
          AI Model Failed to Load
        </h2>
        <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.6, maxWidth: 340 }}>
          {error || 'Could not load the on-device AI. This usually means your browser does not support WebGPU, or there was a network issue during download.'}
        </p>

        {/* Likely causes */}
        <div style={{ width: '100%', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '14px 16px', textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(248,113,113,0.8)', marginBottom: 8, fontFamily: 'var(--font-mono,monospace)' }}>
            Common causes
          </div>
          {[
            '❌ Browser does not support WebGPU (use Chrome 113+ or Edge)',
            '❌ Internet connection interrupted during model download',
            '❌ Insufficient GPU / device memory (needs ~2GB free RAM)',
            '❌ Private/Incognito mode blocking IndexedDB',
          ].map(c => (
            <div key={c} style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 5, lineHeight: 1.4 }}>{c}</div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button
            onClick={onRetry}
            style={{ padding: '13px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#6C8EF5,#38BDF8)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body,sans-serif)', transition: 'all 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            🔄 Retry Loading
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '11px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body,sans-serif)' }}
          >
            ↺ Hard Refresh Page
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontFamily: 'var(--font-mono,monospace)' }}>
          ✅ Tested on: Chrome 113+ · Edge 113+ · Chrome for Android
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const model     = useModelLoader();
  const knowledge = useKnowledgeContext();
  const [activeTab, setActiveTab] = useState<Tab>('pdf');
  const [darkMode, setDarkMode]   = useState(true);
  const [showDemo, setShowDemo]   = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on  = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Loading states
  if (['idle','initializing','downloading','loading'].includes(model.status)) {
    return <LoadingScreen progress={model.progress} label={model.progressLabel} status={model.status} offlineReady={model.offlineReady} />;
  }

  // ── ERROR STATE — show proper error screen with retry ──
  if (model.status === 'error') {
    return <ErrorScreen error={model.error || ''} onRetry={model.reload} />;
  }

  const statusColor = '#34D399';

  return (
    <div className={`app-shell ${darkMode ? 'dark' : 'light'}`}>
      <div className="bg-orbs" aria-hidden="true">
        <div className="bg-orb bg-orb-1"/><div className="bg-orb bg-orb-2"/><div className="bg-orb bg-orb-3"/>
      </div>
      <div className="bg-grid" aria-hidden="true"/>

      {/* ═══ TOP NAV ═══ */}
      <header className="topnav">
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

        <nav className="topnav-tabs">
          {([
            { id: 'pdf'   as Tab, icon: '📄', label: 'Knowledge Base', sub: 'PDF · Analyze · Chat' },
            { id: 'notes' as Tab, icon: '✏️', label: 'Brain Notes',    sub: 'Capture · Summarize' },
          ]).map(t => (
            <button key={t.id} className={`topnav-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              <span className="topnav-tab-icon">{t.icon}</span>
              <div className="topnav-tab-text">
                <span className="topnav-tab-label">{t.label}</span>
                <span className="topnav-tab-sub">{t.sub}</span>
              </div>
              {activeTab === t.id && <span className="topnav-tab-bar"/>}
            </button>
          ))}
        </nav>

        <div className="topnav-right">
          {isOffline && (
            <div className="offline-indicator">
              <span>✈️</span> Offline Mode
            </div>
          )}

          {model.offlineReady && (
            <div className="offline-ready-badge" title="Model cached — works without internet">
              <span className="offline-ready-dot"/>
              <span>Offline Ready</span>
            </div>
          )}

          {knowledge.hasContext && (
            <div className="knowledge-pill" title={knowledge.contextSummary}>
              <span className="knowledge-dot"/>
              <span>{knowledge.pdfName ? knowledge.pdfName.slice(0, 18) + (knowledge.pdfName.length > 18 ? '…' : '') : 'Notes loaded'}</span>
            </div>
          )}

          <div className="status-pill">
            <span className="status-dot" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}88` }}/>
            <span className="status-text">Brain Ready</span>
          </div>

          <button className="topnav-btn demo-btn" onClick={() => setShowDemo(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Demo
          </button>

          <button className="topnav-btn icon-btn" onClick={() => setDarkMode(v => !v)}>
            {darkMode
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
        </div>
      </header>

      <OfflineBanner />

      <main className="app-main">
        <div key={activeTab} className="page-enter">
          {activeTab === 'pdf' && (
            <PDFWorkspace
              model={model}
              onPdfLoaded={(text, name) => knowledge.setPdfContext(text, name)}
              notesContext={knowledge.notesText}
            />
          )}
          {activeTab === 'notes' && <SmartNotes model={model} />}
        </div>
      </main>

      {showDemo && (
        <DemoMode
          onClose={() => setShowDemo(false)}
          onNavigate={(tab) => { setActiveTab(tab as Tab); setShowDemo(false); }}
        />
      )}
      <PWAInstallBanner />
    </div>
  );
}