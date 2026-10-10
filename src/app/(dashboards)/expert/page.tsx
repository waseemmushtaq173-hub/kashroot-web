'use client';

/**
 * Advisory portal.
 *   Farmers: ask a question, book a soil test or request a video call (with
 *   an instant AI first answer), then follow replies — readable aloud.
 *   Approved experts (staff role EXPERT, granted in Admin → Approvals): a live
 *   queue of every request, replies, and in-browser video calls.
 *   Anyone else: apply to join as an agronomist.
 * Requests and replies live in the shared database (advisory_requests /
 * advisory_messages), so they reach the other side on any device.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, CheckCircle2, ClipboardList, FlaskConical, GraduationCap, Inbox, Loader2, MessageCircle, Send, ShieldAlert, Stethoscope, Video } from 'lucide-react';
import { toast } from 'sonner';

import { AskForm } from '@/components/advisory/AskForm';
import { RequestThread } from '@/components/advisory/RequestThread';
import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { KIND_LABEL, listRequests, myRoleRequest, requestStaffRole, STATUS_LABEL, type AdvisoryRequest, type RequestKind, type RequestStatus } from '@/lib/db/advisory';
import { ago, loadAccount, supabaseConfigured, type Account } from '@/lib/db/client';

const theme = PORTAL_THEMES.expert;

interface Article {
  id: string;
  kind: 'protocol' | 'sop';
  title: string;
  status?: string;
  body: string[];
}

const LIBRARY: Article[] = [
  { id: 'A-1', kind: 'protocol', title: 'Apple scab (Venturia inaequalis)', status: 'High alert · pre-bloom to petal fall', body: ['Protect from green tip onwards, especially before forecast rain; a curative spray must follow an infection period within the time on the label.', 'Rotate fungicide groups (e.g. dodine, captan, mancozeb, difenoconazole) as advised by SKUAST-K / the horticulture department, and follow label doses.', 'Rake and destroy fallen leaves in autumn; prune for an open canopy so leaves dry fast.'] },
  { id: 'A-2', kind: 'protocol', title: 'San José scale', body: ['Horticultural mineral oil at delayed dormancy (late February / early March) on a dry, frost-free day.', 'Scrape and destroy heavily infested twigs; check fruit for red-halo spots at harvest.'] },
  { id: 'A-3', kind: 'protocol', title: 'Walnut blight (Xanthomonas arboricola)', body: ['Copper-based sprays at early leaf emergence and before bloom; repeat after heavy spring rain as per label.', 'Avoid wetting leaves and nuts when irrigating.'] },
  { id: 'A-4', kind: 'sop', title: 'High-density apple planting', body: ['Rootstocks such as M9 or MM106; trellis and drip installed before planting.', 'Get a soil test first and correct pH and nutrients before the first season.'] },
  { id: 'A-5', kind: 'sop', title: 'Saffron corm grading & soil prep', body: ['Plant healthy corms heavier than about 8 g on well-drained upland soil.', 'Remove soft or rotting corms; ask your agriculture officer about corm treatment before planting.'] },
  { id: 'A-6', kind: 'sop', title: 'Taking a soil sample', body: ['Take 10–15 spots across the field in a zig-zag, 0–15 cm deep (0–30 cm for orchards, near the drip line).', 'Mix in a clean bucket, take about half a kilo, dry it in the shade and label it with your name, field and crop.'] },
];

const STATUS_TONE = { open: 'amber', accepted: 'blue', answered: 'green', closed: 'slate' } as const;
const KIND_ICON: Record<RequestKind, typeof MessageCircle> = { question: MessageCircle, soil_test: FlaskConical, video_call: Video };

export default function AdvisoryPage() {
  return (
    <Suspense>
      <Advisory />
    </Suspense>
  );
}

function Advisory() {
  const params = useSearchParams();
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [requests, setRequests] = useState<AdvisoryRequest[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'mine' | 'answered' | 'all'>('open');

  useEffect(() => {
    void loadAccount().then(setAccount);
  }, []);

  const isExpert = Boolean(account?.staff.some((r) => r === 'EXPERT' || r === 'ADMIN'));
  const requestedTab = params.get('tab');
  const askKind: RequestKind = requestedTab === 'video' ? 'video_call' : requestedTab === 'soil' ? 'soil_test' : 'question';
  const activeTab = tab ?? (isExpert ? 'queue' : requestedTab === 'library' || requestedTab === 'mine' ? requestedTab : 'ask');

  const refresh = useCallback(async () => {
    if (!account) return;
    try {
      setRequests(await listRequests(isExpert ? {} : { mine: account.id }));
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load requests.');
    }
  }, [account, isExpert]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (live) await refresh();
    };
    void tick();
    const id = window.setInterval(() => void tick(), 20000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const shown = useMemo(() => {
    if (!isExpert) return requests;
    if (filter === 'open') return requests.filter((r) => r.status === 'open' || (r.status === 'accepted' && r.expert_id === account?.id));
    if (filter === 'mine') return requests.filter((r) => r.expert_id === account?.id);
    if (filter === 'answered') return requests.filter((r) => r.status === 'answered');
    return requests;
  }, [account?.id, filter, isExpert, requests]);

  const openCount = requests.filter((r) => r.status === 'open').length;
  const calls = requests.filter((r) => r.kind === 'video_call' && r.status !== 'closed').length;
  const answered = requests.filter((r) => r.status === 'answered' || r.status === 'closed').length;

  if (account === undefined) {
    return <p className="flex items-center gap-2 p-10 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;
  }

  const tabs = isExpert
    ? [
        { id: 'queue', label: 'Requests', icon: Inbox, count: openCount },
        { id: 'library', label: 'Library', icon: BookOpen },
      ]
    : [
        { id: 'ask', label: 'Ask an expert', icon: Stethoscope },
        { id: 'mine', label: 'My requests', icon: ClipboardList, count: requests.filter((r) => r.status === 'answered' || r.status === 'accepted').length || undefined },
        { id: 'library', label: 'Library', icon: BookOpen },
      ];

  return (
    <PortalShell
      title="Advisory & experts"
      description={isExpert ? 'Farmers’ questions, soil-test requests and video calls — answer them here.' : 'Ask an agronomist, book a soil test or talk on video. Answers can be read aloud in your language.'}
      eyebrow={isExpert ? 'Expert desk' : 'Advisory'}
      theme="expert"
      kpis={
        isExpert
          ? [
              { label: 'Waiting for an expert', value: String(openCount), trend: 'All farmers' },
              { label: 'Video calls', value: String(calls), trend: 'Not closed' },
              { label: 'Answered', value: String(answered), trend: 'Answered or solved' },
            ]
          : [
              { label: 'Your requests', value: String(requests.length), trend: `${openCount} waiting` },
              { label: 'Answered', value: String(answered), trend: 'By experts' },
              { label: 'Video calls', value: String(calls), trend: 'Requested' },
            ]
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => {
        setTab(id);
        setOpenId(null);
      }}
    >
      {!supabaseConfigured || account === null ? (
        <Panel theme={theme}>
          <EmptyState theme={theme} icon={ShieldAlert} title="Please sign in again" text="Your session has ended. Sign in to the Advisory portal to continue." />
        </Panel>
      ) : openId ? (
        <RequestThread requestId={openId} account={account} asExpert={isExpert} onBack={() => { setOpenId(null); void refresh(); }} />
      ) : activeTab === 'ask' ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel theme={theme} title="Ask an expert" icon={Stethoscope}>
            <AskForm key={askKind} account={account} initialKind={askKind} onSent={(r) => { setRequests((all) => [r, ...all]); setOpenId(r.id); }} />
          </Panel>
          <Panel theme={theme} title="How it works" icon={CheckCircle2}>
            <ol className="space-y-3 text-sm text-slate-700">
              <li><strong className="text-slate-900">1.</strong> Tell us the problem — type it or tap <em>Speak</em>, and add a photo.</li>
              <li><strong className="text-slate-900">2.</strong> You get an instant first suggestion from KashRoot AI, which you can listen to.</li>
              <li><strong className="text-slate-900">3.</strong> An agronomist checks and replies. Soil tests and video calls are accepted by an expert, who may also phone you.</li>
              <li><strong className="text-slate-900">4.</strong> Find every answer under <em>My requests</em>, on any phone you sign in on.</li>
            </ol>
          </Panel>
        </div>
      ) : activeTab === 'library' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel theme={theme} title="Disease management" icon={ShieldAlert}>
            <ArticleList kind="protocol" />
          </Panel>
          <Panel theme={theme} title="Good practice" icon={CheckCircle2}>
            <ArticleList kind="sop" />
          </Panel>
          {!isExpert && <ExpertApply account={account} />}
        </div>
      ) : (
        <Panel theme={theme} title={isExpert ? 'Requests from farmers' : 'My requests'} icon={Inbox}>
          {isExpert && (
            <div role="group" aria-label="Show" className="mb-4 flex flex-wrap gap-2">
              {([['open', 'Waiting'], ['mine', 'Accepted by me'], ['answered', 'Answered'], ['all', 'All']] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter === id ? theme.solid : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {listError ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{listError}</p>
          ) : shown.length === 0 ? (
            <EmptyState theme={theme} icon={Inbox} title={isExpert ? 'Nothing waiting' : 'No requests yet'} text={isExpert ? 'New questions, soil tests and video calls from farmers appear here by themselves.' : 'Ask a question, book a soil test or request a video call.'} />
          ) : (
            <ul className="space-y-3">
              {shown.map((r) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full cursor-pointer items-start gap-3 rounded-2xl bg-white/80 p-4 text-left ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-md">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${theme.tile}`}><Icon className="h-5 w-5" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{KIND_LABEL[r.kind]}{r.crop ? ` · ${r.crop}` : ''}</span>
                          <Badge tone={STATUS_TONE[r.status as RequestStatus]}>{STATUS_LABEL[r.status as RequestStatus]}</Badge>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-sm text-slate-700">{r.message}</span>
                        <span className="mt-1 block text-xs text-slate-500">{isExpert ? `${r.farmer_name}${r.district ? ` · ${r.district}` : ''} · ` : ''}{ago(r.updated_at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </PortalShell>
  );
}

function ArticleList({ kind }: { kind: Article['kind'] }) {
  return (
    <ul className="space-y-3">
      {LIBRARY.filter((a) => a.kind === kind).map((a) => (
        <li key={a.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{a.title}</h3>
            {a.status && <Badge tone="amber">{a.status}</Badge>}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {a.body.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </li>
      ))}
      <li className="text-xs text-slate-500">General guidance — always follow the product label and your local horticulture department.</li>
    </ul>
  );
}

function ExpertApply({ account }: { account: Account }) {
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState({ phone: account.phone, details: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void myRoleRequest('EXPERT', account.id).then((r) => setStatus(r?.status ?? null)).catch(() => setStatus(null));
  }, [account.id]);

  const apply = async () => {
    if (form.details.trim().length < 10) return toast.error('Tell us your qualification and where you work.');
    setBusy(true);
    try {
      await requestStaffRole('EXPERT', { name: account.name, phone: form.phone, email: account.email, details: form.details.trim() });
      setStatus('pending');
      toast.success('Application sent — the KashRoot admin will review it');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel theme={theme} title="Are you an agronomist?" icon={GraduationCap} className="lg:col-span-2">
      {status === 'pending' ? (
        <p className="text-sm text-slate-700">Your application is with the KashRoot admin. Once approved, this portal shows the farmers’ request queue.</p>
      ) : status === 'rejected' ? (
        <p className="text-sm text-slate-700">Your last application was not approved. Contact KashRoot support, or apply again with more details below.</p>
      ) : null}
      {status !== 'pending' && status !== undefined && (
        <form className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
          <Field label="Mobile">
            <input className={INPUT} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Qualification and where you work">
            <input className={INPUT} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="e.g. MSc Horticulture, SKUAST-K; Horticulture Development Officer, Shopian" />
          </Field>
          <Btn theme={theme} type="submit" icon={Send} disabled={busy}>Apply</Btn>
        </form>
      )}
    </Panel>
  );
}
