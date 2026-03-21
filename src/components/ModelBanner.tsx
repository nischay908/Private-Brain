import React from 'react';
import type { ModelStatus } from '../hooks/useModelLoader';

interface Props {
  status: ModelStatus;
  progress: number;
  label: string;
  error?: string;
}

const STATUS_CONFIG: Record<ModelStatus, { icon: string; className: string; title: string }> = {
  idle:          { icon: '⏳', className: 'loading', title: 'Waiting…' },
  initializing:  { icon: '⚡', className: 'loading', title: 'Initializing SDK' },
  downloading:   { icon: '📥', className: 'loading', title: 'Downloading AI Model' },
  loading:       { icon: '🧠', className: 'loading', title: 'Loading Model' },
  ready:         { icon: '✅', className: 'ready',   title: 'AI Ready — Running On-Device' },
  error:         { icon: '❌', className: 'error',   title: 'Error Loading Model' },
};

export default function ModelBanner({ status, progress, label, error }: Props) {
  // Show briefly when ready, then fade out
  const [showReady, setShowReady] = React.useState(false);

  React.useEffect(() => {
    if (status === 'ready') {
      setShowReady(true);
      const timer = setTimeout(() => setShowReady(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (status === 'idle' || (status === 'ready' && !showReady)) return null;

  const cfg = STATUS_CONFIG[status];

  return (
    <div className={`model-banner ${cfg.className}`}>
      <span className="banner-icon">{cfg.icon}</span>
      <div className="banner-info">
        <div className="banner-title">{cfg.title}</div>
        <div className="banner-sub">{error ?? label}</div>
        {status === 'downloading' && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
