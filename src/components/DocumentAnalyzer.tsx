import React, { useState, useRef, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Props { model: ModelState; }

// ── Analysis modes ──
const MODES = [
  { id: 'summary',   icon: '📋', label: 'Summarize',   desc: 'Concise overview',       accent: '#818CF8' },
  { id: 'keypoints', icon: '🎯', label: 'Key Points',  desc: 'Extract main ideas',     accent: '#22D3EE' },
  { id: 'qa',        icon: '❓', label: 'Q&A Mode',    desc: 'Ask anything about it',  accent: '#F59E0B' },
  { id: 'simplify',  icon: '🔍', label: 'Simplify',    desc: 'Plain language',         accent: '#34D399' },
  { id: 'critique',  icon: '🧐', label: 'Critique',    desc: 'Strengths & weaknesses', accent: '#F87171' },
  { id: 'formal',    icon: '🎓', label: 'Make Formal', desc: 'Academic rewrite',       accent: '#A78BFA' },
];

function buildPrompt(mode: string, text: string, question?: string): string {
  const chunk = text.slice(0, 3500); // keep within token budget
  const base: Record<string, string> = {
    summary:   `Summarize the following document in 3-5 clear sentences:\n\n${chunk}`,
    keypoints: `List the 5-7 most important key points from this document as a numbered list:\n\n${chunk}`,
    qa:        `You are a document assistant. Answer this question based only on the document below.\n\nQuestion: ${question ?? 'What is this document about?'}\n\nDocument:\n${chunk}`,
    simplify:  `Rewrite this document in very simple plain language a 10-year-old can understand:\n\n${chunk}`,
    critique:  `Analyze this document critically. List 3 strengths and 3 weaknesses:\n\n${chunk}`,
    formal:    `Rewrite this document in formal academic language:\n\n${chunk}`,
  };
  return base[mode] ?? base.summary;
}

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

  throw new Error(`Unsupported file type ".${ext}". Use PDF, DOCX, TXT or MD.`);
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

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function DocumentAnalyzer({ model }: Props) {
  const [docText, setDocText]           = useState('');
  const [fileName, setFileName]         = useState<string | null>(null);
  const [fileError, setFileError]       = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [dragOver, setDragOver]         = useState(false);

  const [activeMode, setActiveMode]     = useState('summary');
  const [qaQuestion, setQaQuestion]     = useState('');

  const [output, setOutput]             = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast]               = useState('');
  const abortRef  = useRef(false);
  const fileRef   = useRef<HTMLInputElement>(null);
  const bufferRef = useRef('');
  const rafRef    = useRef<number>(0);

  const wordCount  = docText.trim().split(/\s+/).filter(Boolean).length;
  const readTime   = Math.max(1, Math.round(wordCount / 200));
  const charCount  = docText.length;
  const paraCount  = docText.split(/\n\n+/).filter(Boolean).length;

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  // ── File handling ──
  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf','docx','txt','md'].includes(ext ?? '')) {
      setFileError('Unsupported file. Please upload a PDF, DOCX, TXT or MD.'); return;
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
      const msg = e instanceof Error ? e.message : 'Failed to read file.';
      setFileError(msg);
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
    setIsGenerating(true);
    setOutput('');
    abortRef.current  = false;
    bufferRef.current = '';
    cancelAnimationFrame(rafRef.current);

    try {
      const prompt = buildPrompt(activeMode, docText, qaQuestion || undefined);
      for await (const tok of model.generate(prompt, { maxTokens: 600, temperature: 0.45 })) {
        if (abortRef.current) break;
        bufferRef.current += tok;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => setOutput(bufferRef.current));
      }
      cancelAnimationFrame(rafRef.current);
      setOutput(bufferRef.current);
    } catch {
      setOutput('⚠️ Analysis failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const clearAll = () => { setDocText(''); setOutput(''); setFileName(null); setFileError(null); setQaQuestion(''); };

  const modeCfg = MODES.find(m => m.id === activeMode)!;
  const outputWords = output.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="pb-tab-content">

      {/* ── Stats bar ── */}
      {docText.trim() && (
        <div className="doc-stats-row">
          {[
            { l: 'Words',      v: wordCount.toLocaleString() },
            { l: 'Read Time',  v: `${readTime} min` },
            { l: 'Paragraphs', v: paraCount },
            { l: 'Characters', v: charCount.toLocaleString() },
          ].map(s => (
            <div key={s.l} className="summary-card">
              <div className="summary-card-label">{s.l}</div>
              <div className="summary-card-value">{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Upload card ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Document Input
          </span>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:11, color:'var(--accent3)', fontFamily:'var(--font-mono)' }}>🔒 Never leaves your device</span>
            {docText && <button className="btn btn-secondary btn-sm" onClick={clearAll}>🗑 Clear</button>}
          </div>
        </div>
        <div className="card-body">
          {/* Drop zone */}
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''} ${isLoadingFile ? 'loading' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value=''; }} />
            {isLoadingFile ? (
              <div className="drop-zone-content">
                <span className="spinner" style={{ width:26, height:26 }} />
                <span style={{ color:'var(--text-muted)', fontSize:13 }}>Reading file…</span>
              </div>
            ) : fileName ? (
              <div className="drop-zone-content">
                <span style={{ fontSize:30 }}>✅</span>
                <span className="drop-zone-filename">{fileName}</span>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>Click to replace</span>
              </div>
            ) : (
              <div className="drop-zone-content">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color:'var(--accent)', opacity:0.7 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="drop-zone-title">Drop your file here or click to browse</span>
                <span className="drop-zone-sub">PDF · DOCX · TXT · MD</span>
              </div>
            )}
          </div>

          {fileError && <div className="file-error">⚠️ {fileError}</div>}

          <div className="or-divider"><span>or paste text directly</span></div>

          <textarea
            rows={6}
            placeholder="Paste any document content here — articles, reports, essays, meeting notes…"
            value={docText}
            onChange={e => { setDocText(e.target.value); setFileName(null); }}
            style={{ fontFamily:'var(--font-mono)', fontSize:13 }}
          />
        </div>
      </div>

      {/* ── Mode selector ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔬 Analysis Mode</span>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>
            Selected: <span style={{ color: modeCfg.accent, fontWeight:700 }}>{modeCfg.label}</span>
          </span>
        </div>
        <div className="card-body">
          <div className="mode-grid">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`mode-btn ${activeMode === m.id ? 'active' : ''}`}
                style={{ '--mode-accent': m.accent } as React.CSSProperties}
                onClick={() => setActiveMode(m.id)}
              >
                <span className="mode-icon">{m.icon}</span>
                <span className="mode-label">{m.label}</span>
                <span className="mode-desc">{m.desc}</span>
              </button>
            ))}
          </div>

          {/* Q&A input — only shown in qa mode */}
          {activeMode === 'qa' && (
            <div className="qa-input-wrap">
              <input
                type="text"
                className="qa-input"
                placeholder="Ask a question about the document…"
                value={qaQuestion}
                onChange={e => setQaQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyze()}
              />
            </div>
          )}

          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={analyze}
              disabled={model.status !== 'ready' || isGenerating || !docText.trim() || (activeMode === 'qa' && !qaQuestion.trim())}
            >
              {isGenerating ? <><span className="spinner" /> Analyzing…</> : <>{modeCfg.icon} {modeCfg.label}</>}
            </button>
            {isGenerating && (
              <button className="btn btn-secondary" onClick={() => { abortRef.current = true; }}>⏹ Stop</button>
            )}
          </div>

          {!docText.trim() && (
            <p style={{ marginTop:10, fontSize:12, color:'var(--text-muted)', fontStyle:'italic' }}>
              ↑ Upload a file or paste text above first
            </p>
          )}
        </div>
      </div>

      {/* ── Output ── */}
      {(output || isGenerating) && (
        <div className="card result-card" style={{ borderColor: modeCfg.accent + '55' }}>
          <div className="card-header">
            <span className="card-title" style={{ color: modeCfg.accent }}>
              {modeCfg.icon} {modeCfg.label} Result
              {isGenerating && <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:400, marginLeft:8 }}>— generating…</span>}
            </span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {output && <span className="stat-chip">{outputWords} words</span>}
              {output && <CopyBtn text={output} />}
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

      <div className="pb-tab-footer">Powered by WebLLM · Llama 3.2 1B · WebGPU · 100% Private</div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}