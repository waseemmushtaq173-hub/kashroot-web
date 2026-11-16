'use client';

/**
 * Hub and Super Admin: every soil and lab test booking on KashRoot, by lab: who booked what, where it stands, and whether
 * the report is in. Read only, and without phone numbers or addresses (kr_lab_oversight). A lab that misbehaves is
 * suspended from the Businesses list; the Super Admin sees the same here to know where to look.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { Badge, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';
import { labOversight, LAB_STATUS_LABEL, visitText, type LabStatus, type OversightBooking } from '@/lib/db/lab';

const theme = PORTAL_THEMES.admin;
const TONE: Record<LabStatus, 'amber' | 'blue' | 'green' | 'red' | 'slate'> = { requested: 'amber', accepted: 'blue', sample_collected: 'blue', report_ready: 'green', declined: 'red', cancelled: 'slate' };

export function LabOversightPanel() {
  const [data, setData] = useState<{ labs: number; bookings: OversightBooking[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await labOversight());
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not load the lab tests.');
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

  const by = (s: LabStatus) => (data?.bookings ?? []).filter((b) => b.status === s).length;
  return (
    <Panel theme={theme} title="Soil and lab tests" icon={FlaskConical} action={<RefreshBtn onRefresh={load} />} className="lg:col-span-2">
      {problem && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">{problem}</p>}
      {data && (
        <>
          <p className="mb-3 text-sm text-slate-700">
            <strong>{data.labs}</strong> lab{data.labs === 1 ? '' : 's'} joined · <strong>{data.bookings.length}</strong> booking{data.bookings.length === 1 ? '' : 's'} (newest 300) · {by('requested')} waiting for a lab · {by('accepted') + by('sample_collected')} in progress · {by('report_ready')} reports in
          </p>
          {data.bookings.length === 0 ? (
            <EmptyState theme={theme} icon={FlaskConical} title="No test booked yet" text="Bookings appear here as farmers book tests with labs." />
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="min-w-full bg-white text-left text-xs">
                <caption className="sr-only">Soil and lab test bookings</caption>
                <thead className="bg-forest-soft text-forest-deep">
                  <tr>{['Booking', 'Lab', 'Test', 'Farmer', 'District', 'Status', 'Visit', 'Price', 'Report'].map((h) => <th key={h} scope="col" className="px-2.5 py-1.5 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.bookings.map((b) => (
                    <tr key={b.code}>
                      <th scope="row" className="px-2.5 py-1.5 font-mono font-semibold">{b.code}</th>
                      <td className="px-2.5 py-1.5">{b.lab}</td>
                      <td className="px-2.5 py-1.5">{b.test_name}</td>
                      <td className="px-2.5 py-1.5">{b.farmer}</td>
                      <td className="px-2.5 py-1.5">{b.district}</td>
                      <td className="px-2.5 py-1.5"><Badge tone={TONE[b.status]}>{LAB_STATUS_LABEL[b.status]}</Badge></td>
                      <td className="px-2.5 py-1.5">{visitText(b.scheduled_for) || '—'}</td>
                      <td className="px-2.5 py-1.5 tabular-nums">{inr(b.price)}</td>
                      <td className="px-2.5 py-1.5">{b.has_report ? 'In' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
