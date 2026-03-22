import React, { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────
// DEMO SCRIPT — hackathon presentation flow
// Each step highlights a feature with a sample
// prompt and a pre-written "AI response" that
// appears with a typewriter effect even without
// the model loaded — perfect for live demos
// ─────────────────────────────────────────────

interface DemoStep {
  id: string;
  tab: string;
  tabIcon: string;
  title: string;
  subtitle: string;
  prompt: string;
  response: string;
  highlight: string; // what to point out to judges
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 'chat',
    tab: 'AI Chat',
    tabIcon: '💬',
    title: 'Conversational AI Chat',
    subtitle: 'ChatGPT-like experience — 100% offline',
    prompt: 'Help me write a professional email to reschedule a meeting with a client.',
    response: `Subject: Request to Reschedule Our Meeting

Dear [Client Name],

I hope this message finds you well. I wanted to reach out regarding our scheduled meeting on [Date]. Due to an unexpected conflict, I would kindly like to request if we could reschedule to a time that works better for both of us.

I'm available on [Alternative Date 1] or [Alternative Date 2] — whichever suits your schedule. Please let me know your preference and I'll send a calendar invite right away.

Thank you for your understanding and flexibility.

Best regards,
[Your Name]`,
    highlight: '✓ Runs entirely on your device · No API key · Works offline',
  },
  {
    id: 'notes',
    tab: 'Smart Notes',
    tabIcon: '📝',
    title: 'AI-Powered Smart Notes',
    subtitle: 'Write → AI summarizes, tags, and improves',
    prompt: 'Meeting notes: Discussed Q4 product roadmap. Key decisions: launch mobile app by December, hire 2 engineers, cut legacy API by Jan. Budget approved $200k. Next steps: PM to create tickets, CTO to post job descriptions.',
    response: `📋 AI Summary:
The team finalized the Q4 product roadmap with three key decisions: launching the mobile app by December, hiring two engineers, and deprecating the legacy API in January. A $200,000 budget was approved to support these initiatives.

🎯 Key Points:
1. Mobile app launch deadline: December
2. Engineering hiring: 2 new positions
3. Legacy API deprecation: January
4. Budget approved: $200,000
5. Next: PM creates tickets, CTO posts job descriptions

🏷️ Auto-tags: product, roadmap, Q4, hiring, mobile, budget`,
    highlight: '✓ Notes persist in localStorage · AI extracts key points · Tags auto-applied',
  },
  {
    id: 'analyze',
    tab: 'Doc Analyzer',
    tabIcon: '📄',
    title: 'PDF & Document Analyzer',
    subtitle: 'Upload any PDF — AI analyzes without sending it anywhere',
    prompt: '[PDF uploaded: Annual_Report_2024.pdf — 42 pages]',
    response: `📋 Document Summary:
This annual report covers fiscal year 2024 performance across all business units. Revenue grew 23% YoY to $4.2B, driven primarily by cloud services (+41%) and international expansion (+18%). Operating margins improved to 28% from 24% the prior year.

🎯 Key Points:
1. Revenue: $4.2B (+23% YoY)
2. Cloud services: fastest-growing segment at +41%
3. International revenue now 34% of total
4. Headcount grew from 8,200 to 11,400 employees
5. R&D investment increased to $680M (+35%)

❓ Q&A Ready: Ask anything about this document...`,
    highlight: '✓ PDF text extracted in-browser · Never uploaded to any server · 100% private',
  },
  {
    id: 'code',
    tab: 'Code Helper',
    tabIcon: '💻',
    title: 'Code Explainer & Debugger',
    subtitle: 'Explain, find bugs, optimize — all on-device',
    prompt: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n-1) + fibonacci(n-2);
}`,
    response: `🧠 Explanation:
This function calculates the nth Fibonacci number using recursion. It returns n directly for base cases (0 or 1), then adds the two preceding Fibonacci numbers for any larger input.

🐛 Bug / Performance Issue:
This naive recursive implementation has exponential time complexity O(2ⁿ) — calling fibonacci(40) makes over 300 million recursive calls!

⚡ Optimized Version:
function fibonacci(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n <= 1) return n;
  memo[n] = fibonacci(n-1, memo) + fibonacci(n-2, memo);
  return memo[n];
}
// Now O(n) time and space — 1 million× faster for large n`,
    highlight: '✓ On-device code analysis · No code sent to external APIs · Secure for proprietary code',
  },
  {
    id: 'write',
    tab: 'Writing Studio',
    tabIcon: '✍️',
    title: 'Writing Studio',
    subtitle: '8 templates · 6 tones · Instant drafts',
    prompt: 'Benefits of AI running locally on devices instead of in the cloud',
    response: `# Why Local AI is the Future of Private Computing

In an era where data privacy is paramount, local AI represents a fundamental shift in how we think about artificial intelligence. Unlike cloud-based AI systems that transmit your queries to remote servers, local AI models run directly on your device — keeping your data exactly where it belongs: with you.

**The Privacy Advantage**
When AI runs locally, your conversations, documents, and personal data never leave your machine. There's no server log, no training data collection, and no potential for data breaches affecting your information.

**Speed Without Latency**
Local inference eliminates network round-trips entirely. Responses begin generating within milliseconds, creating a fluid, native-app-like experience that cloud AI simply cannot match.

**Offline Reliability**
Critical workflows shouldn't depend on internet connectivity...`,
    highlight: '✓ Professional email, blog post, resume bullets, study notes · All generated locally',
  },
];

