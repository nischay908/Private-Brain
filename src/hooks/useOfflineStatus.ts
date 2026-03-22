import { useState, useEffect } from 'react';

export interface OfflineStatus {
  isOnline: boolean;
  wasEverOffline: boolean;
  connectionType: string;
}

export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline]             = useState(() => navigator.onLine);
  const [wasEverOffline, setWasEverOffline] = useState(() => !navigator.onLine);
  const [connectionType, setConnectionType] = useState<string>('unknown');

  useEffect(() => {
    // Get connection type if available
    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
    if (nav.connection?.effectiveType) setConnectionType(nav.connection.effectiveType);

    const handleOnline  = () => { setIsOnline(true); };
    const handleOffline = () => { setIsOnline(false); setWasEverOffline(true); };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasEverOffline, connectionType };
}