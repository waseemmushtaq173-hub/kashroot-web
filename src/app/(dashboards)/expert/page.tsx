'use client';

/**
 * Advisory & knowledge hub — disease protocols and SOPs, ask-an-agronomist
 * queries (experts get an answer queue instead), and soil-test kit orders.
 *
 * Queries, published advisories and kit orders live in the browser
 * (kr_expert_*) until an advisory API exists.
 */
import { useState, useSyncExternalStore } from 'react';
import { BookOpen, CheckCircle2, Edit3, FlaskConical, ImagePlus, Lock, MessageCircle, Send, ShieldAlert, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.expert;

interface Article {
  id: string;
  kind: 'protocol' | 'sop';
  title: string;
  status?: string;
  body: string[];
}

interface Query {
  id: string;
  crop: string;
  question: string;
  photo?: string;
  answer?: string;
  askedAt: number;
}

type KitStage = 'requested' | 'delivered' | 'sample-sent' | 'report';
interface KitOrder {
  id: string;
  plot: string;
  crop: string;
  stage: KitStage;
}

const BUILT_IN: Article[] = [
  {
    id: 'A-1',
    kind: 'protocol',
    title: 'Apple scab (Venturia inaequalis)',
    status: 'High alert · pre-bloom to petal fall',
    body: [
      'Silver tip to green tip: Dodine 65 WP (60 g/100 L) or Captan 50 WP (300 g/100 L).',
      'Pink bud: Mancozeb 75 WP (300 g/100 L) or Propineb 70 WP (300 g/100 L).',
      'Prune the canopy open for airflow to keep leaf wetness down.',
    ],
  },
  {
    id: 'A-2',
    kind: 'protocol',
    title: 'San José scale',
    body: ['Horticultural mineral oil at 2% during delayed dormancy (late Feb / early March). Never spray in freezing temperatures.'],
  },
  {
    id: 'A-3',
    kind: 'protocol',
    title: 'Walnut blight (Xanthomonas arboricola)',
    body: ['Copper oxychloride 50 WP (300 g/100 L) at early leaf emergence and pre-bloom; repeat post-bloom after heavy spring rain.'],
  },
  {
    id: 'A-4',
    kind: 'sop',
    title: 'High-density apple planting',
    body: ['Rootstocks M9 or MM106. Pits 3×3×3 ft, rows 3 m apart, trees 1 m apart. Install drip and trellis before planting.'],
  },
  {
    id: 'A-5',
    kind: 'sop',
    title: 'Saffron corm grading & soil prep',
    body: ['Plant corms heavier than 8 g. Dip in Carbendazim 50 WP (2 g/L) for 30 minutes. Aim for soil pH 6.5–7.5 on well-drained upland soil.'],
  },
  {
    id: 'A-6',
    kind: 'sop',
    title: 'NPK for bearing apple trees',
    body: ['Soil-test first. Baseline for 10+ year trees: 700 g N, 350 g P₂O₅, 700 g K₂O per tree in split doses.'],
  },
];

const CANNED: Record<string, string> = {
  Apple: 'From your description this looks like early scab. Spray Captan 50 WP at 300 g/100 L now and again in 10 days, and remove fallen leaves. Send a close-up of the leaf underside if spots keep spreading.',
  Walnut: 'Black lesions on young nuts after rain usually mean walnut blight. Use copper oxychloride 50 WP at 300 g/100 L and avoid overhead irrigation.',
  Saffron: 'Yellowing with soft corms points to corm rot. Lift and discard affected corms, improve drainage, and treat healthy corms with Carbendazim before replanting.',
  Cherry: 'Cracking after rain is common close to harvest. Keep soil moisture even and consider a calcium chloride spray (0.5%) from fruit colour change.',
  Other: 'Thanks — an agronomist will follow up. Meanwhile, isolate affected plants and avoid spraying until the cause is confirmed.',
};

const KIT_STAGES: Record<KitStage, { label: string; tone: 'amber' | 'violet' | 'blue' | 'green'; next?: KitStage; action?: string }> = {
  requested: { label: 'Kit dispatched', tone: 'amber', next: 'delivered', action: 'I received the kit' },
  delivered: { label: 'Kit with you', tone: 'violet', next: 'sample-sent', action: 'I posted my sample' },
  'sample-sent': { label: 'Sample at the lab', tone: 'blue', next: 'report', action: 'Check for report' },
  report: { label: 'Report ready', tone: 'green' },
};

const NO_ARTICLES: Article[] = [];
const NO_QUERIES: Query[] = [];
const NO_KITS: KitOrder[] = [];
const NO_APPLICATION: { status?: string } | null = null;

const subscribeRole = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
const readRole = () => localStorage.getItem('user_role');

export default function ExpertDashboard() {
  const role = useSyncExternalStore(subscribeRole, readRole, () => null);
  const isExpert = role === 'EXPERT';
  const [application] = usePersistentState<{ status?: string } | null>('expert_application', NO_APPLICATION);
  const awaitingVerification = isExpert && application?.status === 'PENDING_VERIFICATION';

  const [tab, setTab] = useState('library');
  const [articles, setArticles] = usePersistentState<Article[]>('kr_expert_articles', NO_ARTICLES);
  const [queries, setQueries] = usePersistentState<Query[]>('kr_expert_queries', NO_QUERIES);
  const [kits, setKits] = usePersistentState<KitOrder[]>('kr_expert_kits', NO_KITS);

  const [ask, setAsk] = useState({ crop: 'Apple', question: '', photo: '' });
  const [publishOpen, setPublishOpen] = useState(false);
  const [draft, setDraft] = useState({ kind: 'protocol' as Article['kind'], title: '', body: '' });
  const [answering, setAnswering] = useState<Query | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [kit, setKit] = useState({ plot: '', crop: 'Apple' });

  const library = [...articles, ...BUILT_IN];
  const open = queries.filter((q) => !q.answer);

  const submitQuestion = () => {
    if (ask.question.trim().length < 10) return toast.error('Describe the problem in a sentence or two.');
    const q: Query = { id: localId('Q'), crop: ask.crop, question: ask.question.trim(), photo: ask.photo || undefined, askedAt: Date.now() };
    setQueries((all) => [q, ...all]);
    setAsk({ crop: ask.crop, question: '', photo: '' });
    toast.success('Question sent to an agronomist');
    if (!isExpert) {
      setTimeout(() => {
        setQueries((all) => all.map((x) => (x.id === q.id && !x.answer ? { ...x, answer: CANNED[q.crop] ?? CANNED.Other } : x)));
        toast.success('An agronomist replied to your question');
      }, 5000);
    }
  };

  const publish = () => {
    if (!draft.title.trim() || draft.body.trim().length < 20) return toast.error('Add a title and at least a couple of sentences.');
    setArticles((all) => [{ id: localId('A'), kind: draft.kind, title: draft.title.trim(), body: draft.body.trim().split(/\n+/) }, ...all]);
    setDraft({ kind: 'protocol', title: '', body: '' });
    setPublishOpen(false);
    toast.success('Advisory published to farmers');
  };

  const sendAnswer = () => {
    if (!answering || answerText.trim().length < 10) return toast.error('Write a short answer first.');
    setQueries((all) => all.map((x) => (x.id === answering.id ? { ...x, answer: answerText.trim() } : x)));
    setAnswering(null);
    setAnswerText('');
    toast.success('Answer sent to the farmer');
  };

  const orderKit = () => {
    if (!kit.plot.trim()) return toast.error('Name the plot so we can label your report.');
    setKits((all) => [{ id: localId('KIT'), plot: kit.plot.trim(), crop: kit.crop, stage: 'requested' }, ...all]);
    setKit({ plot: '', crop: kit.crop });
    toast.success('Soil test kit on its way');
  };

  const articleList = (kind: Article['kind']) => (
    <ul className="space-y-3">
      {library.filter((a) => a.kind === kind).map((a) => (
        <li key={a.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
          <div className="flex flex-wrap items-center gap-2">
            {kind === 'sop' && <BookOpen className="h-4 w-4 text-purple-700" aria-hidden />}
            <h3 className="font-semibold text-slate-900">{a.title}</h3>
            {a.status && <Badge tone="amber">{a.status}</Badge>}
            {!BUILT_IN.includes(a) && <Badge tone="violet">New</Badge>}
          </div>
          {a.body.length > 1 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {a.body.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-700">{a.body[0]}</p>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <PortalShell
      title="Advisory & knowledge hub"
      description="Disease protocols, orchard SOPs and direct answers from agronomists — plus soil testing at your door."
      eyebrow={isExpert ? 'Expert desk' : 'Advisory'}
      theme="expert"
      kpis={[
        { label: 'Protocols & SOPs', value: String(library.length), trend: `${articles.length} published here` },
        { label: isExpert ? 'Open queries' : 'Your questions', value: String(isExpert ? open.length : queries.length), trend: `${queries.filter((q) => q.answer).length} answered` },
        { label: 'Soil tests', value: String(kits.length), trend: `${kits.filter((k) => k.stage === 'report').length} reports ready` },
      ]}
      tabs={[
        { id: 'library', label: 'Library', icon: BookOpen },
        { id: 'ask', label: isExpert ? 'Answer queue' : 'Ask an agronomist', icon: MessageCircle, count: isExpert ? open.length : undefined },
        { id: 'soil', label: 'Soil test', icon: FlaskConical },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        isExpert ? (
          <Btn theme={theme} variant="white" icon={awaitingVerification ? Lock : Edit3} disabled={awaitingVerification} onClick={() => setPublishOpen(true)}>Publish advisory</Btn>
        ) : (
          <Btn theme={theme} variant="white" icon={MessageCircle} onClick={() => setTab('ask')}>Ask an agronomist</Btn>
        )
      }
    >
      {awaitingVerification && (
        <p className="mb-6 flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Your credentials are being verified by the platform admin. Publishing and answering unlock once you are approved.
        </p>
      )}

      {tab === 'library' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel theme={theme} title="Disease management protocols" icon={ShieldAlert}>
            {articleList('protocol')}
          </Panel>
          <Panel theme={theme} title="Best practices & SOPs" icon={CheckCircle2}>
            {articleList('sop')}
          </Panel>
        </div>
      )}

      {tab === 'ask' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <Panel theme={theme} title={isExpert ? 'Post a question for the network' : 'Describe the problem'} icon={Stethoscope}>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submitQuestion(); }}>
              <Field label="Crop">
                <select className={INPUT} value={ask.crop} onChange={(e) => setAsk({ ...ask, crop: e.target.value })}>
                  {Object.keys(CANNED).map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="What are you seeing?">
                <textarea rows={4} className={INPUT} value={ask.question} onChange={(e) => setAsk({ ...ask, question: e.target.value })} placeholder="e.g. Olive-green spots on leaves after last week's rain" />
              </Field>
              <Field label="Photo (optional)" hint={ask.photo ? `Attached: ${ask.photo}` : 'A close-up helps the diagnosis.'}>
                <span className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-purple-700" aria-hidden />
                  <input type="file" accept="image/*" className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:text-purple-800" onChange={(e) => setAsk({ ...ask, photo: e.target.files?.[0]?.name ?? '' })} />
                </span>
              </Field>
              <Btn theme={theme} type="submit" icon={Send}>Send question</Btn>
            </form>
          </Panel>
          <Panel theme={theme} title={isExpert ? 'Answer queue' : 'Your questions'} icon={MessageCircle}>
            {queries.length === 0 ? (
              <EmptyState theme={theme} icon={MessageCircle} title="No questions yet" text={isExpert ? 'Farmer questions land here.' : 'Ask about a pest, disease or nutrient problem — replies usually come in minutes.'} />
            ) : (
              <ul className="space-y-3">
                {queries.map((q) => (
                  <li key={q.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="violet">{q.crop}</Badge>
                      {q.answer ? <Badge tone="green">Answered</Badge> : <Badge tone="amber">Waiting for agronomist</Badge>}
                      {q.photo && <span className="text-xs text-slate-500">📎 {q.photo}</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-800">{q.question}</p>
                    {q.answer && <p className="mt-3 rounded-xl bg-purple-50 p-3 text-sm text-purple-950">{q.answer}</p>}
                    {isExpert && !q.answer && (
                      <Btn theme={theme} size="sm" className="mt-3" icon={awaitingVerification ? Lock : Send} disabled={awaitingVerification} onClick={() => { setAnswering(q); setAnswerText(''); }}>Answer</Btn>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === 'soil' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <Panel theme={theme} title="Order a soil test kit" icon={FlaskConical}>
            <p className="mb-4 text-sm text-slate-600">NPK, pH, organic carbon and micronutrients. The report comes with a fertiliser plan for your crop.</p>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); orderKit(); }}>
              <Field label="Plot name">
                <input className={INPUT} value={kit.plot} onChange={(e) => setKit({ ...kit, plot: e.target.value })} placeholder="e.g. Upper terrace block" />
              </Field>
              <Field label="Crop">
                <select className={INPUT} value={kit.crop} onChange={(e) => setKit({ ...kit, crop: e.target.value })}>
                  {['Apple', 'Walnut', 'Saffron', 'Cherry', 'Almond', 'Vegetables'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Btn theme={theme} type="submit" icon={FlaskConical}>Request soil test kit</Btn>
            </form>
          </Panel>
          <Panel theme={theme} title="Your soil tests" icon={CheckCircle2}>
            {kits.length === 0 ? (
              <EmptyState theme={theme} icon={FlaskConical} title="No tests yet" text="Order a kit to get a fertiliser plan for your plot." />
            ) : (
              <ul className="space-y-3">
                {kits.map((k) => {
                  const st = KIT_STAGES[k.stage];
                  return (
                    <li key={k.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500">{k.id} · {k.crop}</p>
                          <p className="font-semibold text-slate-900">{k.plot}</p>
                        </div>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      {k.stage === 'report' ? (
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                          {[['pH', '6.8'], ['Nitrogen', 'Medium'], ['Phosphorus', 'Low'], ['Potassium', 'High']].map(([l, v]) => (
                            <div key={l} className="rounded-xl bg-purple-50 p-2 text-center"><dt className="text-xs text-purple-700">{l}</dt><dd className="font-semibold text-purple-950">{v}</dd></div>
                          ))}
                          <p className="col-span-full text-xs text-slate-600">Plan: add 350 g P₂O₅ per bearing tree before flowering; hold back potash this season.</p>
                        </dl>
                      ) : (
                        <Btn theme={theme} size="sm" variant="soft" className="mt-3" onClick={() => { setKits((all) => all.map((x) => (x.id === k.id ? { ...x, stage: st.next! } : x))); toast.success(KIT_STAGES[st.next!].label); }}>
                          {st.action}
                        </Btn>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish an advisory"
        wide
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Btn>
            <Btn theme={theme} icon={Edit3} onClick={publish}>Publish</Btn>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Type">
            <select className={INPUT} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Article['kind'] })}>
              <option value="protocol">Disease protocol</option>
              <option value="sop">Best practice / SOP</option>
            </select>
          </Field>
          <Field label="Title">
            <input className={INPUT} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Powdery mildew in nurseries" />
          </Field>
          <Field label="Guidance" hint="One step per line.">
            <textarea rows={5} className={INPUT} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={answering !== null}
        onClose={() => setAnswering(null)}
        title="Answer farmer query"
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setAnswering(null)}>Cancel</Btn>
            <Btn theme={theme} icon={Send} onClick={sendAnswer}>Send answer</Btn>
          </>
        }
      >
        {answering && (
          <div className="grid gap-4">
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><strong>{answering.crop}:</strong> {answering.question}</p>
            <Field label="Your answer">
              <textarea rows={5} className={INPUT} value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
