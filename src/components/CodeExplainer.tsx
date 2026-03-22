import React, { useState, useRef } from 'react';
import type { ModelState } from '../hooks/useModelLoader';

interface Props { model: ModelState; }

const LANGUAGES = ['Auto-detect', 'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'SQL', 'HTML/CSS', 'Shell'];

const EXPLAIN_MODES = [
  { id: 'explain',    icon: '🧠', label: 'Explain',       desc: 'What this code does' },
  { id: 'simplify',   icon: '🔍', label: 'ELI5',          desc: "Like I'm 5" },
  { id: 'bugs',       icon: '🐛', label: 'Find Bugs',     desc: 'Spot issues & errors' },
  { id: 'optimize',   icon: '⚡', label: 'Optimize',      desc: 'Suggest improvements' },
  { id: 'document',   icon: '📝', label: 'Add Comments',  desc: 'Generate documentation' },
  { id: 'complexity', icon: '📊', label: 'Complexity',    desc: 'Time & space analysis' },
];

const EXAMPLES = [
  {
    label: 'Binary Search',
    lang: 'Python',
    code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
  },
  {
    label: 'Debounce',
    lang: 'JavaScript',
    code: `function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}`,
  },
  {
    label: 'Flatten Array',
    lang: 'JavaScript',
    code: `const flatten = (arr) =>
  arr.reduce((acc, val) =>
    Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val), []);`,
  },
];

function buildPrompt(mode: string, code: string, lang: string): string {
  const langHint = lang === 'Auto-detect' ? '' : ` (${lang})`;
  const map: Record<string, string> = {
    explain:    `Explain what this${langHint} code does in clear, simple terms. Break it down step by step:\n\n\`\`\`\n${code}\n\`\`\``,
    simplify:   `Explain this${langHint} code like I'm a complete beginner. Use simple analogies and avoid jargon:\n\n\`\`\`\n${code}\n\`\`\``,
    bugs:       `Analyze this${langHint} code for bugs, errors, edge cases, and potential issues. List each problem clearly:\n\n\`\`\`\n${code}\n\`\`\``,
    optimize:   `Suggest concrete optimizations for this${langHint} code. Show what to change and why:\n\n\`\`\`\n${code}\n\`\`\``,
    document:   `Add clear inline comments and a docstring/JSDoc to this${langHint} code. Return the fully commented version:\n\n\`\`\`\n${code}\n\`\`\``,
    complexity: `Analyze the time and space complexity of this${langHint} code. Explain Big-O notation for each part:\n\n\`\`\`\n${code}\n\`\`\``,
  };
  return map[mode] ?? map.explain;
}

export default function CodeExplainer({ model }: Props) {
  const [code, setCode]               = useState('');
  const [output, setOutput]           = useState('');
  const [activeMode, setActiveMode]   = useState('explain');
  const [activeLang, setActiveLang]   = useState('Auto-detect');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToast, setShowToast]     = useState(false);
  const abortRef = useRef(false);

  const lineCount = code ? code.split('\n').length : 0;
  const charCount = code.length;

  const run = async () => {
    if (!code.trim() || model.status !== 'ready' || isGenerating) return;
    setIsGenerating(true);
    setOutput('');
    abortRef.current = false;
    try {
      let out = '';
      const prompt = buildPrompt(activeMode, code, activeLang);
      for await (const tok of model.generate(prompt, { maxTokens: 600, temperature: 0.4 })) {
        if (abortRef.current) break;
        out += tok;
        setOutput(out);
      }
    } catch {
      setOutput('Error during analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyOutput = () => {
    if (!output) return;
    navigator.clipboard.writeText(output).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    });
  };

  const loadExample = (ex: typeof EXAMPLES[0]) => {
    setCode(ex.code);
    setActiveLang(ex.lang);
    setOutput('');
  };

  const activeModeCfg = EXPLAIN_MODES.find(m => m.id === activeMode)!;

  return (
    <div className="pb-tab-content">
      {/* Example Snippets */}
      {!code && (
        <div className="card" style={{ borderColor: 'rgba(16,185,129,0.2)' }}>
          <div className="card-header">
            <span className="card-title">💡 Try an Example</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {EXAMPLES.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => loadExample(ex)}
                  style={{
                    padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                    border: '1px solid rgba(16,185,129,0.25)',
                    background: 'rgba(16,185,129,0.07)',
                    color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
                    fontFamily: 'var(--font-display)', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.07)'; }}
                >
                  {ex.lang === 'Python' ? '🐍' : '⚡'} {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Code Input */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">💻 Your Code</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {code && <div className="stat-chip">Lines: <span>{lineCount}</span></div>}
            {code && <div className="stat-chip">Chars: <span>{charCount}</span></div>}
            {code && <button className="btn btn-secondary btn-sm" onClick={() => { setCode(''); setOutput(''); }}>🗑 Clear</button>}
          </div>
        </div>
        <div className="card-body">
          {/* Language Selector */}
          <div style={{ marginBottom: 12 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Language</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LANGUAGES.map(lang => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`tone-pill ${activeLang === lang ? 'active' : ''}`}
                  style={{ fontSize: 12 }}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <textarea
            rows={12}
            placeholder={"Paste your code here…\n\nOr click one of the examples above to get started!"}
            value={code}
            onChange={e => setCode(e.target.value)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.7,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
            }}
          />
        </div>
      </div>

      {/* Mode Selector */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">⚙️ What to do with it?</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Mode: <span style={{ color: 'var(--accent3)', fontWeight: 700 }}>{activeModeCfg.label}</span>
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
            {EXPLAIN_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setActiveMode(m.id)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${activeMode === m.id ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  background: activeMode === m.id ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.025)',
                  textAlign: 'left', transition: 'all 0.2s',
                  color: 'var(--text-primary)',
                }}
              >
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{m.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>{m.desc}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={run}
              disabled={model.status !== 'ready' || isGenerating || !code.trim()}
              style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}
            >
              {isGenerating
                ? <><span className="spinner" />Analyzing…</>
                : <>{activeModeCfg.icon} {activeModeCfg.label}</>
              }
            </button>
            {isGenerating && (
              <button className="btn btn-secondary" onClick={() => { abortRef.current = true; }}>⏹ Stop</button>
            )}
          </div>
        </div>
      </div>

      {/* Output */}
      {(output || isGenerating) && (
        <div className="card" style={{ borderColor: 'rgba(16,185,129,0.35)' }}>
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--accent3)' }}>
              {activeModeCfg.icon} {activeModeCfg.label}
              {isGenerating && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>— generating…</span>}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={copyOutput} disabled={!output}>📋 Copy</button>
          </div>
          <div className="card-body">
            <div className="output-text" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7 }}>
              {output || ''}
              {isGenerating && <span className="typing-cursor" />}
            </div>
          </div>
        </div>
      )}

      {showToast && <div className="toast">✅ Copied to clipboard!</div>}
      <div className="pb-tab-footer">Powered by WebLLM · Llama 3.2 1B · WebGPU · 100% Private</div>
    </div>
  );
}