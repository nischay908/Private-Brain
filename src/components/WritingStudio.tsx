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

  // Example prompts users can try
  const EXAMPLE_PROMPTS = [
    'Benefits of daily exercise for mental health',
    'My startup idea for an eco-friendly delivery service',
    'How to improve team productivity in remote work',
    'The importance of cybersecurity for small businesses',
  ];

  const handleInput = (val: string) => {
    setInput(val);
    setWordCount(val.trim() ? val.trim().split(/\s+/).length : 0);
    setCharCount(val.length);
  };

  const applyTemplate = async (template: typeof TEMPLATES[0]) => {
    if (!input.trim()) {
      // Show a helpful message by temporarily setting it
      const placeholder = `💡 Tip: Enter your topic or text in the box above, then click "${template.name}" to generate!`;
      setInput(placeholder);
      setTimeout(() => setInput(''), 3000);
      return;
    }
    if (model.status !== 'ready') {
      console.warn('Model not ready yet');
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

  const handleCustomGenerate = async () => {
    if (!input.trim()) {
      console.warn('No input provided');
      return;
    }
    if (model.status !== 'ready') {
      console.warn('Model not ready yet, current status:', model.status);
      alert('Please wait for the AI model to finish loading. Current status: ' + model.status);
      return;
    }
    
    console.log('=== STARTING CUSTOM GENERATION ===');
    console.log('Input:', input);
    console.log('Tone:', activeTone);
    console.log('Model status:', model.status);
    
    const prompt = `[Tone: ${activeTone}]\n\nUser request: ${input}\n\nProvide a helpful, well-structured response.`;
    await runGeneration(prompt);
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

  const outputWords = output.trim() ? output.trim().split(/\s+/).length : 0;

  return (
    <div className="pb-tab-content">
      {/* ── Quick Examples (when no input) ── */}
      {!input && !output && (
        <div className="card" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
          <div className="card-header">
            <span className="card-title">💡 Quick Examples to Get Started</span>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Click any example below to try it out, or type your own topic above:
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {EXAMPLE_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(139,92,246,0.05)',
                    border: '1px solid rgba(139,92,246,0.15)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: 'var(--font-mono)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139,92,246,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139,92,246,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.15)';
                  }}
                >
                  → {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
            placeholder={`Try any of these examples:\n\n• "My company's new product launch next quarter"\n• "Benefits of remote work for tech companies"\n• "I managed a team of 5 developers and delivered the project 2 weeks early"\n• "The process of photosynthesis in plants"\n\nOr write your own topic, then click a template below!`}
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
        <div className="card" style={{ borderColor: 'rgba(6,182,212,0.3)', boxShadow: '0 4px 20px rgba(6,182,212,0.1)' }}>
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--accent2)' }}>
              🤖 AI Output {isGenerating && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 400, marginLeft: 8 }}>— generating...</span>}
              {!isGenerating && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>— complete</span>}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {output && <div className="stat-chip">Words: <span>{outputWords}</span></div>}
              <button className="btn btn-secondary btn-sm" onClick={copyOutput} disabled={!output || isGenerating}>
                📋 Copy
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className={`output-wrap ${isGenerating ? 'generating' : ''}`}>
              <div className="output-text">
                {output || 'Starting generation...'}
                {isGenerating && <span className="typing-cursor" />}
              </div>
            </div>
          </div>
        </div>
      )}

      {showToast && <div className="toast">✅ Copied to clipboard!</div>}
      <div className="pb-tab-footer">Powered by WebLLM · Llama 3.2 1B · WebGPU · 100% Private</div>
    </div>
  );
}