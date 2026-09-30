'use client';

import { useState } from 'react';
import { Bot, Send, Loader2 } from 'lucide-react';

export default function AssistantPage() {
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/assistant/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setReply(data.reply || data.message || 'Received response from AI module.');
    } catch (err) {
      console.error('AI error:', err);
      setReply('Failed to reach AI assistant. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
          <Bot className="w-8 h-8 text-emerald-600" /> KashRoot AI Voice Assistant
        </h1>
        <p className="text-stone-600 mt-1">Ask questions regarding crop disease, localized weather forecasts, or market trends.</p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-4">
        <form onSubmit={handleAsk} className="flex gap-2">
          <input
            type="text"
            placeholder="Ask in English, Kashmiri, or Urdu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-stone-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-black transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>

        {reply && (
          <div className="mt-6 p-5 bg-stone-50 rounded-xl border border-stone-200">
            <h3 className="font-semibold text-stone-900 mb-2">Assistant Response:</h3>
            <p className="text-stone-700 leading-relaxed">{reply}</p>
          </div>
        )}
      </div>
    </div>
  );
}