// ─────────────────────────────────────────────
// TYPEWRITER HOOK
// ─────────────────────────────────────────────
function useTypewriter(text: string, speed = 12, active = false) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone]           = useState(false);
  const idxRef = useRef(0);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (!active) { setDisplayed(''); setDone(false); idxRef.current = 0; return; }
    setDisplayed('');
    setDone(false);
    idxRef.current = 0;

    const tick = () => {
      if (idxRef.current < text.length) {
        // type 2-3 chars per tick for faster feel
        const chunk = text.slice(idxRef.current, idxRef.current + 3);
        setDisplayed(prev => prev + chunk);
        idxRef.current += 3;
        timerRef.current = window.setTimeout(tick, speed) as unknown as number;
      } else {
        setDone(true);
      }
    };
    timerRef.current = window.setTimeout(tick, 300) as unknown as number; // small delay before start
    return () => window.clearTimeout(timerRef.current);
  }, [text, speed, active]);

  return { displayed, done };
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function DemoMode({ onClose, onNavigate }: {
  onClose: () => void;
  onNavigate: (tab: string) => void;
}) {
  const [step, setStep]         = useState(0);
  const [playing, setPlaying]   = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const autoRef = useRef<number>(0);

  const current = DEMO_STEPS[step];
  const { displayed, done } = useTypewriter(current.response, 8, playing);

  const startStep = (idx: number) => {
    setStep(idx);
    setPlaying(false);
    window.clearTimeout(autoRef.current);
    setTimeout(() => setPlaying(true), 200);
  };

  const next = () => {
    if (step < DEMO_STEPS.length - 1) startStep(step + 1);
  };

  const prev = () => {
    if (step > 0) startStep(step - 1);
  };

  // Auto-play: advance after response is done + 3s
  useEffect(() => {
    if (autoPlay && done && step < DEMO_STEPS.length - 1) {
      autoRef.current = window.setTimeout(() => next(), 3000) as unknown as number;
    }
    return () => window.clearTimeout(autoRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, done, step]);

  useEffect(() => { startStep(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="demo-overlay">
      <div className="demo-modal">

        {/* Header */}
        <div className="demo-header">
          <div className="demo-header-left">
            <div className="demo-logo">🧠</div>
            <div>
              <div className="demo-title">PrivateBrain — Live Demo</div>
              <div className="demo-subtitle">Hackathon Presentation Mode</div>
            </div>
          </div>
          <div className="demo-header-right">
            <button
              className={`demo-autoplay-btn ${autoPlay ? 'active' : ''}`}
              onClick={() => { setAutoPlay(v => !v); if (!playing) startStep(step); }}
            >
              {autoPlay ? '⏸ Pause' : '▶ Auto-play'}
            </button>
            <button className="demo-close-btn" onClick={onClose}>✕ Exit Demo</button>
          </div>
        </div>

        {/* Progress tabs */}
        <div className="demo-tabs">
          {DEMO_STEPS.map((s, i) => (
            <button
              key={s.id}
              className={`demo-tab ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => startStep(i)}
            >
              <span>{s.tabIcon}</span>
              <span className="demo-tab-label">{s.tab}</span>
              {i < step && <span className="demo-tab-check">✓</span>}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="demo-body">
          {/* Left: info */}
          <div className="demo-info">
            <div className="demo-step-num">Step {step + 1} of {DEMO_STEPS.length}</div>
            <h2 className="demo-feature-title">{current.title}</h2>
            <p className="demo-feature-sub">{current.subtitle}</p>

            <div className="demo-highlight">
              <div className="demo-highlight-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Judge talking point
              </div>
              <p>{current.highlight}</p>
            </div>

            <div className="demo-actions">
              <button className="btn btn-secondary" onClick={prev} disabled={step === 0}>← Prev</button>
              <button className="btn btn-secondary" onClick={() => { setPlaying(false); setTimeout(() => setPlaying(true), 100); }}>
                ↺ Replay
              </button>
              <button className="btn btn-primary" onClick={next} disabled={step === DEMO_STEPS.length - 1}>Next →</button>
            </div>

            <button className="demo-try-btn" onClick={() => { onClose(); onNavigate(current.id); }}>
              Try it live in the app →
            </button>
          </div>

          {/* Right: simulated app window */}
          <div className="demo-window">
            {/* Prompt */}
            <div className="demo-prompt-wrap">
              <div className="demo-prompt-label">User prompt:</div>
              <div className="demo-prompt">{current.prompt}</div>
            </div>

            {/* Response */}
            <div className="demo-response-wrap">
              <div className="demo-response-label">
                🤖 AI response
                {playing && !done && <span className="demo-generating"> — generating on-device…</span>}
                {done && <span className="demo-done"> — complete ✓</span>}
              </div>
              <div className="demo-response">
                {displayed}
                {playing && !done && <span className="typing-cursor" />}
              </div>
            </div>

            {/* Privacy badge */}
            <div className="demo-privacy-badge">
              🔒 All inference ran locally · 0 bytes sent to any server
            </div>
          </div>
        </div>

        {/* Footer progress bar */}
        <div className="demo-progress-track">
          <div
            className="demo-progress-fill"
            style={{ width: `${((step + (done ? 1 : 0)) / DEMO_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}