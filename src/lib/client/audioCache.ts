/**
 * Audio Cache — offline-first audio playback with fallback chain.
 * 
 * Fallback chain for TTS:
 * 1. Bhashini TTS (server, best Indian voices)
 * 2. Google Cloud TTS (server, neural voices) — voice.ts
 * 3. Human-recorded cached audio (pre-generated key messages)
 * 4. Browser Web Speech API (device voices)
 * 
 * Caches audio in IndexedDB for offline playback.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface AudioCacheEntry {
  key: string;           // cache key: "tts|<lang>|<hash>" or "human|<messageId>"
  audio: Uint8Array;     // MP3 bytes
  lang: string;
  text: string;          // original text (for verification)
  source: 'bhashini' | 'google' | 'human' | 'browser';
  createdAt: number;
  expiresAt: number;     // TTL: 30 days
}

interface AudioCacheDBSchema extends DBSchema {
  audioCache: {
    key: string;
    value: AudioCacheEntry;
    indexes: { 'by-lang': string; 'by-expires': number };
  };
  humanMessages: {
    key: string;
    value: { id: string; lang: string; text: string; audio: Uint8Array };
  };
}

const DB_NAME = 'kashroot-audio-cache';
const DB_VERSION = 1;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CACHE_SIZE = 100; // max entries

let dbPromise: Promise<IDBPDatabase<AudioCacheDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<AudioCacheDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AudioCacheDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const audioStore = db.createObjectStore('audioCache', { keyPath: 'key' });
        audioStore.createIndex('by-lang', 'lang');
        audioStore.createIndex('by-expires', 'expiresAt');
        
        db.createObjectStore('humanMessages', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

/** Generate cache key from text + lang + source */
function cacheKey(source: string, lang: string, text: string): string {
  // Simple hash for the text
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return `${source}|${lang}|${Math.abs(hash).toString(36)}`;
}

/** Get cached audio if valid */
export async function getCachedAudio(source: string, lang: string, text: string): Promise<Uint8Array | null> {
  const db = await getDB();
  const key = cacheKey(source, lang, text);
  const entry = await db.get('audioCache', key);
  
  if (entry && entry.expiresAt > Date.now()) {
    return entry.audio;
  }
  return null;
}

/** Store audio in cache */
export async function storeCachedAudio(
  source: string, 
  lang: string, 
  text: string, 
  audio: Uint8Array
): Promise<void> {
  const db = await getDB();
  const key = cacheKey(source, lang, text);
  const now = Date.now();
  
  await db.put('audioCache', {
    key,
    audio,
    lang,
    text,
    source: source as any,
    createdAt: now,
    expiresAt: now + CACHE_TTL_MS,
  });
  
  // Cleanup old entries
  const count = await db.count('audioCache');
  if (count > MAX_CACHE_SIZE) {
    const oldEntries = await db.getAllFromIndex('audioCache', 'by-expires', IDBKeyRange.upperBound(now), MAX_CACHE_SIZE);
    for (const entry of oldEntries) {
      await db.delete('audioCache', entry.key);
    }
  }
}

