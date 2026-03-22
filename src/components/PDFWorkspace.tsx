import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';
import { useStreamingAI, buildSummaryPrompt, buildKeyPointsPrompt } from '../hooks/useAI';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props { model: ModelState; }
interface ChatMessage { id: string; role: 'user'|'ai'; content: string; timestamp: number; }
type Phase = 'hero'|'reading'|'analyzing'|'ready';

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'txt' || ext === 'md') return await file.text();
  if (ext === 'pdf') {
    const buf  = await file.arrayBuffer();
    const task = pdfjsLib.getDocument({ data: buf });
    task.onPassword = () => { throw new Error('PDF is password-protected. Remove the password first.'); };
    const pdf = await task.promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const ct = await pg.getTextContent();
      out += ct.items.map((it: unknown) => (it as {str?:string}).str ?? '').join(' ') + '\n';
    }
    return out.trim();
  }
  if (ext === 'docx') {
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value.trim();
  }
  throw new Error(`Unsupported ".${ext}". Upload PDF, DOCX, TXT or MD.`);
}

function fmtTime(ts: number) { return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }

function buildDocPrompt(doc: string, hist: ChatMessage[], q: string): string {
  const ctx = hist.slice(-6).map((m: ChatMessage) => `${m.role==='user'?'User':'AI'}: ${m.content}`).join('\n');
  return `You are a research assistant. Answer the user's question using ONLY the document below. Be concise.\n\nDOCUMENT:\n${doc.slice(0,3000)}\n\n${ctx}\nUser: ${q}\nAI:`;
}

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
  const [progress, setProgress]   = useState(0);
  const [summary, setSummary]     = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'summary'|'keypoints'|'chat'>('summary');
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const fileRef   = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef(false);
  const bufRef    = useRef('');
  const rafRef    = useRef<number>(0);
  const fnRef     = useRef('');
  const { run }   = useStreamingAI(model);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages.length]);
  useEffect(() => { fnRef.current = fileName; }, [fileName]);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const target = analyzeStep === 'summary' ? 48 : 92;
    const id = window.setInterval(() => setProgress(p => { if (p >= target) { clearInterval(id); return p; } return p + 1.2; }), 70);
    return () => clearInterval(id);
  }, [analyzeStep, phase]);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf','docx','txt','md'].includes(ext ?? '')) { setFileError('Please upload PDF, DOCX, TXT or MD.'); return; }
    setFileError(''); setPhase('reading'); setFileName(file.name);
    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error('No readable text found.');
      setDocText(text);
      startAnalysis(text);
    } catch (e: unknown) { setFileError(e instanceof Error ? e.message : 'Failed to read file.'); setPhase('hero'); }
  }, []); // eslint-disable-line

  const startAnalysis = async (text: string) => {
    if (model.status !== 'ready') { setFileError('Your Brain is still loading. Please wait a moment.'); return; }
    setPhase('analyzing'); setSummary(''); setKeyPoints([]); setMessages([]); setProgress(0);
    setAnalyzeStep('summary');
    await run(buildSummaryPrompt(text), { maxTokens:130, temperature:0.15 }, (t: string) => setSummary(t));
    setAnalyzeStep('keypoints');
    let kpRaw = '';
    await run(
      buildKeyPointsPrompt(text), { maxTokens:160, temperature:0.15 },
      (t: string) => { kpRaw = t; },
      () => {
        const pts = kpRaw.split('\n').filter((l: string) => l.trim()).map((l: string) => l.replace(/^\d+\.\s*/,'').trim()).filter(Boolean).slice(0,6);
        setKeyPoints(pts);
        setAnalyzeStep('done'); setProgress(100); setPhase('ready'); setActiveTab('summary');
        setMessages([{ id:'welcome', role:'ai', content:`I've read and understood "${fnRef.current}". Your Brain is ready — ask me anything about it.`, timestamp:Date.now() }]);
      }
    );
  };

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || model.status !== 'ready' || isGenerating || !docText) return;
    setInput(''); abortRef.current = false;
    const userMsg: ChatMessage = { id:`u_${Date.now()}`, role:'user', content:msg, timestamp:Date.now() };
    const aiId = `a_${Date.now()+1}`;
    setMessages((p: ChatMessage[]) => [...p, userMsg, { id:aiId, role:'ai', content:'', timestamp:Date.now() }]);
    setActiveTab('chat'); setIsGenerating(true); bufRef.current = ''; cancelAnimationFrame(rafRef.current);
    try {
      const prompt = buildDocPrompt(docText, [...messages, userMsg], msg);
      for await (const tok of model.generate(prompt, { maxTokens:300, temperature:0.45 })) {
        if (abortRef.current) break;
        bufRef.current += tok;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => setMessages((p: ChatMessage[]) => p.map((m: ChatMessage) => m.id===aiId ? {...m,content:bufRef.current} : m)));
      }
      cancelAnimationFrame(rafRef.current);
      setMessages((p: ChatMessage[]) => p.map((m: ChatMessage) => m.id===aiId ? {...m,content:bufRef.current} : m));
    } catch { setMessages((p: ChatMessage[]) => p.map((m: ChatMessage) => m.id===aiId ? {...m,content:'⚠️ Error. Please try again.'} : m)); }
    finally { setIsGenerating(false); }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };
  const reset = () => { setPhase('hero'); setDocText(''); setFileName(''); setSummary(''); setKeyPoints([]); setMessages([]); setFileError(''); setInput(''); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };
  const wordCount = docText.trim().split(/\s+/).filter(Boolean).length;
  const userMsgs  = messages.filter((m: ChatMessage) => m.role==='user').length;

  // ── HERO ──
  if (phase === 'hero') return (
    <div className="ws-hero">
      <div className="ws-glow ws-glow-1"/><div className="ws-glow ws-glow-2"/>
      <div className="ws-hero-inner hero-enter">
        <div className="ws-hero-badge">
          <span className="ws-hero-dot"/>
          Your knowledge stays yours — zero cloud, zero tracking
        </div>
        <h1 className="ws-hero-title">Your Private<br/><span className="ws-hero-grad">AI Brain</span></h1>
        <p className="ws-hero-sub">
          Feed your Brain any document. Get an instant summary, surface key insights,
          then have a private conversation with your knowledge — all on your device.
        </p>

        {/* 3-feature cards */}
        <div className="ws-hero-features">
          {[
            { icon:'📄', color:'rgba(129,140,248,0.12)', border:'rgba(129,140,248,0.2)', title:'Analyze Documents', desc:'PDF, DOCX, TXT — extracted and understood instantly' },
            { icon:'🎯', color:'rgba(34,211,238,0.1)',   border:'rgba(34,211,238,0.2)',  title:'Surface Insights',   desc:'Summary + key points generated automatically' },
            { icon:'💬', color:'rgba(52,211,153,0.1)',   border:'rgba(52,211,153,0.2)',  title:'Ask Your Knowledge', desc:'Chat with any document using on-device AI' },
          ].map((f, i) => (
            <div key={f.title} className="ws-hero-feature" style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
              <div className="ws-hero-feature-icon" style={{ background: f.color, border: `1px solid ${f.border}` }}>{f.icon}</div>
              <div className="ws-hero-feature-title">{f.title}</div>
              <div className="ws-hero-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        <div
          className={`ws-drop ${dragOver?'over':''}`}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}
          onClick={()=>fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value='';}} />
          <div className="ws-drop-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <span className="ws-drop-title">Drop a document into your Brain</span>
          <span className="ws-drop-sub">PDF · DOCX · TXT · MD · drag & drop or click to browse</span>
          {model.status !== 'ready' && <span className="ws-drop-warn"><span className="spinner" style={{width:11,height:11}}/> Brain loading — you can upload now</span>}
        </div>

        {fileError && <div className="ws-error">{fileError}</div>}

        <div className="ws-pills">
          {['⚡ Instant summary','🎯 Key insights','💬 Ask your doc','🔒 Never leaves device'].map(p => (
            <span key={p} className="ws-pill">{p}</span>
          ))}
        </div>
      </div>
    </div>
  );

  // ── READING ──
  if (phase === 'reading') return (
    <div className="ws-center">
      <div className="ws-status-card status-enter">
        <span className="spinner" style={{width:40,height:40,borderWidth:3}}/>
        <div className="ws-status-title">Feeding document into your Brain…</div>
        <div className="ws-status-sub">{fileName}</div>
      </div>
    </div>
  );

  // ── ANALYZING ──
  if (phase === 'analyzing') return (
    <div className="ws-center">
      <div className="ws-status-card ws-analyzing-card status-enter">
        <div className="ws-brain-rings">
          <div className="ws-ring ws-r1"/><div className="ws-ring ws-r2"/>
          <span style={{fontSize:28,position:'relative',zIndex:2}}>🧠</span>
        </div>
        <div className="ws-status-title">Your Brain is thinking…</div>
        <div className="ws-status-sub">{fileName} · {wordCount.toLocaleString()} words</div>
        <div className="ws-progress-track">
          <div className="ws-progress-fill" style={{width:`${progress}%`,transition:'width 0.5s ease'}}>
            <div className="ws-progress-shim"/>
          </div>
        </div>
        <div className="ws-steps">
          {[
            {id:'summary',   label:'Distilling the key ideas'},
            {id:'keypoints', label:'Surfacing what matters most'},
          ].map(step => {
            const isDone = (step.id==='summary'&&(analyzeStep==='keypoints'||analyzeStep==='done'))||analyzeStep==='done';
            const isActive = analyzeStep === step.id;
            return (
              <div key={step.id} className={`ws-step ${isActive?'active':''} ${isDone?'done':''} ${!isActive&&!isDone?'pending':''}`}>
                <span className="ws-step-dot">
                  {isDone ? '✓' : isActive ? <span className="spinner" style={{width:10,height:10}}/> : '○'}
                </span>
                {step.label}
              </div>
            );
          })}
        </div>
        {summary && (
          <div className="ws-live-preview">
            <span className="ws-live-label">Emerging insight</span>
            <p>{summary.slice(0,110)}{summary.length>110?'…':''}</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── READY ──
  return (
    <div className="ws-workspace workspace-enter">
      <div className="ws-topbar">
        <div className="ws-doc-chip">
          <div className="ws-doc-chip-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div><div className="ws-doc-name">{fileName}</div><div className="ws-doc-meta">{wordCount.toLocaleString()} words</div></div>
        </div>
        <div className="ws-tab-group">
          {([
            {id:'summary',   label:'📋 Overview'},
            {id:'keypoints', label:'🎯 What Matters'},
            {id:'chat',      label:`💬 Ask${userMsgs>0?` (${userMsgs})`:''}`},
          ] as const).map(t => (
            <button key={t.id} className={`ws-tab ${activeTab===t.id?'active':''}`} onClick={()=>setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="ws-topbar-right">
          <span className="ws-privacy-chip">🔒 Private Brain</span>
          <button className="ws-reset-btn" onClick={reset}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            New Document
          </button>
        </div>
      </div>

      <div className="ws-content">
        {activeTab === 'summary' && (
          <div className="ws-panel panel-enter">
            <div className="ws-result-card ws-summary-card">
              <div className="ws-result-header">
                <div className="ws-result-icon" style={{background:'rgba(129,140,248,0.15)',color:'#818CF8'}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </div>
                <h2 className="ws-result-title">Brain's Overview</h2>
                {summary && <CopyBtn text={summary}/>}
              </div>
              <div className="ws-result-body">
                {summary ? <p className="ws-summary-text">{summary}</p> : <div className="ws-skeleton"><div/><div/><div/></div>}
              </div>
            </div>
            <button className="ws-goto-btn" onClick={()=>setActiveTab('chat')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Ask your Brain about this →
            </button>
          </div>
        )}

        {activeTab === 'keypoints' && (
          <div className="ws-panel panel-enter">
            <div className="ws-result-card ws-kp-card">
              <div className="ws-result-header">
                <div className="ws-result-icon" style={{background:'rgba(34,211,238,0.12)',color:'#22D3EE'}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                </div>
                <h2 className="ws-result-title">What Matters Most</h2>
                {keyPoints.length>0 && <CopyBtn text={keyPoints.join('\n')}/>}
              </div>
              <div className="ws-result-body">
                {keyPoints.length > 0 ? (
                  <div className="ws-kp-list">
                    {keyPoints.map((pt: string, i: number) => (
                      <div key={i} className="ws-kp-item kp-item-enter" style={{animationDelay:`${i*0.06}s`}}>
                        <span className="ws-kp-num">{i+1}</span>
                        <span className="ws-kp-text">{pt}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="ws-skeleton"><div/><div/><div/><div/></div>}
              </div>
            </div>
            <button className="ws-goto-btn" onClick={()=>setActiveTab('chat')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Explore deeper with your Brain →
            </button>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="ws-chat-panel panel-enter">
            <div className="ws-chat-context-bar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Your Brain is reading <strong>{fileName}</strong>
              <span className="ws-context-badge">Knowledge active</span>
            </div>

            {messages.length <= 1 && (
              <div className="ws-suggestions">
                <div className="ws-suggestions-title">Explore your knowledge:</div>
                <div className="ws-suggestions-grid">
                  {['What is this document really about?','What are the strongest arguments?','What conclusions does it reach?','What should I remember from this?'].map((q: string) => (
                    <button key={q} className="ws-suggestion" onClick={()=>sendMessage(q)} disabled={isGenerating}>{q}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="ws-messages">
              {messages.map((m: ChatMessage, i: number) => (
                <div key={m.id} className={`ws-msg-row ${m.role} msg-enter`} style={{animationDelay:`${i*0.03}s`}}>
                  <div className="ws-msg-avatar">
                    {m.role==='user'
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
                    }
                  </div>
                  <div className="ws-msg-body">
                    <div className={`ws-bubble ${m.role}`}>
                      {!m.content && isGenerating && i===messages.length-1
                        ? <span className="thinking-dots"><span/><span/><span/></span>
                        : <>{m.content}{isGenerating&&i===messages.length-1&&m.role==='ai'&&m.content&&<span className="typing-cursor"/>}</>
                      }
                    </div>
                    <div className="ws-msg-meta">
                      {m.role==='ai'&&m.content&&!(isGenerating&&i===messages.length-1)&&<CopyBtn text={m.content}/>}
                      <span className="ws-msg-time">{fmtTime(m.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>

            <div className="ws-input-bar">
              <div className="ws-input-wrap">
                <textarea ref={inputRef} rows={1} placeholder="Ask your Brain anything about this document…"
                  value={input}
                  onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';}}
                  onKeyDown={handleKey} disabled={isGenerating||model.status!=='ready'} style={{height:'auto'}}/>
                {isGenerating
                  ? <button className="ws-stop-btn" onClick={()=>{abortRef.current=true;}}>⏹ Stop</button>
                  : <button className="ws-send-btn" onClick={()=>sendMessage()} disabled={!input.trim()||model.status!=='ready'}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                    </button>
                }
              </div>
              <div className="ws-input-hint">🔒 Processed privately on your device · Enter to send</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}