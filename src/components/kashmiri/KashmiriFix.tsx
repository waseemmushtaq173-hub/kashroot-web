'use client';

/**
 * "Not proper Kashmiri? Correct it" — under every Kashmiri answer.
 * Anyone (signed in or not) sends the answer, with their own wording if they
 * like, to KashRoot's Kashmiri editors. A Kashmiri editor's correction is
 * saved at once as an example answer the assistant follows.
 */
import { useRef, useState } from 'react';
import { Languages, Send } from 'lucide-react';
import { toast } from 'sonner';

import { KashmiriKeys } from '@/components/kashmiri/KashmiriKeys';
import { Btn, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { useKsText } from '@/lib/client/kashmiri';
import { addKsExample, isKsEditor, reportKashmiri } from '@/lib/db/kashmiri';
import { KS_PHRASES } from '@/lib/kashmiri/phrases';

const theme = PORTAL_THEMES.kissan ?? PORTAL_THEMES.farmer;

export function KashmiriFix({ question, reply }: { question: string; reply: string }) {
  const t = useKsText();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [editor, setEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const start = () => {
    setOpen(true);
    setSent(false);
    setNote('');
    setText('');
    // An editor starts from the answer and corrects it in place.
    void isKsEditor().then((yes) => {
      setEditor(yes === true);
      if (yes) setText(reply);
    });
  };

  const send = async () => {
    setBusy(true);
    try {
      if (editor) {
        if (!text.trim()) return toast.error('Write the correct Kashmiri first.');
        await addKsExample(question, text);
        toast.success('Saved. The assistant follows it within 5 minutes.');
        setOpen(false);
      } else {
        await reportKashmiri({ question, reply, suggestion: text, note });
        setSent(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={start} lang="ks" dir="rtl" className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-amber-800 underline-offset-2 hover:underline">
        <Languages className="h-3.5 w-3.5" aria-hidden /> {t('assistant.correct')}
      </button>
      {/* Only while open: closed windows would repeat every answer in the page. */}
      {open && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={KS_PHRASES['report.title'].en}
          footer={
            sent ? (
              <Btn theme={theme} onClick={() => setOpen(false)}>Close</Btn>
            ) : (
              <Btn theme={theme} icon={Send} disabled={busy} onClick={() => void send()}>
                {editor ? 'Save as the correct answer' : <span lang="ks">{t('report.send')} · Send</span>}
              </Btn>
            )
          }
        >
          {sent ? (
            <div className="space-y-2 text-center">
              <p lang="ks" dir="rtl" className="text-lg text-emerald-800">{t('report.thanks')}</p>
              <p className="text-sm text-slate-600">{KS_PHRASES['report.thanks'].en}</p>
            </div>
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
              <p lang="ks" dir="rtl" className="text-base text-slate-900">{t('report.title')}</p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">The answer</p>
                <p lang="ks" dir="rtl" className="mt-1 rounded-xl bg-slate-50 p-3 text-[15px] text-slate-800 ring-1 ring-slate-900/5">{reply}</p>
              </div>
              <label className="block">
                <span lang="ks" dir="rtl" className="block text-base text-slate-900">{t('report.write')}</span>
                <span className="block text-xs text-slate-500">{editor ? 'You are a Kashmiri editor: correct the answer below and save it.' : KS_PHRASES['report.write'].en}</span>
                <textarea ref={box} lang="ks" dir="rtl" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} className="mt-2 w-full rounded-xl border-0 bg-white px-3 py-2 text-[15px] text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-amber-500" />
              </label>
              <KashmiriKeys target={box} value={text} onChange={setText} />
              {!editor && (
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600">Anything else? (optional)</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-amber-500" />
                </label>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
