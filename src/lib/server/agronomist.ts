/**
 * AI agronomy helpers, server-only:
 *   adviseFarmer  — a short first answer to a farmer's question (text, any language)
 *   diagnosePhoto — what a leaf/fruit/bark photo most likely shows (structured)
 *   readLabel     — the key facts printed on a fertiliser or pesticide label (structured)
 * All of them say when they're unsure and never invent doses or registrations.
 */
import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { claudeClient, imageBlock, LANGUAGE, MODEL, speechInstruction, splitSpeech, textOf, type Lang } from '@/lib/server/claude';

const AGRONOMIST = `You are KashRoot's agronomist assistant for orchard and field crops in Jammu and Kashmir, Himachal Pradesh and nearby hill regions — apple, pear, cherry, walnut, almond, apricot, plum, saffron, rice, maize and vegetables.

Many farmers cannot read well and listen to your answer through a phone's voice, so write short, plain spoken sentences: no markdown, no bullet symbols, no emojis.

Be honest about uncertainty: say what is most likely, what else it could be, and what to check. For chemicals, name the type or common active ingredient, never a dose — tell the farmer to follow the label and to confirm with the local horticulture or agriculture department. Prefer cultural and safe practices first. Mention the pre-harvest waiting period when fruit is close to picking. Never invent registrations, prices or research.`;

const FALLBACKS = { betas: ['server-side-fallback-2026-07-01'] as Anthropic.AnthropicBeta[], fallbacks: 'default' as const };

export interface AdviseInput {
  crop?: string;
  question: string;
  photo?: string | null;
  lang: Lang;
  /** Also return a Devanagari copy for a Hindi voice (Urdu or Kashmiri replies). */
  speakAs?: 'hi';
  kind?: 'question' | 'soil_test' | 'video_call';
}

export async function adviseFarmer(input: AdviseInput): Promise<{ text: string; speech?: string }> {
  const client = claudeClient();
  if (!client) throw new Error('not-configured');
  const image = imageBlock(input.photo);
  const wantSpeech = input.speakAs === 'hi' && (input.lang === 'ur' || input.lang === 'ks');
  const task =
    input.kind === 'soil_test'
      ? 'The farmer has asked for a soil test. In about 70 words, explain how to take a good soil sample from this field (depth, number of spots, mixing, drying, labelling) and what the test will tell them. An expert will contact them to arrange the test.'
      : input.kind === 'video_call'
        ? 'The farmer has asked for a video call with an expert. In about 50 words, tell them what to keep ready to show on camera (affected leaves, fruit, bark, the whole tree, spray history) so the call is quick. An expert will accept the call shortly.'
        : 'Give a first answer in about 110 words: the most likely problem, what to do now, and what to watch. End by saying an agronomist will also check and reply.';
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(image ? [image] : []),
    {
      type: 'text',
      text: `${input.crop ? `Crop: ${input.crop}\n` : ''}Farmer says: ${input.question}\n\n${task}\nReply in ${LANGUAGE[input.lang]}.${wantSpeech ? ` ${speechInstruction(input.lang)}` : ''}`,
    },
  ];
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: AGRONOMIST, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: { effort: 'low' },
    ...FALLBACKS,
  });
  if (res.stop_reason === 'refusal') return { text: 'Sorry, I cannot help with that. An agronomist will reply to you.' };
  return splitSpeech(textOf(res.content));
}

// ── Photo diagnosis ──

export interface Diagnosis {
  plant_seen: string;
  healthy: boolean;
  likely_problem: string;
  confidence: 'high' | 'medium' | 'low';
  signs_seen: string[];
  other_possibilities: string[];
  do_now: string[];
  prevent: string[];
  see_expert: boolean;
  photo_quality_note: string;
  summary_spoken: string;
  /** summary_spoken in Devanagari, for a Hindi voice (Urdu / Kashmiri only). */
  summary_devanagari: string;
}

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  properties: {
    plant_seen: { type: 'string', description: 'Crop and plant part visible, e.g. "Apple leaves"; "unclear" if not a plant photo' },
    healthy: { type: 'boolean' },
    likely_problem: { type: 'string', description: 'Most likely disease, pest, deficiency or damage; "None seen" if healthy; "Cannot tell" if the photo is unusable' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    signs_seen: { type: 'array', items: { type: 'string' }, description: 'What in the photo points to it' },
    other_possibilities: { type: 'array', items: { type: 'string' } },
    do_now: { type: 'array', items: { type: 'string' }, description: 'Practical steps now; chemicals by type/active ingredient only, no doses, follow the label' },
    prevent: { type: 'array', items: { type: 'string' } },
    see_expert: { type: 'boolean', description: 'True when confidence is not high, damage is spreading, or a lab test is needed' },
    photo_quality_note: { type: 'string', description: 'How to take a better photo if needed, else empty' },
    summary_spoken: { type: 'string', description: 'Three or four plain sentences to read aloud' },
    summary_devanagari: { type: 'string', description: 'When writing Urdu or Kashmiri: summary_spoken transliterated into Devanagari (same words, as pronounced) for a Hindi voice; otherwise empty' },
  },
  required: ['plant_seen', 'healthy', 'likely_problem', 'confidence', 'signs_seen', 'other_possibilities', 'do_now', 'prevent', 'see_expert', 'photo_quality_note', 'summary_spoken', 'summary_devanagari'],
  additionalProperties: false,
};

