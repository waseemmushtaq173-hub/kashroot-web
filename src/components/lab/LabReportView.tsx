'use client';

/**
 * A lab's report for one test, as the lab uploaded it: the values it measured (with its own rating words), its remarks
 * and its own file (PDF or photo, fetched on its own when asked for). The farmer can ask an expert about it; an expert
 * the farmer asked reads the same report from the advice thread. The database decides who may read (kr_lab_report).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, MessageCircleQuestion } from 'lucide-react';

import { Badge, Btn, INPUT } from '@/components/portal/kit';
import { PORTAL_THEMES } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { askExpertAboutReport, dataUrlToBlob, dayText, kindLabel, labReport, labReportFile, type LabReport } from '@/lib/db/lab';

const theme = PORTAL_THEMES.farmer;

/** The lab's own rating word, coloured by what it says (the words are the lab's; only the colour is ours). */
export function ratingTone(rating: string): 'green' | 'amber' | 'red' | 'slate' {
  const r = rating.toLowerCase();
  if (/(very|extremely)\s+(low|high)|deficien|toxic|critical|poor/.test(r)) return 'red';
  if (/\b(low|high|excess|acidic|alkaline|saline|marginal)\b/.test(r)) return 'amber';
  if (/\b(ok|normal|medium|adequate|sufficient|good|optimum|optimal|neutral)\b/.test(r)) return 'green';
  return 'slate';
}

export function LabReportView({ bookingId, canAsk = false, asked = false, onAsked }: { bookingId: string; canAsk?: boolean; asked?: boolean; onAsked?: () => void }) {
  const [report, setReport] = useState<LabReport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [sent, setSent] = useState(asked);

  useEffect(() => {
    let live = true;
    labReport(bookingId)
      .then((r) => live && setReport(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load the report.'));
    return () => {
      live = false;
    };
  }, [bookingId]);
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );

  const loadFile = async () => {
    setFileBusy(true);
    try {
      const f = await labReportFile(bookingId);
      if (!f) throw new Error('The lab did not attach a file.');
      setFile({ url: URL.createObjectURL(dataUrlToBlob(f.data)), name: f.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the file.');
    } finally {
      setFileBusy(false);
    }
  };
  const ask = async () => {
    setAskBusy(true);
    try {
      await askExpertAboutReport(bookingId, question);
      setSent(true);
      toast.success('Your question went to the experts, with the report.');
      onAsked?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send your question.');
    } finally {
      setAskBusy(false);
    }
  };

  if (error) return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>;
  if (report === undefined) return <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the report…</p>;
  if (report === null) return <p className="text-sm text-slate-700">The lab has not uploaded the report yet.</p>;

  return (
    <div className="space-y-4 text-sm text-slate-800">
      <div>
        <p className="text-base font-semibold text-slate-900">{report.test_name}</p>
        <p className="text-slate-600">
          {report.lab_name} · {kindLabel(report.sample_kind)}
          {report.crop ? ` · ${report.crop}` : ''} · {report.district}
        </p>
        <p className="text-xs text-slate-600">
          Booking {report.code}
          {report.report_no ? ` · report no. ${report.report_no}` : ''}
          {report.tested_on ? ` · tested on ${dayText(report.tested_on)}` : ''}
        </p>
      </div>

      {report.results.length > 0 && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full bg-white text-left">
            <caption className="sr-only">Values measured by {report.lab_name}</caption>
            <thead className="bg-forest-soft text-xs uppercase tracking-wide text-forest-deep">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Value</th>
                <th scope="col" className="px-3 py-2 font-semibold">Result</th>
                <th scope="col" className="px-3 py-2 font-semibold">Unit</th>
                <th scope="col" className="px-3 py-2 font-semibold">Lab’s rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.results.map((r, i) => (
                <tr key={`${r.parameter}-${i}`}>
                  <th scope="row" className="px-3 py-2 font-medium text-slate-900">{r.parameter}</th>
                  <td className="px-3 py-2 font-semibold tabular-nums">{r.value}</td>
                  <td className="px-3 py-2 text-slate-600">{r.unit || '—'}</td>
                  <td className="px-3 py-2">{r.rating ? <Badge tone={ratingTone(r.rating)}>{r.rating}</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.remarks && (
        <div className="rounded-xl bg-champagne-soft/60 p-3 ring-1 ring-champagne/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-champagne-deep">The lab’s remarks</p>
          <p className="mt-1 whitespace-pre-wrap">{report.remarks}</p>
        </div>
      )}

      {report.has_file && (
        <div>
          {file ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 font-semibold text-forest-deep ring-1 ring-forest-line hover:bg-forest-soft">
              <FileText className="h-4 w-4" aria-hidden /> Open the lab’s file ({file.name})
            </a>
          ) : (
            <Btn theme={theme} variant="soft" icon={fileBusy ? Loader2 : FileText} disabled={fileBusy} onClick={() => void loadFile()}>
              {fileBusy ? 'Loading the file…' : `Load the lab’s file${report.file_name ? ` (${report.file_name})` : ''}`}
            </Btn>
          )}
        </div>
      )}

      <p className="text-xs text-slate-600">These are the lab’s own results. KashRoot does not change them. A lab report is a measurement of one sample, not a prescription: ask an expert before you change what you apply.</p>

      {canAsk && (
        <div className="rounded-xl bg-forest-soft p-3 ring-1 ring-forest-line">
          {sent ? (
            <p className="font-semibold text-forest-deep">
              You asked the experts about this report. Their reply appears under{' '}
              <Link href="/farmer/ask-expert" className="underline underline-offset-2">Ask an expert</Link>.
            </p>
          ) : (
            <>
              <label htmlFor={`ask-${bookingId}`} className="font-semibold text-forest-deep">Ask an expert about this report</label>
              <p className="text-xs text-slate-600">The experts see the values above. Say what worries you, or leave it empty.</p>
              <textarea id={`ask-${bookingId}`} rows={3} maxLength={900} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="For example: my apple leaves are pale. What should I add?" className={`${INPUT} mt-2`} />
              <div className="mt-2">
                <Btn theme={theme} icon={askBusy ? Loader2 : MessageCircleQuestion} disabled={askBusy} onClick={() => void ask()}>{askBusy ? 'Sending…' : 'Send to the experts'}</Btn>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
