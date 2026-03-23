/**
 * PWAInstallBanner
 * Shows an "Install App" prompt when browser triggers beforeinstallprompt.
 * Also shows "Running Offline" banner when network is lost.
 * Place at: src/components/PWAInstallBanner.tsx
 */
import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallBanner() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed]       = useState(false);
  const [isOffline, setIsOffline]       = useState(!navigator.onLine);
  const [showOffline, setShowOffline]   = useState(false);

  useEffect(() => {
    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Online / offline
    const goOnline  = () => { setIsOffline(false); setShowOffline(false); };
    const goOffline = () => { setIsOffline(true);  setShowOffline(true);  };
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('✅ SW registered:', reg.scope);
      }).catch(err => {
        console.warn('SW registration failed:', err);
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstallEvent(null);
    setDismissed(true);
  };

  // Offline banner — shown when internet drops
  if (showOffline) return (
    <div className="pwa-install-banner" style={{ borderColor: 'rgba(52,211,153,0.4)' }}>
      <span style={{ fontSize: 20 }}>✈️</span>
      <div className="pwa-install-text">
        <span>Running Offline</span> — Your Brain works without internet
      </div>
      <button className="pwa-install-dismiss" onClick={() => setShowOffline(false)}>✕</button>
    </div>
  );

  // Install prompt
  if (!installEvent || dismissed) return null;

  return (
    <div className="pwa-install-banner">
      <span style={{ fontSize: 20 }}>🧠</span>
      <div className="pwa-install-text">
        Install <span>PrivateBrain</span> — works offline, no internet needed
      </div>
      <button className="pwa-install-btn" onClick={install}>Install App</button>
      <button className="pwa-install-dismiss" onClick={() => setDismissed(true)}>Not now</button>
    </div>
  );
}