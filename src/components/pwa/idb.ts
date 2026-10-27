/**
 * The outbox: things written without signal (a question to the experts, a
 * Mandi Helper's rate, a listing draft), kept on this phone in IndexedDB
 * until they are sent (outboxSend.ts). A tiny helper of our own instead of a
 * package; nothing here talks to the internet, so it can be tested alone.
 *
 * Each item belongs to the account that wrote it and is sent only while that
 * account is signed in. Its id is also the id of the row it becomes, so
 * sending it twice (the answer lost on a weak signal) cannot make two.
 */

export type OutboxKind = 'question' | 'rate' | 'listing';

export interface OutboxItem<P = unknown> {
  id: string;
  kind: OutboxKind;
  /** The account that wrote it. */
  userId: string;
  /** What the person sees in "Waiting to send", e.g. “Question: Black spots on leaves”. */
  label: string;
  payload: P;
  createdAt: number;
  /** waiting: sent when online; sending: on its way; failed: the person decides (Try again / Remove). */
  state: 'waiting' | 'sending' | 'failed';
  /** Why the last try did not work, in plain words. */
  error?: string;
  tries: number;
}

const DB_NAME = 'kashroot-offline';
const STORE = 'outbox';
/** Other tabs hear about changes on this channel; this tab gets a window event. */
const CHANNEL = 'kr-outbox';
export const OUTBOX_CHANGED = 'kr-outbox-changed';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This phone cannot keep things for later (no storage).'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab with a newer version: let it upgrade, open again next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('This phone cannot keep things for later.'));
    req.onblocked = () => reject(new Error('Close KashRoot in your other tabs, then try again.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** One request in its own transaction; resolves when the transaction is done. */
async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error('Could not save on this phone.'));
  });
}

/** This tab, so it does not hear its own changes twice (a channel also reaches other listeners in the same tab). */
const TAB = Math.random().toString(36).slice(2);

function changed() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OUTBOX_CHANGED));
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ from: TAB });
    ch.close();
  } catch {
    /* an older browser: other tabs see it on their next look */
  }
}

/** A new id (also the id of the row the item becomes). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // crypto.randomUUID needs https; getRandomValues does not.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const outbox = {
  /** Keeps a new item (state waiting). */
  async add<P>(item: Omit<OutboxItem<P>, 'createdAt' | 'state' | 'tries'> & Partial<Pick<OutboxItem<P>, 'createdAt'>>): Promise<OutboxItem<P>> {
    const full: OutboxItem<P> = { createdAt: Date.now(), ...item, state: 'waiting', tries: 0 };
    await run('readwrite', (s) => s.put(full));
    changed();
    return full;
  },
  /** Every item on this phone, oldest first (all accounts: filter by userId). */
  async all(): Promise<OutboxItem[]> {
    const items = await run<OutboxItem[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
    return items.sort((a, b) => a.createdAt - b.createdAt);
  },
  async get(id: string): Promise<OutboxItem | undefined> {
    return run<OutboxItem | undefined>('readonly', (s) => s.get(id) as IDBRequest<OutboxItem | undefined>);
  },
  /** Changes some fields of an item (no-op when it was removed meanwhile). */
  async update(id: string, patch: Partial<Pick<OutboxItem, 'state' | 'error' | 'tries'>>): Promise<void> {
    const item = await outbox.get(id);
    if (!item) return;
    const next = { ...item, ...patch };
    if (patch.error === undefined && 'error' in patch) delete next.error;
    await run('readwrite', (s) => s.put(next));
    changed();
  },
  async remove(id: string): Promise<void> {
    await run('readwrite', (s) => s.delete(id));
    changed();
  },
};

/** Calls `fn` whenever the outbox changes, in this tab or another. Returns the stop function. */
export function onOutboxChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(OUTBOX_CHANGED, fn);
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<{ from?: string } | null>) => {
      if (e.data?.from !== TAB) fn();
    };
  } catch {
    ch = null;
  }
  return () => {
    window.removeEventListener(OUTBOX_CHANGED, fn);
    ch?.close();
  };
}
