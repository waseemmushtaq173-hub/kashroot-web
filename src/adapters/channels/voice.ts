export interface VoiceCallPayload {
  phone: string;
  audioUrl?: string; // Pre-recorded message
  ttsText?: string;  // Text-to-speech fallback
  language?: string; // e.g. 'ks', 'ur'
  gatherInput?: boolean; // e.g. Press 1 to speak to an expert
}

export const VoiceAdapter = {
  initiateCall: async (payload: VoiceCallPayload) => {
    console.log(`[Voice Adapter] Calling ${payload.phone}`);
    console.log(`[Voice Adapter] Language: ${payload.language || 'en'}`);
    
    if (payload.audioUrl) {
      console.log(`[Voice Adapter] Playing audio file: ${payload.audioUrl}`);
    } else if (payload.ttsText) {
      console.log(`[Voice Adapter] Text-To-Speech: "${payload.ttsText}"`);
    }

    if (payload.gatherInput) {
      console.log(`[Voice Adapter] Waiting for DTMF input (IVR mode)...`);
    }

    return { callId: `call-${Date.now()}`, status: 'ringing' };
  },

  startAdvisoryMenu: async (phone: string, language: string = 'ks') => {
    // A mock IVR menu for basic feature phones
    return VoiceAdapter.initiateCall({
      phone,
      language,
      ttsText: "Welcome to KashRoot Advisory. Press 1 for Mandi prices. Press 2 for weather alerts. Press 3 to speak to a horticulture expert.",
      gatherInput: true
    });
  }
};
