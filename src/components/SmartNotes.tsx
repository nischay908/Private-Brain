import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ModelState } from '../hooks/useModelLoader';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  aiSummary?: string;
}

interface Props { model: ModelState; }

// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────
const LS_KEY = 'pb_smart_notes';

function loadNotes(): Note[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

function saveNotes(notes: Note[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(notes)); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function mkId() { return `note_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function excerpt(text: string, len = 60): string {
  const clean = text.replace(/\n+/g, ' ').trim();
  return clean.length > len ? clean.slice(0, len) + '…' : clean;
}

// ─────────────────────────────────────────────
// AI ACTIONS
// ─────────────────────────────────────────────
type AiAction = 'summarize' | 'keypoints' | 'title' | 'tags' | 'improve';

const AI_ACTIONS: { id: AiAction; icon: string; label: string; prompt: (t: string) => string }[] = [
  {
    id: 'summarize',
    icon: '📋',
    label: 'Summarize',
    prompt: t => `Summarize the following note in 2-3 clear sentences:\n\n${t}`,
  },
  {
    id: 'keypoints',
    icon: '🎯',
    label: 'Key Points',
    prompt: t => `Extract 3-5 key points from this note as a numbered list:\n\n${t}`,
  },
  {
    id: 'title',
    icon: '✏️',
    label: 'Suggest Title',
    prompt: t => `Suggest 3 short, catchy titles for this note. Return only the titles, one per line:\n\n${t}`,
  },
  {
    id: 'tags',
    icon: '🏷️',
    label: 'Auto Tags',
    prompt: t => `Generate 4-6 relevant single-word or short tags for this note. Return only the tags separated by commas, no extra text:\n\n${t}`,
  },
  {
    id: 'improve',
    icon: '✨',
    label: 'Improve',
    prompt: t => `Rewrite and improve the following note to be clearer, better structured, and more concise:\n\n${t}`,
  },
];

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function SmartNotes({ model }: Props) {
  const [notes, setNotes]               = useState<Note[]>(() => loadNotes());
  const [activeId, setActiveId]         = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiOutput, setAiOutput]         = useState('');
  const [activeAction, setActiveAction] = useState<AiAction | null>(null);
  const [toast, setToast]               = useState('');
  const abortRef  = useRef(false);
  const bufferRef = useRef('');
  const rafRef    = useRef<number>(0);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const active = notes.find(n => n.id === activeId) ?? null;

  // Persist on every change
  useEffect(() => { saveNotes(notes); }, [notes]);

  // Auto-focus editor when switching notes
  useEffect(() => {
    if (activeId) setTimeout(() => editorRef.current?.focus(), 60);
  }, [activeId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 2200);
  }, []);

  // ── CRUD ──
  const createNote = () => {
    const note: Note = {
      id: mkId(), title: 'Untitled Note', content: '',
      tags: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    setNotes(prev => [note, ...prev]);
    setActiveId(note.id);
    setAiOutput('');
  };

  const updateNote = (id: string, patch: Partial<Note>) => {
    setNotes(prev => prev.map(n =>
      n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
    ));
  };

  const deleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeId === id) {
      const rem = notes.filter(n => n.id !== id);
      setActiveId(rem[0]?.id ?? null);
    }
    showToast('Note deleted');
  };

  const duplicateNote = () => {
    if (!active) return;
    const copy: Note = { ...active, id: mkId(), title: active.title + ' (copy)', createdAt: Date.now(), updatedAt: Date.now() };
    setNotes(prev => [copy, ...prev]);
    setActiveId(copy.id);
    showToast('Note duplicated');
  };

  // ── AI ACTION ──
  const runAi = async (action: AiAction) => {
    if (!active?.content.trim() || model.status !== 'ready' || isGenerating) return;
    setIsGenerating(true);
    setActiveAction(action);
    setAiOutput('');
    abortRef.current  = false;
    bufferRef.current = '';
    cancelAnimationFrame(rafRef.current);

    const cfg = AI_ACTIONS.find(a => a.id === action)!;
    try {
      for await (const tok of model.generate(cfg.prompt(active.content), { maxTokens: 120, temperature: 0.3 })) {
        if (abortRef.current) break;
        bufferRef.current += tok;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => setAiOutput(bufferRef.current));
      }
      cancelAnimationFrame(rafRef.current);
      setAiOutput(bufferRef.current);

      // Auto-apply: tags → parse & save, summary → save to note
      if (action === 'tags' && bufferRef.current) {
        const tags = bufferRef.current.split(',').map(t => t.trim().replace(/^#+/, '')).filter(Boolean).slice(0, 6);
        updateNote(active.id, { tags });
        showToast('Tags applied to note ✓');
      }
      if (action === 'summarize' && bufferRef.current) {
        updateNote(active.id, { aiSummary: bufferRef.current });
      }
    } catch {
      setAiOutput('⚠️ AI action failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyToNote = () => {
    if (!active || !aiOutput) return;
    if (activeAction === 'improve') {
      updateNote(active.id, { content: aiOutput });
      setAiOutput('');
      showToast('Note updated with improved version ✓');
    } else if (activeAction === 'title') {
      const firstLine = aiOutput.split('\n')[0].replace(/^\d+\.\s*/, '').trim();
      updateNote(active.id, { title: firstLine });
      setAiOutput('');
      showToast('Title applied ✓');
    }
  };

  // ── FILTERED NOTES ──
  const filtered = notes.filter(n =>
    !search || n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const wordCount = active?.content.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const charCount = active?.content.length ?? 0;

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="notes-layout">

      {/* ══ NOTES SIDEBAR ══ */}
      <aside className="notes-sidebar">
        <div className="notes-sidebar-header">
          <span className="notes-sidebar-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Notes
          </span>
          <button className="notes-new-btn" onClick={createNote} title="New Note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New
          </button>
        </div>

        {/* Search */}
        <div className="notes-search-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="notes-search"
            placeholder="Search notes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="notes-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>

        {/* Note list */}
        <div className="notes-list">
          {filtered.length === 0 && (
            <div className="notes-empty">
              {notes.length === 0
                ? <><span style={{ fontSize: 28 }}>📝</span><br />No notes yet.<br />Click New to start!</>
                : 'No notes match your search.'
              }
            </div>
          )}
          {filtered.map(n => (
            <div
              key={n.id}
              className={`note-item ${n.id === activeId ? 'active' : ''}`}
              onClick={() => { setActiveId(n.id); setAiOutput(''); }}
            >
              <div className="note-item-header">
                <span className="note-item-title">{n.title}</span>
                <button className="note-item-delete" onClick={e => deleteNote(n.id, e)} title="Delete">✕</button>
              </div>
              <div className="note-item-excerpt">{excerpt(n.content) || 'Empty note…'}</div>
              <div className="note-item-meta">
                {fmtDate(n.updatedAt)}
                {n.tags.length > 0 && <span className="note-item-tag">{n.tags[0]}</span>}
                {n.tags.length > 1 && <span className="note-item-tag">+{n.tags.length - 1}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="notes-sidebar-footer">
          {notes.length} note{notes.length !== 1 ? 's' : ''} · Saved locally
        </div>
      </aside>

      {/* ══ EDITOR AREA ══ */}
      <div className="notes-editor-area">
        {!active ? (
          <div className="notes-placeholder">
            <div className="notes-placeholder-icon">📝</div>
            <h3>Select a note or create one</h3>
            <p>Your notes are saved locally and never leave your device.</p>
            <button className="btn btn-primary" onClick={createNote} style={{ marginTop: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Note
            </button>
          </div>
        ) : (
          <>
            {/* Editor header */}
            <div className="notes-editor-header">
              <input
                className="notes-title-input"
                value={active.title}
                placeholder="Note title…"
                onChange={e => updateNote(active.id, { title: e.target.value })}
              />
              <div className="notes-editor-actions">
                <span className="notes-stats">{wordCount}w · {charCount}c</span>
                <button className="btn btn-secondary btn-sm" onClick={duplicateNote} title="Duplicate">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy
                </button>
                <button className="btn btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(active.content); showToast('Copied to clipboard ✓'); }}>
                  📋 Export
                </button>
              </div>
            </div>

            {/* Tags row */}
            {active.tags.length > 0 && (
              <div className="notes-tags-row">
                {active.tags.map(tag => (
                  <span key={tag} className="note-tag">
                    #{tag}
                    <button onClick={() => updateNote(active.id, { tags: active.tags.filter(t => t !== tag) })}>✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* AI summary banner */}
            {active.aiSummary && (
              <div className="notes-summary-banner">
                <span className="notes-summary-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 8v4l3 3"/></svg>
                  AI Summary
                </span>
                <p>{active.aiSummary}</p>
                <button className="notes-summary-dismiss" onClick={() => updateNote(active.id, { aiSummary: undefined })}>✕</button>
              </div>
            )}

            {/* Text editor */}
            <textarea
              ref={editorRef}
              className="notes-editor"
              placeholder={`Start writing your note…\n\nTip: Use the AI tools below to summarize, extract key points, suggest titles, or improve your writing.`}
              value={active.content}
              onChange={e => updateNote(active.id, { content: e.target.value })}
            />

            {/* AI toolbar */}
            <div className="notes-ai-toolbar">
              <span className="notes-ai-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
                AI Actions
              </span>
              <div className="notes-ai-actions">
                {AI_ACTIONS.map(a => (
                  <button
                    key={a.id}
                    className={`notes-ai-btn ${activeAction === a.id && isGenerating ? 'active' : ''}`}
                    onClick={() => runAi(a.id)}
                    disabled={!active.content.trim() || model.status !== 'ready' || isGenerating}
                    title={a.label}
                  >
                    {activeAction === a.id && isGenerating
                      ? <span className="spinner" style={{ width: 12, height: 12 }} />
                      : a.icon
                    }
                    {a.label}
                  </button>
                ))}
                {isGenerating && (
                  <button className="notes-ai-btn stop" onClick={() => { abortRef.current = true; }}>
                    ⏹ Stop
                  </button>
                )}
              </div>
            </div>

            {/* AI output panel */}
            {(aiOutput || isGenerating) && (
              <div className="notes-ai-output">
                <div className="notes-ai-output-header">
                  <span>
                    {AI_ACTIONS.find(a => a.id === activeAction)?.icon}{' '}
                    {AI_ACTIONS.find(a => a.id === activeAction)?.label} Result
                    {isGenerating && <span className="notes-generating"> — generating…</span>}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(activeAction === 'improve' || activeAction === 'title') && aiOutput && !isGenerating && (
                      <button className="btn btn-primary btn-sm" onClick={applyToNote}>
                        ✓ Apply to Note
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(aiOutput); showToast('Copied ✓'); }}>
                      📋 Copy
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAiOutput(''); setActiveAction(null); }}>✕</button>
                  </div>
                </div>
                <div className="notes-ai-output-body">
                  {aiOutput}
                  {isGenerating && <span className="typing-cursor" />}
                </div>
              </div>
            )}

            <div className="notes-editor-footer">
              Last saved {fmtDate(active.updatedAt)} · 🔒 Local only
            </div>
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}