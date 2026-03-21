import React, { useState, useRef, useEffect } from 'react';
import type { ModelState } from '../hooks/useModelLoader';

interface Props { model: ModelState; }

interface Message {
  role: 'user' | 'ai';
  content: string;
  id: string;
}

const STARTERS = [
  'Help me plan my week effectively',
  'Explain quantum computing simply',
  'Give me 5 productivity tips',
  'How do I improve my writing?',
  'What makes a great presentation?',
  'Help me brainstorm a startup idea',
];

function buildChatPrompt(messages: Message[], newMsg: string): string {
  const history = messages
    .slice(-6) // keep last 3 exchanges for context
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
  return `You are a helpful, knowledgeable AI assistant. Respond concisely and helpfully.\n\n${history}\nUser: ${newMsg}\nAssistant:`;
}

export default function ChatAssistant({ model }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) {
      console.warn('No message to send');
      return;
    }
    if (model.status !== 'ready') {
      console.warn('Model not ready yet');
      return;
    }
    if (isGenerating) {
      console.warn('Already generating response');
      return;
    }
    
    setInput('');

    const userMsg: Message = { role: 'user', content: msg, id: Date.now().toString() };
    setMessages(prev => [...prev, userMsg]);

    const aiId = (Date.now() + 1).toString();
    const aiMsg: Message = { role: 'ai', content: '', id: aiId };
    setMessages(prev => [...prev, aiMsg]);

    setIsGenerating(true);
    try {
      let out = '';
      const prompt = buildChatPrompt([...messages, userMsg], msg);
      console.log('Generating chat response...');
      
      for await (const tok of model.generate(prompt, { maxTokens: 400, temperature: 0.75 })) {
        out += tok;
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: out } : m));
      }
      
      console.log(`Response complete (${out.length} characters)`);
    } catch (error) {
      console.error('Chat generation error:', error);
      setMessages(prev => prev.map(m => 
        m.id === aiId ? { ...m, content: 'Sorry, I encountered an error. Please try again.' } : m
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <>
      {/* ── Empty State with Starters ── */}
      {messages.length === 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">💬 Quick Start</span>
          </div>
          <div className="card-body">
            <div className="templates-grid">
              {STARTERS.map(s => (
                <button
                  key={s}
                  className="template-btn"
                  onClick={() => send(s)}
                  disabled={model.status !== 'ready'}
                  style={{ padding: '14px' }}
                >
                  <span className="template-emoji">💡</span>
                  <span className="template-name" style={{ fontSize: 12, lineHeight: 1.4 }}>{s}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      {messages.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(6,182,212,0.15)' }}>
          <div className="card-header">
            <span className="card-title">💬 Conversation</span>
            <button className="btn btn-secondary btn-sm" onClick={clearChat}>🗑 Clear</button>
          </div>
          <div className="card-body">
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={m.id} className={`chat-message msg-${m.role}`}>
                  <div className="msg-avatar">
                    {m.role === 'user' ? '🧑' : '🤖'}
                  </div>
                  <div className="msg-bubble">
                    {m.content || (isGenerating && i === messages.length - 1
                      ? <span className="typing-cursor" />
                      : '…'
                    )}
                    {m.content && isGenerating && i === messages.length - 1 && (
                      <span className="typing-cursor" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      )}

      {/* ── Input ── */}
      <div className="card">
        <div className="card-body" style={{ paddingBottom: 16 }}>
          <div className="chat-input-row">
            <textarea
              rows={2}
              placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={isGenerating}
            />
            <button
              className="btn btn-primary"
              onClick={() => send()}
              disabled={model.status !== 'ready' || isGenerating || !input.trim()}
              style={{ height: 52, flexShrink: 0 }}
            >
              {isGenerating ? <span className="spinner" /> : '↑'}
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            🔒 All messages processed locally · No data sent anywhere
          </div>
        </div>
      </div>
    </>
  );
}
