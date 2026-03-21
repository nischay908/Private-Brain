import React, { useState, useRef } from 'react';
import type { ModelState } from '../hooks/useModelLoader';

interface Props { model: ModelState; }

const ANALYSIS_MODES = [
  { id: 'summary',   icon: '📋', label: 'Summarize',    desc: 'Concise summary',         color: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' },
  { id: 'keypoints', icon: '🎯', label: 'Key Points',   desc: 'Extract main ideas',       color: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.4)'  },
  { id: 'simplify',  icon: '🔍', label: 'Simplify',     desc: 'Plain language',           color: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)' },
  { id: 'critique',  icon: '🧐', label: 'Critique',     desc: 'Strengths & weaknesses',   color: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)' },
  { id: 'questions', icon: '❓', label: 'Generate Q&A', desc: 'Study questions',           color: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)'  },
  { id: 'formal',    icon: '🎓', label: 'Make Formal',  desc: 'Academic version',         color: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.4)' },
];

function buildPrompt(mode: string, text: string): string {
  const map: Record<string, string> = {
    summary:   `Summarize this text in 3-4 clear sentences. Be concise:\n\n${text}`,
    keypoints: `List the 5 most important key points from this text. Use numbered list:\n\n${text}`,
    simplify:  `Rewrite this in very simple plain language anyone can understand:\n\n${text}`,
    critique:  `Analyze this text. Give 3 strengths and 3 areas to improve:\n\n${text}`,
    questions: `Write 5 study questions based on this text:\n\n${text}`,
    formal:    `Rewrite this in formal academic language:\n\n${text}`,
  };
  return map[mode] ?? map.summary;
}

export default function DocumentAnalyzer({ model }: Props) {
  const [docText, setDocText] = useState('');
  const [output, setOutput] = useState('');
  const [activeMode, setActiveMode] = useState('summary');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const abortRef = useRef(false);

  const wordCount  = docText.trim() ? docText.trim().split(/\s+/).length : 0;
  const readTime   = Math.max(1, Math.round(wordCount / 200));
  const paraCount  = docText.split(/\n\n+/).filter(Boolean).length || 0;
  const outputWords = output.trim() ? output.trim().split(/\s+/).length : 0;

  const analyze = async () => {
    if (!docText.trim()) {
      console.warn('No document text provided');
      return;
    }
    if (model.status !== 'ready') {
      console.warn('Model not ready yet');
      return;
    }
    if (isGenerating) {
      console.warn('Already generating');
      return;
    }
    
    setIsGenerating(true);
    setOutput('');
    abortRef.current = false;
    
    try {
      let out = '';
      const prompt = buildPrompt(activeMode, docText);
      console.log(`Starting ${activeMode} analysis...`);
      
      for await (const tok of model.generate(prompt, { maxTokens: 500, temperature: 0.5 })) {
        if (abortRef.current) {
          console.log('Analysis aborted by user');
          break;
        }
        out += tok;
        setOutput(out);
      }
      
      console.log(`Analysis complete (${out.length} characters generated)`);
    } catch (error) {
      console.error('Analysis error:', error);
      setOutput('Error during analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyOutput = () => {
    if (!output) {
      console.warn('No output to copy');
      return;
    }
    navigator.clipboard.writeText(output).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const clearAll = () => {
    setDocText('');
    setOutput('');
  };

  const activeModeCfg = ANALYSIS_MODES.find(m => m.id === activeMode)!;

  return (
    <>
      {/* ── Stats Row (only when text present) ── */}
      {docText.trim() && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Words',      value: wordCount.toLocaleString(),  sub: 'in document' },
            { label: 'Read Time',  value: `${readTime}m`,              sub: 'to read' },
            { label: 'Paragraphs', value: paraCount,                   sub: 'blocks' },
            { label: 'Characters', value: docText.length.toLocaleString(), sub: 'total' },
          ].map(s => (
            <div key={s.label} className="summary-card">
              <div className="summary-card-label">{s.label}</div>
              <div className="summary-card-value">{s.value}</div>
              <div className="summary-card-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Input Card ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📄 Paste Your Document</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--accent3)', fontWeight: 600 }}>🔒 Never leaves your device</span>
            {docText && <button className="btn btn-secondary btn-sm" onClick={clearAll}>🗑 Clear</button>}
          </div>
        </div>
        <div className="card-body">
          <textarea
            rows={9}
            placeholder={"Paste any text here — articles, essays, reports, emails, research papers…\n\nThe AI analyzes it entirely in your browser. Nothing is sent anywhere."}
            value={docText}
            onChange={e => setDocText(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
        </div>
      </div>

      {/* ── Mode Selector ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔬 Analysis Mode</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Selected: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{activeModeCfg.label}</span>
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
            {ANALYSIS_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setActiveMode(m.id)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${activeMode === m.id ? m.border : 'rgba(255,255,255,0.07)'}`,
                  background: activeMode === m.id ? m.color : 'rgba(255,255,255,0.025)',
                  textAlign: 'left', transition: 'all 0.2s', fontFamily: 'var(--font-display)',
                  color: 'var(--text-primary)',
                }}
              >
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={analyze}
              disabled={model.status !== 'ready' || isGenerating || !docText.trim()}
            >
              {isGenerating
                ? <><span className="spinner" />Analyzing…</>
                : <>{activeModeCfg.icon} {activeModeCfg.label}</>
              }
            </button>
            {isGenerating && (
              <button className="btn btn-secondary" onClick={() => { abortRef.current = true; }}>
                ⏹ Stop
              </button>
            )}
          </div>

          {!docText.trim() && (
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              ↑ Paste your text above first, then choose an analysis mode
            </p>
          )}
        </div>
      </div>

      {/* ── Output ── */}
      {(output || isGenerating) && (
        <div className="card" style={{ borderColor: activeModeCfg.border }}>
          <div className="card-header" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <span className="card-title" style={{ color: 'var(--accent2)' }}>
              {activeModeCfg.icon} {activeModeCfg.label} Result
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                — running on your device
              </span>
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {output && <div className="stat-chip">Words: <span>{outputWords}</span></div>}
              <button className="btn btn-secondary btn-sm" onClick={copyOutput} disabled={!output}>
                📋 Copy
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="output-text">
              {output || ''}
              {isGenerating && <span className="typing-cursor" />}
            </div>
          </div>
        </div>
      )}

      {showToast && <div className="toast">✅ Copied to clipboard!</div>}
    </>
  );
}