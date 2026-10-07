'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function VoiceAssistant() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [supported, setSupported] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSupported(true);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    }
  }, [pathname]);

  const toggleVoice = () => {
    if (!supported) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    let textToRead = "Welcome to KashRoot. ";

    try {
      if (pathname.includes('/tracking')) {
        textToRead = "You are on the Tracking dashboard. ";
        const main = document.getElementById('main-content');
        if (main) {
          const trackData = main.innerText;
          if (trackData.includes('Vehicle Registration')) {
             textToRead += "Please enter a vehicle registration number to get live GPS location.";
          } else {
             // Summarize the tracking text
             const words = trackData.replace(/\s+/g, ' ').substring(0, 400);
             textToRead += "Here is the live status: " + words;
          }
        }
      } else if (pathname.includes('/mandi')) {
        textToRead = "Live Mandi Rates and Weather. ";
        const main = document.getElementById('main-content');
        if (main) {
           const text = main.innerText.replace(/\s+/g, ' ').substring(0, 400);
           textToRead += "Here is the current market update: " + text;
        }
      } else if (pathname.includes('/tester')) {
        textToRead = "AgroGuard Tester. Scan or enter a batch code to verify the product's authenticity against manufacturer records.";
      } else if (pathname.includes('/agriculture')) {
        textToRead = "Agriculture Portal. Here you can find seeds, fertilizers, and heavy machinery.";
      } else if (pathname.includes('/horticulture')) {
        textToRead = "Horticulture Portal. Here you can find orchard inventory, pruning tools, and cold storage logs.";
      } else if (pathname.includes('/admin')) {
        textToRead = "Admin Portal. Managing KYC, disputes, and analytics.";
      } else {
        textToRead = "This is the KashRoot dashboard.";
      }
    } catch(e) {
      console.error(e);
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    // Pick an English or Hindi voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('hi-IN'));
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.lang = 'en-IN';
    utterance.rate = 0.9;
    
    utterance.onend = () => {
      setIsPlaying(false);
    };
    
    utterance.onerror = () => {
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  if (!supported) return null;

  return (
    <button
      onClick={toggleVoice}
      className={`fixed bottom-6 right-6 p-4 rounded-full shadow-xl transition-all z-50 ${isPlaying ? 'bg-kr-primary-600 text-white animate-pulse' : 'kr-glass text-kr-primary-600 border-2 border-kr-primary-600 hover:bg-kr-fill-brand-subtle'}`}
      aria-label={isPlaying ? 'Stop Voice Assistant' : 'Start Voice Assistant'}
      title="Voice Assistant"
    >
      {isPlaying ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
    </button>
  );
}
