import React, { useState } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import LoadingScreen from './components/LoadingScreen';
import WritingStudio from './components/WritingStudio';
import DocumentAnalyzer from './components/DocumentAnalyzer';
import ChatAssistant from './components/ChatAssistant';
import CodeExplainer from './components/CodeExplainer';
import SmartNotes from './components/SmartNotes';
import Sidebar from './components/Sidebar';
import OfflineBanner from './components/OfflineBanner';

export type Tab = 'chat' | 'write' | 'analyze' | 'code' | 'notes';

export default function App() {
  const model = useModelLoader();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [darkMode, setDarkMode]   = useState(true);

  if (['idle','initializing','downloading','loading'].includes(model.status)) {
    return <LoadingScreen progress={model.progress} label={model.progressLabel} status={model.status} />;
  }

  return (
    <div className={`pb-root ${darkMode ? 'dark' : 'light'}`}>
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(v => !v)}
        model={model}
      />
      <div className="pb-main-wrapper">
        <OfflineBanner />
        <main className="pb-main">
          {activeTab === 'chat'    && <ChatAssistant    model={model} />}
          {activeTab === 'write'   && <WritingStudio    model={model} />}
          {activeTab === 'analyze' && <DocumentAnalyzer model={model} />}
          {activeTab === 'code'    && <CodeExplainer    model={model} />}
          {activeTab === 'notes'   && <SmartNotes       model={model} />}
        </main>
      </div>
    </div>
  );
}