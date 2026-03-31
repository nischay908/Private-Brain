/**
 * useHistory — persists PDF sessions + chat history in localStorage
 * Each session = { id, fileName, summary, keyPoints, messages, date }
 * Place at: src/hooks/useHistory.ts
 */
import { useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  fromKnowledge?: boolean;
}

export interface PDFSession {
  id: string;
  fileName: string;
  fileSize?: number;
  wordCount?: number;
  summary: string;
  keyPoints: string[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const LS_KEY = 'pb_pdf_sessions';
const MAX_SESSIONS = 20;

function load(): PDFSession[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(sessions: PDFSession[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch { /* storage full */ }
}

export function useHistory() {
  const [sessions, setSessions] = useState<PDFSession[]>(() => load());

  const createSession = useCallback((
    fileName: string,
    wordCount: number,
    summary: string,
    keyPoints: string[]
  ): string => {
    const id = `session_${Date.now()}`;
    const newSession: PDFSession = {
      id, fileName, wordCount, summary, keyPoints,
      messages: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    setSessions(prev => {
      const updated = [newSession, ...prev];
      save(updated);
      return updated;
    });
    return id;
  }, []);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    setSessions(prev => {
      const updated = prev.map(s =>
        s.id === sessionId
          ? { ...s, messages: [...s.messages, msg], updatedAt: Date.now() }
          : s
      );
      save(updated);
      return updated;
    });
  }, []);

  const updateSession = useCallback((sessionId: string, patch: Partial<PDFSession>) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === sessionId ? { ...s, ...patch, updatedAt: Date.now() } : s);
      save(updated);
      return updated;
    });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      save(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSessions([]);
    localStorage.removeItem(LS_KEY);
  }, []);

  const getSession = useCallback((sessionId: string) =>
    sessions.find(s => s.id === sessionId), [sessions]);

  return { sessions, createSession, addMessage, updateSession, deleteSession, clearAll, getSession };
}