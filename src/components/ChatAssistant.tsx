import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';
import { useVoiceInput } from '../hooks/useVoiceInput';

// ─────────────────────────────────────────────
// SUPABASE (optional) — replace with real values
// ─────────────────────────────────────────────
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const SUPABASE_ON  = SUPABASE_URL !== 'YOUR_SUPABASE_URL';

async function dbReq(method: string, path: string, body?: unknown): Promise<unknown[]> {
  if (!SUPABASE_ON) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch { return []; }
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface Props { model: ModelState; }

interface Message {
  role: 'user' | 'ai';
  content: string;
  id: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────
const LS_KEY    = 'pb_chat_sessions';
const LS_ACTIVE = 'pb_active_session';

async function loadSessions(): Promise<ChatSession[]> {
  if (SUPABASE_ON) {
    const rows = await dbReq('GET', 'chat_sessions?select=*&order=updated_at.desc') as Array<{ id: string; title: string; messages: string; created_at: number; updated_at: number }>;
    if (rows.length) return rows.map(r => ({ id: r.id, title: r.title, messages: typeof r.messages === 'string' ? JSON.parse(r.messages) : r.messages, createdAt: r.created_at, updatedAt: r.updated_at }));
  }
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}

async function saveSession(s: ChatSession) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as ChatSession[];
    localStorage.setItem(LS_KEY, JSON.stringify([s, ...all.filter(x => x.id !== s.id)]));
  } catch { /* ignore */ }
  if (SUPABASE_ON) await dbReq('POST', 'chat_sessions', { id: s.id, title: s.title, messages: JSON.stringify(s.messages), created_at: s.createdAt, updated_at: s.updatedAt });
}

async function deleteSession(id: string) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as ChatSession[];
    localStorage.setItem(LS_KEY, JSON.stringify(all.filter((x: ChatSession) => x.id !== id)));
  } catch { /* ignore */ }
  if (SUPABASE_ON) await dbReq('DELETE', `chat_sessions?id=eq.${id}`);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const STARTERS = [
  'Help me plan my week effectively',
  'Explain quantum computing simply',
  'Give me 5 productivity tips',
  'How do I improve my writing?',
  'What makes a great presentation?',
  'Help me brainstorm a startup idea',
];

function buildPrompt(msgs: Message[], newMsg: string): string {
  const history = msgs.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  return `You are a helpful AI assistant. Respond clearly and helpfully.\n\n${history}\nUser: ${newMsg}\nAssistant:`;
}

function mkTitle(msgs: Message[]): string {
  const first = msgs.find(m => m.role === 'user');
  if (!first) return 'New Chat';
  return first.content.length > 38 ? first.content.slice(0, 38) + '…' : first.content;
}

function fmtTime(ts: number): string {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ─────────────────────────────────────────────
// COPY BUTTON
// ─────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="msg-action-btn" onClick={async () => { const ok = await copyText(text); if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); } }}>
      {copied
        ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
        : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</>
      }
    </button>
  );
}

