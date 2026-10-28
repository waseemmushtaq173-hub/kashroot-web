'use client';

/**
 * Advisory → Answer bank (experts and admins): what the KashRoot assistant
 * answers from before it asks the AI.
 *   Waiting for review  questions the AI answered, most asked first. The
 *                       expert corrects the answer, adds other ways people
 *                       ask it, and approves it into the bank — or discards it.
 *   Add an answer       the expert's own answer, in any of the four languages.
 *   In the bank         search, edit, hide or remove; how often each was used.
 * The assistant tells people whose answer it is ("Answer from KashRoot
 * expert …"), so an answer here is said in the expert's name.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NOT_ANSWERED } from '@/lib/notAnswered';
import { BookCheck, Check, EyeOff, Eye, Inbox, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

import { Badge, Btn, EmptyState, Field, INPUT, Panel, type PortalTheme } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import {
  addAnswer,
  ANSWER_LANGS,
  approveSuggestion,
  discardSuggestion,
  listAnswers,
  listSuggestions,
  phrasings,
  removeAnswer,
  updateAnswer,
  type AnswerInput,
  type AnswerLang,
  type BankEntry,
  type Suggestion,
} from '@/lib/db/answerBank';

const LANG_LABEL = Object.fromEntries(ANSWER_LANGS.map((l) => [l.id, l.label])) as Record<AnswerLang, string>;
const rtl = (lang: AnswerLang) => (lang === 'ur' || lang === 'ks' ? 'rtl' : undefined);

/** The form for one answer: language, the ways people ask, the answer, a topic. */
function AnswerForm({
  theme,
  initial,
  saveLabel,
  onSave,
  onCancel,
}: {
  theme: PortalTheme;
  initial: AnswerInput;
  saveLabel: string;
  onSave: (input: AnswerInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [lang, setLang] = useState<AnswerLang>(initial.lang);
  const [asks, setAsks] = useState(initial.questions.join('\n'));
  const [answer, setAnswer] = useState(initial.answer);
  const [topic, setTopic] = useState(initial.topic ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const questions = phrasings(asks);
    if (!questions.length) return toast.error('Write at least one way people ask this.');
    if (answer.trim().length < 2) return toast.error('Write the answer.');
    setBusy(true);
    try {
      await onSave({ lang, questions, answer: answer.trim(), topic: topic.trim() || null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the answer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Language">
          <select className={`${INPUT} min-h-11`} value={lang} onChange={(e) => setLang(e.target.value as AnswerLang)}>
            {ANSWER_LANGS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Topic (optional)">
          <input className={`${INPUT} min-h-11`} value={topic} maxLength={60} onChange={(e) => setTopic(e.target.value)} placeholder="Apple scab, cold storage, PM-Kisan…" />
        </Field>
      </div>
      <Field label="Ways people ask it" hint="One per line — the words farmers really use, in any script (for example “scab spray kab karein”). Up to 20.">
        <textarea className={INPUT} rows={3} dir={rtl(lang)} value={asks} onChange={(e) => setAsks(e.target.value)} />
      </Field>
      <Field label="Answer" hint="Short and plain, as you would say it to a grower. It is read aloud. Never a dose: say to follow the label.">
        <textarea className={INPUT} rows={4} dir={rtl(lang)} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn theme={theme} icon={Check} className="min-h-11" disabled={busy} aria-busy={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : saveLabel}
        </Btn>
        {onCancel && (
          <Btn theme={theme} variant="ghost" icon={X} className="min-h-11" disabled={busy} onClick={onCancel}>
            Cancel
          </Btn>
        )}
      </div>
    </div>
  );
}

export function AnswerBank({ theme }: { theme: PortalTheme }) {
  const [answers, setAnswers] = useState<BankEntry[] | null>(null);
  const [waiting, setWaiting] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([listAnswers(), listSuggestions()]);
      setAnswers(a);
      setWaiting(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the answer bank.');
    }
  }, []);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!answers || !q) return answers ?? [];
    return answers.filter((a) => [a.answer, a.topic ?? '', ...a.questions].some((t) => t.toLowerCase().includes(q)));
  }, [answers, find]);

  const act = async (run: () => Promise<void>, done: string) => {
    try {
      await run();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    }
  };

  if (error) return <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">{error}</p>;
  if (!answers || !waiting) return <p className="text-sm text-slate-600">Loading the answer bank…</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-700">
        The KashRoot assistant answers from here first — at once, in your words, and even when the AI is not working. People see whose answer it is (“Answer from KashRoot expert {'<your name>'}”). Prices and weather never come from here: they are always read live.
      </p>

      <Panel theme={theme} title={`Waiting for review${waiting.length ? ` (${waiting.length})` : ''}`} icon={Inbox}>
        {waiting.length === 0 ? (
          <EmptyState theme={theme} icon={Inbox} title="Nothing to review" text="When the assistant cannot answer a question, it appears here for an expert to answer. Most-asked first." />
        ) : (
          <ul className="space-y-3">
            {waiting.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{LANG_LABEL[s.lang]}</Badge>
                  {s.asked > 1 && <Badge tone="amber">Asked {s.asked} times</Badge>}
                </div>
                <p dir={rtl(s.lang)} className="mt-2 font-semibold text-slate-900">{s.question}</p>
                {reviewing === s.id ? (
                  <div className="mt-3">
                    <AnswerForm
                      theme={theme}
                      initial={{ lang: s.lang, questions: [s.question], answer: s.reply === NOT_ANSWERED ? '' : s.reply, topic: null }}
                      saveLabel={s.reply === NOT_ANSWERED ? 'Save into the bank' : 'Approve into the bank'}
                      onCancel={() => setReviewing(null)}
                      onSave={async (input) => {
                        await approveSuggestion(s, input);
                        setReviewing(null);
                        toast.success('Saved. The assistant now answers this from the bank.');
                        await load();
                      }}
                    />
                  </div>
                ) : (
                  <>
                    {s.reply === NOT_ANSWERED ? (
                      <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">The assistant did not know the answer. Write it, and the assistant answers it from now on.</p>
                    ) : (
                      <p dir={rtl(s.lang)} className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        <span className="block text-xs font-semibold text-slate-500">Suggested answer:</span>
                        {s.reply}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn theme={theme} icon={Pencil} className="min-h-11" onClick={() => setReviewing(s.id)}>{s.reply === NOT_ANSWERED ? 'Write the answer' : 'Check and approve'}</Btn>
                      <Btn theme={theme} variant="ghost" icon={Trash2} className="min-h-11" onClick={() => void act(() => discardSuggestion(s.id), 'Discarded.')}>
                        Discard
                      </Btn>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        theme={theme}
        title={`In the bank (${answers.length})`}
        icon={BookCheck}
        action={
          !adding && (
            <Btn theme={theme} size="sm" icon={Plus} className="min-h-11" onClick={() => setAdding(true)}>
              Add an answer
            </Btn>
          )
        }
      >
        {adding && (
          <div className="mb-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <AnswerForm
              theme={theme}
              initial={{ lang: 'en', questions: [], answer: '', topic: null }}
              saveLabel="Add to the bank"
              onCancel={() => setAdding(false)}
              onSave={async (input) => {
                await addAnswer(input);
                setAdding(false);
                toast.success('Added. The assistant answers this from the bank now.');
                await load();
              }}
            />
          </div>
        )}
        {answers.length > 0 && (
          <label className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <span className="sr-only">Search the answers</span>
            <input className={`${INPUT} min-h-11`} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search questions, answers or topics" />
          </label>
        )}
        {answers.length === 0 ? (
          !adding && <EmptyState theme={theme} icon={BookCheck} title="The bank is empty" text="Add the questions farmers ask you most, or approve the AI's answers waiting above." />
        ) : (
          <ul className="space-y-3">
            {shown.map((a) => (
              <li key={a.id} className={`rounded-2xl p-4 ring-1 ${a.status === 'hidden' ? 'bg-slate-50 ring-slate-200' : 'bg-white ring-slate-200'}`}>
                {editing === a.id ? (
                  <AnswerForm
                    theme={theme}
                    initial={{ lang: a.lang, questions: a.questions, answer: a.answer, topic: a.topic }}
                    saveLabel="Save"
                    onCancel={() => setEditing(null)}
                    onSave={async (input) => {
                      await updateAnswer(a.id, input);
                      setEditing(null);
                      toast.success('Saved.');
                      await load();
                    }}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{LANG_LABEL[a.lang]}</Badge>
                      {a.topic && <Badge>{a.topic}</Badge>}
                      {a.status === 'hidden' ? <Badge tone="red">Hidden</Badge> : <Badge tone="green">Live</Badge>}
                      <span className="text-xs text-slate-500">
                        {a.origin === 'ai_reviewed' ? 'AI answer approved by' : 'Written by'} {a.author_name ?? 'a KashRoot expert'} · used {a.uses.toLocaleString('en-IN')} times
                      </span>
                    </div>
                    <p dir={rtl(a.lang)} className="mt-2 text-sm font-semibold text-slate-900">{a.questions.join(' · ')}</p>
                    <p dir={rtl(a.lang)} className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.answer}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn theme={theme} variant="soft" icon={Pencil} className="min-h-11" onClick={() => setEditing(a.id)}>Edit</Btn>
                      <Btn
                        theme={theme}
                        variant="ghost"
                        icon={a.status === 'hidden' ? Eye : EyeOff}
                        className="min-h-11"
                        onClick={() => void act(() => updateAnswer(a.id, { status: a.status === 'hidden' ? 'approved' : 'hidden' }), a.status === 'hidden' ? 'The assistant uses it again.' : 'Hidden: the assistant no longer uses it.')}
                      >
                        {a.status === 'hidden' ? 'Use again' : 'Hide'}
                      </Btn>
                      <Btn
                        theme={theme}
                        variant="ghost"
                        icon={Trash2}
                        className="min-h-11"
                        onClick={() => {
                          if (window.confirm('Remove this answer from the bank for good?')) void act(() => removeAnswer(a.id), 'Removed.');
                        }}
                      >
                        Remove
                      </Btn>
                    </div>
                  </>
                )}
              </li>
            ))}
            {shown.length === 0 && <li className="text-sm text-slate-600">No answer matches “{find}”.</li>}
          </ul>
        )}
      </Panel>
    </div>
  );
}
