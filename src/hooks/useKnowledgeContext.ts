/**
 * useKnowledgeContext — shared brain state
 *
 * Stores PDF text + notes text so chat can use BOTH as context.
 * Import and use in App.tsx, pass down to PDFWorkspace + SmartNotes.
 */
import { useState, useCallback } from 'react';

export interface KnowledgeContext {
  pdfText:   string;
  pdfName:   string;
  notesText: string;
  setPdfContext:   (text: string, name: string) => void;
  setNotesContext: (text: string) => void;
  clearPdf:        () => void;
  hasContext:      boolean;
  contextSummary:  string; // short description of what's loaded
}

export function useKnowledgeContext(): KnowledgeContext {
  const [pdfText,   setPdfText]   = useState('');
  const [pdfName,   setPdfName]   = useState('');
  const [notesText, setNotesText] = useState('');

  const setPdfContext = useCallback((text: string, name: string) => {
    setPdfText(text); setPdfName(name);
  }, []);

  const setNotesContext = useCallback((text: string) => {
    setNotesText(text);
  }, []);

  const clearPdf = useCallback(() => {
    setPdfText(''); setPdfName('');
  }, []);

  const hasContext = pdfText.length > 0 || notesText.length > 0;

  const parts: string[] = [];
  if (pdfName)    parts.push(`PDF: ${pdfName}`);
  if (notesText)  parts.push('Brain Notes');
  const contextSummary = parts.join(' + ') || 'No documents loaded';

  return { pdfText, pdfName, notesText, setPdfContext, setNotesContext, clearPdf, hasContext, contextSummary };
}

/**
 * Build a context-aware prompt using PDF + notes
 */
export function buildKnowledgePrompt(
  pdfText: string,
  notesText: string,
  history: { role: string; content: string }[],
  question: string
): string {
  const ctx = history.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Brain'}: ${m.content}`).join('\n');

  const sources: string[] = [];
  if (pdfText)   sources.push(`=== UPLOADED DOCUMENT ===\n${pdfText.slice(0, 2800)}`);
  if (notesText) sources.push(`=== BRAIN NOTES ===\n${notesText.slice(0, 800)}`);

  const knowledge = sources.join('\n\n');

  return `You are PrivateBrain, a private AI research assistant. You ONLY answer using the knowledge sources provided below. If the answer is not in the sources, say "I don't have that information in the loaded documents."

${knowledge}

${ctx ? `Conversation so far:\n${ctx}\n` : ''}
User: ${question}
Brain:`;
}