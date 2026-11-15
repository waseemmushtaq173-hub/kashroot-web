/**
 * Bhashini ASR (Automatic Speech Recognition) — Speech-to-Text.
 * 
 * Uses Bhashini's ASR models (IndicASR) for Indian languages.
 * Pipeline ID: 64392f96daac500b55c543cd (MeitY public pipeline)
 * 
 * Requires: BHASHINI_USER_ID, BHASHINI_API_KEY
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
let asrCached: Pipeline | null = null;

interface ConfigResponse {
  pipelineResponseConfig?: { taskType?: string; config?: { serviceId?: string; language?: { sourceLanguage?: string; targetLanguage?: string } }[] }[];
  pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
}

async function asrPipeline(): Promise<Pipeline> {
  if (asrCached && Date.now() - asrCached.at < 3_600_000) return asrCached;
  
  const res = await fetch(CONFIG_URL, {
    method: 'POST',
    headers: { 
      'content-type': 'application/json', 
      userID: process.env.BHASHINI_USER_ID!.trim(), 
      ulcaApiKey: process.env.BHASHINI_API_KEY!.trim() 
    },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: 'asr', config: { language: { sourceLanguage: 'hi' } } }], // Hindi as default, can be changed per request
      pipelineRequestConfig: { pipelineId: PIPELINE_ID },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  
  if (!res.ok) throw new Error(`Bhashini ASR setup failed (HTTP ${res.status})`);
  const j = (await res.json()) as { 
    pipelineResponseConfig?: { taskType?: string; config?: { serviceId?: string }[] }[];
    pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
  };
  
  const endpoint = j.pipelineInferenceAPIEndPoint;
  const serviceId = j.pipelineResponseConfig?.find((t) => t.taskType === 'asr')?.config?.[0]?.serviceId;
  
  if (!endpoint?.callbackUrl || !endpoint.inferenceApiKey?.name || !endpoint.inferenceApiKey.value || !serviceId) {
    throw new Error('Bhashini ASR not available');
  }
  
  asrCached = { 
    url: endpoint.callbackUrl, 
    auth: { name: endpoint.inferenceApiKey.name, value: endpoint.inferenceApiKey.value }, 
    serviceId, 
    at: Date.now() 
  };
  return asrCached;
}

/** 
 * Speech-to-text via Bhashini ASR.
 * 
 * @param audioBase64 - Base64 encoded audio (WAV/MP3/OGG)
 * @param sourceLanguage - 'hi' (Hindi), 'en' (English), 'ur' (Urdu), 'ks' (Kashmiri via Urdu)
 * @returns Transcribed text
 */
export async function bhashiniAsr(audioBase64: string, sourceLanguage: 'hi' | 'en' | 'ur' | 'ks' = 'hi'): Promise<string> {
  const p = await asrPipeline();
  
  // Map language codes
  const langMap: Record<string, string> = { hi: 'hi', en: 'en', ur: 'ur', ks: 'ur' }; // Kashmiri ASR not available, use Urdu
  const lang = langMap[sourceLanguage] ?? 'hi';
  
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 
      'content-type': 'application/json', 
      [p.auth.name]: p.auth.value 
    },
    body: JSON.stringify({
      pipelineTasks: [{
        taskType: 'asr',
        config: { 
          language: { sourceLanguage: lang }, 
          serviceId: p.serviceId 
        }
      }],
      inputData: { 
        audio: [{ audioContent: audioBase64 }] 
      },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) asrCached = null;
    throw new Error(`Bhashini ASR failed (HTTP ${res.status})`);
  }
  
  const j = (await res.json()) as { 
    pipelineResponse?: { output?: { source?: string }[] }[] 
  };
  
  const out = j.pipelineResponse?.[0]?.output?.map((o) => o.source ?? '').join(' ').trim();
  if (!out) throw new Error('Bhashini ASR returned no transcription');
  return out;
}

export const bhashiniAsrConfigured = () => Boolean(process.env.BHASHINI_USER_ID?.trim() && process.env.BHASHINI_API_KEY?.trim());