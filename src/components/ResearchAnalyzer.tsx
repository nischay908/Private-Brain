/**
 * ResearchAnalyzer — PDF Analyzer
 *
 * Keeps only 2 AI actions: Summarize + Q&A
 * Supports PDF, DOCX, TXT, MD upload
 * Shared AI logic via useAI hook
 */
import React, { useState, useRef, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';
import { useStreamingAI, buildSummaryPrompt, buildQAPrompt, buildKeyPointsPrompt } from '../hooks/useAI';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Props { model: ModelState; }

// Only 3 essential analysis modes
const MODES = [
  {
    id: 'summary',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
    label: 'Summarize',
    desc: 'Get a concise overview of the document',
    accent: '#818CF8',
  },
  {
    id: 'keypoints',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
    label: 'Key Points',
    desc: 'Extract the most important findings',
    accent: '#22D3EE',
  },
  {
    id: 'qa',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    label: 'Ask a Question',
    desc: 'Query the document with a specific question',
    accent: '#34D399',
  },
];

// ── File extraction ──
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
      out += content.items.map((item: unknown) => (item as { str?: string }).str ?? '').join(' ') + '\n';
    }
    return out.trim();
  }
  if (ext === 'docx') {
    const buf    = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }
  throw new Error(`Unsupported file type ".${ext}". Upload a PDF, DOCX, TXT or MD.`);
}

// ── Copy button ──
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="msg-action-btn" onClick={async () => {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }}>
      {copied ? '✅ Copied' : '📋 Copy'}
    </button>
  );
}

