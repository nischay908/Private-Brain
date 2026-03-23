import { useState, useEffect, useRef, useCallback } from 'react';
import * as webllm from '@mlc-ai/web-llm';

export type ModelStatus = 'idle' | 'initializing' | 'downloading' | 'loading' | 'ready' | 'error';

export interface ModelState {
  status: ModelStatus;
  progress: number;
  progressLabel: string;
  error?: string;
  offlineReady: boolean;
  generate: (prompt: string, opts?: { maxTokens?: number; temperature?: number }) => AsyncGenerator<string>;
  generateFull: (prompt: string, opts?: { maxTokens?: number; temperature?: number }) => Promise<string>;
  reload: () => void;
}

const MODEL_NAME = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const IDB_DB     = 'privatebrain-meta';
const IDB_STORE  = 'flags';
const IDB_KEY    = 'modelCached';

function openMeta(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function getFlag(key: string): Promise<boolean> {
  try {
    const db = await openMeta();
    return new Promise((res) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => res(!!req.result);
      req.onerror   = () => res(false);
    });
  } catch { return false; }
}

async function setFlag(key: string, value: boolean): Promise<void> {
  try {
    const db = await openMeta();
    return new Promise((res) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => res();
      tx.onerror    = () => res();
    });
  } catch { /* ignore */ }
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[SW] Registered');
  } catch (e) {
    console.warn('[SW] Registration failed', e);
  }
}

// ── Check if an error is a "disposed" / "not loaded" error ────
function isDisposedError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes('disposed') ||
    msg.includes('not loaded') ||
    msg.includes('mlcengine.reload') ||
    msg.includes('createmlcengine')
  );
}

export function useModelLoader(): ModelState {
  const [status,        setStatus]        = useState<ModelStatus>('idle');
  const [progress,      setProgress]      = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error,         setError]         = useState<string | undefined>();
  const [offlineReady,  setOfflineReady]  = useState(false);

  const initialized   = useRef(false);
  const isReady       = useRef(false);
  const engineRef     = useRef<webllm.MLCEngine | null>(null);
  const reloadingRef  = useRef(false);

  useEffect(() => { registerSW(); }, []);

  useEffect(() => {
    getFlag(IDB_KEY).then((cached) => { if (cached) setOfflineReady(true); });
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    load();
  }, []);

  useEffect(() => { isReady.current = status === 'ready'; }, [status]);

  async function load() {
    try {
      setStatus('initializing');
      setProgressLabel('Starting up your on-device brain…');
      setProgress(5);
      setError(undefined);
      reloadingRef.current = false;

      const engine = await webllm.CreateMLCEngine(MODEL_NAME, {
        initProgressCallback: (report: webllm.InitProgressReport) => {
          setStatus('downloading');
          const percent = Math.round(report.progress * 100);
          setProgress(percent);
          if (report.text.includes('Fetch') || report.text.includes('fetch')) {
            setProgressLabel(`Downloading model weights… ${percent}%`);
          } else if (report.text.includes('Load') || report.text.includes('load')) {
            setProgressLabel(`Loading into WebGPU… ${percent}%`);
          } else {
            setProgressLabel(report.text);
          }
        },
      });

      engineRef.current = engine;
      setStatus('ready');
      setProgress(100);
      setProgressLabel('Brain is ready!');
      isReady.current = true;

      await setFlag(IDB_KEY, true);
      setOfflineReady(true);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Model] Load failed:', msg);
      setStatus('error');
      setProgress(0);
      isReady.current = false;
      engineRef.current = null;
      setError(`Failed to load AI model: ${msg}`);
    }
  }

  // ── Auto-recover when the engine gets disposed ────────────────
  async function recoverAndRetry(
    prompt: string,
    opts: { maxTokens?: number; temperature?: number }
  ): Promise<AsyncGenerator<string>> {
    if (reloadingRef.current) {
      return (async function* () {
        yield '⏳ Model is reloading, please wait a moment and try again…';
      })();
    }

    console.warn('[Model] Engine disposed — reloading…');
    reloadingRef.current = true;
    engineRef.current = null;
    isReady.current = false;
    setStatus('initializing');
    setProgressLabel('Reloading model…');
    setProgress(5);

    await load();

    // After reload, try once more
    if (isReady.current && engineRef.current) {
      return generateInner(prompt, opts);
    }

    return (async function* () {
      yield '❌ Model failed to reload. Please refresh the page.';
    })();
  }

  async function* generateInner(
    prompt: string,
    opts: { maxTokens?: number; temperature?: number } = {}
  ): AsyncGenerator<string> {
    const chunks = await engineRef.current!.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: opts.temperature ?? 0.7,
      max_tokens:  opts.maxTokens  ?? 150,
      stream: true,
    });
    for await (const chunk of chunks) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  async function* generate(
    prompt: string,
    opts: { maxTokens?: number; temperature?: number } = {}
  ): AsyncGenerator<string> {
    // If model not ready at all, wait with a helpful message
    if (!isReady.current || !engineRef.current) {
      yield '⏳ AI model is still loading. Please wait for it to finish, then try again.';
      return;
    }

    try {
      yield* generateInner(prompt, opts);
    } catch (e: unknown) {
      if (isDisposedError(e)) {
        // Engine got disposed — auto-recover
        const recovery = await recoverAndRetry(prompt, opts);
        yield* recovery;
      } else {
        yield `Error: ${e instanceof Error ? e.message : 'Generation failed'}. Please try again.`;
      }
    }
  }

  async function generateFull(
    prompt: string,
    opts: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    let out = '';
    for await (const tok of generate(prompt, opts)) out += tok;
    return out.trim();
  }

  // Manual reload button support
  const reload = useCallback(() => {
    initialized.current = false;
    isReady.current = false;
    engineRef.current = null;
    load();
  }, []);

  return { status, progress, progressLabel, error, offlineReady, generate, generateFull, reload };
}