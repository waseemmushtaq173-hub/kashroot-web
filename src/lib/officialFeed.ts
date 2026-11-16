/**
 * Keeping an official list up to date by itself (KashRoot TrueScan).
 *
 * A "feed" is an official list (official_products) plus the link of the file
 * the Government publishes it in. The daily job — and the admin's "Check now" —
 * reads that link; only when the file has changed does the list change:
 * new products are added, products no longer in the file are removed, and a
 * file that cannot be read, or that holds far fewer products than before,
 * changes nothing and says why.
 *
 * Nothing here knows any product: every row comes from the file, and the
 * file must be at an official address (.gov.in, .nic.in, .ac.in, .res.in).
 * No side effects of its own — the network and the database are passed in, so
 * it is tested without either. The server routes call it with the service key.
 */
import { decodeListFile, parseOfficialList, type OfficialKind, type OfficialRow } from '@/lib/fertilizer/officialList';

export const KEY_PLACEHOLDER = '{DATA_GOV_IN_API_KEY}';
/** Addresses a feed may be read from: the Government's and the universities'. */
const OFFICIAL_SUFFIXES = ['.gov.in', '.nic.in', '.ac.in', '.res.in'];
/** The largest file read (megabytes of text). */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
const PAGE = 1000;
const MAX_PAGES = 100;
const BATCH = 1000;
const REDIRECTS = 3;

export interface Feed {
  id: string;
  kind: OfficialKind;
  source: string;
  source_url: string;
  file_url: string;
  active: boolean;
  replace_missing: boolean;
  last_hash: string | null;
}

export type FeedOutcome =
  | { status: 'ok'; rows: number; added: number; removed: number }
  | { status: 'unchanged' }
  | { status: 'failed'; error: string };

/** Why a file link cannot be used, in plain words; null when it can. */
export function feedUrlProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return 'Add the link of the file.';
  if (text.length > 1000) return 'The link is too long.';
  let url: URL;
  try {
    url = new URL(text.replace(KEY_PLACEHOLDER, 'key'));
  } catch {
    return 'This is not a web link.';
  }
  if (url.protocol !== 'https:') return 'The link must start with https://';
  if (url.username || url.password) return 'The link must not contain a user name or password.';
  if (url.port && url.port !== '443') return 'The link must use the standard https port.';
  const host = url.hostname.toLowerCase();
  if (!OFFICIAL_SUFFIXES.some((s) => host.endsWith(s))) {
    return 'Only an official address is read: one ending in .gov.in, .nic.in, .ac.in or .res.in (for example ppqs.gov.in, data.gov.in, skuastkashmir.ac.in).';
  }
  if (text.includes(KEY_PLACEHOLDER) && host !== 'api.data.gov.in') {
    return `${KEY_PLACEHOLDER} can only be used in an api.data.gov.in link.`;
  }
  return null;
}

/** The link as it is read: the data.gov.in key goes in from the server's own settings. */
export function resolveFeedUrl(raw: string, env: { DATA_GOV_IN_API_KEY?: string }): { url: string } | { problem: string } {
  const bad = feedUrlProblem(raw);
  if (bad) return { problem: bad };
  const text = raw.trim();
  if (!text.includes(KEY_PLACEHOLDER)) return { url: text };
  const key = (env.DATA_GOV_IN_API_KEY ?? '').trim();
  if (!key) return { problem: 'The data.gov.in key is not set on this site (DATA_GOV_IN_API_KEY).' };
  return { url: text.split(KEY_PLACEHOLDER).join(encodeURIComponent(key)) };
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** One GET with the redirects followed by hand: every address passed through must be official too. */
async function getBytes(url: string, fetcher: Fetcher): Promise<{ bytes: ArrayBuffer } | { problem: string }> {
  let at = url;
  for (let hop = 0; hop <= REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetcher(at, { redirect: 'manual', cache: 'no-store', headers: { accept: 'text/csv,text/plain,*/*' }, signal: AbortSignal.timeout(40_000) });
    } catch {
      // The address is not repeated: it may carry the data.gov.in key.
      return { problem: 'The official site could not be reached.' };
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const next = res.headers.get('location');
      let target: string;
      try {
        target = new URL(next ?? '', at).toString();
      } catch {
        return { problem: 'The official site sent us somewhere we could not follow.' };
      }
      if (feedUrlProblem(target)) return { problem: 'The official site sent us to an address that is not official, so it was not followed.' };
      at = target;
      continue;
    }
    if (!res.ok) return { problem: `The official site answered with an error (${res.status}).` };
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_FILE_BYTES) return { problem: 'The file is too large to read.' };
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_FILE_BYTES) return { problem: 'The file is too large to read.' };
    return { bytes };
  }
  return { problem: 'The official site sent us around in circles.' };
}

