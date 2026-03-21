import React, { useState, useRef, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';

// @ts-ignore
import * as mammoth from 'mammoth';

interface Props { model: ModelState; }

const ANALYSIS_MODES = [
  { id: 'summary',   icon: '📋', label: 'Summarize',    desc: 'Concise summary',       color: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' },
  { id: 'keypoints', icon: '🎯', label: 'Key Points',   desc: 'Extract main ideas',    color: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.4)'  },
  { id: 'simplify',  icon: '🔍', label: 'Simplify',     desc: 'Plain language',        color: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)' },
  { id: 'critique',  icon: '🧐', label: 'Critique',     desc: 'Strengths & weaknesses',color: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)' },
  { id: 'questions', icon: '❓', label: 'Generate Q&A', desc: 'Study questions',        color: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)'  },
  { id: 'formal',    icon: '🎓', label: 'Make Formal',  desc: 'Academic version',      color: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.4)' },
];

function buildPrompt(mode: string, text: string): string {
  const map: Record<string, string> = {
    summary:   `Summarize this text in 3-4 clear sentences:\n\n${text}`,
    keypoints: `List the 5 most important key points from this text as a numbered list:\n\n${text}`,
    simplify:  `Rewrite this in very simple plain language anyone can understand:\n\n${text}`,
    critique:  `Analyze this text. Give 3 strengths and 3 areas to improve:\n\n${text}`,
    questions: `Write 5 study questions based on this text:\n\n${text}`,
    formal:    `Rewrite this in formal academic language:\n\n${text}`,
  };
  return map[mode] ?? map.summary;
}

type FileStatus = 'idle' | 'reading' | 'ready' | 'error';

export default function DocumentAnalyzer({ model }: Props) {
  const [docText, setDocText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle');
  const [fileError, setFileError] = useState('');
  const [output, setOutput] = useState('');
  const [activeMode, setActiveMode] = useState('summary');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToast, setShowToast] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount  = docText.trim() ? docText.trim().split(/\s+/).length : 0;
  const readTime   = Math.max(1, Math.round(wordCount / 200));
  const paraCount  = docText.split(/\n\n+/).filter(Boolean).length || 0;
  const outputWords = output.trim() ? output.trim().split(/\s+/).length : 0;
  const activeModeCfg = ANALYSIS_MODES.find(m => m.id === activeMode)!;

  // ── File Reading ──────────────────────────────────────────
  const readFile = useCallback(async (file: File) => {
    setFileStatus('reading');
    setFileError('');
    setFileName(file.name);
    setOutput('');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'txt' || ext === 'md') {
        const text = await file.text();
        setDocText(text);
        setFileStatus('ready');

      } else if (ext === 'pdf') {
        // Dynamic import of pdf.js to avoid SSR issues
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        setDocText(fullText.trim());
        setFileStatus('ready');

      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setDocText(result.value.trim());
        setFileStatus('ready');

      } else {
        throw new Error(`Unsupported file type: .${ext}. Use PDF, DOCX, TXT, or MD.`);
      }
    } catch (e: any) {
      console.error('File read error:', e);
      setFileError(e?.message ?? 'Failed to read file');
      setFileStatus('error');
      setFileName('');
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const clearAll = () => {
    setDocText(''); setOutput(''); setFileName('');
    setFileStatus('idle'); setFileError('');
  };

  // ── Analysis ──────────────────────────────────────────────
  const analyze = async () => {
    if (!docText.trim() || model.status !== 'ready' || isGenerating) return;
    setIsGenerating(true);
    setOutput('');
    abortRef.current = false;
    try {
      let out = '';
      // Use first 3000 words to stay within token limits
      const trimmedText = docText.split(/\s+/).slice(0, 3000).join(' ');
      const prompt = buildPrompt(activeMode, trimmedText);
      for await (const tok of model.generate(prompt, { maxTokens: 600, temperature: 0.5 })) {
        if (abortRef.current) break;
        out += tok;
        setOutput(out);
      }
    } catch (e) {
      setOutput('Error during analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyOutput = () => {
    if (!output) return;
    navigator.clipboard.writeText(output).then(() => {
      setShowToast('✅ Copied!');
      setTimeout(() => setShowToast(''), 2000);
    });
  };

  return (
    <>
      {/* Stats Row */}
      {docText.trim() && (
        <div className="stats-row">
          {[
            { label: 'Words', value: wordCount.toLocaleString(), sub: 'in document' },
            { label: 'Read Time', value: `${readTime}m`, sub: 'estimate' },
            { label: 'Paragraphs', value: paraCount, sub: 'blocks' },
            { label: 'Characters', value: docText.length.toLocaleString(), sub: 'total' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-card-label">{s.label}</div>
              <div className="stat-card-value">{s.value}</div>
              <div className="stat-card-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Zone */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📄 Document Input</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--accent3)', fontWeight: 600 }}>🔒 Never leaves your device</span>
            {(docText || fileName) && <button className="btn btn-secondary btn-sm" onClick={clearAll}>🗑 Clear</button>}
          </div>
        </div>
        <div className="card-body">
          {/* Drag & Drop Zone */}
          <div
            className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${fileStatus === 'ready' && fileName ? 'has-file' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            {fileStatus === 'reading' ? (
              <div className="drop-zone-content">
                <span className="spinner" style={{ width: 24, height: 24 }} />
                <span>Reading {fileName}…</span>
              </div>
            ) : fileStatus === 'ready' && fileName ? (
              <div className="drop-zone-content file-loaded">
                <span style={{ fontSize: 28 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{fileName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{wordCount.toLocaleString()} words extracted · Click to replace</div>
                </div>
              </div>
            ) : fileStatus === 'error' ? (
              <div className="drop-zone-content error">
                <span style={{ fontSize: 28 }}>❌</span>
                <div style={{ color: 'var(--error, #ef4444)' }}>{fileError}</div>
              </div>
            ) : (
              <div className="drop-zone-content">
                <span style={{ fontSize: 36 }}>📁</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Drop a file or click to browse</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Supports PDF · DOCX · TXT · MD</div>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="or-divider"><span>or paste text directly</span></div>

          <textarea
            rows={6}
            placeholder="Paste any text here — articles, essays, reports, emails, research papers…"
            value={docText}
            onChange={e => { setDocText(e.target.value); if (e.target.value && fileName) setFileName(''); }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
        </div>
      </div>

      {/* Mode Selector */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔬 Analysis Mode</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Selected: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{activeModeCfg.label}</span>
          </span>
        </div>
        <div className="card-body">
          <div className="mode-grid">
            {ANALYSIS_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setActiveMode(m.id)}
                className="mode-btn"
                style={{
                  border: `1px solid ${activeMode === m.id ? m.border : 'rgba(255,255,255,0.07)'}`,
                  background: activeMode === m.id ? m.color : 'rgba(255,255,255,0.025)',
                }}
              >
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={analyze}
              disabled={model.status !== 'ready' || isGenerating || !docText.trim()}
            >
              {isGenerating ? <><span className="spinner" />Analyzing…</> : <>{activeModeCfg.icon} {activeModeCfg.label}</>}
            </button>
            {isGenerating && (
              <button className="btn btn-secondary" onClick={() => { abortRef.current = true; }}>⏹ Stop</button>
            )}
          </div>
          {!docText.trim() && (
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              ↑ Upload a file or paste text above, then choose an analysis mode
            </p>
          )}
        </div>
      </div>

      {/* Output */}
      {(output || isGenerating) && (
        <div className="card" style={{ borderColor: activeModeCfg.border }}>
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--accent2)' }}>
              {activeModeCfg.icon} {activeModeCfg.label} Result
              {isGenerating && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>generating…</span>}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {output && <div className="stat-chip">Words: <span>{outputWords}</span></div>}
              <button className="btn btn-secondary btn-sm" onClick={copyOutput} disabled={!output}>📋 Copy</button>
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

      {showToast && <div className="toast">{showToast}</div>}
    </>
  );
}
