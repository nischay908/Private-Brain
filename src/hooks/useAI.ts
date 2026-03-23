import { useCallback, useRef } from 'react';
import type { ModelState } from './useModelLoader';

// ── Prompt builders ───────────────────────────────────────────

export function buildSummaryPrompt(text: string): string {
  return `Summarize in 2-3 sentences only:\n\n${text.slice(0, 1500)}`;
}

export function buildKeyPointsPrompt(text: string): string {
  return `List 3 key points as numbered list, one sentence each:\n\n${text.slice(0, 1500)}`;
}

export function buildQAPrompt(text: string, question: string): string {
  return `Answer briefly using only this document.\n\nQuestion: ${question}\n\nDocument:\n${text.slice(0, 1500)}`;
}

export function buildNoteSummaryPrompt(text: string): string {
  return `Summarize these notes in 2-3 clear sentences, capturing the core ideas:\n\n${text}`;
}

export function buildNoteKeyPointsPrompt(text: string): string {
  return `Extract the 3-5 key points from these notes as a numbered list:\n\n${text}`;
}

export function buildNoteTitlePrompt(text: string): string {
  return `Suggest 3 short, descriptive titles for these notes. Return only the titles, one per line, no numbering:\n\n${text}`;
}

// ── ENHANCED: context-aware chat prompt ──────────────────────
// Chunks large PDFs and restricts answers strictly to sources.
export function buildPrivateBrainPrompt(
  pdfText: string,
  notesText: string,
  history: { role: string; content: string }[],
  question: string
): string {
  // Use more of the PDF — 5000 chars instead of 2600
  const PDF_LIMIT   = 1500;
  const NOTES_LIMIT = 600;

  const sources: string[] = [];

  if (pdfText.trim()) {
    const chunk = pdfText.slice(0, PDF_LIMIT);
    const truncated = pdfText.length > PDF_LIMIT;
    sources.push(
      `=== UPLOADED DOCUMENT ===\n${chunk}${truncated ? '\n[...document continues — showing first portion]' : ''}`
    );
  }

  if (notesText.trim()) {
    sources.push(`=== YOUR BRAIN NOTES ===\n${notesText.slice(0, NOTES_LIMIT)}`);
  }

  if (sources.length === 0) {
    return `You are PrivateBrain. No documents are loaded. Tell the user to upload a PDF or write notes first, then you can answer questions about them.\n\nUser: ${question}\nBrain:`;
  }

  const ctx = history
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'User' : 'Brain'}: ${m.content}`)
    .join('\n');

  return `You are PrivateBrain, a private AI research assistant. You have been given the user's private documents below. Your job is to answer questions STRICTLY using only these documents.

RULES:
1. Only answer from the sources below — never use outside knowledge.
2. If the answer is not in the sources, say exactly: "I don't see that in your loaded documents."
3. Be structured: use short paragraphs or numbered points when listing multiple things.
4. Be specific — reference the actual content from the documents, not vague summaries.
5. Keep answers concise and relevant.

${sources.join('\n\n')}

${ctx ? `Previous conversation:\n${ctx}\n` : ''}User: ${question}
Brain:`;
}

// ── Streaming helper ──────────────────────────────────────────
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