export default function ResearchAnalyzer({ model }: Props) {
  const [docText, setDocText]             = useState('');
  const [fileName, setFileName]           = useState<string | null>(null);
  const [fileError, setFileError]         = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [dragOver, setDragOver]           = useState(false);
  const [activeMode, setActiveMode]       = useState('summary');
  const [question, setQuestion]           = useState('');
  const [output, setOutput]               = useState('');
  const [isGenerating, setIsGenerating]   = useState(false);
  const [toast, setToast]                 = useState('');

  const fileRef  = useRef<HTMLInputElement>(null);
  const { run, abort } = useStreamingAI(model);

  const wordCount = docText.trim().split(/\s+/).filter(Boolean).length;
  const readTime  = Math.max(1, Math.round(wordCount / 200));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  // ── File handling ──
  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf','docx','txt','md'].includes(ext ?? '')) {
      setFileError('Please upload a PDF, DOCX, TXT or MD file.'); return;
    }
    setFileError(null);
    setIsLoadingFile(true);
    setFileName(file.name);
    setOutput('');
    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error('No readable text found in this file.');
      setDocText(text);
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Failed to read file.');
      setFileName(null);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  // ── Analyze ──
  const analyze = async () => {
    if (!docText.trim() || model.status !== 'ready' || isGenerating) return;
    if (activeMode === 'qa' && !question.trim()) return;

    setIsGenerating(true);
    setOutput('');

    const prompt =
      activeMode === 'summary'   ? buildSummaryPrompt(docText) :
      activeMode === 'keypoints' ? buildKeyPointsPrompt(docText) :
      buildQAPrompt(docText, question);

    await run(prompt, { maxTokens: 500, temperature: 0.4 }, setOutput);
    setIsGenerating(false);
  };

  const clearDoc = () => {
    setDocText(''); setOutput(''); setFileName(null);
    setFileError(null); setQuestion('');
  };

  const modeCfg = MODES.find(m => m.id === activeMode)!;

  return (
    <div className="pb-tab-content">

      {/* ── Page header ── */}
      <div className="research-header">
        <div>
          <h1 className="research-title">PDF Analyzer</h1>
          <p className="research-sub">
            Upload any document and extract insights privately — nothing is sent to any server.
          </p>
        </div>
        {docText && (
          <div className="research-doc-meta">
            <span className="research-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {fileName ?? 'Pasted text'}
            </span>
            <span className="research-meta-item">{wordCount.toLocaleString()} words</span>
            <span className="research-meta-item">~{readTime} min read</span>
            <button className="btn btn-secondary btn-sm" onClick={clearDoc}>Clear</button>
          </div>
        )}
      </div>

      {/* ── Upload / Input ── */}
      {!docText ? (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload your document
            </span>
            <span style={{ fontSize: 11, color: 'var(--accent3)', fontFamily: 'var(--font-mono)' }}>
              🔒 Stays on your device
            </span>
          </div>
          <div className="card-body">
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''} ${isLoadingFile ? 'loading' : ''}`}
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
              {isLoadingFile ? (
                <div className="drop-zone-content">
                  <span className="spinner" style={{ width: 28, height: 28 }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Reading document…</span>
                </div>
              ) : (
                <div className="drop-zone-content">
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent)', opacity: 0.7 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span className="drop-zone-title">Drop your document here or click to browse</span>
                  <span className="drop-zone-sub">PDF · DOCX · TXT · MD — all analyzed privately</span>
                </div>
              )}
            </div>

            {fileError && <div className="file-error">⚠️ {fileError}</div>}

            <div className="or-divider"><span>or paste text directly</span></div>

            <textarea
              rows={6}
              placeholder="Paste research papers, articles, reports, meeting notes, or any text you want to analyze…"
              onChange={e => { if (e.target.value.trim()) { setDocText(e.target.value); setFileName(null); } }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
          </div>
        </div>
      ) : (
        /* ── Analysis tools (shown after doc loaded) ── */
        <>
          {/* Mode selector */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Choose analysis type</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Using: <span style={{ color: modeCfg.accent, fontWeight: 700 }}>{modeCfg.label}</span>
              </span>
            </div>
            <div className="card-body">
              <div className="research-modes">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    className={`research-mode-btn ${activeMode === m.id ? 'active' : ''}`}
                    style={{ '--mode-accent': m.accent } as React.CSSProperties}
                    onClick={() => setActiveMode(m.id)}
                  >
                    <span className="research-mode-icon">{m.icon}</span>
                    <div className="research-mode-text">
                      <span className="research-mode-label">{m.label}</span>
                      <span className="research-mode-desc">{m.desc}</span>
                    </div>
                    {activeMode === m.id && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto', color: m.accent }}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Q&A input */}
              {activeMode === 'qa' && (
                <div className="research-qa-wrap">
                  <label className="research-qa-label">Your question about the document:</label>
                  <input
                    className="qa-input"
                    placeholder="e.g. What are the main conclusions? What methodology was used?"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && analyze()}
                  />
                </div>
              )}

              <div className="toolbar">
                <button
                  className="btn btn-primary"
                  onClick={analyze}
                  disabled={
                    model.status !== 'ready' || isGenerating || !docText.trim() ||
                    (activeMode === 'qa' && !question.trim())
                  }
                >
                  {isGenerating
                    ? <><span className="spinner" /> Analyzing…</>
                    : <><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{modeCfg.icon}</span> {modeCfg.label}</>
                  }
                </button>
                {isGenerating && (
                  <button className="btn btn-secondary" onClick={abort}>⏹ Stop</button>
                )}
              </div>
            </div>
          </div>

          {/* Result */}
          {(output || isGenerating) && (
            <div className="card" style={{ borderColor: modeCfg.accent + '44' }}>
              <div className="card-header">
                <span className="card-title" style={{ color: modeCfg.accent }}>
                  {modeCfg.label} Result
                  {isGenerating && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                      — analyzing on your device…
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {output && !isGenerating && <CopyBtn text={output} />}
                </div>
              </div>
              <div className="card-body">
                <div className="output-text">
                  {output}
                  {isGenerating && <span className="typing-cursor" />}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="pb-tab-footer">
        PrivateBrain · Private AI Research Assistant · Zero data sent anywhere
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}