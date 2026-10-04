'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import { tokenStore } from '@/lib/api/auth';

export default function AssistantPage() {
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lang, setLang] = useState('en-IN');
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
      }
    }
  }, []);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [lang]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      // It uses the latest language because we update `recognitionRef.current.lang` in the useEffect
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setReply(''); // Clear old reply
    try {
      const res = await fetch(`/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      if (!res.ok) {
        throw new Error('API error');
      }
      
      const data = await res.json();
      const answer = data.reply || 'No response';
      setReply(answer);
      // Removed the auto-speak here to avoid browser autoplay blocking.
    } catch (err) {
      console.error('AI error:', err);
      setReply("Connection to AI failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window && reply) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(reply);
      // Try to find a voice matching the selected language
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang === lang || v.lang.startsWith(lang.split('-')[0]));
      if (preferred) utterance.voice = preferred;
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-emerald-900 flex items-center gap-2">
          <Bot className="w-8 h-8 text-emerald-600" /> KashRoot AI Voice Assistant
        </h1>
        <p className="text-emerald-800 mt-1">Ask questions regarding crop disease, localized weather forecasts, or market trends using your voice.</p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm space-y-4">
        <form onSubmit={handleAsk} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="lang-select" className="text-sm font-medium text-emerald-900">Language:</label>
            <select
              id="lang-select"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="text-sm px-2 py-1 border border-emerald-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (India)</option>
              <option value="ur-IN">Urdu (India)</option>
              <option value="pa-IN">Punjabi (India)</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-lg flex items-center justify-center transition-colors ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              }`}
              title="Toggle Voice Input"
            >
              {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <input
              type="text"
              placeholder="Tap the mic or type here..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-4 py-3 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 text-emerald-900"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </form>

        {reply && (
          <div className="mt-6 p-5 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-emerald-900">Assistant Response:</h3>
              <button 
                type="button"
                onClick={handleSpeak}
                className="text-emerald-600 hover:text-emerald-800 p-2 rounded-full hover:bg-emerald-100 transition-colors"
                title="Read aloud"
              >
                <Volume2 className="w-6 h-6" />
              </button>
            </div>
            <p className="text-emerald-800 leading-relaxed">{reply}</p>
          </div>
        )}
      </div>
    </div>
  );
}