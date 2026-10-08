'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { BookOpen, PlayCircle, Mic, HelpCircle, MessageSquare, Star, ArrowRight } from 'lucide-react';

// Mock DEMO DATA
const VIDEO_LESSONS = [
  { id: 'VID-1', title: 'High-Density Pruning Techniques', duration: '12 mins', views: '2.4k', type: 'Video' },
  { id: 'VID-2', title: 'Understanding Apple Scab (Kashmiri)', duration: '8 mins', views: '1.1k', type: 'Voice' },
];

const EXPERT_QA = [
  { id: 'QA-1', question: 'When is the best time to apply dormant oil?', answers: 3, topAnswerBy: 'Dr. Shah (SKUAST)' },
  { id: 'QA-2', question: 'How to manage red mite outbreak in Sopore?', answers: 5, topAnswerBy: 'KashRoot Agronomy Team' },
];

export default function LearnPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Saffron to Teal Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-saffron-gold,#E8A317)] to-[var(--kr-dal-teal,#0E7C86)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <BookOpen className="w-8 h-8 text-white" /> Learn & Community
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Access voice/video lessons in local languages and get answers directly from agricultural experts.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <BookOpen className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column: Lessons */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-saffron-gold,#E8A317)]/40 rounded-2xl p-6 shadow-[0_0_20px_rgba(232,163,23,0.1)] flex flex-col">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-[var(--kr-saffron-gold,#E8A317)]" /> Voice & Video Lessons
              </h2>
              
              <div className="space-y-4 flex-1">
                {VIDEO_LESSONS.map(lesson => (
                  <div key={lesson.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors flex gap-4 items-center group cursor-pointer">
                    <div className="w-16 h-16 bg-black/50 rounded-lg flex items-center justify-center border border-white/10 group-hover:border-[var(--kr-saffron-gold,#E8A317)] transition-colors">
                      {lesson.type === 'Video' ? <PlayCircle className="w-8 h-8 text-white/70" /> : <Mic className="w-8 h-8 text-white/70" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${lesson.type === 'Video' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                          {lesson.type}
                        </span>
                        <span className="text-xs text-white/50">{lesson.duration}</span>
                      </div>
                      <h3 className="font-bold text-md leading-tight group-hover:text-[var(--kr-saffron-gold,#E8A317)] transition-colors">{lesson.title}</h3>
                      <div className="text-xs text-white/40 mt-1">{lesson.views} views</div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button className="mt-6 w-full py-3 bg-[var(--kr-saffron-gold,#E8A317)] hover:bg-[#B37A0B] text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2 hidden">
                Browse Full Library <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right Column: Expert Q&A */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-dal-teal,#0E7C86)]/40 rounded-2xl p-6 shadow-[0_0_20px_rgba(14,124,134,0.15)] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-[var(--kr-dal-teal,#0E7C86)]" /> Expert Q&A Board
                </h2>
                <button className="bg-[var(--kr-dal-teal,#0E7C86)] hover:bg-[#0b636b] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors hidden">
                  Ask a Question
                </button>
              </div>
              
              <div className="space-y-4 flex-1">
                {EXPERT_QA.map(qa => (
                  <div key={qa.id} className="bg-[var(--kr-dal-teal,#0E7C86)]/10 border border-[var(--kr-dal-teal,#0E7C86)]/20 rounded-xl p-5 hover:border-[var(--kr-dal-teal,#0E7C86)]/40 transition-colors">
                    <h3 className="font-bold text-lg mb-3 leading-snug">{qa.question}</h3>
                    
                    <div className="flex justify-between items-center border-t border-white/10 pt-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-white/50" />
                        <span className="text-xs font-bold text-white/70">{qa.answers} Answers</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-white/50">Top Answer:</span>
                        <span className="text-[var(--kr-dal-teal,#0E7C86)] font-bold flex items-center gap-1"><Star className="w-3 h-3" /> {qa.topAnswerBy}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
