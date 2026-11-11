/**
 * Bhashini TTS (Text-to-Speech) — Indian language voices.
 * 
 * Uses Bhashini's TTS models for Indian languages.
 * Pipeline ID: 64392f96daac500b55c543cd (MeitY public pipeline)
 * 
 * Requires: BHASHINI_USER_ID, BHASHINI_API_KEY
 * 
 * Falls back to Google Cloud TTS (voice.ts) if not configured or fails.
 */
import 'server-only';

const CONFIG_URL = process.env.BHASHINI_CONFIG_URL?.trim() || 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';
const PIPELINE_ID = '64392f96daac500b55c543cd';

interface Pipeline {
  url: string;
  auth: { name: string; value: string };
  serviceId: string;
  at: number;
}
let ttsCached: Pipeline | null = null;

interface ConfigResponse {
  pipelineResponseConfig?: { taskType?: string; config?: { serviceId?: string; language?: { sourceLanguage?: string; targetLanguage?: string } }[] }[];
  pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
}

async function ttsPipeline(): Promise<Pipeline> {
  if (ttsCached && Date.now() - ttsCached.at < 3_600_000) return ttsCached;
  
  const res = await fetch(CONFIG_URL, {
    method: 'POST',
    headers: { 
      'content-type': 'application/json', 
      userID: process.env.BHASHINI_USER_ID!.trim(), 
      ulcaApiKey: process.env.BHASHINI_API_KEY!.trim() 
    },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: 'tts', config: { language: { targetLanguage: 'hi' } } }], // Hindi as default
      pipelineRequestConfig: { pipelineId: PIPELINE_ID },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  
  if (!res.ok) throw new Error(`Bhashini TTS setup failed (HTTP ${res.status})`);
  const j = (await res.json()) as { 
    pipelineResponseConfig?: { taskType?: string; config?: { serviceId?: string }[] }[];
    pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
  };
  
  const endpoint = j.pipelineInferenceAPIEndPoint;
  const serviceId = j.pipelineResponseConfig?.find((t) => t.taskType === 'tts')?.config?.[0]?.serviceId;
  
  if (!endpoint?.callbackUrl || !endpoint.inferenceApiKey?.name || !endpoint.inferenceApiKey.value || !serviceId) {
    throw new Error('Bhashini TTS not available');
  }
  
  ttsCached = { 
    url: endpoint.callbackUrl, 
    auth: { name: endpoint.inferenceApiKey.name, value: endpoint.inferenceApiKey.value }, 
    serviceId, 
    at: Date.now() 
  };
  return ttsCached;
}

export type BhashiniVoiceLang = 'hi' | 'en' | 'ur' | 'ks';

const LANG_CODE: Record<BhashiniVoiceLang, string> = { 
  hi: 'hi', 
  en: 'en', 
  ur: 'ur', 
  ks: 'ur' // Kashmiri TTS not available, use Urdu voice
};

const DEFAULT_SPEAKER: Record<BhashiniVoiceLang, string> = {
  hi: 'meity-hindi-female',    // Default Hindi speaker
  en: 'meity-english-female',  // Default English speaker  
  ur: 'meity-urdu-female',     // Default Urdu speaker
  ks: 'meity-urdu-female',     // Kashmiri uses Urdu voice
};

/** 
 * Text-to-speech via Bhashini TTS.
 * 
 * @param text - Text to synthesize (max 500 chars per request)
 * @param lang - Target language
 * @param speaker - Optional speaker ID (falls back to default)
 * @returns MP3 audio as Uint8Array
 */
export async function bhashiniTts(text: string, lang: BhashiniVoiceLang, speaker?: string): Promise<Uint8Array> {
  const p = await ttsPipeline();
  const targetLang = LANG_CODE[lang] ?? 'hi';
  const speakerId = speaker || DEFAULT_SPEAKER[lang];
  
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 
      'content-type': 'application/json', 
      [p.auth.name]: p.auth.value 
    },
    body: JSON.stringify({
      pipelineTasks: [{
        taskType: 'tts',
        config: { 
          language: { targetLanguage: targetLang }, 
          serviceId: p.serviceId,
          speaker: speakerId,
        }
      }],
      inputData: { 
        input: [{ source: text.slice(0, 500) }] 
      },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) ttsCached = null;
    throw new Error(`Bhashini TTS failed (HTTP ${res.status})`);
  }
  
  const j = (await res.json()) as { 
    pipelineResponse?: { audio?: { audioContent?: string }[] }[] 
  };
  
  const audioContent = j.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
  if (!audioContent) throw new Error('Bhashini TTS returned no audio');
  
  return new Uint8Array(Buffer.from(audioContent, 'base64'));
}

export const bhashiniTtsConfigured = () => Boolean(process.env.BHASHINI_USER_ID?.trim() && process.env.BHASHINI_API_KEY?.trim());