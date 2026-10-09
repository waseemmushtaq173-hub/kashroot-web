'use client';

/**
 * Buyer portal — purchase inquiries, saved suppliers and shortcuts into the
 * marketplace, price comparison, escrow and tracking.
 *
 * Inquiries and saved suppliers have no API yet, so they live in the browser
 * (kr_buyer_inquiries / kr_buyer_suppliers). Quotes arrive on a timer so the
 * accept → escrow flow can be exercised end to end.
 */
import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  FileText,
  MapPin,
  MessageSquare,
  PlusCircle,
  Scale,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trash2,
  TrendingUp,
  Truck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel, Tile, inr } from '@/components/portal/kit';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.buyer;

interface Inquiry {
  id: string;
  crop: string;
  quantity: string;
  targetPrice: number;
  city: string;
  quotes: number;
  bestQuote: number | null;
  status: 'open' | 'accepted';
}

interface Supplier {
  id: string;
  name: string;
  region: string;
  speciality: string;
  rating: number;
}

const SEED_INQUIRIES: Inquiry[] = [
  { id: 'INQ-2041', crop: 'Delicious Apples (Grade A)', quantity: '500 boxes', targetPrice: 1400, city: 'Delhi', quotes: 3, bestQuote: 1430, status: 'open' },
  { id: 'INQ-2038', crop: 'Walnut Kernels (Light)', quantity: '200 kg', targetPrice: 900, city: 'Mumbai', quotes: 0, bestQuote: null, status: 'open' },
];

const SEED_SUPPLIERS: Supplier[] = [
  { id: 'SUP-1', name: 'Green Valley Orchards', region: 'Hill orchards', speciality: 'Apples · Pears', rating: 4.8 },
  { id: 'SUP-2', name: 'Crocus Fields Collective', region: 'Saffron belt', speciality: 'Saffron', rating: 4.9 },
  { id: 'SUP-3', name: 'Walnut Grove Growers', region: 'Northern valleys', speciality: 'Walnuts · Almonds', rating: 4.6 },
  { id: 'SUP-4', name: 'Lakeside Fresh', region: 'Lake district', speciality: 'Vegetables · Lotus stem', rating: 4.5 },
];

const EMPTY_FORM = { crop: '', quantity: '', targetPrice: '', city: '' };

