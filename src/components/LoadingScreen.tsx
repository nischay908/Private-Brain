import React from 'react';

interface LoadingScreenProps {
  progress: number;
  label: string;
  status: string;
}

export default function LoadingScreen({ progress, label, status }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        {/* Animated Logo */}
        <div className="loading-logo">
          <div className="logo-icon-large">🧠</div>
          <div className="loading-rings">
            <div className="ring ring-1"></div>
            <div className="ring ring-2"></div>
            <div className="ring ring-3"></div>
          </div>
        </div>

        {/* Brand */}
        <h1 className="loading-title">
          Think<span className="gradient-text">Local</span>
        </h1>
        <p className="loading-subtitle">Privacy-First AI Assistant</p>

        {/* Progress Bar */}
        <div className="loading-progress-container">
          <div className="loading-progress-bar">
            <div 
              className="loading-progress-fill" 
              style={{ width: `${progress}%` }}
            >
              <div className="progress-shimmer"></div>
            </div>
          </div>
          <div className="loading-percentage">{progress}%</div>
        </div>

        {/* Status Text */}
        <div className="loading-status">
          <div className="status-dot"></div>
          <span>{label}</span>
        </div>

        {/* Feature Pills */}
        <div className="loading-features">
          <div className="feature-pill">
            <span className="feature-icon">🔒</span>
            <span>100% Private</span>
          </div>
          <div className="feature-pill">
            <span className="feature-icon">⚡</span>
            <span>Lightning Fast</span>
          </div>
          <div className="feature-pill">
            <span className="feature-icon">✈️</span>
            <span>Works Offline</span>
          </div>
        </div>

        {/* Particles Background */}
        <div className="particles">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i} 
              className="particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 4}s`
              }}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
}
