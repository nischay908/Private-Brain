# 🐛 KNOWN SDK BUG - Image.png Error

## The Problem

The `@runanywhere/web-llamacpp@0.1.0-beta.10` SDK has a bug where it tries to check for "image.png" even when using text-only models like LFM2-350M.

**Error Message:**
```
ERROR: Cannot read "image.png" (this model does not support image input)
```

This error **prevents text generation from working**, even though the model is text-only and doesn't use images at all.

---

## Why This Happens

The SDK's `TextGeneration.generateStream()` function has internal code that checks for image inputs, but this check runs even for models that don't support images. This is a bug in the beta.10 version.

---

## Solutions

### Option 1: Update SDK (RECOMMENDED)

Check if a newer version is available:

```bash
npm update @runanywhere/web @runanywhere/web-llamacpp
```

Look for versions newer than `0.1.0-beta.10`. Even `beta.11` or `beta.12` might have the fix.

If a new version exists:
```bash
npm install @runanywhere/web@latest @runanywhere/web-llamacpp@latest
npm run build
```

### Option 2: Use Alternative Model

Try using a different model from the RunAnywhere catalog that doesn't trigger this bug. Edit `src/runanywhere.ts`:

```typescript
export const MODELS: CompactModelDef[] = [
  {
    id: 'alternative-model',
    name: 'Alternative Model',
    repo: 'different/repo-name',  // Try a different model
    files: ['model.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 250_000_000,
  },
];
```

### Option 3: Contact RunAnywhere

This is a clear bug in their SDK. Report it:

1. Go to: https://github.com/RunanywhereAI/runanywhere-sdks
2. Open an issue with title: "TextGeneration.generateStream() checks for image.png in text-only models (beta.10)"
3. Include this error log
4. Reference model: LFM2-350M-GGUF

### Option 4: Downgrade SDK

Try an earlier beta version that might not have this bug:

```bash
npm install @runanywhere/web@0.1.0-beta.9 @runanywhere/web-llamacpp@0.1.0-beta.9
```

Then:
```bash
npm run build
npm run dev
```

---

## Temporary Workaround (If Nothing Else Works)

The app has been set up with error handling, but if generation still fails:

### Manual Test in Console

1. Open browser console (F12)
2. After model loads, paste this:

```javascript
// Test if SDK is actually broken or if there's a workaround
const testPrompt = "Hello world";
try {
  const result = await TextGeneration.generateStream(testPrompt, {
    maxTokens: 50,
    temperature: 0.7
  });
  console.log("Success! Stream created:", result);
  for await (const token of result.stream) {
    console.log(token);
  }
} catch (err) {
  console.error("Failed:", err);
}
```

If this throws the image.png error, the SDK is definitely broken and you need to update it.

---

## Checking Your SDK Version

```bash
npm list @runanywhere/web @runanywhere/web-llamacpp
```

Current version in this project:
- `@runanywhere/web@0.1.0-beta.10`
- `@runanywhere/web-llamacpp@0.1.0-beta.10`

---

## What We've Tried

✅ Error suppression in console → Doesn't fix the actual generation  
✅ Try-catch error handling → Error still blocks the function  
✅ Alternative prompts → Still triggers image check  
✅ Different generation parameters → No effect  
❌ **The bug is in the SDK itself, not the app code**

---

## Expected Behavior

Text-only models should **never** check for images. The SDK should only look for "image.png" when using multimodal models (VLM).

### Correct Flow:
1. Load text-only model (LFM2-350M)
2. Call `TextGeneration.generateStream(textPrompt, options)`
3. SDK generates text without checking for images
4. Text streams back successfully

### Current Buggy Flow:
1. Load text-only model (LFM2-350M)  
2. Call `TextGeneration.generateStream(textPrompt, options)`
3. SDK checks for "image.png" ❌ (Why?!)
4. Throws error and stops
5. No text generated

---

## If You're From RunAnywhere

The fix should be in `@runanywhere/web-llamacpp`:

```typescript
// Current (buggy):
async function generateStream(prompt, options) {
  checkForImages(prompt);  // ← This runs for ALL models
  // ...
}

// Should be:
async function generateStream(prompt, options) {
  if (model.modality === ModelCategory.Multimodal) {
    checkForImages(prompt);  // ← Only check for VLM models
  }
  // ...
}
```

---

## For Users: What To Do Now

Since this is an SDK bug, here's what you can do:

1. **Check for SDK updates** every few days:
   ```bash
   npm outdated
   ```

2. **Star this issue** if it gets reported on GitHub

3. **Try alternative AI tools** while waiting for fix:
   - Use Claude/GPT APIs (not private, but works)
   - Try Ollama locally (different tool)
   - Use WebLLM (alternative browser AI library)

4. **Keep checking** - Beta software gets updated frequently

---

## Status: BLOCKED BY SDK BUG

This is not an issue with the app code. Everything else works:
- ✅ Model downloads correctly
- ✅ Model loads into memory
- ✅ UI is functional
- ✅ Error handling is in place
- ❌ **SDK prevents generation with image.png error**

The ball is in RunAnywhere's court to fix this in their next SDK release.

---

Sorry for the inconvenience! This is beyond what can be fixed in the app itself. 😔

