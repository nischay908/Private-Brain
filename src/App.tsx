import React, { useState } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';
import PDFWorkspace from './components/PDFWorkspace';
import SmartNotes from './components/SmartNotes';
import OfflineBanner from './components/OfflineBanner';

export type Tab = 'pdf' | 'notes';

export default function App() {
  const model = useModelLoader();
  const [activeTab, setActiveTab] = useState<Tab>('pdf');
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
          {activeTab === 'pdf'   && <PDFWorkspace model={model} />}
          {activeTab === 'notes' && <SmartNotes   model={model} />}
        </main>
      </div>
    </div>
  );
}