// ─────────────────────────────────────────────
// MIC BUTTON
// ─────────────────────────────────────────────
function MicButton({ isListening, isProcessing, isSupported, onClick }: {
  isListening: boolean; isProcessing: boolean; isSupported: boolean; onClick: () => void;
}) {
  if (!isSupported) return null;
  return (
    <button
      className={`mic-btn ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`}
      onClick={onClick}
      title={isListening ? 'Stop recording' : 'Voice input'}
    >
      {isListening ? (
        // Animated waves while recording
        <span className="mic-waves">
          <span /><span /><span />
        </span>
      ) : isProcessing ? (
        <span className="spinner" style={{ width: 15, height: 15 }} />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function ChatAssistant({ model }: Props) {
  const [sessions, setSessions]             = useState<ChatSession[]>([]);
  const [activeId, setActiveId]             = useState<string | null>(null);
  const [input, setInput]                   = useState('');
  const [isGenerating, setIsGenerating]     = useState(false);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [toast, setToast]                   = useState('');
  const [lastUserMsg, setLastUserMsg]       = useState('');

  const bufferRef    = useRef('');
  const aiIdRef      = useRef('');
  const sessionIdRef = useRef('');
  const rafRef       = useRef<number>(0);
  const abortRef     = useRef(false);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  // Voice input — when final transcript received, set as input and auto-send
  const voice = useVoiceInput(useCallback((text: string) => {
    setInput(text);
    // Small delay to let state update, then auto-send
    setTimeout(() => {
      setInput('');
      sendMsg(text);
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const active   = sessions.find(s => s.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  useEffect(() => {
    loadSessions().then(data => {
      setSessions(data);
      const saved = localStorage.getItem(LS_ACTIVE);
      if (saved && data.find(s => s.id === saved)) setActiveId(saved);
      else if (data.length) setActiveId(data[0].id);
      setLoadingHistory(false);
    });
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(LS_ACTIVE, activeId);
    else localStorage.removeItem(LS_ACTIVE);
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, isGenerating]);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200); }, []);

  const newSession = useCallback((): ChatSession => ({
    id: `s_${Date.now()}`, title: 'New Chat', messages: [], createdAt: Date.now(), updatedAt: Date.now(),
  }), []);

  const startNewChat = () => {
    const s = newSession();
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
    setInput('');
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const removeSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) { const rem = sessions.filter(s => s.id !== id); setActiveId(rem[0]?.id ?? null); }
  };

  const flushBuffer = useCallback(() => {
    const sid = sessionIdRef.current, aid = aiIdRef.current, txt = bufferRef.current;
    if (!sid || !aid) return;
    setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === aid ? { ...m, content: txt } : m), updatedAt: Date.now() } : s));
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sendMsg = async (overrideText?: string) => {
    const msg = (overrideText ?? input).trim();
    if (!msg || model.status !== 'ready' || isGenerating) return;

    setInput('');
    abortRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setLastUserMsg(msg);

    let sid = activeId;
    if (!sid || !sessions.find(s => s.id === sid)) {
      const s = newSession();
      setSessions(prev => [s, ...prev]);
      setActiveId(s.id);
      sid = s.id;
    }

    const userMsg: Message = { role: 'user', content: msg, id: `u_${Date.now()}`, timestamp: Date.now() };
    const aiId = `a_${Date.now() + 1}`;
    const aiMsg: Message   = { role: 'ai', content: '', id: aiId, timestamp: Date.now() };
    const prevMsgs = sessions.find(s => s.id === sid)?.messages ?? [];

    bufferRef.current = ''; aiIdRef.current = aiId; sessionIdRef.current = sid;

    setSessions(prev => prev.map(s => s.id === sid
      ? { ...s, messages: [...s.messages, userMsg, aiMsg], title: mkTitle([...s.messages, userMsg]), updatedAt: Date.now() }
      : s
    ));

    setIsGenerating(true);
    try {
      const prompt = buildPrompt([...prevMsgs, userMsg], msg);
      for await (const tok of model.generate(prompt, { maxTokens: 500, temperature: 0.72 })) {
        if (abortRef.current) break;
        bufferRef.current += tok;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(flushBuffer);
      }
      cancelAnimationFrame(rafRef.current);
      flushBuffer();
      setSessions(prev => { const done = prev.find(s => s.id === sid); if (done) saveSession(done); return prev; });
    } catch {
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === aiId ? { ...m, content: '⚠️ Something went wrong. Please try again.' } : m) } : s));
    } finally {
      setIsGenerating(false);
      aiIdRef.current = ''; sessionIdRef.current = '';
    }
  };

  const regenerate = async () => {
    if (!lastUserMsg || isGenerating || !activeId) return;
    setSessions(prev => prev.map(s => s.id === activeId
      ? { ...s, messages: s.messages.filter((m, i) => !(m.role === 'ai' && i === s.messages.length - 1)) }
      : s
    ));
    await sendMsg(lastUserMsg);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const toggleVoice = () => {
    if (voice.isListening) voice.stop();
    else voice.start();
  };

  const lastAiMsg = messages.filter(m => m.role === 'ai').at(-1);

  return (
    <div className="chat-layout">

      {/* ══ HISTORY SIDEBAR ══ */}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          {sidebarOpen && <span className="sidebar-label">History</span>}
          <button className="new-chat-btn" onClick={startNewChat} title="New Chat">
            {sidebarOpen ? <><span>＋</span> New Chat</> : '＋'}
          </button>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {sidebarOpen && (
          <div className="session-list">
            <div className="storage-badge" style={{
              background: SUPABASE_ON ? 'rgba(52,211,153,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${SUPABASE_ON ? 'rgba(52,211,153,0.25)' : 'rgba(245,158,11,0.25)'}`,
              color: SUPABASE_ON ? 'var(--accent3)' : '#F59E0B',
            }}>
              {SUPABASE_ON ? '☁️ Cloud sync active' : '💾 Saved locally'}
            </div>

            {loadingHistory
              ? <div className="session-empty"><span className="spinner" style={{ width: 14, height: 14 }} /> Loading…</div>
              : sessions.length === 0
                ? <div className="session-empty">No chats yet.<br />Start a conversation!</div>
                : sessions.map(s => (
                  <div key={s.id} className={`session-item ${s.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(s.id)}>
                    <div className="session-icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <div className="session-info">
                      <div className="session-title">{s.title}</div>
                      <div className="session-meta">{s.messages.length} msgs · {fmtTime(s.updatedAt)}</div>
                    </div>
                    <button className="session-delete" onClick={e => removeSession(s.id, e)}>✕</button>
                  </div>
                ))
            }
          </div>
        )}
      </aside>

      {/* ══ MAIN CHAT ══ */}
      <div className="chat-main">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent)' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h3 className="chat-empty-title">How can I help you today?</h3>
            <p className="chat-empty-sub">All AI runs on your device. {voice.isSupported && 'Click 🎤 to speak.'}</p>
            <div className="starters-grid">
              {STARTERS.map(s => (
                <button key={s} className="starter-btn" onClick={() => sendMsg(s)} disabled={model.status !== 'ready'}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="chat-messages-area">
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
                    {!m.content && m.role === 'ai' && isGenerating && i === messages.length - 1
                      ? <span className="thinking-dots"><span /><span /><span /></span>
                      : <>
                          <span className={isGenerating && i === messages.length - 1 && m.role === 'ai' ? 'streaming-text' : ''}>
                            {m.content}
                          </span>
                          {isGenerating && i === messages.length - 1 && m.role === 'ai' && m.content && <span className="typing-cursor" />}
                        </>
                    }
                  </div>
                  {m.role === 'ai' && m.content && !(isGenerating && i === messages.length - 1) && (
                    <div className="msg-actions">
                      <CopyBtn text={m.content} />
                      <span className="bubble-time">{fmtTime(m.timestamp)}</span>
                    </div>
                  )}
                  {m.role === 'user' && <div className="bubble-time" style={{ textAlign: 'right' }}>{fmtTime(m.timestamp)}</div>}
                </div>
              </div>
            ))}

            {/* Regenerate */}
            {!isGenerating && lastAiMsg && messages.at(-1)?.role === 'ai' && (
              <div className="regenerate-row">
                <button className="regenerate-btn" onClick={regenerate}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                  Regenerate response
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Voice recording indicator */}
        {voice.isListening && (
          <div className="voice-indicator">
            <span className="voice-ripple" />
            <span className="voice-ripple voice-ripple-2" />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            Listening… speak now
            <button onClick={voice.stop} style={{ marginLeft: 8, fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Stop</button>
          </div>
        )}

        {/* Voice error */}
        {voice.error && (
          <div className="voice-error">⚠️ {voice.error}</div>
        )}

        {/* Input */}
        <div className="chat-input-bar">
          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={
                voice.isListening ? '🎤 Listening…' :
                model.status !== 'ready' ? 'Loading AI model…' :
                'Message PrivateBrain… (or click 🎤)'
              }
              value={voice.isListening ? voice.transcript : input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              disabled={isGenerating || model.status !== 'ready' || voice.isListening}
              style={{ height: 'auto' }}
            />
            <div className="chat-input-actions">
              {/* Mic button */}
              <MicButton
                isListening={voice.isListening}
                isProcessing={voice.isProcessing}
                isSupported={voice.isSupported}
                onClick={toggleVoice}
              />
              {/* Send / Stop */}
              {isGenerating
                ? <button className="stop-btn" onClick={() => { abortRef.current = true; }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                    Stop
                  </button>
                : <button className="send-btn" onClick={() => sendMsg()} disabled={model.status !== 'ready' || (!input.trim() && !voice.transcript)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                  </button>
              }
            </div>
          </div>
          <div className="chat-input-hint">
            🔒 On-device · {SUPABASE_ON ? '☁️ Cloud sync · ' : ''}{sessions.length} session{sessions.length !== 1 ? 's' : ''} · Enter to send{voice.isSupported ? ' · 🎤 Voice' : ''}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}