export default function BuyerDashboardPage() {
  const [tab, setTab] = useState('overview');
  const [inquiries, setInquiries] = usePersistentState<Inquiry[]>('kr_buyer_inquiries', SEED_INQUIRIES);
  const [suppliers, setSuppliers] = usePersistentState<Supplier[]>('kr_buyer_suppliers', SEED_SUPPLIERS);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [messageTo, setMessageTo] = useState<Supplier | null>(null);
  const [message, setMessage] = useState('');

  // Suppliers "respond" to open inquiries without quotes a few seconds later.
  useEffect(() => {
    const waiting = inquiries.filter((q) => q.status === 'open' && q.quotes === 0);
    if (waiting.length === 0) return;
    const timer = window.setTimeout(() => {
      setInquiries((all) =>
        all.map((q) =>
          q.status === 'open' && q.quotes === 0
            ? { ...q, quotes: 2, bestQuote: Math.round(q.targetPrice * 1.04) }
            : q,
        ),
      );
      toast.info('New supplier quotes arrived');
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [inquiries, setInquiries]);

  const accepted = inquiries.filter((q) => q.status === 'accepted');

  const submitInquiry = () => {
    const price = Number(form.targetPrice);
    if (!form.crop.trim() || !form.quantity.trim() || !form.city.trim() || !(price > 0)) {
      toast.error('Fill in crop, quantity, target price and delivery city.');
      return;
    }
    setInquiries((all) => [
      { id: localId('INQ'), crop: form.crop.trim(), quantity: form.quantity.trim(), targetPrice: price, city: form.city.trim(), quotes: 0, bestQuote: null, status: 'open' },
      ...all,
    ]);
    setForm(EMPTY_FORM);
    setNewOpen(false);
    setTab('inquiries');
    toast.success('Inquiry sent to verified suppliers');
  };

  return (
    <PortalShell
      title="Source with confidence"
      description="Inquiries, quotes and consignments — every rupee held in escrow until your goods arrive."
      eyebrow="Buyer portal"
      theme="buyer"
      kpis={[
        { label: 'Open inquiries', value: String(inquiries.filter((q) => q.status === 'open').length), trend: 'Awaiting or quoted' },
        { label: 'Accepted', value: String(accepted.length), trend: 'Ready for escrow' },
        { label: 'Saved suppliers', value: String(suppliers.length), trend: 'Verified growers' },
      ]}
      tabs={[
        { id: 'overview', label: 'Overview', icon: ShoppingBag },
        { id: 'inquiries', label: 'Inquiries', icon: FileText, count: inquiries.length },
        { id: 'suppliers', label: 'Saved suppliers', icon: Star, count: suppliers.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <Btn theme={theme} variant="white" icon={PlusCircle} onClick={() => setNewOpen(true)}>
          New inquiry
        </Btn>
      }
    >
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile theme={theme} icon={Search} label="Marketplace" hint="Browse live lots" href="/buyer/discover" />
            <Tile theme={theme} icon={Scale} label="Compare prices" hint="Dealers side by side" href="/compare-prices" />
            <Tile theme={theme} icon={ShieldCheck} label="Escrow" hint="Money held safely" href="/escrow" />
            <Tile theme={theme} icon={Truck} label="Track consignment" hint="Toll-plaza route" href="/tracking/dashboard" />
            <Tile theme={theme} icon={TrendingUp} label="Mandi rates" hint="Today’s prices" href="/mandi-weather" />
          </div>

          <Panel
            theme={theme}
            title="Active consignments"
            icon={Truck}
            action={<Btn theme={theme} variant="soft" size="sm" onClick={() => setTab('inquiries')}>Manage inquiries</Btn>}
          >
            {accepted.length === 0 ? (
              <EmptyState
                theme={theme}
                icon={ShoppingBag}
                title="No active consignments"
                text="Accept a supplier quote on one of your inquiries and it will appear here."
                action={<Btn theme={theme} href="/buyer/discover">Browse marketplace produce</Btn>}
              />
            ) : (
              <ul className="space-y-3">
                {accepted.map((q) => (
                  <li key={q.id} className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-slate-500">{q.id} · to {q.city}</p>
                      <p className="font-semibold text-slate-900">{q.crop} · {q.quantity}</p>
                      <p className="mt-1 text-sm font-bold text-sky-800">{q.bestQuote ? inr.format(q.bestQuote) : '—'} per unit</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Btn theme={theme} size="sm" icon={ShieldCheck} href="/escrow">Pay into escrow</Btn>
                      <Btn theme={theme} variant="soft" size="sm" icon={Truck} href="/tracking">Track</Btn>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === 'inquiries' && (
        <Panel
          theme={theme}
          title="Purchase inquiries"
          icon={FileText}
          action={<Btn theme={theme} icon={PlusCircle} onClick={() => setNewOpen(true)}>New inquiry</Btn>}
        >
          {inquiries.length === 0 ? (
            <EmptyState theme={theme} icon={FileText} title="No inquiries" text="Tell suppliers what you need and they will quote." />
          ) : (
            <ul className="divide-y divide-slate-900/5">
              {inquiries.map((q) => (
                <li key={q.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{q.id} · deliver to {q.city}</p>
                    <p className="font-semibold text-slate-900">{q.crop} · {q.quantity}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      Target {inr.format(q.targetPrice)}
                      {q.status === 'accepted' ? (
                        <Badge tone="green">Accepted at {inr.format(q.bestQuote ?? 0)}</Badge>
                      ) : q.quotes > 0 ? (
                        <Badge tone="blue">{q.quotes} quotes · best {inr.format(q.bestQuote ?? 0)}</Badge>
                      ) : (
                        <Badge tone="amber">Waiting for quotes…</Badge>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {q.status === 'open' && q.quotes > 0 && (
                      <Btn
                        theme={theme}
                        size="sm"
                        icon={BadgeCheck}
                        onClick={() => {
                          setInquiries((all) => all.map((x) => (x.id === q.id ? { ...x, status: 'accepted' } : x)));
                          toast.success(`Quote accepted — pay into escrow to confirm ${q.id}`);
                        }}
                      >
                        Accept best quote
                      </Btn>
                    )}
                    {q.status === 'accepted' && (
                      <Btn theme={theme} size="sm" icon={ShieldCheck} href="/escrow">Pay into escrow</Btn>
                    )}
                    <Btn
                      theme={theme}
                      variant="danger"
                      size="sm"
                      icon={XCircle}
                      onClick={() => {
                        setInquiries((all) => all.filter((x) => x.id !== q.id));
                        toast.success(`${q.id} cancelled`);
                      }}
                    >
                      Cancel
                    </Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'suppliers' && (
        <Panel
          theme={theme}
          title="Saved suppliers"
          icon={Star}
          action={<Btn theme={theme} variant="soft" icon={Search} href="/buyer/discover">Find more</Btn>}
        >
          {suppliers.length === 0 ? (
            <EmptyState theme={theme} icon={Star} title="No saved suppliers" text="Save growers from the marketplace to reach them quickly." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {suppliers.map((s) => (
                <div key={s.id} className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {s.name} <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="Verified" />
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> {s.region} · {s.speciality}
                      </p>
                    </div>
                    <Badge tone="amber">★ {s.rating}</Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Btn theme={theme} size="sm" icon={MessageSquare} onClick={() => { setMessageTo(s); setMessage(''); }}>
                      Message
                    </Btn>
                    <Btn
                      theme={theme}
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => {
                        setSuppliers((all) => all.filter((x) => x.id !== s.id));
                        toast.success(`${s.name} removed`);
                      }}
                    >
                      Remove
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New purchase inquiry"
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Btn>
            <Btn theme={theme} icon={FileText} onClick={submitInquiry}>Send to suppliers</Btn>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Produce">
              <input className={INPUT} value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} placeholder="e.g. Gala apples, Grade A" />
            </Field>
          </div>
          <Field label="Quantity">
            <input className={INPUT} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 300 boxes" />
          </Field>
          <Field label="Target price per unit (₹)">
            <input type="number" min={1} className={INPUT} value={form.targetPrice} onChange={(e) => setForm({ ...form, targetPrice: e.target.value })} placeholder="1400" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Delivery city">
              <input className={INPUT} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Delhi" />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={messageTo !== null}
        onClose={() => setMessageTo(null)}
        title={messageTo ? `Message ${messageTo.name}` : 'Message'}
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setMessageTo(null)}>Cancel</Btn>
            <Btn
              theme={theme}
              icon={MessageSquare}
              onClick={() => {
                if (!message.trim()) return toast.error('Write a message first.');
                toast.success(`Message sent to ${messageTo?.name}`);
                setMessageTo(null);
              }}
            >
              Send
            </Btn>
          </>
        }
      >
        <Field label="Your message">
          <textarea rows={4} className={INPUT} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi, I’d like a quote for…" />
        </Field>
      </Modal>
    </PortalShell>
  );
}
