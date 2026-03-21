import { useState, useEffect, useRef } from 'react';
import * as webllm from '@mlc-ai/web-llm';

export type ModelStatus = 'idle' | 'initializing' | 'downloading' | 'loading' | 'ready' | 'error';

export interface ModelState {
  status: ModelStatus;
  progress: number;
  progressLabel: string;
  error?: string;
  generate: (prompt: string, opts?: { maxTokens?: number; temperature?: number }) => AsyncGenerator<string>;
  generateFull: (prompt: string, opts?: { maxTokens?: number; temperature?: number }) => Promise<string>;
}

// Use a small, fast model
const MODEL_NAME = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export function useModelLoader(): ModelState {
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | undefined>();
  const initialized = useRef(false);
  const isReady = useRef(false);
  const engineRef = useRef<webllm.MLCEngine | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    load();
  }, []);

  useEffect(() => {
    isReady.current = status === 'ready';
  }, [status]);

  async function load() {
    try {
      console.log('========================================');
      console.log('🚀 WEBLLM - NO ONNX, NO IMAGE ERRORS!');
      console.log('========================================');
      
      setStatus('initializing');
      setProgressLabel('Initializing WebLLM...');
      setProgress(5);

      const engine = await webllm.CreateMLCEngine(MODEL_NAME, {
        initProgressCallback: (report: webllm.InitProgressReport) => {
          console.log('📊 Progress:', report.text, report.progress);
          
          setStatus('downloading');
          const percent = Math.round(report.progress * 100);
          setProgress(percent);
          setProgressLabel(report.text);
        },
      });

      engineRef.current = engine;
      
      setStatus('ready');
      setProgress(100);
      setProgressLabel('✅ AI Ready - No errors!');
      isReady.current = true;
      
      console.log('========================================');
      console.log('✅✅✅ WEBLLM READY - WORKING! ✅✅✅');
      console.log('========================================');
      
    } catch (e: any) {
      console.error('❌ Load failed:', e);
      setStatus('error');
      setProgress(0);
      setError(`Failed to load: ${e?.message}`);
    }
  }

  async function* generate(
    prompt: string,
    opts: { maxTokens?: number; temperature?: number } = {}
  ): AsyncGenerator<string> {
    if (!isReady.current || !engineRef.current) {
      yield 'Model not ready yet...';
      return;
    }

    try {
      console.log('🚀 Generating with WebLLM...');
      
      const chunks = await engineRef.current.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 150,
        stream: true,
      });

      let totalGenerated = '';
      for await (const chunk of chunks) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          totalGenerated += content;
          yield content; // Yield each chunk immediately
        }
      }

      console.log('✅ Generation complete!', totalGenerated.length, 'chars');

    } catch (e: any) {
      console.error('❌ Generation error:', e);
      yield `Error: ${e?.message || 'Generation failed'}. Please try again.`;
    }
  }

  async function generateFull(
    prompt: string,
    opts: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    let out = '';
    for await (const tok of generate(prompt, opts)) {
      out += tok;
    }
    return out.trim();
  }

  return { status, progress, progressLabel, error, generate, generateFull };
}
