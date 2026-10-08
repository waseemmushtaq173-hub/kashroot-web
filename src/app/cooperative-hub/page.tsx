'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Users, Mic, Layers, UserPlus, CheckCircle, Apple, Search, Megaphone, ArrowRight, Plus } from 'lucide-react';

// Mock DEMO DATA
const COOP_MEMBERS = [
  { id: 'M-01', name: 'Fayaz Ahmad', village: 'Shopian', contribution: '450 Boxes', status: 'Active' },
  { id: 'M-02', name: 'Tariq Bhat', village: 'Sopore', contribution: '320 Boxes', status: 'Active' },
  { id: 'M-03', name: 'Zahoor Lone', village: 'Pulwama', contribution: '150 Boxes', status: 'Pending Grading' },
  { id: 'M-04', name: 'Abdul Rashid', village: 'Shopian', contribution: '--', status: 'Inactive' },
];

const POOLED_LOTS = [
  { id: 'LOT-A1', grade: 'Grade A (Premium)', variety: 'Gala', totalBoxes: 770, membersCount: 2, status: 'Ready for Sale', priceEst: '₹1400/box' },
  { id: 'LOT-B1', grade: 'Grade B (Standard)', variety: 'Gala', totalBoxes: 150, membersCount: 1, status: 'Grading in Progress', priceEst: '₹950/box' },
];

export default function CooperativeHubPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Green to Gold Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-orchard-green,#1E7B4F)] to-[var(--kr-saffron-gold,#E8A317)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Users className="w-8 h-8 text-white" /> Cooperative Hub
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Manage your farmer group, pool harvests for better grading, and broadcast voice updates to all members.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Users className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Member List & Broadcast */}
            <div className="lg:col-span-1 space-y-8">
              
              {/* Voice Broadcast */}
              <div className="bg-[var(--kr-orchard-green,#1E7B4F)]/30 backdrop-blur-md border border-[var(--kr-orchard-green,#1E7B4F)]/50 p-6 rounded-2xl text-center shadow-[0_0_20px_rgba(30,123,79,0.2)]">
                <div className="bg-white/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
                  <Megaphone className="w-8 h-8 text-[var(--kr-saffron-gold,#E8A317)]" />
                </div>
                <h2 className="text-xl font-bold mb-2">Group Announcement</h2>
                <p className="text-sm text-white/70 mb-6">Instantly send an automated voice call or SMS to all 12 members of your cooperative.</p>
                <button className="w-full bg-[var(--kr-orchard-green,#1E7B4F)] hover:bg-[#165a39] text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg hidden">
                  <Mic className="w-5 h-5" /> Record Voice Broadcast
                </button>
              </div>

              {/* Member List */}
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Users className="w-5 h-5 text-[var(--kr-orchard-green,#1E7B4F)]" /> Member Directory
                  </h2>
                  <button className="text-white/60 hover:text-white transition-colors p-1 hidden">
                    <UserPlus className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="relative mb-4">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input type="text" placeholder="Search members..." className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--kr-orchard-green,#1E7B4F)] transition-colors" />
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {COOP_MEMBERS.map(member => (
                    <div key={member.id} className="bg-white/5 border border-white/10 p-3 rounded-lg flex justify-between items-center hover:bg-white/10 transition-colors">
                      <div>
                        <div className="font-bold text-sm">{member.name}</div>
                        <div className="text-xs text-white/50">{member.village}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm text-[var(--kr-saffron-gold,#E8A317)]">{member.contribution}</div>
                        <div className={`text-[10px] uppercase font-bold tracking-wider ${member.status === 'Active' ? 'text-green-400' : member.status === 'Pending Grading' ? 'text-amber-400' : 'text-white/40'}`}>
                          {member.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Column: Pooled Lots */}
            <div className="lg:col-span-2">
              <div className="bg-black/40 backdrop-blur-lg border border-white/20 rounded-2xl p-6 md:p-8 h-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <Layers className="w-6 h-6 text-[var(--kr-saffron-gold,#E8A317)]" /> Pooled Lots & Grading
                    </h2>
                    <p className="text-sm text-white/60 mt-1">Combine harvests from multiple members to attract larger institutional buyers.</p>
                  </div>
                  <button className="bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 hidden">
                    <Plus className="w-4 h-4" /> Create New Lot
                  </button>
                </div>

                <div className="space-y-6">
                  {POOLED_LOTS.map(lot => (
                    <div key={lot.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/30 transition-colors relative overflow-hidden group">
                      
                      {/* Status Ribbon */}
                      <div className={`absolute top-0 right-0 px-4 py-1 text-xs font-bold rounded-bl-lg ${lot.status === 'Ready for Sale' ? 'bg-green-500/20 text-green-400 border-b border-l border-green-500/30' : 'bg-amber-500/20 text-amber-400 border-b border-l border-amber-500/30'}`}>
                        {lot.status}
                      </div>

                      <div className="flex flex-col md:flex-row gap-6">
                        {/* Lot Details */}
                        <div className="flex-1 space-y-4">
                          <div>
                            <div className="flex items-center gap-2 text-white/50 text-xs font-mono mb-1">
                              <span>{lot.id}</span>
                              <span>•</span>
                              <span>{lot.variety}</span>
                            </div>
                            <h3 className="text-xl font-bold text-white">{lot.grade}</h3>
                          </div>
                          
                          <div className="flex gap-6">
                            <div>
                              <div className="text-xs text-white/50 mb-1">Total Volume</div>
                              <div className="text-lg font-bold flex items-center gap-1">
                                <Apple className="w-4 h-4 text-red-400" /> {lot.totalBoxes} Boxes
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-white/50 mb-1">Contributors</div>
                              <div className="text-lg font-bold flex items-center gap-1">
                                <Users className="w-4 h-4 text-blue-400" /> {lot.membersCount} Members
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions & Price */}
                        <div className="flex flex-col justify-between items-start md:items-end border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6 w-full md:w-48 shrink-0">
                          <div className="mb-4 md:mb-0">
                            <div className="text-xs text-white/50 md:text-right mb-1">Estimated Value</div>
                            <div className="text-xl font-bold text-[var(--kr-saffron-gold,#E8A317)]">{lot.priceEst}</div>
                          </div>
                          
                          {lot.status === 'Ready for Sale' ? (
                            <button className="w-full bg-[var(--kr-saffron-gold,#E8A317)] hover:bg-[#B37A0B] text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 hidden">
                              List to Market <ArrowRight className="w-4 h-4" />
                            </button>
                          ) : (
                            <button className="w-full bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10 hidden">
                              Manage Grading
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
              </div>
            </div>

          </div>

        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
