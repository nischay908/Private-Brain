import React, { useState, useEffect } from 'react';
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
  const [pwaReady, setPwaReady]   = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setPwaReady(true)).catch(() => {});
    }
  }, []);

  if (['idle','initializing','downloading','loading'].includes(model.status)) {
    return <LoadingScreen progress={model.progress} label={model.progressLabel} status={model.status} />;
  }

  return (
    <div className={`pb-root ${darkMode ? 'dark' : 'light'}`}>
      <div className="orbs-bg" aria-hidden="true">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
      </div>
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(v => !v)}
        model={model}
        pwaReady={pwaReady}
      />
      <div className="pb-main-wrapper">
        <OfflineBanner />
        <main className="pb-main">
          <div key={activeTab} className="tab-page tab-enter">
            {activeTab === 'pdf'   && <PDFWorkspace model={model} />}
            {activeTab === 'notes' && <SmartNotes   model={model} />}
          </div>
        </main>
      </div>
    </div>
  );
}