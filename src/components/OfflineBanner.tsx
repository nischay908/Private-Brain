import React, { useState, useEffect } from 'react';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export default function OfflineBanner() {
  const isOnline  = useOnline();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className={`privacy-banner banner-enter ${isOnline ? 'online' : 'offline-mode'}`}>
      <div className="privacy-banner-left">
        <span className={`privacy-dot ${isOnline ? 'green' : 'amber'}`} />
        <div className="privacy-banner-text">
          {isOnline ? (
            <><strong>Your Brain runs 100% on this device</strong><span> — documents and conversations never touch a server, even when online</span></>
          ) : (
            <><strong>✈️ Full Offline Mode — Your Brain is self-contained</strong><span> — no internet needed · complete privacy · works anywhere</span></>
          )}
        </div>
      </div>
      <div className="privacy-banner-right">
        <span className="privacy-tech-badge">WebGPU · On-Device AI</span>
        <button className="privacy-dismiss" onClick={() => setDismissed(true)}>✕</button>
      </div>
    </div>
  );
}