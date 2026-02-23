'use client';

import { useState, useRef, useEffect } from 'react';
import DashboardShell from '@/components/DashboardShell';
import { Bot, Send, Loader2, Sparkles, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIAgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();
      if (data.message) {
        setMessages([...newMessages, { role: 'assistant', content: data.message }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.error || 'Sorry, I encountered an error. Please try again.' }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Connection error. Please check your network and try again.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMarkdown = (text: string) => {
    let html = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    html = html.replace(/(<li>.*?<\/li>\s*)+/g, '<ul class="list-disc ml-5 my-1">$&</ul>');
    return html;
  };

  const suggestions = [
    "Who owes the most money?",
    "Which cases haven't been contacted in 7+ days?",
    "Show me Izi's current workload",
    "Quem precisa de acompanhamento via WhatsApp?",
    "Give me a billing summary by practice area",
    "Which clients are missing phone numbers?",
  ];

  return (
    <DashboardShell>
      <div className="flex flex-col" style={{ height: 'calc(100vh - 5rem)' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">AI Assistant</h1>
            <p className="text-[13px] text-[#98989D]">Ask anything about matters, billing, and clients</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="btn btn-ghost text-[12px] text-[#FF3B30] border-none hover:bg-[rgba(255,59,48,0.06)]"
            >
              <Trash2 size={13} /> Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto card p-5 mb-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-[#F5F5F7]">
                <Bot size={24} className="text-[#1D1D1F]" />
              </div>
              <h3 className="text-[15px] font-semibold mb-1.5 text-[#1D1D1F]">PinhoLaw AI Assistant</h3>
              <p className="text-[13px] mb-6 max-w-md text-[#98989D]">
                I have real-time access to all your matter data, billing info, and WhatsApp communication history.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-left text-[13px] px-4 py-2.5 rounded-xl transition-all cursor-pointer bg-[#F5F5F7] text-[#6E6E73] hover:bg-[#E5E5EA] hover:text-[#1D1D1F]"
                  >
                    <Sparkles size={11} className="inline mr-2 opacity-40" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-3"
                  style={{
                    background: msg.role === 'user' ? '#1D1D1F' : '#F5F5F7',
                    color: msg.role === 'user' ? '#FFFFFF' : '#1D1D1F',
                  }}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Bot size={13} className="text-[#98989D]" />
                      <span className="text-[11px] font-semibold text-[#98989D]">AI Assistant</span>
                    </div>
                  )}
                  <div
                    className="text-[13px] chat-markdown leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start animate-fade-in">
              <div className="rounded-2xl px-4 py-3 flex items-center gap-2 bg-[#F5F5F7]">
                <Loader2 size={14} className="animate-spin text-[#98989D]" />
                <span className="text-[13px] text-[#98989D]">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about matters, billing, clients, or WhatsApp status..."
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl text-[13px] resize-none input-field"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="btn btn-primary px-5 rounded-xl"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
