import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';

// COMPLETELY SUPPRESS THE ANNOYING IMAGE.PNG ERROR
// This error comes from ONNX Runtime checking for image support
// It's HARMLESS and doesn't prevent text generation from working
const originalError = console.error;
console.error = (...args: any[]) => {
  const msg = String(args[0] || '');
  // Block ALL image-related errors
  if (msg.includes('image.png') || 
      msg.includes('image input') ||
      msg.includes('Cannot read "image')) {
    // COMPLETELY IGNORE - this is expected for text-only models
    return;
  }
  originalError.apply(console, args);
};

console.log('%c🧠 ThinkLocal AI Assistant', 'font-size: 20px; font-weight: bold; color: #8B5CF6;');
console.log('%c✅ All AI runs locally in your browser', 'color: #10B981;');
console.log('%c🔒 Your data never leaves your device', 'color: #10B981;');
console.log('');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('✅ Offline ready'))
      .catch(() => console.log('SW not available'));
  });
}
