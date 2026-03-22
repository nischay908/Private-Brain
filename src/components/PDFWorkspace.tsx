/**
 * PDFWorkspace — The MAIN experience of PrivateBrain
 *
 * Flow:
 *  1. Hero upload screen (first impression)
 *  2. Auto-generates summary + key points immediately on upload
 *  3. Chat panel opens — every message has the PDF as context
 *
 * Everything runs 100% in-browser. Zero network calls.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';
import { useStreamingAI, buildSummaryPrompt, buildKeyPointsPrompt, buildQAPrompt } from '../hooks/useAI';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface Props { model: ModelState; }

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

type WorkspacePhase = 'hero' | 'loading-file' | 'auto-analyzing' | 'ready';

// ─────────────────────────────────────────────
// FILE EXTRACTION
// ─────────────────────────────────────────────
async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'txt' || ext === 'md') return await file.text();
  if (ext === 'pdf') {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it: unknown) => (it as { str?: string }).str ?? '').join(' ') + '\n';
    }
    return out.trim();
  }
  if (ext === 'docx') {
    const buf    = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }
  throw new Error(`Unsupported file ".${ext}". Upload PDF, DOCX, TXT or MD.`);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildDocChatPrompt(docText: string, history: ChatMessage[], question: string): string {
  const ctx = history.slice(-6)
    .map(m => `${m.role === 'user' ? 'Researcher' : 'Assistant'}: ${m.content}`)
    .join('\n');
  return `You are PrivateBrain, a private AI research assistant. The researcher has uploaded a document. Answer questions about it accurately using only the document content. Be concise and cite relevant parts.\n\nDOCUMENT:\n${docText.slice(0, 3000)}\n\n${ctx}\nResearcher: ${question}\nAssistant:`;
}

// Copy button
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="msg-action-btn" onClick={async () => {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }}>
      {copied
        ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied</>
        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</>
      }
    </button>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function PDFWorkspace({ model }: Props) {
  const [phase, setPhase]           = useState<WorkspacePhase>('hero');
  const [docText, setDocText]       = useState('');
  const [fileName, setFileName]     = useState('');
  const [fileError, setFileError]   = useState('');
  const [dragOver, setDragOver]     = useState(false);

  // Auto-analysis results
  const [summary, setSummary]       = useState('');
  const [keyPoints, setKeyPoints]   = useState('');
  const [autoStep, setAutoStep]     = useState<'summary'|'keypoints'|'done'>('summary');

  // Chat state
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [input, setInput]           = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // UI panels
  const [showInsights, setShowInsights] = useState(true);
  const [activePanel, setActivePanel]   = useState<'insights'|'chat'>('insights');

  const fileRef    = useRef<HTMLInputElement>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef(false);
  const bufferRef  = useRef('');
  const rafRef     = useRef<number>(0);

  const { run } = useStreamingAI(model);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isGenerating]);

  // ── FILE UPLOAD ──
  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf','docx','txt','md'].includes(ext ?? '')) {
      setFileError('Please upload a PDF, DOCX, TXT or MD file.'); return;
    }
    setFileError('');
    setPhase('loading-file');
    setFileName(file.name);

    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error('No readable text found in this file.');
      setDocText(text);
      // Immediately start auto-analysis
      startAutoAnalysis(text);
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Failed to read file.');
      setPhase('hero');
    }
  }, []); // eslint-disable-line

  // ── AUTO-ANALYSIS — runs immediately on upload ──
  const startAutoAnalysis = async (text: string) => {
    if (model.status !== 'ready') return;
    setPhase('auto-analyzing');
    setSummary('');
    setKeyPoints('');
    setAutoStep('summary');

    // Step 1: Summary
    let sum = '';
    await run(
      buildSummaryPrompt(text),
      { maxTokens: 200, temperature: 0.3 },
      (t) => { sum = t; setSummary(t); },
    );

    // Step 2: Key points
    setAutoStep('keypoints');
    await run(
      buildKeyPointsPrompt(text),
      { maxTokens: 250, temperature: 0.3 },
      (t) => setKeyPoints(t),
      () => {
        setAutoStep('done');
        setPhase('ready');
        setActivePanel('insights');
        // Welcome message in chat
        setMessages([{
          id: 'welcome',
          role: 'ai',
          content: `I've analyzed **${file_name_ref}**. Here's what I found — you can read the insights, or start asking me questions about the document directly.`,
          timestamp: Date.now(),
        }]);
      }
    );
  };

  // Hack: capture filename for welcome message
  const file_name_ref = fileName;

  // ── CHAT ──
  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || model.status !== 'ready' || isGenerating || !docText) return;

    setInput('');
    abortRef.current = false;

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content: msg, timestamp: Date.now() };
    const aiId = `a_${Date.now() + 1}`;
    const aiMsg: ChatMessage   = { id: aiId, role: 'ai', content: '', timestamp: Date.now() };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setActivePanel('chat');
    setIsGenerating(true);

    bufferRef.current = '';
    cancelAnimationFrame(rafRef.current);

    try {
      const prompt = buildDocChatPrompt(docText, [...messages, userMsg], msg);
      for await (const tok of model.generate(prompt, { maxTokens: 400, temperature: 0.6 })) {
        if (abortRef.current) break;
        bufferRef.current += tok;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: bufferRef.current } : m));
        });
      }
      cancelAnimationFrame(rafRef.current);
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: bufferRef.current } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: '⚠️ Something went wrong. Try again.' } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const resetWorkspace = () => {
    setPhase('hero'); setDocText(''); setFileName(''); setSummary('');
    setKeyPoints(''); setMessages([]); setFileError(''); setInput('');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  const wordCount = docText.trim().split(/\s+/).filter(Boolean).length;

  // ─────────────────────────────────────────────
  // PHASE 1: HERO UPLOAD SCREEN
  // ─────────────────────────────────────────────
  if (phase === 'hero') {
    return (
      <div className="workspace-hero">
        {/* Ambient glow */}
        <div className="workspace-glow-1" />
        <div className="workspace-glow-2" />

        <div className="workspace-hero-content">
          {/* Hero text */}
          <div className="workspace-hero-badge">
            <span className="workspace-hero-dot" />
            Running 100% locally — no data leaves your device
          </div>

          <h1 className="workspace-hero-title">
            Your Private<br />
            <span className="workspace-hero-gradient">AI Brain</span>
          </h1>

          <p className="workspace-hero-sub">
            Analyze documents, extract insights, and chat with your research.
            Powered by on-device AI — zero cloud, zero tracking, zero compromise.
          </p>

          {/* Upload zone — center of the page */}
          <div
            className={`workspace-upload-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <div className="workspace-upload-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div className="workspace-upload-text">
              <span className="workspace-upload-title">Upload a PDF to start</span>
              <span className="workspace-upload-sub">or drag & drop here · PDF · DOCX · TXT · MD</span>
            </div>
            {model.status !== 'ready' && (
              <div className="workspace-upload-warning">
                <span className="spinner" style={{ width: 12, height: 12 }} />
                AI model loading… upload will start analysis automatically
              </div>
            )}
          </div>

          {fileError && <div className="workspace-error">⚠️ {fileError}</div>}

          {/* Feature pills */}
          <div className="workspace-features">
            <span className="workspace-feature-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Auto-summary on upload
            </span>
            <span className="workspace-feature-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Chat with your document
            </span>
            <span className="workspace-feature-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              100% private · stays on-device
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // PHASE 2: LOADING FILE
  // ─────────────────────────────────────────────
  if (phase === 'loading-file') {
    return (
      <div className="workspace-loading">
        <div className="workspace-loading-card">
          <span className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
          <div className="workspace-loading-title">Reading document…</div>
          <div className="workspace-loading-sub">{fileName}</div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // PHASE 3: AUTO-ANALYZING
  // ─────────────────────────────────────────────
  if (phase === 'auto-analyzing') {
    return (
      <div className="workspace-loading">
        <div className="workspace-loading-card">
          <div className="workspace-analyze-rings">
            <div className="wa-ring wa-ring-1" />
            <div className="wa-ring wa-ring-2" />
            <span style={{ fontSize: 24 }}>🧠</span>
          </div>
          <div className="workspace-loading-title">Analyzing your document…</div>
          <div className="workspace-loading-sub">{fileName} · {wordCount.toLocaleString()} words</div>

          <div className="workspace-auto-steps">
            <div className={`workspace-auto-step ${autoStep === 'summary' ? 'active' : autoStep === 'keypoints' || autoStep === 'done' ? 'done' : ''}`}>
              {(autoStep === 'keypoints' || autoStep === 'done') ? '✓' : autoStep === 'summary' ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '○'}
              Generating summary
            </div>
            <div className={`workspace-auto-step ${autoStep === 'keypoints' ? 'active' : autoStep === 'done' ? 'done' : ''}`}>
              {autoStep === 'done' ? '✓' : autoStep === 'keypoints' ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '○'}
              Extracting key points
            </div>
          </div>

          {summary && (
            <div className="workspace-preview">
              <div className="workspace-preview-label">Preview:</div>
              <div className="workspace-preview-text">{summary.slice(0, 120)}…</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // PHASE 4: READY — INSIGHTS + CHAT
  // ─────────────────────────────────────────────
  return (
    <div className="workspace-ready">

      {/* ── Top bar ── */}
      <div className="workspace-topbar">
        <div className="workspace-doc-info">
          <div className="workspace-doc-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <div className="workspace-doc-name">{fileName}</div>
            <div className="workspace-doc-meta">{wordCount.toLocaleString()} words · analyzed privately</div>
          </div>
        </div>
        <div className="workspace-topbar-actions">
          <div className="workspace-online-badge">
            <span className="workspace-online-dot" />
            100% On-Device
          </div>
          <div className="workspace-panel-tabs">
            <button
              className={`workspace-panel-tab ${activePanel === 'insights' ? 'active' : ''}`}
              onClick={() => setActivePanel('insights')}
            >
              📋 Insights
            </button>
            <button
              className={`workspace-panel-tab ${activePanel === 'chat' ? 'active' : ''}`}
              onClick={() => setActivePanel('chat')}
            >
              💬 Chat
              {messages.filter(m => m.role === 'user').length > 0 && (
                <span className="workspace-chat-badge">{messages.filter(m => m.role === 'user').length}</span>
              )}
            </button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={resetWorkspace}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            New PDF
          </button>
        </div>
      </div>

      <div className="workspace-body">

        {/* ── INSIGHTS PANEL ── */}
        {activePanel === 'insights' && (
          <div className="workspace-insights">

            {/* Summary card */}
            <div className="insight-card insight-card-summary">
              <div className="insight-card-header">
                <div className="insight-card-icon" style={{ background: 'rgba(129,140,248,0.15)', color: '#818CF8' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </div>
                <span className="insight-card-title">Summary</span>
                <CopyBtn text={summary} />
              </div>
              <div className="insight-card-body">
                {summary ? (
                  <p className="insight-text">{summary}</p>
                ) : (
                  <div className="insight-skeleton"><div /><div /><div /></div>
                )}
              </div>
            </div>

            {/* Key points card */}
            <div className="insight-card insight-card-keypoints">
              <div className="insight-card-header">
                <div className="insight-card-icon" style={{ background: 'rgba(34,211,238,0.12)', color: '#22D3EE' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <span className="insight-card-title">Key Points</span>
                <CopyBtn text={keyPoints} />
              </div>
              <div className="insight-card-body">
                {keyPoints ? (
                  <div className="insight-keypoints">
                    {keyPoints.split('\n').filter(l => l.trim()).map((line, i) => (
                      <div key={i} className="insight-keypoint">
                        <span className="insight-keypoint-num">{i + 1}</span>
                        <span>{line.replace(/^\d+\.\s*/, '')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="insight-skeleton"><div /><div /><div /><div /></div>
                )}
              </div>
            </div>

            {/* CTA to chat */}
            <button className="insight-chat-cta" onClick={() => setActivePanel('chat')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Ask questions about this document →
            </button>
          </div>
        )}

        {/* ── CHAT PANEL ── */}
        {activePanel === 'chat' && (
          <div className="workspace-chat">

            {/* Chat context banner */}
            <div className="workspace-chat-context">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Chatting with: <strong>{fileName}</strong>
              <span className="workspace-chat-context-badge">Document context active</span>
            </div>

            {/* Suggested questions */}
            {messages.length <= 1 && (
              <div className="workspace-suggestions">
                <div className="workspace-suggestions-label">Suggested questions:</div>
                <div className="workspace-suggestions-grid">
                  {[
                    'What is the main argument of this document?',
                    'What evidence or data does it present?',
                    'What are the key conclusions?',
                    'What methodology was used?',
                  ].map(q => (
                    <button
                      key={q}
                      className="workspace-suggestion-btn"
                      onClick={() => sendMessage(q)}
                      disabled={isGenerating || model.status !== 'ready'}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="workspace-messages">
              {messages.map((m, i) => (
                <div key={m.id} className={`chat-bubble-row ${m.role}`}>
                  <div className="bubble-avatar">
                    {m.role === 'user'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
                    }
                  </div>
                  <div className="bubble-content">
                    <div className={`bubble ${m.role}`}>
                      {!m.content && isGenerating && i === messages.length - 1
                        ? <span className="thinking-dots"><span /><span /><span /></span>
                        : <>{m.content}{isGenerating && i === messages.length - 1 && m.content && <span className="typing-cursor" />}</>
                      }
                    </div>
                    {m.role === 'ai' && m.content && !(isGenerating && i === messages.length - 1) && (
                      <div className="msg-actions"><CopyBtn text={m.content} /><span className="bubble-time">{fmtTime(m.timestamp)}</span></div>
                    )}
                    {m.role === 'user' && <div className="bubble-time" style={{ textAlign: 'right' }}>{fmtTime(m.timestamp)}</div>}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="chat-input-bar">
              <div className="chat-input-wrap">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder="Ask anything about this document…"
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
                <div className="chat-input-actions">
                  {isGenerating
                    ? <button className="stop-btn" onClick={() => { abortRef.current = true; }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg> Stop
                      </button>
                    : <button className="send-btn" onClick={() => sendMessage()} disabled={model.status !== 'ready' || !input.trim()}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                      </button>
                  }
                </div>
              </div>
              <div className="chat-input-hint">🔒 All responses generated on your device · Enter to send</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}