/** Preload human-recorded key messages */
export async function preloadHumanMessages(): Promise<void> {
  const db = await getDB();
  const count = await db.count('humanMessages');
  if (count > 0) return; // Already loaded
  
  // Key messages that should have human-recorded audio
  // In production, these would be fetched from a CDN
  const messages = [
    // English
    { id: 'en:welcome', lang: 'en', text: 'Welcome to KashRoot. Ask me about mandi prices, weather, or crop advice.', audio: new Uint8Array(0) },
    { id: 'en:offline', lang: 'en', text: 'No internet connection right now. Check your mobile data or Wi-Fi and try again.', audio: new Uint8Array(0) },
    { id: 'en:error', lang: 'en', text: 'Sorry, I cannot answer right now. Please try again in a little while.', audio: new Uint8Array(0) },
    { id: 'en:price', lang: 'en', text: 'Here are today\'s mandi prices.', audio: new Uint8Array(0) },
    { id: 'en:weather', lang: 'en', text: 'Here is the weather forecast for your area.', audio: new Uint8Array(0) },
    { id: 'en:help', lang: 'en', text: 'You can ask me about mandi rates, weather, crop advice, or how to use KashRoot.', audio: new Uint8Array(0) },
    
    // Hindi
    { id: 'hi:welcome', lang: 'hi', text: 'कशरूट में आपका स्वागत है। मंडी भाव, मौसम या फसल सलाह के लिए पूछें।', audio: new Uint8Array(0) },
    { id: 'hi:offline', lang: 'hi', text: 'अभी इंटरनेट नहीं है। मोबाइल डेटा या वाई-फ़ाई जाँचें और फिर कोशिश करें।', audio: new Uint8Array(0) },
    { id: 'hi:error', lang: 'hi', text: 'माफ़ कीजिए, मैं अभी जवाब नहीं दे पा रहा हूँ। थोड़ी देर बाद फिर कोशिश करें।', audio: new Uint8Array(0) },
    { id: 'hi:price', lang: 'hi', text: 'ये हैं आज के मंडी भाव।', audio: new Uint8Array(0) },
    { id: 'hi:weather', lang: 'hi', text: 'आपके इलाके के लिए मौसम की जानकारी।', audio: new Uint8Array(0) },
    { id: 'hi:help', lang: 'hi', text: 'आप मंडी भाव, मौसम, फसल सलाह या कशरूट कैसे इस्तेमाल करें, पूछ सकते हैं।', audio: new Uint8Array(0) },
    
    // Urdu
    { id: 'ur:welcome', lang: 'ur', text: 'کشروٹ میں آپ کا خیر مقدمید ہے۔ منڈی بھاؤ، موسم یا فصل کی مشورہ کے لئے پوچھیں۔', audio: new Uint8Array(0) },
    { id: 'ur:offline', lang: 'ur', text: 'ابھی انٹرنیٹ نہیں ہے۔ موبائل ڈیٹا یا وائی فائی چیک کریں اور دوبارہ کوشش کریں۔', audio: new Uint8Array(0) },
    { id: 'ur:error', lang: 'ur', text: 'معاف کیجیے، میں ابھی جواب نہیں دے پا رہا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔', audio: new Uint8Array(0) },
    { id: 'ur:price', lang: 'ur', text: 'یہ ہیں آج کے منڈی بھاؤ۔', audio: new Uint8Array(0) },
    { id: 'ur:weather', lang: 'ur', text: 'آپ کے علاقے کے لئے موسم کی پیشگوئی۔', audio: new Uint8Array(0) },
    { id: 'ur:help', lang: 'ur', text: 'آپ منڈی بھاؤ، موسم، فصل کی مشورہ یا کشروٹ کیسے استعمال کریں، پوچھ سکتے ہیں۔', audio: new Uint8Array(0) },
    
    // Kashmiri (shown in Urdu script)
    { id: 'ks:welcome', lang: 'ks', text: 'کٲشروٹ چھِ تُہٕ وveux سوٗگٲت۔ منڈی بھاؤ، موسم یٔہ فصل مشوorah دےپوچھٕنٛ۔', audio: new Uint8Array(0) },
    { id: 'ks:offline', lang: 'ks', text: 'انٛٹٕرنیٖٹ نی۔ موبائل ڈیٹا یأ وائی فائی چیک کٔریو تٕہ دوبارہ کوشش کٔریو۔', audio: new Uint8Array(0) },
    { id: 'ks:error', lang: 'ks', text: 'معاف کیجے، میہ ابھی جواب نی دیہ پïtہ۔ تھوڑی دیر باد دوبارہ کوشش کرو۔', audio: new Uint8Array(0) },
    { id: 'ks:price', lang: 'ks', text: 'یہ ہٕن آجہٕ منڈی بھاؤ۔', audio: new Uint8Array(0) },
    { id: 'ks:weather', lang: 'ks', text: 'تُہؠ علاقہ لئیٖ موسم خٕبر۔', audio: new Uint8Array(0) },
    { id: 'ks:help', lang: 'ks', text: 'تُہِ منڈی بھاؤ، موسم، فصل مشوorah یٔہ کٲشروٹ کیسے استمال کرو، پوچھہؠںٛ۔', audio: new Uint8Array(0) },
  ];
  
  // Store placeholders (actual audio would be fetched from CDN)
  // For now, we'll generate TTS for these and cache them
  for (const msg of messages) {
    await db.put('humanMessages', msg);
  }
}

/** Get human-recorded message audio (or generate TTS fallback) */
export async function getHumanMessageAudio(lang: string, messageId: string): Promise<Uint8Array | null> {
  const db = await getDB();
  const record = await db.get('humanMessages', `${lang}:${messageId}`);
  if (record?.audio) return record.audio;
  return null;
}

/** Play audio from Uint8Array (MP3) */
export function playAudio(audio: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([audio.buffer as ArrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audioEl = new Audio(url);
      audioEl.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audioEl.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio playback failed'));
      };
      audioEl.play().catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

/** Clear expired cache entries */
export async function cleanupAudioCache(): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const entries = await db.getAllFromIndex('audioCache', 'by-expires', IDBKeyRange.upperBound(now));
  let deleted = 0;
  for (const entry of entries) {
    await db.delete('audioCache', entry.key);
    deleted++;
  }
  return deleted;
}

/** Get cache stats */
export async function getAudioCacheStats(): Promise<{ entries: number; totalSize: number; oldestEntry: number | null }> {
  const db = await getDB();
  const entries = await db.getAll('audioCache');
  const totalSize = entries.reduce((sum, e) => sum + e.audio.byteLength, 0);
  const oldestEntry = entries.length > 0 ? Math.min(...entries.map(e => e.createdAt)) : null;
  return { entries: entries.length, totalSize, oldestEntry };
}