export async function diagnosePhoto(input: { photo: string; crop?: string; notes?: string; lang: Lang }): Promise<Diagnosis> {
  const client = claudeClient(55_000);
  if (!client) throw new Error('not-configured');
  const image = imageBlock(input.photo);
  if (!image) throw new Error('bad-image');
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: [{ type: 'text', text: AGRONOMIST, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          image,
          {
            type: 'text',
            text: `Look at this photo from a farmer${input.crop ? ` (crop: ${input.crop})` : ''}.${input.notes ? ` The farmer adds: ${input.notes}` : ''}
Diagnose only from what is visible. If the photo is blurry, too far away or not a plant, say "Cannot tell" with low confidence and explain how to retake it.
Write every text field in ${LANGUAGE[input.lang]}.`,
          },
        ],
      },
    ],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: DIAGNOSIS_SCHEMA } },
    ...FALLBACKS,
  });
  if (res.stop_reason === 'refusal') throw new Error('refused');
  return JSON.parse(textOf(res.content)) as Diagnosis;
}

// ── Fertiliser / pesticide label reading ──

export interface LabelReading {
  readable: boolean;
  product_type: 'fertilizer' | 'pesticide' | 'seed' | 'other' | 'unknown';
  product_name: string;
  manufacturer: string;
  batch_code: string;
  registration_no: string;
  grade_or_composition: string;
  mfg_date: string;
  expiry_date: string;
  mrp: string;
  missing_details: string[];
  warning_signs: string[];
  summary_spoken: string;
}

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    product_type: { type: 'string', enum: ['fertilizer', 'pesticide', 'seed', 'other', 'unknown'] },
    product_name: { type: 'string' },
    manufacturer: { type: 'string' },
    batch_code: { type: 'string', description: 'Batch / lot number exactly as printed, empty if not visible' },
    registration_no: { type: 'string', description: 'CIB&RC registration number for pesticides (e.g. CIR-xxxx), or FCO / licence number for fertilisers, exactly as printed; empty if not visible' },
    grade_or_composition: { type: 'string', description: 'e.g. "NPK 19:19:19" or "Mancozeb 75% WP"' },
    mfg_date: { type: 'string', description: 'As printed, empty if not visible' },
    expiry_date: { type: 'string', description: 'As printed, empty if not visible' },
    mrp: { type: 'string' },
    missing_details: { type: 'array', items: { type: 'string' }, description: 'Details a genuine Indian label must show that are missing or unreadable' },
    warning_signs: { type: 'array', items: { type: 'string' }, description: 'Signs of a fake or unsafe product: misspellings, no registration number, expired, odd packaging; empty if none' },
    summary_spoken: { type: 'string', description: 'Three plain sentences to read aloud' },
  },
  required: ['readable', 'product_type', 'product_name', 'manufacturer', 'batch_code', 'registration_no', 'grade_or_composition', 'mfg_date', 'expiry_date', 'mrp', 'missing_details', 'warning_signs', 'summary_spoken'],
  additionalProperties: false,
};

export async function readLabel(input: { photo: string; lang: Lang; today: string }): Promise<LabelReading> {
  const client = claudeClient(55_000);
  if (!client) throw new Error('not-configured');
  const image = imageBlock(input.photo);
  if (!image) throw new Error('bad-image');
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 5000,
    system: [
      {
        type: 'text',
        text: `You read fertiliser, pesticide and seed packaging for farmers in India. Copy printed details exactly; never guess a number you cannot read. Genuine pesticide labels show a CIB&RC registration number, batch number, manufacturing and expiry dates and the manufacturer's address; fertiliser bags show the grade, batch number, manufacturer and dates under the Fertiliser (Control) Order. Point out what is missing or suspicious, but do not call a product fake on appearance alone — say it should be checked.`,
      },
    ],
    messages: [
      {
        role: 'user',
        content: [image, { type: 'text', text: `Today is ${input.today}. Read this label. Write the free-text fields (missing_details, warning_signs, summary_spoken) in ${LANGUAGE[input.lang]}; keep codes, numbers and dates exactly as printed.` }],
      },
    ],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: LABEL_SCHEMA } },
    ...FALLBACKS,
  });
  if (res.stop_reason === 'refusal') throw new Error('refused');
  return JSON.parse(textOf(res.content)) as LabelReading;
}
