import { useState, useEffect, useRef } from 'react';
import { ModelManager, ModelCategory, EventBus } from '@runanywhere/web';
// @ts-ignore
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
  // Use a ref to track ready state — avoids stale closure bug
  const isReady = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    load();
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    isReady.current = status === 'ready';
  }, [status]);

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

      if (model.status !== 'downloaded' && model.status !== 'loaded') {
        setStatus('downloading');
        setProgressLabel('Downloading model… (first time only, ~250MB)');

        EventBus.shared.on('model.downloadProgress', (evt: any) => {
          const pct = Math.round((evt.progress ?? 0) * 100);
          setProgress(pct);
          setProgressLabel(`Downloading… ${pct}%`);
        });

        await ModelManager.downloadModel(model.id);
        setProgress(100);
      }

      setStatus('loading');
      setProgressLabel('Loading model into memory…');
      await ModelManager.loadModel(model.id);

      isReady.current = true;
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
    // Use ref instead of status state — avoids stale closure
    if (!isReady.current) {
      console.warn('Model not ready yet');
      return;
    }
    try {
      console.log('Starting generation for prompt:', prompt.slice(0, 50));
      const { stream } = await TextGeneration.generateStream(prompt, {
        maxTokens: opts.maxTokens ?? 300,
        temperature: opts.temperature ?? 0.7,
      });
      console.log('Stream obtained, reading tokens...');
      let tokenCount = 0;
      for await (const token of stream) {
        tokenCount++;
        yield token;
      }
      console.log('Generation complete, tokens:', tokenCount);
    } catch (e) {
      console.error('Generation error:', e);
      yield 'Error generating response. Please try again.';
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