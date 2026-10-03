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

    // Basic heuristic to read page content
    if (pathname.includes('/tracking')) {
      textToRead += "You are on the Logistics and Tracking dashboard. Enter a vehicle registration number to get live GPS location and shipment details.";
      const mainElement = document.getElementById('main-content');
      if (mainElement) {
        // Find visible text
        const content = mainElement.innerText || mainElement.textContent;
        if (content) {
          textToRead = content.substring(0, 500); // Read a summary
        }
      }
    } else if (pathname.includes('/mandi')) {
      textToRead += "You are viewing the Mandi Prices. Here are the latest horticultural rates.";
    } else if (pathname.includes('/tester')) {
      textToRead += "You are on the AgroGuard Input Tester. Please scan or enter a batch code to verify the product.";
    } else if (pathname.includes('/agriculture')) {
      textToRead += "Agriculture Portal. Here you can find seeds, fertilizers, and heavy machinery.";
    } else if (pathname.includes('/horticulture')) {
      textToRead += "Horticulture Portal. Here you can find orchard inventory, pruning tools, and cold storage logs.";
    } else if (pathname.includes('/admin')) {
      textToRead += "Admin Portal. Managing KYC, disputes, and analytics.";
    } else {
      textToRead += "This is the KashRoot dashboard.";
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
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
      className={`fixed bottom-6 right-6 p-4 rounded-full shadow-xl transition-all z-50 ${isPlaying ? 'bg-kr-primary-600 text-white animate-pulse' : 'bg-white text-kr-primary-600 border-2 border-kr-primary-600 hover:bg-kr-primary-50'}`}
      aria-label={isPlaying ? 'Stop Voice Assistant' : 'Start Voice Assistant'}
      title="Voice Assistant"
    >
      {isPlaying ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
    </button>
  );
}
