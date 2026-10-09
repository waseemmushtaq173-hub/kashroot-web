'use client';

/**
 * Logistics & service provider hub — incoming transport requests, live
 * shipments, your fleet/services, and escrow payouts.
 *
 * Data lives in the browser (kr_provider_*) until a logistics API exists.
 */
import { useState } from 'react';
import { Banknote, CheckCircle2, Inbox, MapPin, PlusCircle, Power, Thermometer, Trash2, Truck, X } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { PayoutPanel } from '@/components/portal/PayoutPanel';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel, Tile, inr } from '@/components/portal/kit';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.provider;

interface Service {
  id: string;
  name: string;
  kind: string;
  capacity: string;
  rate: number;
  unit: string;
  available: boolean;
}

interface TransportRequest {
  id: string;
  from: string;
  to: string;
  load: string;
  date: string;
  offer: number;
  reefer: boolean;
}

type ShipStage = 'assigned' | 'picked' | 'transit' | 'delivered';
interface Shipment extends TransportRequest {
  stage: ShipStage;
  tempC?: number;
}

const KINDS = ['Reefer truck', 'Open truck', 'Pickup', 'Cold store', 'Loading crew'];

const SEED_SERVICES: Service[] = [
  { id: 'SV-1', name: '10-tonne reefer truck', kind: 'Reefer truck', capacity: '10 t · 2–4 °C', rate: 42, unit: 'km', available: true },
  { id: 'SV-2', name: 'Pickup (1.5 t)', kind: 'Pickup', capacity: '1.5 t', rate: 18, unit: 'km', available: true },
];

const SEED_REQUESTS: TransportRequest[] = [
  { id: 'TR-4410', from: 'Orchard cluster A', to: 'Central fruit mandi', load: '600 boxes apples', date: '2026-10-12', offer: 18500, reefer: false },
  { id: 'TR-4413', from: 'Riverside cold store', to: 'Northern wholesale market', load: '8 t controlled-atmosphere apples', date: '2026-10-14', offer: 64000, reefer: true },
];

const SEED_SHIPMENTS: Shipment[] = [
  { id: 'TR-4398', from: 'Hillside walnut co-op', to: 'Export packhouse', load: '120 bags walnuts', date: '2026-10-09', offer: 9200, reefer: false, stage: 'transit' },
];

const STAGES: Record<ShipStage, { label: string; tone: 'amber' | 'blue' | 'violet' | 'green'; next?: ShipStage; action?: string }> = {
  assigned: { label: 'Assigned', tone: 'amber', next: 'picked', action: 'Confirm pickup' },
  picked: { label: 'Picked up', tone: 'violet', next: 'transit', action: 'Start transit' },
  transit: { label: 'In transit', tone: 'blue', next: 'delivered', action: 'Mark delivered' },
  delivered: { label: 'Delivered', tone: 'green' },
};

const EMPTY_SERVICE = { name: '', kind: 'Reefer truck', capacity: '', rate: '' };