/** A data.gov.in resource API link: read it a page at a time (its default is ten rows). */
function isDataGovResource(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'api.data.gov.in' && u.pathname.startsWith('/resource/');
  } catch {
    return false;
  }
}

/** The text of the file at a link — all pages of a data.gov.in resource joined under one heading row. */
export async function fetchFeedText(rawUrl: string, env: { DATA_GOV_IN_API_KEY?: string }, fetcher: Fetcher = fetch): Promise<{ text: string } | { problem: string }> {
  const resolved = resolveFeedUrl(rawUrl, env);
  if ('problem' in resolved) return resolved;

  if (!isDataGovResource(resolved.url)) {
    const got = await getBytes(resolved.url, fetcher);
    if ('problem' in got) return got;
    return decodeListFile(got.bytes);
  }

  let heading = '';
  const body: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const u = new URL(resolved.url);
    u.searchParams.set('format', 'csv');
    u.searchParams.set('limit', String(PAGE));
    u.searchParams.set('offset', String(page * PAGE));
    const got = await getBytes(u.toString(), fetcher);
    if ('problem' in got) return got;
    const decoded = decodeListFile(got.bytes);
    if ('problem' in decoded) return decoded;
    const text = decoded.text.replace(/^﻿/, '');
    // An error comes back as JSON, not as a table.
    if (/^\s*[{[]/.test(text)) return { problem: 'data.gov.in did not return a table (check the resource link and the key).' };
    const nl = text.indexOf('\n');
    if (nl < 0) break;
    const head = text.slice(0, nl).replace(/\r$/, '');
    if (page === 0) heading = head;
    else if (head !== heading) return { problem: 'data.gov.in changed its columns part-way through the list.' };
    const rest = text.slice(nl + 1).replace(/\s+$/, '');
    const read = rest ? parseOfficialList(`${heading}\n${rest}`).read : 0;
    if (rest) body.push(rest);
    if (read < PAGE) break;
  }
  if (!heading || !body.length) return { problem: 'data.gov.in returned no rows for this resource.' };
  return { text: `${heading}\n${body.join('\n')}\n` };
}

/** The database calls a refresh needs (the service key's functions in 20261125000000_official_feeds.sql). */
export interface FeedDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

/** The file's fingerprint (Web Crypto, so this module also loads in the browser for the admin screen). */
async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads the feed's file once and brings its list up to date. Never throws; `force` imports even if the file is unchanged. */
export async function refreshFeed(
  feed: Feed,
  deps: { db: FeedDb; env: { DATA_GOV_IN_API_KEY?: string }; fetcher?: Fetcher },
  force = false,
): Promise<FeedOutcome> {
  const { db, env, fetcher } = deps;
  const fail = async (error: string): Promise<FeedOutcome> => {
    await db.rpc('kr_registry_feed_finish', { p_feed: feed.id, p_status: 'failed', p_hash: null, p_rows: null, p_error: error });
    return { status: 'failed', error };
  };
  try {
    const got = await fetchFeedText(feed.file_url, env, fetcher);
    if ('problem' in got) return await fail(got.problem);

    const parsed = parseOfficialList(got.text);
    if (parsed.problem) return await fail(parsed.problem);
    if (!parsed.rows.length) return await fail('The file has no products in it.');

    const hash = await sha256(got.text);
    if (!force && feed.last_hash === hash) {
      await db.rpc('kr_registry_feed_unchanged', { p_feed: feed.id });
      return { status: 'unchanged' };
    }

    const begun = await db.rpc('kr_registry_feed_begin', { p_feed: feed.id });
    if (begun.error) return await fail('The list could not be updated (the database refused it).');

    let added = 0;
    for (let i = 0; i < parsed.rows.length; i += BATCH) {
      const batch: OfficialRow[] = parsed.rows.slice(i, i + BATCH);
      const done = await db.rpc('kr_registry_feed_import', { p_feed: feed.id, p_rows: batch });
      if (done.error) return await fail(`The list was only partly updated (${i.toLocaleString('en-IN')} of ${parsed.rows.length.toLocaleString('en-IN')} products); it will be tried again.`);
      added += Number(done.data) || 0;
    }

    const finished = await db.rpc('kr_registry_feed_finish', { p_feed: feed.id, p_status: 'ok', p_hash: hash, p_rows: parsed.rows.length, p_error: null });
    if (finished.error) return { status: 'failed', error: 'The list was read but its status could not be saved.' };
    const result = (finished.data ?? {}) as { status?: string; removed?: number; error?: string | null };
    if (result.status === 'failed') return { status: 'failed', error: result.error ?? 'The list was not updated.' };
    return { status: 'ok', rows: parsed.rows.length, added, removed: Number(result.removed) || 0 };
  } catch {
    return await fail('The list could not be updated.').catch(() => ({ status: 'failed', error: 'The list could not be updated.' }) as FeedOutcome);
  }
}
