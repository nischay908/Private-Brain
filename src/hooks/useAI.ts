/**
 * useAI — shared AI logic for all 3 tools
 *
 * Single place for all prompt templates and the
 * streaming generate helper. Notes, ResearchAnalyzer,
 * and ChatAssistant all import from here so there's
 * zero duplication.
 */

import { useCallback, useRef } from 'react';
import type { ModelState } from './useModelLoader';

// ── Prompt builders ──────────────────────────────────────
export function buildSummaryPrompt(text: string): string {
  return `You are a research assistant. Summarize the following content clearly and concisely in 3-5 sentences. Focus on the most important findings and key ideas.\n\n${text.slice(0, 3500)}`;
}

export function buildQAPrompt(text: string, question: string): string {
  return `You are a research assistant. Answer the following question using only the information provided in the document below. Be specific and cite relevant parts.\n\nQuestion: ${question}\n\nDocument:\n${text.slice(0, 3500)}`;
}

export function buildKeyPointsPrompt(text: string): string {
  return `You are a research assistant. Extract the 5 most important key points from the following document as a numbered list. Be concise and precise.\n\n${text.slice(0, 3500)}`;
}

export function buildChatPrompt(history: { role: string; content: string }[], message: string): string {
  const ctx = history
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Researcher' : 'Assistant'}: ${m.content}`)
    .join('\n');
  return `You are PrivateBrain, a private AI research assistant running entirely in the user's browser. Help the researcher think through ideas, analyze information, and answer questions clearly and accurately. Never mention sending data anywhere — everything runs locally.\n\n${ctx}\nResearcher: ${message}\nAssistant:`;
}

export function buildNoteSummaryPrompt(text: string): string {
  return `Summarize these research notes in 2-3 clear sentences, capturing the core ideas:\n\n${text}`;
}

export function buildNoteKeyPointsPrompt(text: string): string {
  return `Extract the 3-5 key points from these research notes as a numbered list:\n\n${text}`;
}

export function buildNoteTitlePrompt(text: string): string {
  return `Suggest 3 short, descriptive titles for these research notes. Return only the titles, one per line, no numbering:\n\n${text}`;
}

// ── Streaming helper ─────────────────────────────────────
export function useStreamingAI(model: ModelState) {
  const bufferRef = useRef('');
  const rafRef    = useRef<number>(0);
  const abortRef  = useRef(false);

  const run = useCallback(async (
    prompt: string,
    opts: { maxTokens?: number; temperature?: number },
    onToken: (text: string) => void,
    onDone?: (fullText: string) => void,
  ) => {
    bufferRef.current = '';
    abortRef.current  = false;
    cancelAnimationFrame(rafRef.current);

    try {
      for await (const tok of model.generate(prompt, opts)) {
        if (abortRef.current) break;
        bufferRef.current += tok;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => onToken(bufferRef.current));
      }
      cancelAnimationFrame(rafRef.current);
      onToken(bufferRef.current);
      onDone?.(bufferRef.current);
    } catch {
      onToken('⚠️ Something went wrong. Please try again.');
    }
  }, [model]);

  const abort = useCallback(() => { abortRef.current = true; }, []);

  return { run, abort };
}