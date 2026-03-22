import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';
import { useStreamingAI, buildSummaryPrompt, buildKeyPointsPrompt } from '../hooks/useAI';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// ── Use local bundled worker (offline-safe) ──
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props { model: ModelState; }

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

type Phase = 'hero' | 'reading' | 'analyzing' | 'ready';

// ── File text extraction ──
async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'txt' || ext === 'md') return await file.text();
  if (ext === 'pdf') {
    const buf = await file.arrayBuffer();
    const loadTask = pdfjsLib.getDocument({ data: buf });
    loadTask.onPassword = () => { throw new Error('PDF is password-protected. Remove the password first.'); };
    const pdf = await loadTask.promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it: unknown) => (it as { str?: string }).str ?? '').join(' ') + '\n';
    }
    return out.trim();
  }
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value.trim();
  }
  throw new Error(`Unsupported file ".${ext}". Upload PDF, DOCX, TXT or MD.`);
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildDocPrompt(docText: string, history: ChatMessage[], q: string): string {
  const ctx = history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');
  return `You are a helpful research assistant. The user has uploaded a document. Answer their question accurately and concisely using ONLY the document content below. Keep your answer focused.\n\nDOCUMENT:\n${docText.slice(0, 3000)}\n\n${ctx}\nUser: ${q}\nAI:`;
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

export default function PDFWorkspace({ model }: Props) {
  const [phase, setPhase]         = useState<Phase>('hero');
  const [docText, setDocText]     = useState('');
  const [fileName, setFileName]   = useState('');
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver]   = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState<'summary'|'keypoints'|'done'>('summary');
  const [analyzeProgress, setAnalyzeProgress] = useState(0);

  const [summary, setSummary]     = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'summary'|'keypoints'|'chat'>('summary');

  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const fileRef     = useRef<HTMLInputElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef(false);
  const bufRef      = useRef('');
  const rafRef      = useRef<number>(0);
  const { run }     = useStreamingAI(model);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // Animate progress bar during analysis
  useEffect(() => {
    if (phase !== 'analyzing') return;
    setAnalyzeProgress(0);
    const target = analyzeStep === 'summary' ? 45 : 90;
    const timer = setInterval(() => {
      setAnalyzeProgress(p => {
        if (p >= target) { clearInterval(timer); return p; }
        return p + 1;
      });
    }, 80);
    return () => clearInterval(timer);
  }, [analyzeStep, phase]);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf','docx','txt','md'].includes(ext ?? '')) {
      setFileError('Please upload a PDF, DOCX, TXT or MD file.'); return;
    }
    setFileError('');
    setPhase('reading');
    setFileName(file.name);
    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error('No readable text found.');
      setDocText(text);
      runAutoAnalysis(text);
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Failed to read file.');
      setPhase('hero');
    }
  }, []); // eslint-disable-line

  const runAutoAnalysis = async (text: string) => {
    if (model.status !== 'ready') {
      setFileError('AI model not ready yet. Please wait and try again.'); return;
    }
    setPhase('analyzing');
    setSummary(''); setKeyPoints([]); setMessages([]);

    // Step 1: Summary (short, fast)
    setAnalyzeStep('summary');
    let sumText = '';
    await run(
      buildSummaryPrompt(text),
      { maxTokens: 150, temperature: 0.2 }, // lower = faster
      t => { sumText = t; setSummary(t); },
    );

    // Step 2: Key points (short list)
    setAnalyzeStep('keypoints');
    let kpRaw = '';
    await run(
      buildKeyPointsPrompt(text),
      { maxTokens: 180, temperature: 0.2 },
      t => { kpRaw = t; },
      () => {
        const lines = kpRaw.split('\n').filter(l => l.trim()).map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
        setKeyPoints(lines);
        setAnalyzeStep('done');
        setAnalyzeProgress(100);
        setPhase('ready');
        setActiveTab('summary');
        setMessages([{
          id: 'welcome', role: 'ai',
          content: `I've read "${fileName || file_ref.current}". Ask me anything about it — I'll answer using only this document.`,
          timestamp: Date.now(),
        }]);
      }
    );
  };

  // Capture filename for welcome msg
  const file_ref = useRef('');
  useEffect(() => { file_ref.current = fileName; }, [fileName]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || model.status !== 'ready' || isGenerating || !docText) return;
    setInput('');
    abortRef.current = false;
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content: msg, timestamp: Date.now() };
    const aiId = `a_${Date.now()+1}`;
    const aiMsg: ChatMessage   = { id: aiId, role: 'ai', content: '', timestamp: Date.now() };
    setMessages(p => [...p, userMsg, aiMsg]);
    setActiveTab('chat');
    setIsGenerating(true);
    bufRef.current = '';
    cancelAnimationFrame(rafRef.current);
    try {
      const prompt = buildDocPrompt(docText, [...messages, userMsg], msg);
      for await (const tok of model.generate(prompt, { maxTokens: 350, temperature: 0.5 })) {
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
      setMessages(p => p.map(m => m.id === aiId ? { ...m, content: '⚠️ Error. Please try again.' } : m));
    } finally { setIsGenerating(false); }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const reset = () => {
    setPhase('hero'); setDocText(''); setFileName(''); setSummary('');
    setKeyPoints([]); setMessages([]); setFileError(''); setInput('');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  const wordCount = docText.trim().split(/\s+/).filter(Boolean).length;
  const userMsgs  = messages.filter(m => m.role === 'user').length;

  // ── HERO ──────────────────────────────────────────────
  if (phase === 'hero') return (
    <div className="ws-hero">
      <div className="ws-glow ws-glow-1" /><div className="ws-glow ws-glow-2" />
      <div className="ws-hero-inner">
        <div className="ws-hero-badge">
          <span className="ws-hero-dot" />
          Running 100% locally — no data leaves your device
        </div>
        <h1 className="ws-hero-title">Your Private<br /><span className="ws-hero-grad">AI Brain</span></h1>
        <p className="ws-hero-sub">Upload a document and instantly get a summary, key points, and a private AI chat — all on your device.</p>

        <div
          className={`ws-drop ${dragOver ? 'over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display:'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value=''; }} />
          <div className="ws-drop-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <span className="ws-drop-title">Upload a PDF to start</span>
          <span className="ws-drop-sub">or drag & drop · PDF · DOCX · TXT · MD</span>
          {model.status !== 'ready' && (
            <span className="ws-drop-warn"><span className="spinner" style={{width:11,height:11}} /> AI loading — you can upload now, analysis will start when ready</span>
          )}
        </div>

        {fileError && <div className="ws-error">⚠️ {fileError}</div>}

        <div className="ws-pills">
          <span className="ws-pill">⚡ Instant summary</span>
          <span className="ws-pill">🎯 Key points</span>
          <span className="ws-pill">💬 Chat with doc</span>
          <span className="ws-pill">🔒 100% private</span>
        </div>
      </div>
    </div>
  );

  // ── READING FILE ──────────────────────────────────────
  if (phase === 'reading') return (
    <div className="ws-center">
      <div className="ws-status-card">
        <span className="spinner" style={{ width:40, height:40, borderWidth:3 }} />
        <div className="ws-status-title">Reading your document…</div>
        <div className="ws-status-sub">{fileName}</div>
      </div>
    </div>
  );

  // ── ANALYZING ─────────────────────────────────────────
  if (phase === 'analyzing') return (
    <div className="ws-center">
      <div className="ws-status-card ws-analyzing-card">
        <div className="ws-brain-rings">
          <div className="ws-ring ws-r1" /><div className="ws-ring ws-r2" />
          <span style={{ fontSize:28, position:'relative', zIndex:2 }}>🧠</span>
        </div>
        <div className="ws-status-title">Analyzing with on-device AI…</div>
        <div className="ws-status-sub">{fileName} · {wordCount.toLocaleString()} words</div>

        {/* Progress bar */}
        <div className="ws-progress-track">
          <div className="ws-progress-fill" style={{ width: `${analyzeProgress}%` }}>
            <div className="ws-progress-shim" />
          </div>
        </div>

        {/* Steps */}
        <div className="ws-steps">
          <div className={`ws-step ${analyzeStep === 'summary' ? 'active' : 'done'}`}>
            <span className="ws-step-dot">
              {analyzeStep === 'summary' ? <span className="spinner" style={{width:10,height:10}} /> : '✓'}
            </span>
            Generating summary
          </div>
          <div className={`ws-step ${analyzeStep === 'keypoints' ? 'active' : analyzeStep === 'done' ? 'done' : 'pending'}`}>
            <span className="ws-step-dot">
              {analyzeStep === 'done' ? '✓' : analyzeStep === 'keypoints' ? <span className="spinner" style={{width:10,height:10}} /> : '○'}
            </span>
            Extracting key points
          </div>
        </div>

        {/* Live preview as it types */}
        {summary && (
          <div className="ws-live-preview">
            <span className="ws-live-label">Live preview</span>
            <p>{summary.slice(0, 100)}{summary.length > 100 ? '…' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── READY — MAIN WORKSPACE ─────────────────────────────
  return (
    <div className="ws-workspace">

      {/* Top bar */}
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
            <div className="ws-doc-meta">{wordCount.toLocaleString()} words</div>
          </div>
        </div>

        <div className="ws-tab-group">
          {([
            { id: 'summary',   label: '📋 Summary' },
            { id: 'keypoints', label: '🎯 Key Points' },
            { id: 'chat',      label: `💬 Chat${userMsgs > 0 ? ` (${userMsgs})` : ''}` },
          ] as const).map(t => (
            <button key={t.id} className={`ws-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="ws-topbar-right">
          <span className="ws-privacy-chip">🔒 On-Device</span>
          <button className="ws-reset-btn" onClick={reset}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            New PDF
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="ws-content">

        {/* ── SUMMARY TAB ── */}
        {activeTab === 'summary' && (
          <div className="ws-panel">
            <div className="ws-result-card ws-summary-card">
              <div className="ws-result-header">
                <div className="ws-result-icon" style={{ background:'rgba(129,140,248,0.15)', color:'#818CF8' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </div>
                <h2 className="ws-result-title">Document Summary</h2>
                {summary && <CopyBtn text={summary} />}
              </div>
              <div className="ws-result-body">
                {summary
                  ? <p className="ws-summary-text">{summary}</p>
                  : <div className="ws-skeleton"><div/><div/><div/></div>
                }
              </div>
            </div>
            <button className="ws-goto-btn" onClick={() => setActiveTab('chat')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Ask questions about this document →
            </button>
          </div>
        )}

        {/* ── KEY POINTS TAB ── */}
        {activeTab === 'keypoints' && (
          <div className="ws-panel">
            <div className="ws-result-card ws-kp-card">
              <div className="ws-result-header">
                <div className="ws-result-icon" style={{ background:'rgba(34,211,238,0.12)', color:'#22D3EE' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <h2 className="ws-result-title">Key Points</h2>
                {keyPoints.length > 0 && <CopyBtn text={keyPoints.join('\n')} />}
              </div>
              <div className="ws-result-body">
                {keyPoints.length > 0
                  ? (
                    <div className="ws-kp-list">
                      {keyPoints.map((pt, i) => (
                        <div key={i} className="ws-kp-item">
                          <span className="ws-kp-num">{i + 1}</span>
                          <span className="ws-kp-text">{pt}</span>
                        </div>
                      ))}
                    </div>
                  )
                  : <div className="ws-skeleton"><div/><div/><div/><div/></div>
                }
              </div>
            </div>
            <button className="ws-goto-btn" onClick={() => setActiveTab('chat')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Dive deeper — chat with this document →
            </button>
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {activeTab === 'chat' && (
          <div className="ws-chat-panel">
            <div className="ws-chat-context-bar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Chatting with <strong>{fileName}</strong>
              <span className="ws-context-badge">Document context active</span>
            </div>

            {/* Suggested questions */}
            {messages.length <= 1 && (
              <div className="ws-suggestions">
                <div className="ws-suggestions-title">Try asking:</div>
                <div className="ws-suggestions-grid">
                  {['What is the main argument?', 'What evidence is provided?', 'What are the conclusions?', 'Explain the methodology used.'].map(q => (
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
                <div key={m.id} className={`ws-msg-row ${m.role}`}>
                  <div className="ws-msg-avatar">
                    {m.role === 'user'
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
                    }
                  </div>
                  <div className="ws-msg-body">
                    <div className={`ws-bubble ${m.role}`}>
                      {!m.content && isGenerating && i === messages.length - 1
                        ? <span className="thinking-dots"><span/><span/><span/></span>
                        : <>{m.content}{isGenerating && i === messages.length - 1 && m.content && <span className="typing-cursor" />}</>
                      }
                    </div>
                    <div className="ws-msg-meta">
                      {m.role === 'ai' && m.content && !(isGenerating && i === messages.length - 1) && <CopyBtn text={m.content} />}
                      <span className="ws-msg-time">{fmtTime(m.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="ws-input-bar">
              <div className="ws-input-wrap">
                <textarea
                  ref={inputRef} rows={1}
                  placeholder="Ask anything about this document…"
                  value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; }}
                  onKeyDown={handleKey}
                  disabled={isGenerating || model.status !== 'ready'}
                  style={{ height:'auto' }}
                />
                {isGenerating
                  ? <button className="ws-stop-btn" onClick={() => { abortRef.current = true; }}>⏹</button>
                  : <button className="ws-send-btn" onClick={() => sendMessage()} disabled={!input.trim() || model.status !== 'ready'}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                      </svg>
                    </button>
                }
              </div>
              <div className="ws-input-hint">🔒 On-device · Enter to send · Shift+Enter for new line</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}