/**
 * Kashmiri translation through Bhashini — the Government of India's free
 * language platform (bhashini.gov.in, IndicTrans2 models), which translates
 * English into Kashmiri in the Perso-Arabic script and in Devanagari.
 *
 * Switched on by two Vercel variables from a free Bhashini account
 * (bhashini.gov.in → sign up → My Profile → generate API key):
 *   BHASHINI_USER_ID, BHASHINI_API_KEY
 * Without them, or if Bhashini fails, callers fall back to the AI's own
 * Kashmiri. Server-only.
 */
import 'server-only';

const CONFIG_URL = process.env.BHASHINI_CONFIG_URL?.trim() || 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';
const PIPELINE_ID = '64392f96daac500b55c543cd'; // MeitY's public pipeline (translation, ASR, TTS)

export const bhashiniConfigured = () => Boolean(process.env.BHASHINI_USER_ID?.trim() && process.env.BHASHINI_API_KEY?.trim());

interface Pipeline {
  url: string;
  auth: { name: string; value: string };
  serviceId: string;
  at: number;
}
let cached: Pipeline | null = null;

interface ConfigResponse {
  pipelineResponseConfig?: { taskType?: string; config?: { serviceId?: string; language?: { sourceLanguage?: string; targetLanguage?: string; targetScriptCode?: string } }[] }[];
  pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
}

async function pipeline(): Promise<Pipeline> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached;
  const res = await fetch(CONFIG_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', userID: process.env.BHASHINI_USER_ID!.trim(), ulcaApiKey: process.env.BHASHINI_API_KEY!.trim() },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: 'translation', config: { language: { sourceLanguage: 'en', targetLanguage: 'ks' } } }],
      pipelineRequestConfig: { pipelineId: PIPELINE_ID },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Bhashini setup failed (HTTP ${res.status})`);
  const j = (await res.json()) as ConfigResponse;
  const endpoint = j.pipelineInferenceAPIEndPoint;
  const serviceId = j.pipelineResponseConfig?.find((t) => t.taskType === 'translation')?.config?.[0]?.serviceId;
  if (!endpoint?.callbackUrl || !endpoint.inferenceApiKey?.name || !endpoint.inferenceApiKey.value || !serviceId) throw new Error('Bhashini has no Kashmiri translation right now');
  cached = { url: endpoint.callbackUrl, auth: { name: endpoint.inferenceApiKey.name, value: endpoint.inferenceApiKey.value }, serviceId, at: Date.now() };
  return cached;
}

/** English → Kashmiri, in the Perso-Arabic ('Arab') or Devanagari ('Deva') script. */
export async function toKashmiri(text: string, script: 'Arab' | 'Deva' = 'Arab'): Promise<string> {
  const p = await pipeline();
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [p.auth.name]: p.auth.value },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: 'translation', config: { language: { sourceLanguage: 'en', targetLanguage: 'ks', targetScriptCode: script }, serviceId: p.serviceId } }],
      inputData: { input: [{ source: text.slice(0, 4000) }] },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) cached = null;
    throw new Error(`Bhashini translation failed (HTTP ${res.status})`);
  }
  const j = (await res.json()) as { pipelineResponse?: { output?: { target?: string }[] }[] };
  const out = j.pipelineResponse?.[0]?.output?.map((o) => o.target ?? '').join('\n').trim();
  if (!out) throw new Error('Bhashini returned no translation');
  return out;
}
