import {
  RunAnywhere,
  SDKEnvironment,
  ModelManager,
  ModelCategory,
  LLMFramework,
  EventBus,
  type CompactModelDef,
} from '@runanywhere/web';

// @ts-ignore — LlamaCPP exists at runtime even if TS can't find it in beta.10 types
import { LlamaCPP } from '@runanywhere/web-llamacpp';

export const MODELS: CompactModelDef[] = [
  {
    id: 'lfm2-350m-q4_k_m',
    name: 'LFM2 350M',
    repo: 'LiquidAI/LFM2-350M-GGUF',
    files: ['LFM2-350M-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 250_000_000,
  },
];

export const DEFAULT_MODEL_ID = 'lfm2-350m-q4_k_m';

let _initPromise: Promise<void> | null = null;

export async function initSDK(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await RunAnywhere.initialize({
      environment: SDKEnvironment.Development,
      debug: true,
    });
    // @ts-ignore
    await LlamaCPP.register();
    RunAnywhere.registerModels(MODELS);
  })();
  return _initPromise;
}

export { RunAnywhere, ModelManager, ModelCategory, EventBus };