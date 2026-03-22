import React, { useState } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';
import ChatAssistant from './components/ChatAssistant';
import SmartNotes from './components/SmartNotes';
import ResearchAnalyzer from './components/ResearchAnalyzer';
import OfflineBanner from './components/OfflineBanner';

// Only 3 tools — Chat, Notes, Research
export type Tab = 'chat' | 'notes' | 'research';

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
          {activeTab === 'chat'     && <ChatAssistant    model={model} />}
          {activeTab === 'notes'    && <SmartNotes       model={model} />}
          {activeTab === 'research' && <ResearchAnalyzer model={model} />}
        </main>
      </div>
    </div>
  );
}