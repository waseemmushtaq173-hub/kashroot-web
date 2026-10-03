import { BookOpen, Video, Calendar, PhoneCall, GraduationCap } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function ExpertKnowledgeHub() {
  return (
    <div className="min-h-screen flex flex-col bg-kr-bg-page">
      <SiteHeader />
      <main className="flex-1 kr-container py-10">
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <div className="flex justify-center mb-4">
            <GraduationCap className="w-16 h-16 text-kr-text-brand" />
          </div>
          <h1 className="font-heading text-display text-kr-text-primary mb-4">
            Expert Advisory & Knowledge Hub
          </h1>
          <p className="text-body-lg text-kr-text-secondary">
            Verified agricultural advisory, video guides, localized crop calendars, and direct expert consultation for Kashmiri horticulture.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="kr-card bg-white p-6 hover:shadow-kr-card-md transition-shadow">
            <BookOpen className="w-8 h-8 text-emerald-600 mb-4" />
            <h2 className="font-heading text-h3 mb-2">Verified Advisory</h2>
            <p className="text-body-sm text-kr-text-secondary mb-4">
              Access peer-reviewed research and official university guidelines on pest management, pruning, and soil health.
            </p>
            <button className="kr-btn-secondary w-full">Read Articles</button>
          </div>
          
          <div className="kr-card bg-white p-6 hover:shadow-kr-card-md transition-shadow">
            <Video className="w-8 h-8 text-blue-600 mb-4" />
            <h2 className="font-heading text-h3 mb-2">Video Guides</h2>
            <p className="text-body-sm text-kr-text-secondary mb-4">
              Watch step-by-step video tutorials in local languages demonstrating advanced harvesting and packaging techniques.
            </p>
            <button className="kr-btn-secondary w-full">Watch Videos</button>
          </div>
          
          <div className="kr-card bg-white p-6 hover:shadow-kr-card-md transition-shadow">
            <Calendar className="w-8 h-8 text-amber-600 mb-4" />
            <h2 className="font-heading text-h3 mb-2">Crop Calendars</h2>
            <p className="text-body-sm text-kr-text-secondary mb-4">
              Download localized schedules for spraying, irrigation, and harvesting tailored to your specific district and altitude.
            </p>
            <button className="kr-btn-secondary w-full">View Calendars</button>
          </div>
          
          <div className="kr-card bg-white p-6 hover:shadow-kr-card-md transition-shadow">
            <PhoneCall className="w-8 h-8 text-orange-600 mb-4" />
            <h2 className="font-heading text-h3 mb-2">Expert Consultation</h2>
            <p className="text-body-sm text-kr-text-secondary mb-4">
              Request a direct callback or book a farm visit from certified agricultural extension officers.
            </p>
            <button className="kr-btn-primary w-full">Request Consult</button>
          </div>
        </div>

        <div className="mt-12 bg-kr-fill-brand-subtle border border-kr-border-brand rounded-xl p-8 text-center">
          <h2 className="font-heading text-h2 text-kr-text-brand mb-4">Need Immediate Assistance?</h2>
          <p className="text-body mb-6 text-kr-text-secondary">
            Use our AI Voice Assistant for instant, voice-driven answers in Kashmiri or Urdu.
          </p>
          <Link href="/farmer/assistant" className="kr-btn-primary kr-btn-lg inline-flex items-center">
            <GraduationCap className="w-5 h-5 mr-2" /> Open Voice Assistant
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
