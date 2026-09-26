/**
 * High-level API surface for the Kashroot web app. Every call goes through the
 * shared client in `lib/api-client.ts` (base URL, auth token, credentials, JSON
 * parsing, typed errors); this module maps typed request/response shapes onto
 * the real backend routes so components never hand-roll `fetch`.
 */
import {
  api,
  ApiError,
  API_BASE_URL,
  setAuthTokenProvider,
} from './lib/api-client';
import type {
  VoiceQueryResponseDto,
  FarmingAdvisory,
  AdvisoryCategory,
  AgencyInspectionResult,
} from './types';

// Re-exported so existing `import { ... } from './api'` sites keep working and
// callers have one entry point for the client essentials.
export { API_BASE_URL, ApiError, setAuthTokenProvider };

/* ---------------------------------------------------------------------------
 * Voice assistant — POST /assistant/voice  (FARMER, multipart field `audio`)
 * ------------------------------------------------------------------------ */

/** Back-compat error type; carries the HTTP status so the UI can branch (401). */
export class VoiceAssistantError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceAssistantError';
  }
}

/**
 * Uploads a recorded audio clip to the voice-to-voice assistant and returns the
 * transcript, reply text, and a playable reply-audio URL. Identity + language
 * are derived server-side from the token — nothing about the user is sent.
 */
export async function askVoiceAssistant(
  audioBlob: Blob,
): Promise<VoiceQueryResponseDto> {
  const form = new FormData();
  // Filename/type help the server file-type validator; mimetype is what's checked.
  form.append('audio', audioBlob, `query.${mimeToExt(audioBlob.type)}`);
  try {
    return await api.post<VoiceQueryResponseDto>('/assistant/voice', form);
  } catch (err) {
    // Preserve the historical error contract for existing callers.
    if (err instanceof ApiError) throw new VoiceAssistantError(err.status, err.message);
    throw err;
  }
}

/* ---------------------------------------------------------------------------
 * Farming advisories — GET /advisories  (public knowledge feed)
 * ------------------------------------------------------------------------ */

export interface AdvisoryFilters {
  category?: AdvisoryCategory;
  crop?: string;
  region?: string;
}

/** Fetches the verified farming-advisory knowledge feed, optionally filtered. */
export function getAdvisories(
  filters: AdvisoryFilters = {},
): Promise<FarmingAdvisory[]> {
  // Public route — no token required; still send credentials harmlessly.
  return api.get<FarmingAdvisory[]>('/advisories', {
    auth: false,
    query: {
      category: filters.category,
      crop: filters.crop,
      region: filters.region,
    },
  });
}

/* ---------------------------------------------------------------------------
 * AgroGuard inspection — POST /tester/inspect  (TESTER, multipart)
 * ------------------------------------------------------------------------ */

/** Mirrors the backend InspectAgencyProductDto plus the optional bottle photo. */
export interface InspectAgencyProductInput {
  agencyName: string;
  productBrand: string;
  scannedBatchNo?: string;
  scannedBottleImageUrl?: string;
  observedHologramPattern?: string;
  logoMatchesFactory?: boolean;
  sealPresent?: boolean;
  fontAnomalies?: string[];
  /** Scanned bottle photo; sent as the `bottleImage` multipart field. */
  bottleImage?: Blob | null;
}

/** Runs a live counterfeit-detection inspection and returns the verdict. */
export function inspectAgencyProduct(
  input: InspectAgencyProductInput,
): Promise<AgencyInspectionResult> {
  const { bottleImage, fontAnomalies, ...scalars } = input;
  const form = new FormData();
  for (const [key, value] of Object.entries(scalars)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  // Repeat the key per entry so the ValidationPipe rebuilds a string[].
  fontAnomalies?.forEach((f) => form.append('fontAnomalies', f));
  if (bottleImage) form.append('bottleImage', bottleImage, 'bottle.jpg');
  return api.post<AgencyInspectionResult>('/tester/inspect', form);
}

/* ------------------------------------------------------------------------ */

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
  };
  return map[mime] ?? 'webm';
}
