import { useState, useRef, useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────
// Browser SpeechRecognition types
// ─────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

// Grab correct constructor across browsers
function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as (new () => SpeechRecognitionInstance) | null;
}

// ─────────────────────────────────────────────
// RETURN TYPE
// ─────────────────────────────────────────────
export interface VoiceInputState {
  isSupported: boolean;
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;       // live interim text
  error: string | null;
  start: () => void;
  stop: () => void;
  clear: () => void;
}

// ─────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────
export function useVoiceInput(onFinal: (text: string) => void): VoiceInputState {
  const [isListening, setIsListening]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript]     = useState('');
  const [error, setError]               = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const SpeechRec      = getSpeechRecognition();
  const isSupported    = SpeechRec !== null;

  // Cleanup on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  const start = useCallback(() => {
    if (!SpeechRec || isListening) return;
    setError(null);
    setTranscript('');

    const rec = new SpeechRec();
    rec.continuous     = false;  // single utterance per click
    rec.interimResults = true;
    rec.lang           = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
      setIsProcessing(false);
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      let final   = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      // Show interim in real-time
      setTranscript(final || interim);

      if (final) {
        setIsProcessing(true);
        onFinal(final.trim());
      }
    };

    rec.onerror = (e) => {
      const msg: Record<string, string> = {
        'not-allowed':     'Microphone access denied. Please allow microphone.',
        'no-speech':       'No speech detected. Try again.',
        'network':         'Network error. Voice works offline too — try again.',
        'audio-capture':   'No microphone found.',
        'service-not-allowed': 'Speech service not allowed.',
      };
      setError(msg[e.error] ?? `Error: ${e.error}`);
      setIsListening(false);
      setIsProcessing(false);
    };

    rec.onend = () => {
      setIsListening(false);
      setTimeout(() => setIsProcessing(false), 400);
    };

    recognitionRef.current = rec;
    try { rec.start(); } catch { setError('Failed to start microphone.'); }
  }, [SpeechRec, isListening, onFinal]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const clear = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return { isSupported, isListening, isProcessing, transcript, error, start, stop, clear };
}