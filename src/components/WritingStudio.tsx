import React, { useState, useRef } from 'react';
import type { ModelState } from '../hooks/useModelLoader';

interface Props { model: ModelState; }

// ── Templates ─────────────────────────────────────────────
const TEMPLATES = [
  { emoji: '📧', name: 'Professional Email', desc: 'Clear & concise business email', prompt: (txt: string) => `Write a professional email about: ${txt}\n\nMake it clear, concise, and business-appropriate.` },
  { emoji: '📝', name: 'Blog Post', desc: 'Engaging article structure', prompt: (txt: string) => `Write an engaging blog post about: ${txt}\n\nInclude a hook intro, clear sections, and a conclusion.` },
  { emoji: '🎯', name: 'Bullet Summary', desc: 'Key points at a glance', prompt: (txt: string) => `Summarize the following into 5-7 clear bullet points:\n\n${txt}` },
  { emoji: '✨', name: 'Rewrite & Polish', desc: 'Improve clarity & flow', prompt: (txt: string) => `Rewrite the following text to be clearer, more engaging, and better structured:\n\n${txt}` },
  { emoji: '💡', name: 'Brainstorm Ideas', desc: 'Generate creative ideas', prompt: (txt: string) => `Brainstorm 8 creative and practical ideas related to: ${txt}\n\nMake each idea unique and actionable.` },
  { emoji: '📄', name: 'Resume Bullet', desc: 'Impact-driven bullet points', prompt: (txt: string) => `Convert this experience into 3 strong resume bullet points using the STAR method:\n\n${txt}` },
  { emoji: '🔍', name: 'Explain Simply', desc: 'Like I\'m 10 years old', prompt: (txt: string) => `Explain the following in simple terms that anyone can understand:\n\n${txt}` },
  { emoji: '📚', name: 'Study Notes', desc: 'Structured learning notes', prompt: (txt: string) => `Create structured study notes from the following content:\n\n${txt}` },
];

const TONES = ['Professional', 'Friendly', 'Formal', 'Casual', 'Creative', 'Persuasive'];

export default function WritingStudio({ model }: Props) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTone, setActiveTone] = useState('Professional');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const abortRef = useRef(false);

  const handleInput = (val: string) => {
    setInput(val);
    setWordCount(val.trim() ? val.trim().split(/\s+/).length : 0);
    setCharCount(val.length);
  };

  const applyTemplate = async (template: typeof TEMPLATES[0]) => {
    if (!input.trim()) {
      setInput('Enter your topic or text above, then click a template!');
      return;
    }
    const basePrompt = template.prompt(input);
    const fullPrompt = `[Tone: ${activeTone}]\n\n${basePrompt}`;
    await runGeneration(fullPrompt);
  };

  const runGeneration = async (prompt: string) => {
    if (model.status !== 'ready' || isGenerating) return;
    setIsGenerating(true);
    setOutput('');
    abortRef.current = false;

    try {
      let out = '';
      for await (const token of model.generate(prompt, { maxTokens: 500 })) {
        if (abortRef.current) break;
        out += token;
        setOutput(out);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCustomGenerate = () => {
    if (!input.trim()) return;
    runGeneration(`[Tone: ${activeTone}]\n\nUser request: ${input}\n\nProvide a helpful, well-structured response.`);
  };

  const copyOutput = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const outputWords = output.trim() ? output.trim().split(/\s+/).length : 0;

  return (
    <>
      {/* ── Input Card ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">✍️ Your Topic or Text</span>
          <div className="stat-chips">
            <div className="stat-chip">Words: <span>{wordCount}</span></div>
            <div className="stat-chip">Chars: <span>{charCount}</span></div>
          </div>
        </div>
        <div className="card-body">
          <div className="section-label" style={{ marginBottom: 10 }}>Tone</div>
          <div className="tone-pills">
            {TONES.map(t => (
              <button key={t} className={`tone-pill ${activeTone === t ? 'active' : ''}`} onClick={() => setActiveTone(t)}>
                {t}
              </button>
            ))}
          </div>
          <textarea
            rows={5}
            placeholder="Type your topic, paste your text, or describe what you want to write…"
            value={input}
            onChange={e => handleInput(e.target.value)}
          />
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleCustomGenerate} disabled={model.status !== 'ready' || isGenerating || !input.trim()}>
              {isGenerating ? <><span className="spinner" />Generating…</> : <>✨ Generate</>}
            </button>
            {isGenerating && (
              <button className="btn btn-secondary" onClick={() => { abortRef.current = true; }}>
                ⏹ Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Templates Grid ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🗂️ Quick Templates</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click any to generate instantly</span>
        </div>
        <div className="card-body">
          <div className="templates-grid">
            {TEMPLATES.map(t => (
              <button
                key={t.name}
                className="template-btn"
                onClick={() => applyTemplate(t)}
                disabled={model.status !== 'ready' || isGenerating}
              >
                <span className="template-emoji">{t.emoji}</span>
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Output ── */}
      {(output || isGenerating) && (
        <div className="card" style={{ borderColor: 'rgba(6,182,212,0.2)' }}>
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--accent2)' }}>🤖 AI Output <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>— running on your device</span></span>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="stat-chip">Words: <span>{outputWords}</span></div>
              <button className="btn btn-secondary btn-sm" onClick={copyOutput}>📋 Copy</button>
            </div>
          </div>
          <div className="card-body">
            <div className="output-wrap">
              <div className="output-text">
                {output}
                {isGenerating && <span className="typing-cursor" />}
              </div>
            </div>
          </div>
        </div>
      )}

      {showToast && <div className="toast">✅ Copied to clipboard!</div>}
    </>
  );
}
