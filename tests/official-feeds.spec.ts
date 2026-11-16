/**
 * Official lists that keep themselves up to date (src/lib/officialFeed.ts).
 * No server, no network, no database: the file and the database are stood in for
 * by plain functions. The rows below are made up for the test only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { catalogUrl, parseCatalog, resourceFeedUrl, searchCatalog } from '@/lib/dataGovCatalog';
import { OFFICIAL_SOURCES } from '@/lib/officialSources';
import { feedUrlProblem, fetchFeedText, KEY_PLACEHOLDER, refreshFeed, resolveFeedUrl, type Feed, type FeedDb } from '@/lib/officialFeed';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const KEY = 'test-key-1234567890';
const ENV = { DATA_GOV_IN_API_KEY: KEY };

const csv = (n: number, from = 1) =>
  ['Registration No,Product,Registrant', ...Array.from({ length: n }, (_, i) => `CIR-${from + i}/2020-Test Product ${from + i} (EC),Test Product ${from + i},Test Company`)].join('\n');
const respond = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

test.describe('which links may be read', () => {
  test('official addresses pass', () => {
    for (const u of [
      'https://ppqs.gov.in/files/list.csv',
      'https://data.gov.in/files/x.csv',
      'https://www.skuastkashmir.ac.in/frmPDF.aspx?FN=list.csv',
      `https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}`,
    ]) expect(feedUrlProblem(u), u).toBeNull();
  });

  test('anything else is refused, in words', () => {
    for (const u of [
      '',
      'not a link',
      'http://ppqs.gov.in/list.csv',
      'https://example.com/list.csv',
      'https://gov.in.evil.com/list.csv',
      'https://evilgov.in/list.csv',
      'https://127.0.0.1/list.csv',
      'https://user:pw@ppqs.gov.in/list.csv',
      'https://ppqs.gov.in:8443/list.csv',
      `https://ppqs.gov.in/list.csv?k=${KEY_PLACEHOLDER}`,
    ]) expect(feedUrlProblem(u), u).toEqual(expect.any(String));
  });

  test('the data.gov.in key goes in from the server and is never asked for', () => {
    const ok = resolveFeedUrl(`https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}`, ENV);
    expect('url' in ok && ok.url).toContain(`api-key=${KEY}`);
    const none = resolveFeedUrl(`https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}`, {});
    expect('problem' in none && none.problem).toMatch(/key is not set/i);
  });
});

test.describe('reading the file', () => {
  test('a redirect to a non-official address is not followed', async () => {
    const seen: string[] = [];
    const r = await fetchFeedText('https://ppqs.gov.in/a.csv', ENV, async (u) => {
      seen.push(String(u));
      return new Response(null, { status: 302, headers: { location: 'https://evil.example.com/steal' } });
    });
    expect(r).toHaveProperty('problem');
    expect(seen).toEqual(['https://ppqs.gov.in/a.csv']);
  });

  test('a redirect to another official address is followed', async () => {
    const r = await fetchFeedText('https://ppqs.gov.in/a.csv', ENV, async (u) =>
      String(u).startsWith('https://ppqs.gov.in/') ? new Response(null, { status: 301, headers: { location: 'https://www.data.gov.in/b.csv' } }) : respond(csv(2)),
    );
    expect(r).toHaveProperty('text');
  });

  test('data.gov.in pages are joined under one heading row', async () => {
    const offsets: string[] = [];
    const r = await fetchFeedText(`https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}`, ENV, async (u) => {
      const url = new URL(String(u));
      offsets.push(url.searchParams.get('offset') ?? '');
      expect(url.searchParams.get('format')).toBe('csv');
      return respond(url.searchParams.get('offset') === '0' ? csv(1000) : csv(3, 1001));
    });
    expect(offsets).toEqual(['0', '1000']);
    const text = 'text' in r ? r.text : '';
    expect(text.match(/Registration No,Product,Registrant/g)).toHaveLength(1);
    expect(text.trim().split('\n')).toHaveLength(1004);
  });

  test('an error page, a server error and an Excel file are refused, and the key is never repeated', async () => {
    const json = await fetchFeedText(`https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}`, ENV, async () => respond('{"status":"error"}'));
    expect(json).toHaveProperty('problem');
    const down = await fetchFeedText(`https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}`, ENV, async () => respond('no', { status: 503 }));
    const dead = await fetchFeedText(`https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}`, ENV, async (u) => {
      throw new Error(`connect failed: ${String(u)}`);
    });
    const xlsx = await fetchFeedText('https://ppqs.gov.in/a.xlsx', ENV, async () => new Response(new Uint8Array([0x50, 0x4b, 3, 4])));
    for (const r of [json, down, dead, xlsx]) {
      expect(r).toHaveProperty('problem');
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
  });
});

/** A stand-in database that remembers every call. */
function fakeDb(opts: { importFails?: boolean; finish?: { status: string; removed?: number; error?: string } } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db: FeedDb = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'kr_registry_feed_import') return opts.importFails ? { data: null, error: { message: 'boom' } } : { data: (args.p_rows as unknown[]).length, error: null };
      if (name === 'kr_registry_feed_finish' && args.p_status === 'ok') return { data: opts.finish ?? { status: 'ok', removed: 2, seen: 5 }, error: null };
      return { data: null, error: null };
    },
  };
  return { db, calls, names: () => calls.map((c) => c.name) };
}

