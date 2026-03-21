import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';

// ─────────────────────────────────────────────
// SUPABASE SETUP
// Step 1: npm install @supabase/supabase-js
// Step 2: Replace the two values below with
//         your real values from supabase.com
//         dashboard → Project Settings → API
// ─────────────────────────────────────────────
const SUPABASE_URL  = 'https://uuiycrrlbktfosmcnktv.supabase.co';   // e.g. https://abc123.supabase.co
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1aXljcnJsYmt0Zm9zbWNua3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDgyNTEsImV4cCI6MjA4OTY4NDI1MX0.yvzsRP5nxl5uBkL2yBNS-HptEAlrLVjAnsALe5-_S9A'; // long key from supabase dashboard

// Check if Supabase is configured
const SUPABASE_READY = SUPABASE_URL !== 'https://uuiycrrlbktfosmcnktv.supabase.co' && SUPABASE_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1aXljcnJsYmt0Zm9zbWNua3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDgyNTEsImV4cCI6MjA4OTY4NDI1MX0.yvzsRP5nxl5uBkL2yBNS-HptEAlrLVjAnsALe5-_S9A';

// Simple Supabase API helper (no extra imports needed!)
async function supabaseRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown[]> {
  if (!SUPABASE_READY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return [];
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch {
    return [];
  }
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
// CONSTANTS
// ─────────────────────────────────────────────
const STARTERS = [
  'Help me plan my week effectively',
  'Explain quantum computing simply',
  'Give me 5 productivity tips',
  'How do I improve my writing?',
  'What makes a great presentation?',
  'Help me brainstorm a startup idea',
];

const STORAGE_KEY = 'thinklocal_chat_sessions';
const ACTIVE_KEY  = 'thinklocal_active_session';

// ─────────────────────────────────────────────
// STORAGE HELPERS
// Automatically uses Supabase if configured,
// otherwise falls back to localStorage
// ─────────────────────────────────────────────
async function loadSessionsFromStorage(): Promise<ChatSession[]> {
  // Try Supabase first
  if (SUPABASE_READY) {
    const data = await supabaseRequest(
      'GET',
      'chat_sessions?select=*&order=updated_at.desc'
    ) as Array<{ id: string; title: string; messages: string; created_at: number; updated_at: number }>;

    if (data.length > 0) {
      return data.map(row => ({
        id: row.id,
        title: row.title,
        messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    }
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveSessionToStorage(session: ChatSession): Promise<void> {
  // Always save to localStorage (instant, works offline)
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ChatSession[];
    const updated = [session, ...existing.filter((s: ChatSession) => s.id !== session.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }

  // Also save to Supabase if configured
  if (SUPABASE_READY) {
    await supabaseRequest('POST', 'chat_sessions', {
      id: session.id,
      title: session.title,
      messages: JSON.stringify(session.messages),
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    });
  }
}

async function deleteSessionFromStorage(id: string): Promise<void> {
  // Delete from localStorage
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ChatSession[];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter((s: ChatSession) => s.id !== id)));
  } catch { /* ignore */ }

  // Delete from Supabase if configured
  if (SUPABASE_READY) {
    await supabaseRequest('DELETE', `chat_sessions?id=eq.${id}`);
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function buildChatPrompt(messages: Message[], newMsg: string): string {
  const history = messages
    .slice(-8)
    .map((m: Message) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
  return `You are a helpful, knowledgeable AI assistant. Respond concisely and helpfully.\n\n${history}\nUser: ${newMsg}\nAssistant:`;
}

function truncateTitle(messages: Message[]): string {
  const first = messages.find((m: Message) => m.role === 'user');
  if (!first) return 'New Chat';
  return first.content.length > 38 ? first.content.slice(0, 38) + '…' : first.content;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function ChatAssistant({ model }: Props) {
  const [sessions, setSessions]           = useState<ChatSession[]>([]);
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [input, setInput]                 = useState('');
  const [isGenerating, setIsGenerating]   = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef(false);

  const activeSession = sessions.find((s: ChatSession) => s.id === activeId) ?? null;
  const messages = activeSession?.messages ?? [];

  // Load sessions on first render
  useEffect(() => {
    loadSessionsFromStorage().then(loaded => {
      setSessions(loaded);
      const savedActiveId = localStorage.getItem(ACTIVE_KEY);
      if (savedActiveId && loaded.find((s: ChatSession) => s.id === savedActiveId)) {
        setActiveId(savedActiveId);
      } else if (loaded.length > 0) {
        setActiveId(loaded[0].id);
      }
      setIsLoadingHistory(false);
    });
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Remember active session
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  }, [activeId]);

  const createNewSession = useCallback((): ChatSession => ({
    id: Date.now().toString(),
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }), []);

  const startNewChat = () => {
    const s = createNewSession();
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
    setInput('');
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSessionFromStorage(id);
    setSessions(prev => prev.filter((s: ChatSession) => s.id !== id));
    if (activeId === id) {
      const remaining = sessions.filter((s: ChatSession) => s.id !== id);
      setActiveId(remaining[0]?.id ?? null);
    }
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || model.status !== 'ready' || isGenerating) return;

    setInput('');
    abortRef.current = false;

    // Create session if none exists
    let sessionId = activeId;
    if (!sessionId || !sessions.find((s: ChatSession) => s.id === sessionId)) {
      const s = createNewSession();
      setSessions(prev => [s, ...prev]);
      setActiveId(s.id);
      sessionId = s.id;
    }

    const userMsg: Message = {
      role: 'user',
      content: msg,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };
    const aiId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      role: 'ai',
      content: '',
      id: aiId,
      timestamp: Date.now(),
    };

    // Grab current messages BEFORE state update (for building prompt)
    const currentMsgs = sessions.find((s: ChatSession) => s.id === sessionId)?.messages ?? [];

    // Add both messages to state
    setSessions(prev => prev.map((s: ChatSession) =>
      s.id === sessionId
        ? {
            ...s,
            messages: [...s.messages, userMsg, aiMsg],
            title: truncateTitle([...s.messages, userMsg]),
            updatedAt: Date.now(),
          }
        : s
    ));

    setIsGenerating(true);
    try {
      let out = '';
      const prompt = buildChatPrompt([...currentMsgs, userMsg], msg);

      for await (const tok of model.generate(prompt, { maxTokens: 500, temperature: 0.75 })) {
        if (abortRef.current) break;
        out += tok;
        setSessions(prev => prev.map((s: ChatSession) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m: Message) =>
                  m.id === aiId ? { ...m, content: out } : m
                ),
                updatedAt: Date.now(),
              }
            : s
        ));
      }

      // Save completed session to storage (localStorage + Supabase)
      setSessions(prev => {
        const updated = prev.find((s: ChatSession) => s.id === sessionId);
        if (updated) saveSessionToStorage(updated);
        return prev;
      });

    } catch {
      setSessions(prev => prev.map((s: ChatSession) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m: Message) =>
                m.id === aiId
                  ? { ...m, content: 'Sorry, I encountered an error. Please try again.' }
                  : m
              ),
            }
          : s
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="chat-layout">

      {/* ── Sidebar ── */}
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

            {/* Supabase status badge */}
            <div style={{
              margin: '8px 8px 4px',
              padding: '6px 10px',
              borderRadius: 8,
              background: SUPABASE_READY ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${SUPABASE_READY ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
              fontSize: 11,
              color: SUPABASE_READY ? '#10B981' : '#F59E0B',
              fontFamily: 'var(--font-mono)',
            }}>
              {SUPABASE_READY ? '☁️ Cloud sync ON' : '💾 Local storage only'}
            </div>

            {isLoadingHistory ? (
              <div className="session-empty">Loading history…</div>
            ) : sessions.length === 0 ? (
              <div className="session-empty">No chats yet.<br />Start a new conversation!</div>
            ) : (
              sessions.map((s: ChatSession) => (
                <div
                  key={s.id}
                  className={`session-item ${s.id === activeId ? 'active' : ''}`}
                  onClick={() => setActiveId(s.id)}
                >
                  <div className="session-icon">💬</div>
                  <div className="session-info">
                    <div className="session-title">{s.title}</div>
                    <div className="session-meta">
                      {s.messages.length} msgs · {formatTime(s.updatedAt)}
                    </div>
                  </div>
                  <button
                    className="session-delete"
                    onClick={(e) => deleteSession(s.id, e)}
                  >✕</button>
                </div>
              ))
            )}
          </div>
        )}
      </aside>

      {/* ── Main Chat Area ── */}
      <div className="chat-main">

        {/* Empty state with starter prompts */}
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">🤖</div>
            <h3 className="chat-empty-title">What can I help with?</h3>
            <p className="chat-empty-sub">
              All processing happens on your device. Nothing is sent to the cloud.
            </p>
            <div className="starters-grid">
              {STARTERS.map((s: string) => (
                <button
                  key={s}
                  className="starter-btn"
                  onClick={() => send(s)}
                  disabled={model.status !== 'ready'}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="chat-messages-area">
            {messages.map((m: Message, i: number) => (
              <div key={m.id} className={`chat-bubble-row ${m.role}`}>
                <div className="bubble-avatar">
                  {m.role === 'user' ? '🧑' : '🤖'}
                </div>
                <div className="bubble-content">
                  <div className={`bubble ${m.role}`}>
                    {m.content || (
                      isGenerating && i === messages.length - 1
                        ? <span className="typing-cursor" />
                        : '…'
                    )}
                    {m.content && isGenerating && i === messages.length - 1 && (
                      <span className="typing-cursor" />
                    )}
                  </div>
                  <div className="bubble-time">{formatTime(m.timestamp)}</div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input bar */}
        <div className="chat-input-bar">
          <div className="chat-input-wrap">
            <textarea
              rows={2}
              placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={isGenerating}
            />
            <div className="chat-input-actions">
              {isGenerating
                ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { abortRef.current = true; }}
                  >⏹ Stop</button>
                ) : (
                  <button
                    className="btn btn-primary send-btn"
                    onClick={() => send()}
                    disabled={model.status !== 'ready' || !input.trim()}
                  >↑</button>
                )
              }
            </div>
          </div>
          <div className="chat-input-hint">
            🔒 Processed locally ·{' '}
            {SUPABASE_READY ? '☁️ synced to cloud · ' : ''}{sessions.length} session{sessions.length !== 1 ? 's' : ''} saved
          </div>
        </div>

      </div>
    </div>
  );
}