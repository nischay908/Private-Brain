import React, { useState, useEffect } from 'react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

export default function OfflineBanner() {
  const { isOnline, wasEverOffline } = useOfflineStatus();
  const [showOnlineFlash, setShowOnlineFlash] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Flash "back online" briefly when reconnecting
  useEffect(() => {
    if (isOnline && wasEverOffline) {
      setShowOnlineFlash(true);
      const t = setTimeout(() => setShowOnlineFlash(false), 4000);
      return () => clearTimeout(t);
    }
  }, [isOnline, wasEverOffline]);

  // Always show privacy-first offline banner (never truly needs internet after load)
  if (dismissed) return null;

  // User just came back online after being offline
  if (showOnlineFlash) {
    return (
      <div className="offline-banner online-flash">
        <span className="offline-banner-dot online" />
        <span>Back online — but PrivateBrain still runs 100% on your device</span>
        <button className="offline-dismiss" onClick={() => setShowOnlineFlash(false)}>✕</button>
      </div>
    );
  }

  // Currently offline
  if (!isOnline) {
    return (
      <div className="offline-banner offline">
        <span className="offline-banner-dot offline-dot" />
        <div className="offline-banner-text">
          <strong>Running in 100% Private Offline Mode</strong>
          <span>No internet required · All AI runs on your device · Your data stays here</span>
        </div>
        <div className="offline-banner-badge">✈️ Offline</div>
      </div>
    );
  }

  // Online — show subtle privacy reminder (dismissible)
  return (
    <div className="offline-banner privacy-mode">
      <span className="offline-banner-dot online" />
      <span className="offline-banner-text-inline">
        <strong>Privacy-First Mode</strong> · AI runs on your device · Zero data sent to cloud
      </span>
      <button className="offline-dismiss" onClick={() => setDismissed(true)}>✕</button>
    </div>
  );
}