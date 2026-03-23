/**
 * PDFWorkspace — Complete rewrite
 * - Hero with animated stats counter + comparison vs ChatGPT
 * - PDF upload → auto summary + key insights with staggered card reveal
 * - Chat uses PDF + notes as unified context
 * - "Answering from your knowledge" label on every AI message
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';
import { useStreamingAI, buildSummaryPrompt, buildKeyPointsPrompt } from '../hooks/useAI';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  model: ModelState;
  onPdfLoaded?: (text: string, name: string) => void;
  notesContext?: string; // notes text from SmartNotes
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  fromKnowledge?: boolean;
}

type Phase = 'hero' | 'reading' | 'analyzing' | 'ready';

// ── File extraction ──
async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'txt' || ext === 'md') return await file.text();
  if (ext === 'pdf') {
    const buf  = await file.arrayBuffer();
    const task = pdfjsLib.getDocument({ data: buf });
    task.onPassword = () => { throw new Error('PDF is password-protected.'); };
    const pdf = await task.promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const ct = await pg.getTextContent();
      out += ct.items.map((it: unknown) => (it as { str?: string }).str ?? '').join(' ') + '\n';
    }
    return out.trim();
  }
  if (ext === 'docx') {
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value.trim();
  }
  throw new Error(`Unsupported ".${ext}". Upload PDF, DOCX, TXT or MD.`);
}

// ── Build context-aware prompt using PDF + notes ──
function buildKnowledgePrompt(
  pdfText: string,
  notesText: string,
  history: ChatMessage[],
  question: string
): string {
  const ctx = history
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'User' : 'Brain'}: ${m.content}`)
    .join('\n');

  const sources: string[] = [];
  if (pdfText)   sources.push(`=== UPLOADED DOCUMENT ===\n${pdfText.slice(0, 2600)}`);
  if (notesText) sources.push(`=== YOUR BRAIN NOTES ===\n${notesText.slice(0, 700)}`);

  return `You are PrivateBrain, a private AI research assistant. Answer ONLY using the knowledge sources below. If the answer is not found in the sources, say "I don't see that in your loaded documents." Be concise and specific.

${sources.join('\n\n')}

${ctx ? `Previous conversation:\n${ctx}\n` : ''}User: ${question}
Brain:`;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Copy button ──
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="copy-btn" onClick={async () => {
      await navigator.clipboard.writeText(text);
      setDone(true); setTimeout(() => setDone(false), 2000);
    }}>
      {done ? '✓ Copied' : 'Copy'}
    </button>
  );
}

// ── Animated counter for stats ──
function Counter({ to, suffix = '', duration = 1500 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setVal(Math.floor(p * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to, duration]);
  return <>{val.toLocaleString()}{suffix}</>;
}

export default function PDFWorkspace({ model, onPdfLoaded, notesContext = '' }: Props) {
  const [phase, setPhase]     = useState<Phase>('hero');
  const [docText, setDocText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver]   = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState<'summary' | 'keypoints' | 'done'>('summary');
  const [progress, setProgress] = useState(0);

  const [summary, setSummary]     = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'insights' | 'chat'>('insights');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Stats shown after analysis
  const [analyzeTime, setAnalyzeTime] = useState(0);
  const analyzeStart = useRef(0);

  const fileRef   = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef(false);
  const bufRef    = useRef('');
  const rafRef    = useRef<number>(0);
  const fnRef     = useRef('');
  const { run }   = useStreamingAI(model);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  useEffect(() => { fnRef.current = fileName; }, [fileName]);

  // Progress animation
  useEffect(() => {
    if (phase !== 'analyzing') return;
    const target = analyzeStep === 'summary' ? 48 : 92;
    const id = window.setInterval(() => setProgress(p => {
      if (p >= target) { clearInterval(id); return p; }
      return p + 1.2;
    }), 70);
    return () => clearInterval(id);
  }, [analyzeStep, phase]);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'txt', 'md'].includes(ext ?? '')) {
      setFileError('Please upload PDF, DOCX, TXT or MD.'); return;
    }
    setFileError(''); setPhase('reading'); setFileName(file.name);
    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error('No readable text found.');
      setDocText(text);
      onPdfLoaded?.(text, file.name); // share with App context
      analyzeStart.current = Date.now();
      startAnalysis(text);
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Failed to read file.');
      setPhase('hero');
    }
  }, []); // eslint-disable-line

  const startAnalysis = async (text: string) => {
    if (model.status !== 'ready') { setFileError('Brain is still loading. Please wait.'); return; }
    setPhase('analyzing'); setSummary(''); setKeyPoints([]); setMessages([]); setProgress(0);

    setAnalyzeStep('summary');
    await run(buildSummaryPrompt(text), { maxTokens: 140, temperature: 0.15 }, (t: string) => setSummary(t));

    setAnalyzeStep('keypoints');
    let kpRaw = '';
    await run(
      buildKeyPointsPrompt(text), { maxTokens: 170, temperature: 0.15 },
      (t: string) => { kpRaw = t; },
      () => {
        const pts = kpRaw.split('\n')
          .filter((l: string) => l.trim())
          .map((l: string) => l.replace(/^\d+\.\s*/, '').trim())
          .filter(Boolean).slice(0, 6);
        setKeyPoints(pts);
        setAnalyzeStep('done');
        setProgress(100);
        setAnalyzeTime(Math.round((Date.now() - analyzeStart.current) / 100) / 10);
        setPhase('ready');
        setActiveTab('insights');
        setMessages([{
          id: 'welcome', role: 'ai', fromKnowledge: true,
          content: `I've read "${fnRef.current}" and it's loaded into your Brain. ${notesContext ? 'Your notes are also active as context. ' : ''}Ask me anything — I'll only answer from your documents.`,
          timestamp: Date.now(),
        }]);
      }
    );
  };

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || model.status !== 'ready' || isGenerating) return;
    setInput(''); abortRef.current = false;

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content: msg, timestamp: Date.now() };
    const aiId = `a_${Date.now() + 1}`;
    const aiMsg: ChatMessage   = { id: aiId, role: 'ai', content: '', timestamp: Date.now(), fromKnowledge: true };

    setMessages(p => [...p, userMsg, aiMsg]);
    setActiveTab('chat'); setIsGenerating(true);
    bufRef.current = ''; cancelAnimationFrame(rafRef.current);

    try {
      // Use PDF + notes as unified context
      const prompt = buildKnowledgePrompt(docText, notesContext, [...messages, userMsg], msg);
      for await (const tok of model.generate(prompt, { maxTokens: 320, temperature: 0.4 })) {
        if (abortRef.current) break;
        bufRef.current += tok;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() =>
          setMessages(p => p.map(m => m.id === aiId ? { ...m, content: bufRef.current } : m))
        );
      }
      cancelAnimationFrame(rafRef.current);
      setMessages(p => p.map(m => m.id === aiId ? { ...m, content: bufRef.current } : m));
    } catch {
      setMessages(p => p.map(m => m.id === aiId ? { ...m, content: '⚠️ Error — please try again.' } : m));
    } finally { setIsGenerating(false); }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };
  const reset = () => {
    setPhase('hero'); setDocText(''); setFileName(''); setSummary('');
    setKeyPoints([]); setMessages([]); setFileError(''); setInput(''); setProgress(0);
    onPdfLoaded?.('', '');
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };
  const wordCount = docText.trim().split(/\s+/).filter(Boolean).length;
  const userMsgs  = messages.filter(m => m.role === 'user').length;
  const hasNotes  = notesContext.length > 10;

  // ════════════════════════════════════════════
  // HERO
  // ════════════════════════════════════════════
  if (phase === 'hero') return (
    <div className="ws-hero">
      <div className="ws-glow ws-glow-1"/><div className="ws-glow ws-glow-2"/>
      <div className="ws-hero-inner">

        {/* Live status badge */}
        <div className="ws-hero-badge">
          <span className="ws-hero-dot"/>
          Your knowledge stays yours — zero cloud, zero tracking
        </div>

        {/* Title */}
        <h1 className="ws-hero-title">
          Your Private<br/>
          <span className="ws-hero-grad">AI Brain</span>
        </h1>

        {/* Subtitle */}
        <p className="ws-hero-sub">
          Upload any PDF or write notes. Your Brain instantly summarizes, extracts insights,
          and lets you chat with your knowledge — all processed privately on your device.
          <span className="hero-sub-highlight"> No internet required after setup.</span>
        </p>

        {/* VS ChatGPT comparison */}
        <div className="hero-compare">
          <div className="hero-compare-item hero-compare-bad">
            <span className="hero-compare-icon">❌</span>
            <div>
              <div className="hero-compare-title">ChatGPT / Claude</div>
              <div className="hero-compare-desc">Sends your documents to cloud servers</div>
            </div>
          </div>
          <div className="hero-compare-divider">VS</div>
          <div className="hero-compare-item hero-compare-good">
            <span className="hero-compare-icon">✅</span>
            <div>
              <div className="hero-compare-title">PrivateBrain</div>
              <div className="hero-compare-desc">Everything stays on your device, always</div>
            </div>
          </div>
        </div>

        {/* 3 feature cards */}
        <div className="ws-hero-features">
          {[
            { icon: '📄', bg: 'rgba(108,142,245,0.12)', bd: 'rgba(108,142,245,0.22)', title: 'Analyze Documents', desc: 'PDF, DOCX, TXT — understood instantly' },
            { icon: '✏️', bg: 'rgba(56,189,248,0.1)',   bd: 'rgba(56,189,248,0.22)',  title: 'Brain Notes',       desc: 'Capture ideas, summarize with AI' },
            { icon: '🔒', bg: 'rgba(52,211,153,0.1)',   bd: 'rgba(52,211,153,0.22)',  title: '100% Private',      desc: 'On-device AI · works offline' },
          ].map((f, i) => (
            <div key={f.title} className="ws-hero-feature" style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
              <div className="ws-hero-feature-icon" style={{ background: f.bg, border: `1px solid ${f.bd}` }}>{f.icon}</div>
              <div className="ws-hero-feature-title">{f.title}</div>
              <div className="ws-hero-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Upload zone */}
        <div
          className={`ws-drop ${dragOver ? 'over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          <div className="ws-drop-icon">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <span className="ws-drop-title">Upload PDF to Start</span>
          <span className="ws-drop-sub">PDF · DOCX · TXT · MD · drag & drop or click</span>
          <span className="ws-drop-cta">→ Get instant summary + key insights</span>
          {model.status !== 'ready' && (
            <span className="ws-drop-warn">
              <span className="spinner" style={{ width: 11, height: 11 }}/> Brain loading — upload when ready
            </span>
          )}
        </div>

        {fileError && <div className="ws-error">⚠️ {fileError}</div>}

        {/* Notes active indicator */}
        {hasNotes && (
          <div className="hero-notes-active">
            <span>✏️</span> Brain Notes loaded — will be included as context in chat
          </div>
        )}

        {/* Pill stats */}
        <div className="ws-pills">
          <span className="ws-pill">⚡ Auto-summary</span>
          <span className="ws-pill">🎯 Key insights</span>
          <span className="ws-pill">💬 PDF + Notes chat</span>
          <span className="ws-pill">✈️ Works offline</span>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════
  // READING
  // ════════════════════════════════════════════
  if (phase === 'reading') return (
    <div className="ws-center">
      <div className="ws-status-card">
        <span className="spinner" style={{ width: 44, height: 44, borderWidth: 3 }}/>
        <div className="ws-status-title">Reading your document…</div>
        <div className="ws-status-sub">{fileName}</div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════
  // ANALYZING
  // ════════════════════════════════════════════
  if (phase === 'analyzing') return (
    <div className="ws-center">
      <div className="ws-status-card ws-analyzing-card">
        <div className="ws-brain-rings">
          <div className="ws-ring ws-r1"/><div className="ws-ring ws-r2"/>
          <span style={{ fontSize: 30, position: 'relative', zIndex: 2 }}>🧠</span>
        </div>
        <div className="ws-status-title">Your Brain is thinking…</div>
        <div className="ws-status-sub">{fileName} · {wordCount.toLocaleString()} words</div>
        <div className="ws-progress-track">
          <div className="ws-progress-fill" style={{ width: `${progress}%`, transition: 'width 0.5s ease' }}>
            <div className="ws-progress-shim"/>
          </div>
        </div>
        <div className="ws-steps">
          {[
            { id: 'summary',   label: 'Distilling the key ideas' },
            { id: 'keypoints', label: 'Surfacing what matters most' },
          ].map(step => {
            const isDone   = (step.id === 'summary' && (analyzeStep === 'keypoints' || analyzeStep === 'done')) || analyzeStep === 'done';
            const isActive = analyzeStep === step.id;
            return (
              <div key={step.id} className={`ws-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${!isActive && !isDone ? 'pending' : ''}`}>
                <span className="ws-step-dot">
                  {isDone ? '✓' : isActive ? <span className="spinner" style={{ width: 10, height: 10 }}/> : '○'}
                </span>
                {step.label}
              </div>
            );
          })}
        </div>
        {summary && (
          <div className="ws-live-preview">
            <span className="ws-live-label">Emerging insight</span>
            <p>{summary.slice(0, 120)}{summary.length > 120 ? '…' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════
  // READY — insights + chat
  // ════════════════════════════════════════════
  return (
    <div className="ws-workspace">

      {/* Topbar */}
      <div className="ws-topbar">
        <div className="ws-doc-chip">
          <div className="ws-doc-chip-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <div className="ws-doc-name">{fileName}</div>
            <div className="ws-doc-meta">{wordCount.toLocaleString()} words · {analyzeTime}s analysis</div>
          </div>
        </div>

        {/* Context sources */}
        <div className="ws-context-sources">
          <span className="ws-source-chip ws-source-pdf">📄 {fileName.slice(0, 20)}{fileName.length > 20 ? '…' : ''}</span>
          {hasNotes && <span className="ws-source-chip ws-source-notes">✏️ Brain Notes</span>}
        </div>

        <div className="ws-tab-group">
          <button className={`ws-tab ${activeTab === 'insights' ? 'active' : ''}`} onClick={() => setActiveTab('insights')}>
            ✨ Insights
          </button>
          <button className={`ws-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
            💬 Chat {userMsgs > 0 && <span className="ws-tab-count">{userMsgs}</span>}
          </button>
        </div>

        <div className="ws-topbar-right">
          <span className="ws-privacy-chip">🔒 On-Device</span>
          <button className="ws-reset-btn" onClick={reset}>↺ New Doc</button>
        </div>
      </div>

      {/* ── INSIGHTS PANEL ── */}
      {activeTab === 'insights' && (
        <div className="ws-content">
          <div className="ws-panel">

            {/* Stats bar */}
            {analyzeTime > 0 && (
              <div className="stats-bar">
                <div className="stat-item">
                  <span className="stat-value"><Counter to={analyzeTime * 10} suffix="s" duration={800}/></span>
                  <span className="stat-label">Analysis time</span>
                </div>
                <div className="stat-divider"/>
                <div className="stat-item">
                  <span className="stat-value"><Counter to={wordCount} duration={1000}/></span>
                  <span className="stat-label">Words read</span>
                </div>
                <div className="stat-divider"/>
                <div className="stat-item">
                  <span className="stat-value"><Counter to={0} duration={500}/></span>
                  <span className="stat-label">Bytes sent</span>
                </div>
                <div className="stat-divider"/>
                <div className="stat-item">
                  <span className="stat-value"><Counter to={keyPoints.length} duration={600}/></span>
                  <span className="stat-label">Key insights</span>
                </div>
              </div>
            )}

            {/* Summary card */}
            <div className="ws-result-card ws-summary-card" style={{ animationDelay: '0s' }}>
              <div className="ws-result-header">
                <div className="ws-result-icon" style={{ background: 'rgba(108,142,245,0.15)', color: '#6C8EF5' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                  </svg>
                </div>
                <h2 className="ws-result-title">AI Summary</h2>
                <span className="insight-source-badge">Generated from your document</span>
                {summary && <CopyBtn text={summary}/>}
              </div>
              <div className="ws-result-body">
                {summary
                  ? <p className="ws-summary-text">{summary}</p>
                  : <div className="ws-skeleton"><div/><div/><div/></div>
                }
              </div>
            </div>

            {/* Key insights card */}
            <div className="ws-result-card ws-kp-card" style={{ animationDelay: '0.1s' }}>
              <div className="ws-result-header">
                <div className="ws-result-icon" style={{ background: 'rgba(56,189,248,0.12)', color: '#38BDF8' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <h2 className="ws-result-title">Key Insights</h2>
                <span className="insight-source-badge insight-source-cyan">Extracted automatically</span>
                {keyPoints.length > 0 && <CopyBtn text={keyPoints.join('\n')}/>}
              </div>
              <div className="ws-result-body">
                {keyPoints.length > 0 ? (
                  <div className="ws-kp-list">
                    {keyPoints.map((pt, i) => (
                      <div key={i} className="ws-kp-item" style={{ animationDelay: `${i * 0.07}s` }}>
                        <span className="ws-kp-num">{i + 1}</span>
                        <span className="ws-kp-text">{pt}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="ws-skeleton"><div/><div/><div/><div/></div>}
              </div>
            </div>

            {/* CTA to chat */}
            <button className="ws-goto-btn" onClick={() => setActiveTab('chat')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Chat with this document{hasNotes ? ' + your notes' : ''} →
            </button>
          </div>
        </div>
      )}

      {/* ── CHAT PANEL ── */}
      {activeTab === 'chat' && (
        <div className="ws-chat-panel">

          {/* Context bar — shows what sources are active */}
          <div className="ws-chat-context-bar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <strong>Answering from your knowledge:</strong>
            <span className="ctx-source">📄 {fileName}</span>
            {hasNotes && <span className="ctx-source">✏️ Brain Notes</span>}
            <span className="ws-context-badge">Private · On-device</span>
          </div>

          {/* Suggested questions */}
          {messages.length <= 1 && (
            <div className="ws-suggestions">
              <div className="ws-suggestions-title">Start exploring:</div>
              <div className="ws-suggestions-grid">
                {[
                  'What is this document mainly about?',
                  'What are the key findings or conclusions?',
                  'What evidence supports the main argument?',
                  'What should I remember from this?',
                ].map(q => (
                  <button key={q} className="ws-suggestion" onClick={() => sendMessage(q)} disabled={isGenerating}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="ws-messages">
            {messages.map((m, i) => (
              <div key={m.id} className={`ws-msg-row ${m.role}`} style={{ animationDelay: `${i * 0.03}s` }}>
                <div className="ws-msg-avatar">
                  {m.role === 'user'
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
                  }
                </div>
                <div className="ws-msg-body">
                  {/* "Answering from your knowledge" label on AI messages */}
                  {m.role === 'ai' && m.fromKnowledge && m.content && !(isGenerating && i === messages.length - 1) && (
                    <div className="knowledge-label">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Answering from your knowledge
                    </div>
                  )}
                  <div className={`ws-bubble ${m.role}`}>
                    {!m.content && isGenerating && i === messages.length - 1
                      ? <span className="thinking-dots"><span/><span/><span/></span>
                      : <>{m.content}{isGenerating && i === messages.length - 1 && m.role === 'ai' && m.content && <span className="typing-cursor"/>}</>
                    }
                  </div>
                  <div className="ws-msg-meta">
                    {m.role === 'ai' && m.content && !(isGenerating && i === messages.length - 1) && <CopyBtn text={m.content}/>}
                    <span className="ws-msg-time">{fmtTime(m.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div className="ws-input-bar">
            <div className="ws-input-wrap">
              <textarea
                ref={inputRef} rows={1}
                placeholder={`Ask about ${fileName}${hasNotes ? ' + your notes' : ''}…`}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKey}
                disabled={isGenerating || model.status !== 'ready'}
                style={{ height: 'auto' }}
              />
              {isGenerating
                ? <button className="ws-stop-btn" onClick={() => { abortRef.current = true; }}>⏹ Stop</button>
                : <button className="ws-send-btn" onClick={() => sendMessage()} disabled={!input.trim() || model.status !== 'ready'}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                    </svg>
                  </button>
              }
            </div>
            <div className="ws-input-hint">
              🔒 Processed privately on your device · restricted to your loaded documents · Enter to send
            </div>
          </div>
        </div>
      )}
    </div>
  );
}