import { useState, useEffect, useRef } from 'react';
import { ModelManager, ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { initSDK } from '../runanywhere';

export type ModelStatus = 'idle' | 'initializing' | 'downloading' | 'loading' | 'ready' | 'error';

export interface ModelState {
  status: ModelStatus;
  progress: number;
  progressLabel: string;
  error?: string;
  generate: (prompt: string, opts?: { maxTokens?: number; temperature?: number }) => AsyncGenerator<string>;
  generateFull: (prompt: string, opts?: { maxTokens?: number; temperature?: number }) => Promise<string>;
}

export function useModelLoader(): ModelState {
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | undefined>();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    load();
  }, []);

  async function load() {
    try {
      setStatus('initializing');
      setProgressLabel('Initializing RunAnywhere SDK…');
      await initSDK();

      const models = ModelManager.getModels().filter(
        (m) => m.modality === ModelCategory.Language
      );
      const model = models[0];
      if (!model) throw new Error('No language model found in catalog');

      // Download if needed
      if (model.status !== 'downloaded' && model.status !== 'loaded') {
        setStatus('downloading');
        setProgressLabel('Downloading model… (first time only, ~250MB)');
        await ModelManager.downloadModel(model.id);
        setProgress(100);
      }

      // Load into memory
      setStatus('loading');
      setProgressLabel('Loading model into memory…');
      await ModelManager.loadModel(model.id);

      setStatus('ready');
      setProgressLabel('Model ready!');
    } catch (e: any) {
      console.error('Model load error:', e);
      setStatus('error');
      setError(e?.message ?? 'Unknown error loading model');
    }
  }

  async function* generate(
    prompt: string,
    opts: { maxTokens?: number; temperature?: number } = {}
  ): AsyncGenerator<string> {
    if (status !== 'ready') return;
    const { stream } = await TextGeneration.generateStream(prompt, {
      maxTokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.7,
    });
    for await (const token of stream) {
      yield token;
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

  return { status, progress, progressLabel, error, generate, generateFull };
}