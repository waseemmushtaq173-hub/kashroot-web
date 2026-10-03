'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import { tokenStore } from '@/lib/api/auth';

export default function AssistantPage() {
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

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
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const token = tokenStore.getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/assistant/voice`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ query }),
      });
      
      if (!res.ok) {
        throw new Error('API error');
      }
      
      const data = await res.json();
      const answer = data.reply || data.message || 'Received response from AI module.';
      setReply(answer);
      speakText(answer);
    } catch (err) {
      console.error('AI error:', err);
      // Fallback expert system / guest mode response
      const fallbackMsg = "It seems you are offline or your session expired. As a fallback expert tip: Apple scab disease thrives in wet conditions. Ensure proper pruning for air circulation and apply a protective fungicide before expected rainfall.";
      setReply(fallbackMsg);
      speakText(fallbackMsg);
    } finally {
      setLoading(false);
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
        <form onSubmit={handleAsk} className="flex gap-2">
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
        </form>

        {reply && (
          <div className="mt-6 p-5 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-emerald-900">Assistant Response:</h3>
              <button 
                onClick={() => speakText(reply)}
                className="text-emerald-600 hover:text-emerald-800"
                title="Read aloud"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>
            <p className="text-emerald-800 leading-relaxed">{reply}</p>
          </div>
        )}
      </div>
    </div>
  );
}