'use client';

/**
 * Farmer portal → Ask the assistant. The same voice assistant as the home
 * page: speak or type in Kashmiri, Urdu, Hindi or English, and every answer
 * (or problem) is read aloud in that language. Mandi prices and weather come
 * from live sources; it also explains how to use KashRoot.
 */
import { PortalShell } from '@/components/layout/PortalShell';
import { VoiceConcierge } from '@/components/voice/VoiceConcierge';

export default function FarmerAssistantPage() {
  return (
    <PortalShell
      title="Ask the assistant"
      description="Press the microphone and speak — about mandi rates, weather, your orchard, or how to use KashRoot. The answer is read out to you."
      eyebrow="Farmer portal"
      theme="farmer"
    >
      <div className="mx-auto max-w-3xl">
        <VoiceConcierge />
      </div>
    </PortalShell>
  );
}