export default function ProviderDashboardPage() {
  const [tab, setTab] = useState('requests');
  const [services, setServices] = usePersistentState<Service[]>('kr_provider_services', SEED_SERVICES);
  const [requests, setRequests] = usePersistentState<TransportRequest[]>('kr_provider_requests', SEED_REQUESTS);
  const [shipments, setShipments] = usePersistentState<Shipment[]>('kr_provider_shipments', SEED_SHIPMENTS);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_SERVICE);

  const earned = shipments.filter((s) => s.stage === 'delivered').reduce((sum, s) => sum + s.offer, 0);

  const accept = (r: TransportRequest) => {
    setRequests((all) => all.filter((x) => x.id !== r.id));
    setShipments((all) => [{ ...r, stage: 'assigned', tempC: r.reefer ? 3 : undefined }, ...all]);
    toast.success(`${r.id} accepted — added to shipments`);
  };

  const decline = (r: TransportRequest) => {
    setRequests((all) => all.filter((x) => x.id !== r.id));
    toast.success(`${r.id} declined`);
  };

  const advance = (s: Shipment) => {
    const next = STAGES[s.stage].next;
    if (!next) return;
    setShipments((all) => all.map((x) => (x.id === s.id ? { ...x, stage: next } : x)));
    toast.success(next === 'delivered' ? `${s.id} delivered — ${inr.format(s.offer)} released from escrow` : `${s.id}: ${STAGES[next].label}`);
  };

  const logTemp = (s: Shipment) => {
    // Simulated probe reading: drifts within the 2–4.5 °C reefer band.
    const reading = Math.round((2 + (((s.tempC ?? 3) * 10 + 7) % 25) / 10) * 10) / 10;
    setShipments((all) => all.map((x) => (x.id === s.id ? { ...x, tempC: reading } : x)));
    toast.success(`${s.id}: ${reading} °C logged`);
  };

  const addService = () => {
    const rate = Number(draft.rate);
    if (!draft.name.trim() || !(rate > 0)) return toast.error('Add a name and a rate.');
    setServices((all) => [
      { id: localId('SV'), name: draft.name.trim(), kind: draft.kind, capacity: draft.capacity.trim() || '—', rate, unit: draft.kind === 'Cold store' ? 'box / month' : draft.kind === 'Loading crew' ? 'hour' : 'km', available: true },
      ...all,
    ]);
    setDraft(EMPTY_SERVICE);
    setAddOpen(false);
    toast.success('Service listed');
  };

  return (
    <PortalShell
      title="Logistics & services hub"
      description="Accept transport jobs, run cold-chain shipments from pickup to delivery, and get paid through escrow."
      eyebrow="Logistics"
      theme="provider"
      kpis={[
        { label: 'Open requests', value: String(requests.length), trend: 'Waiting for you' },
        { label: 'Active shipments', value: String(shipments.filter((s) => s.stage !== 'delivered').length), trend: `${shipments.filter((s) => s.reefer).length} cold-chain` },
        { label: 'Fleet & services', value: String(services.length), trend: `${services.filter((s) => s.available).length} available` },
        { label: 'Earned', value: inr.format(earned), trend: 'Released from escrow' },
      ]}
      tabs={[
        { id: 'requests', label: 'Requests', icon: Inbox, count: requests.length },
        { id: 'shipments', label: 'Shipments', icon: Truck, count: shipments.filter((s) => s.stage !== 'delivered').length },
        { id: 'fleet', label: 'Fleet & services', icon: PlusCircle },
        { id: 'payouts', label: 'Payouts', icon: Banknote },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={<Btn theme={theme} variant="white" icon={PlusCircle} onClick={() => setAddOpen(true)}>Add vehicle or service</Btn>}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile theme={theme} icon={MapPin} label="Live tracking" hint="Map view of every consignment" href="/tracking/dashboard" />
        <Tile theme={theme} icon={Thermometer} label="Mandi weather" hint="Road & weather before you dispatch" href="/mandi-weather" />
        <Tile theme={theme} icon={Banknote} label="Escrow" hint="See held and released payments" href="/escrow" />
      </div>

      {tab === 'requests' && (
        <Panel theme={theme} title="Incoming transport requests" icon={Inbox}>
          {requests.length === 0 ? (
            <EmptyState
              theme={theme}
              icon={Inbox}
              title="All caught up"
              text="New jobs from farmers and buyers will appear here."
              action={<Btn theme={theme} variant="soft" onClick={() => { setRequests(SEED_REQUESTS); toast.success('Demo requests reloaded'); }}>Load demo requests</Btn>}
            />
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{r.id} · pickup {r.date}</p>
                    <p className="font-semibold text-slate-900">{r.from} → {r.to}</p>
                    <p className="text-sm text-slate-600">{r.load}</p>
                    <div className="mt-1 flex gap-2">
                      {r.reefer && <Badge tone="blue">Cold chain 2–4 °C</Badge>}
                      <Badge tone="green">Offer {inr.format(r.offer)}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Btn theme={theme} size="sm" icon={CheckCircle2} onClick={() => accept(r)}>Accept</Btn>
                    <Btn theme={theme} size="sm" variant="ghost" icon={X} onClick={() => decline(r)}>Decline</Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'shipments' && (
        <Panel theme={theme} title="Shipments" icon={Truck}>
          {shipments.length === 0 ? (
            <EmptyState theme={theme} icon={Truck} title="No shipments yet" text="Accept a request to start a shipment." action={<Btn theme={theme} onClick={() => setTab('requests')}>View requests</Btn>} />
          ) : (
            <ul className="space-y-3">
              {shipments.map((s) => {
                const st = STAGES[s.stage];
                const steps: ShipStage[] = ['assigned', 'picked', 'transit', 'delivered'];
                const at = steps.indexOf(s.stage);
                return (
                  <li key={s.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs text-slate-500">{s.id} · {s.load}</p>
                        <p className="font-semibold text-slate-900">{s.from} → {s.to}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {s.reefer && <Badge tone="blue">{s.tempC ?? '—'} °C</Badge>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {s.reefer && s.stage !== 'delivered' && (
                          <Btn theme={theme} size="sm" variant="soft" icon={Thermometer} onClick={() => logTemp(s)}>Log temperature</Btn>
                        )}
                        {st.action && <Btn theme={theme} size="sm" icon={CheckCircle2} onClick={() => advance(s)}>{st.action}</Btn>}
                      </div>
                    </div>
                    <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Progress">
                      {steps.map((step, i) => (
                        <li key={step} className="text-center">
                          <div className={`h-1.5 rounded-full ${i <= at ? 'bg-teal-600' : 'bg-slate-200'}`} />
                          <span className={`mt-1 block text-[11px] ${i <= at ? 'font-semibold text-teal-800' : 'text-slate-400'}`}>{STAGES[step].label}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'fleet' && (
        <Panel theme={theme} title="Your fleet & services" icon={Truck} action={<Btn theme={theme} size="sm" icon={PlusCircle} onClick={() => setAddOpen(true)}>Add</Btn>}>
          {services.length === 0 ? (
            <EmptyState theme={theme} icon={Truck} title="No services listed" text="Add a truck, cold store or crew so requests can reach you." action={<Btn theme={theme} icon={PlusCircle} onClick={() => setAddOpen(true)}>Add vehicle or service</Btn>} />
          ) : (
            <ul className="divide-y divide-slate-900/5">
              {services.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-sm text-slate-500">{s.kind} · {s.capacity} · {inr.format(s.rate)}/{s.unit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.available ? <Badge tone="green">Available</Badge> : <Badge>Off duty</Badge>}
                    <Btn theme={theme} size="sm" variant="ghost" icon={Power} onClick={() => setServices((all) => all.map((x) => (x.id === s.id ? { ...x, available: !x.available } : x)))}>
                      {s.available ? 'Go off duty' : 'Go available'}
                    </Btn>
                    <Btn theme={theme} size="sm" variant="danger" icon={Trash2} onClick={() => { setServices((all) => all.filter((x) => x.id !== s.id)); toast.success('Service removed'); }}>
                      Remove
                    </Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'payouts' && <PayoutPanel theme={theme} storageKey="kr_provider_payout" />}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a vehicle or service"
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
            <Btn theme={theme} icon={PlusCircle} onClick={addService}>Add</Btn>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name">
              <input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. 6-tonne reefer" />
            </Field>
          </div>
          <Field label="Type">
            <select className={INPUT} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Capacity">
            <input className={INPUT} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="e.g. 6 t" />
          </Field>
          <Field label="Rate (₹)" hint={draft.kind === 'Cold store' ? 'Per box per month' : draft.kind === 'Loading crew' ? 'Per hour' : 'Per km'}>
            <input type="number" min={1} className={INPUT} value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </PortalShell>
  );
}