const FEED: Feed = { id: '11111111-1111-1111-1111-111111111111', kind: 'pesticide', source: 'Test list', source_url: 'https://ppqs.gov.in/x', file_url: 'https://ppqs.gov.in/list.csv', active: true, replace_missing: true, last_hash: null };

test.describe('bringing a list up to date', () => {
  test('a changed file is imported in order: begin, rows, finish', async () => {
    const { db, names, calls } = fakeDb();
    const out = await refreshFeed(FEED, { db, env: ENV, fetcher: async () => respond(csv(1500)) });
    expect(out).toEqual({ status: 'ok', rows: 1500, added: 1500, removed: 2 });
    expect(names()).toEqual(['kr_registry_feed_begin', 'kr_registry_feed_import', 'kr_registry_feed_import', 'kr_registry_feed_finish']);
    expect(calls.at(-1)?.args).toMatchObject({ p_status: 'ok', p_rows: 1500 });
    expect(String(calls.at(-1)?.args.p_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the same file again changes nothing', async () => {
    const first = fakeDb();
    await refreshFeed(FEED, { db: first.db, env: ENV, fetcher: async () => respond(csv(5)) });
    const hash = String(first.calls.at(-1)?.args.p_hash);
    const again = fakeDb();
    const out = await refreshFeed({ ...FEED, last_hash: hash }, { db: again.db, env: ENV, fetcher: async () => respond(csv(5)) });
    expect(out).toEqual({ status: 'unchanged' });
    expect(again.names()).toEqual(['kr_registry_feed_unchanged']);
    // "Check now" imports even so.
    const forced = fakeDb();
    expect((await refreshFeed({ ...FEED, last_hash: hash }, { db: forced.db, env: ENV, fetcher: async () => respond(csv(5)) }, true)).status).toBe('ok');
  });

  test('an unreadable or empty file changes nothing and says why', async () => {
    for (const body of ['', 'Registration No,Product,Registrant\n']) {
      const { db, names } = fakeDb();
      const out = await refreshFeed(FEED, { db, env: ENV, fetcher: async () => respond(body) });
      expect(out.status).toBe('failed');
      expect(names()).toEqual(['kr_registry_feed_finish']);
      expect(names()).not.toContain('kr_registry_feed_begin');
    }
  });

  test('a database refusal part-way is a failure that says so', async () => {
    const { db } = fakeDb({ importFails: true });
    const out = await refreshFeed(FEED, { db, env: ENV, fetcher: async () => respond(csv(5)) });
    expect(out).toMatchObject({ status: 'failed', error: expect.stringMatching(/partly updated/) });
  });

  test('a file with far fewer products than the list had is reported as failed (the database refuses to remove)', async () => {
    const { db } = fakeDb({ finish: { status: 'failed', removed: 0, error: 'The new file has far fewer products (3) than the list had (100); nothing was removed.' } });
    const out = await refreshFeed(FEED, { db, env: ENV, fetcher: async () => respond(csv(3)) });
    expect(out).toMatchObject({ status: 'failed', error: expect.stringMatching(/far fewer/) });
  });

  test('the key never reaches the database', async () => {
    const { db, calls } = fakeDb();
    await refreshFeed({ ...FEED, file_url: `https://api.data.gov.in/resource/abc?api-key=${KEY_PLACEHOLDER}` }, { db, env: ENV, fetcher: async () => respond(csv(4)) });
    expect(JSON.stringify(calls)).not.toContain(KEY);
  });
});

test.describe('the database and the routes', () => {
  const sql = read('supabase/migrations/20261125000000_official_feeds.sql');

  test('the feed table and its functions belong to the server alone', () => {
    expect(sql).toContain('alter table public.official_feeds enable row level security');
    expect(sql).toContain('revoke all on public.official_feeds from anon, authenticated');
    expect(sql).not.toMatch(/create policy[^;]*official_feeds/i);
    for (const fn of ['kr_registry_feed_begin', 'kr_registry_feed_import', 'kr_registry_feed_finish', 'kr_registry_feed_unchanged']) {
      expect(sql, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
      expect(sql, fn).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to[^;]*(anon|authenticated|public)`));
    }
  });

  test('the stats answer keeps its old shape and adds to it', () => {
    for (const key of ["'total'", "'last_import'", "'kinds'", "'lists'", "'source_url'", "'imported_at'", "'auto'", "'checked_at'"]) expect(sql).toContain(key);
  });

  test('only the Super Admin sets up a feed; the daily job needs its secret', () => {
    const admin = read('src/app/api/admin/official-feeds/route.ts');
    expect(admin.match(/isSuperAdminCaller\(request\)/g)?.length).toBe(2);
    const cron = read('src/app/api/cron/refresh-official-lists/route.ts');
    expect(cron).toMatch(/secret\.length >= 8/);
    expect(read('vercel.json')).toContain('/api/cron/refresh-official-lists');
    // The file's address (it can carry the key) is never sent back by the daily job.
    expect(cron).not.toMatch(/file_url/);
  });
});

test.describe('where the official files are published', () => {
  test('every listed source is the publisher\'s own official address', () => {
    expect(OFFICIAL_SOURCES.length).toBeGreaterThanOrEqual(5);
    for (const o of OFFICIAL_SOURCES) {
      expect(feedUrlProblem(o.url), o.url).toBeNull();
      expect(o.holds.length, o.name).toBeGreaterThan(30);
    }
  });

  test('data.gov.in is listed as statistics only, never as a product register', () => {
    const d = OFFICIAL_SOURCES.find((o) => o.url.includes('data.gov.in'));
    expect(d?.holds).toMatch(/Statistics only/);
    expect(d?.holds).toMatch(/No product-level register/);
  });

  test('the official-data folder says nothing is typed in by KashRoot', () => {
    const readme = read('official-data/README.md');
    expect(readme).toMatch(/never types a registration/i);
    expect(readme).toMatch(/not\*\* a source/);
  });
});

test.describe('copying the publishers\' documents', () => {
  const script = read('scripts/fetch-official-documents.py');
  const workflow = read('.github/workflows/fetch-official-documents.yml');

  test('only official pages are read, and the script never edits what it saves', () => {
    const pages = [...script.matchAll(/\(\s*'[a-z-]+',\s*'(https:\/\/[^']+)'/g)].map((m) => m[1]);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    for (const u of pages) expect(feedUrlProblem(u), u).toBeNull();
    // Every address, including each redirect, is checked before it is read.
    expect(script).toMatch(/if not official\(url\)/);
    expect(script).toMatch(/non-official address/);
    // Bytes in, the same bytes out: no decode, no rewrite.
    expect(script).toMatch(/fh\.write\(data\)/);
  });

  test('the job runs by hand, uses no secrets, and writes only into official-data', () => {
    expect(workflow).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).toMatch(/git add official-data\b/);
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: write/);
  });
});

test.describe('searching data.gov.in\'s catalogue', () => {
  const ID = '9ef84268-d588-465a-a308-a864a43d0070';
  const answer = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

  test('entries are read forgivingly; one without a resource id is left out', () => {
    const r = parseCatalog({
      total: 2,
      records: [
        { index_name: ID, title: 'A made-up dataset', org: ['Ministry', 'Department'], updated: '2026-01-02' },
        { title: 'No id at all' },
        { index_name: 'not-a-uuid', title: 'Bad id' },
        { resource_id: ID.replace('9', '8'), title: 'Other shape', org_type: 'Central' },
      ],
    });
    expect(r.total).toBe(2);
    expect(r.entries.map((e) => e.title)).toEqual(['A made-up dataset', 'Other shape']);
    expect(r.entries[0].org).toBe('Ministry › Department');
    expect(parseCatalog('nonsense')).toEqual({ entries: [], total: null });
  });

  test('the key is added by the server and never comes back out', async () => {
    const seen: string[] = [];
    const ok = await searchCatalog('pesticide', ENV, async (u) => {
      seen.push(String(u));
      return answer({ records: [{ index_name: ID, title: 'T' }] });
    });
    expect(ok).toMatchObject({ entries: [{ id: ID }] });
    expect(seen[0]).toContain(`api-key=${KEY}`);
    expect(seen[0]).toContain('filters%5Btitle%5D=pesticide');
    expect(JSON.stringify(ok)).not.toContain(KEY);
    for (const bad of [
      () => answer('x', { status: 403 }),
      () => answer('x', { status: 500 }),
      () => new Response('<html>', { status: 200 }),
    ]) {
      const r = await searchCatalog('pesticide', ENV, async () => bad());
      expect(r).toHaveProperty('problem');
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
    const dead = await searchCatalog('pesticide', ENV, async (u) => {
      throw new Error(`failed ${String(u)}`);
    });
    expect(JSON.stringify(dead)).not.toContain(KEY);
  });

  test('a short word, or no key, is refused before anything is sent', async () => {
    let sent = 0;
    const f = async () => {
      sent++;
      return answer({});
    };
    expect(await searchCatalog('ab', ENV, f)).toHaveProperty('problem');
    expect(await searchCatalog('pesticide', {}, f)).toHaveProperty('problem');
    expect(sent).toBe(0);
  });

  test('"use this dataset" gives a link that the feed rules accept, without the key', () => {
    const link = resourceFeedUrl(ID);
    expect(feedUrlProblem(link)).toBeNull();
    expect(link).toContain(KEY_PLACEHOLDER);
    expect(catalogUrl('x', KEY)).toContain('api.data.gov.in/lists');
  });

  test('only the Super Admin can search', () => {
    const route = read('src/app/api/admin/official-feeds/route.ts');
    const post = route.slice(route.indexOf('export async function POST'));
    expect(post.indexOf('isSuperAdminCaller(request)')).toBeGreaterThan(-1);
    expect(post.indexOf('isSuperAdminCaller(request)')).toBeLessThan(post.indexOf("search_datagov"));
  });
});

