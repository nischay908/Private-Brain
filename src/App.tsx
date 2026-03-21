import React, { useState } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import LoadingScreen from './components/LoadingScreen';
import WritingStudio from './components/WritingStudio';
import DocumentAnalyzer from './components/DocumentAnalyzer';
import ChatAssistant from './components/ChatAssistant';
import CodeExplainer from './components/CodeExplainer';

type Tab = 'chat' | 'write' | 'analyze' | 'code';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'chat',    icon: '💬', label: 'AI Chat' },
  { id: 'write',   icon: '✍️', label: 'Writing Studio' },
  { id: 'analyze', icon: '🔬', label: 'Doc Analyzer' },
  { id: 'code',    icon: '💻', label: 'Code Helper' },
];

export default function App() {
  const model = useModelLoader();
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  if (['idle','initializing','downloading','loading'].includes(model.status)) {
    return <LoadingScreen progress={model.progress} label={model.progressLabel} status={model.status} />;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🧠</div>
          <div className="logo-text">Think<span>Local</span></div>
        </div>
        <nav className="header-nav">
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
        <div className="header-badge">
          <div className="pulse-dot" />
          On-Device · Zero Cloud
        </div>
      </header>

      <main className={`main ${activeTab === 'chat' ? 'main-chat' : ''}`}>
        {model.status === 'error' && (
          <div className="error-banner">
            ❌ Model failed to load: {model.error}
          </div>
        )}
        {activeTab === 'chat'    && <ChatAssistant    model={model} />}
        {activeTab === 'write'   && <WritingStudio    model={model} />}
        {activeTab === 'analyze' && <DocumentAnalyzer model={model} />}
        {activeTab === 'code'    && <CodeExplainer    model={model} />}
      </main>

      {activeTab !== 'chat' && (
        <footer className="app-footer">
          Powered by WebLLM · Llama 3.2 1B · WebGPU · 100% Private
        </footer>
      )}
    </div>
  );
}
