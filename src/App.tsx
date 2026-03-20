import React, { useState } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import ModelBanner from './components/ModelBanner';
import WritingStudio from './components/WritingStudio';
import DocumentAnalyzer from './components/DocumentAnalyzer';
import ChatAssistant from './components/ChatAssistant';

type Tab = 'write' | 'analyze' | 'chat';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'write',   icon: '✍️', label: 'Writing Studio' },
  { id: 'analyze', icon: '🔬', label: 'Doc Analyzer' },
  { id: 'chat',    icon: '💬', label: 'AI Chat' },
];

export default function App() {
  const model = useModelLoader();
  const [activeTab, setActiveTab] = useState<Tab>('write');

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🧠</div>
          <div className="logo-text">Think<span>Local</span></div>
        </div>
        <div className="header-badge">
          <div className="pulse-dot" />
          On-Device AI · Zero Cloud
        </div>
      </header>

      {/* ── Nav ── */}
      <nav className="nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="nav-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <main className="main">
        {/* Model Banner */}
        <ModelBanner
          status={model.status}
          progress={model.progress}
          label={model.progressLabel}
          error={model.error}
        />

        {/* Hero (only on write tab when model is loading or fresh) */}
        {activeTab === 'write' && model.status !== 'ready' && (
          <div className="hero">
            <h1 className="hero-title">
              AI That <span className="hero-gradient">Runs on You</span>
            </h1>
            <p className="hero-sub">
              A privacy-first writing assistant powered by on-device AI.
              Your data never leaves your browser — ever.
            </p>
            <div className="feature-chips">
              <span className="feature-chip purple">⚡ Sub-100ms responses</span>
              <span className="feature-chip cyan">🔒 100% Private</span>
              <span className="feature-chip green">✈️ Works Offline</span>
              <span className="feature-chip purple">💸 Zero Cloud Costs</span>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'write'   && <WritingStudio   model={model} />}
        {activeTab === 'analyze' && <DocumentAnalyzer model={model} />}
        {activeTab === 'chat'    && <ChatAssistant    model={model} />}

        {/* Footer note */}
        <div style={{ textAlign: 'center', paddingBottom: 32, fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Powered by RunAnywhere SDK · LFM2 350M · WebAssembly · Built at HackXtreme
        </div>
      </main>
    </div>
  );
}
