'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Field, INPUT } from '@/components/portal/kit';
import { compressImage } from '@/lib/client/image';
import { getLiveGPS, reverseGeocode, nowIST, type GeoResult, engravePhotoFrame, startEngravedVideo } from '@/lib/geoStampMedia';
import { PRODUCE, SUBCATEGORIES, UNITS, type ListingInput } from '@/lib/db/market';
import type { PayoutAccount } from '@/lib/db/rentals';

export const MAX_PHOTOS = 3;
/** The longest photo (data URL) the database keeps. */
const PHOTO_MAX_CHARS = 590_000;

/** Units sold whole (the stock is a whole number). */
const WHOLE_UNITS: ListingInput['unit'][] = ['box', 'piece', 'bag'];

/** Quick presets for box capacity in kg. */
const CAPACITY_PRESETS = [8, 10, 15, 16, 18, 20] as const;

/** Packing layer presets with apple count hints. */
const LAYER_PRESETS: { label: string; value: string; hint: string }[] = [
  { label: '4 Layer', value: '4 Layer', hint: 'Large / Extra Fancy · ~80–100 apples' },
  { label: '5 Layer', value: '5 Layer', hint: 'Medium / Standard · ~125–150 apples' },
  { label: '3 Layer', value: '3 Layer', hint: 'Super Large · ~60–75 apples' },
  { label: '2 Layer (Half Box)', value: '2 Layer (Half Box)', hint: '~40–50 apples' },
  { label: 'Loose / Crate Packed', value: 'Loose / Crate Packed', hint: 'No fixed layer count' },
];

/** The listing's photos: the list, or the single photo of an older listing. */
export const photosOf = (v: Pick<ListingInput, 'photo' | 'photos'>): string[] => (v.photos?.length ? v.photos : v.photo ? [v.photo] : []);

const emptyBoxCapacity = (v: ListingInput) => v.box_capacity_kg === null || v.box_capacity_kg === undefined || Number(v.box_capacity_kg) <= 0;

/** Captured live media (engraved with GPS + timestamp). */
type CapturedMedia = {
  kind: 'photo' | 'video';
  src: string; // data URL or blob URL
  geo: GeoResult;
  capturedAt: string;
};

/** Produce listings require live camera + GPS — no gallery uploads. */
export function ProductForm({ value: v, onChange, isNew = false, payout, onPayoutChange }: { value: ListingInput; onChange: (v: ListingInput) => void; /** A new listing (a farm input then needs a photo). */ isNew?: boolean; /** The farmer's payout account the escrow releases into (produce only). */ payout?: PayoutAccount | null; /** Fired on every payout field edit. */ onPayoutChange?: (p: PayoutAccount) => void }) {
  const produce = v.category === 'produce';
  const photos = photosOf(v);
  const [gps, setGps] = useState<GeoResult | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedMedia[]>([]);
  const [recording, setRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<{ stop: () => void; stream: MediaStream } | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);

  const set = <K extends keyof ListingInput>(k: K, val: ListingInput[K]) => onChange({ ...v, [k]: val });
  const setPhotos = (list: string[]) => onChange({ ...v, photos: list.length ? list : null, photo: list[0] ?? null });

  // Request GPS + camera when the form mounts for produce.
  useEffect(() => {
    if (!produce) return;
    let live = true;
    const init = async () => {
      setGpsLoading(true);
      try {
        const pos = await getLiveGPS();
        const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (live) setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, address });
        if (live) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
            if (live) {
              setCameraStream(stream);
              const v = videoRef.current;
              if (v) v.srcObject = stream;
              audioTrackRef.current = stream.getAudioTracks()[0];
            }
          } catch (err) {
            if (live) setCameraError('Camera access is required for verified produce photos. Allow camera permission and try again.');
          }
        }
      } catch (err) {
        if (live) setGpsError(err instanceof Error ? err.message : 'Could not get live GPS location. Enable location services and try again.');
      } finally {
        if (live) setGpsLoading(false);
      }
    };
    init();
    return () => { live = false; };
  }, [produce]);

  // Clean up camera stream on unmount.
  useEffect(() => {
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
      recorderRef.current?.stop();
    };
  }, [cameraStream]);

  const addEngravedPhoto = async () => {
    if (!gps) return toast.error('Live GPS lock is required before capturing a verified photo.');
    if (!videoRef.current) return toast.error('Camera is not ready.');
    try {
      const blob = await engravePhotoFrame(videoRef.current, gps, v.seller_name);
      const src = URL.createObjectURL(blob);
      const m: CapturedMedia = { kind: 'photo', src, geo: gps, capturedAt: nowIST() };
      setCaptured([...captured, m]);
      // Store as a data URL for the listing (bounded size).
      const arr = await blob.arrayBuffer();
      const bytes = new Uint8Array(arr);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const dataUrl = `data:image/jpeg;base64,${btoa(binary)}`;
      setPhotos([...photos, dataUrl].slice(0, MAX_PHOTOS));
      onChange({ ...v, is_live_camera_verified: true, captured_lat: gps.lat, captured_lng: gps.lng, captured_accuracy_m: gps.accuracy, captured_address: gps.address, captured_at_iso: new Date().toISOString() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not capture verified photo.');
    }
  };

  const toggleVideo = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!gps) return toast.error('Live GPS lock is required before recording a verified video.');
    if (!videoRef.current) return toast.error('Camera is not ready.');
    try {
      const { stop, stream } = startEngravedVideo(videoRef.current, gps, v.seller_name, (blob) => {
        const src = URL.createObjectURL(blob);
        const m: CapturedMedia = { kind: 'video', src, geo: gps, capturedAt: nowIST() };
        setCaptured([...captured, m]);
        setRecording(false);
      }, audioTrackRef.current ?? undefined);
      recorderRef.current = { stop, stream };
      setRecording(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start verified video recording.');
    }
  };

  const removeCaptured = (i: number) => {
    const m = captured[i];
    if (m.src.startsWith('blob:')) URL.revokeObjectURL(m.src);
    setCaptured(captured.filter((_, j) => j !== i));
    // Also remove from photos if it was added there.
    setPhotos(photos.filter((_, j) => j !== i));
  };

  const capacityKg = v.box_capacity_kg ?? null;
  const totalWeightKg = capacityKg ? capacityKg * Number(v.quantity || 0) : null;

  // Produce requires at least one captured live photo/video.
  const needsLiveMedia = produce && captured.length === 0 && photos.length === 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="What are you selling?">
        <select className={`${INPUT} min-h-11`} value={v.category} onChange={(e) => onChange({ ...v, category: e.target.value as ListingInput['category'], subcategory: e.target.value === 'produce' ? 'Apple' : SUBCATEGORIES[0], unit: e.target.value === 'produce' ? 'box' : 'piece' })} >
          <option value="supplies">Farm inputs & supplies</option>
          <option value="produce">Fruit / produce</option>
        </select>
      </Field>
      <Field label={produce ? 'Crop' : 'Type'}>
        <select className={`${INPUT} min-h-11`} value={v.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value)} >
          {(produce ? PRODUCE : SUBCATEGORIES).map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Product name">
          <input className={`${INPUT} min-h-11`} value={v.product} onChange={(e) => set('product', e.target.value)} placeholder={produce ? 'e.g. Delicious apple, A grade' : 'e.g. Apple corrugated box (10 kg)'} />
        </Field>
      </div>
      <Field label={produce ? 'Variety (optional)' : 'Brand / size (optional)'}>
        <input className={`${INPUT} min-h-11`} value={v.variety ?? ''} onChange={(e) => set('variety', e.target.value)} />
      </Field>
      <Field label="Grade (optional)">
        <input className={`${INPUT} min-h-11`} value={v.grade ?? ''} onChange={(e) => set('grade', e.target.value)} placeholder="e.g. A, Premium" />
      </Field>

      {produce && (
        <>
          <Field label="Capacity of 1 box (kg)">
            <div className="grid grid-cols-2 gap-1">
              <input type="number" inputMode="decimal" min={0.1} step="0.1" className={INPUT} value={capacityKg ?? ''} onChange={(e) => set('box_capacity_kg', Number(e.target.value) || null)} placeholder="e.g. 18" />
              <div className="flex flex-wrap gap-1">
                {CAPACITY_PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => set('box_capacity_kg', p)} className={`min-h-9 px-2 text-xs rounded border ${capacityKg === p ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-200 text-slate-700'}`}>{p} kg</button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">Net weight of one box. Buyers see the rate per kg and total lot weight.</p>
          </Field>
          <Field label="Packing layers (per box)">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {LAYER_PRESETS.map((preset) => (
                <button key={preset.value} type="button" onClick={() => { set('packing_layers', preset.value); set('apples_per_box', preset.hint.split('·')[1]?.trim() ?? null); }} className={`min-h-10 px-2 text-xs leading-none rounded border ${v.packing_layers === preset.value ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-200 text-slate-700'}`}>
                  {preset.label}
                  <span className="block text-[10px] opacity-75">{preset.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">How the fruit is packed inside one box. 4 Layer = larger fruit, fewer per box; 5 Layer = standard.</p>
          </Field>

          {/* Live auto-calculated summary pill */}
          {capacityKg && v.quantity > 0 && (
            <div className="sm:col-span-2 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-sm font-semibold text-emerald-900">
                📦 1 box = {capacityKg} kg · {v.packing_layers ?? 'packing'} · {v.apples_per_box ? `(${v.apples_per_box})` : ''} ·
                Effective rate: ₹${(Number(v.price) / capacityKg).toFixed(2)} / kg ·
                Total lot: {Number(v.quantity).toLocaleString('en-IN')} boxes ({totalWeightKg!.toLocaleString('en-IN')} kg)
              </p>
            </div>
          )}

          {/* Live GPS + Camera section — replaces gallery upload for produce. */}
          <Field label="📍 Live GPS & Camera (verified capture)">
            {gpsLoading && <p className="text-xs text-slate-500">Acquiring live GPS + camera…</p>}
            {gpsError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{gpsError}</p>}
            {cameraError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{cameraError}</p>}
            {gps && cameraStream && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="relative rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 aspect-[4/5]">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-end px-3 pb-3">
                    <p className="text-xs font-semibold text-white drop-shadow">📍 {gps.address} · ±{Math.round(gps.accuracy)}m · {nowIST()}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={addEngravedPhoto} className="flex-1 min-h-11 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed">
                    📸 Capture Verified Live Photo
                  </button>
                  <button type="button" onClick={toggleVideo} className={`flex-1 min-h-11 rounded-xl font-semibold ${recording ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'} hover:opacity-90`}>
                    {recording ? '🛑 Stop Recording' : '🎥 Record Verified Video (30s)'}
                  </button>
                </div>
                {captured.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {captured.map((m, i) => (
                      <div key={i} className="relative" style={{ maxWidth: '140px' }}>
                        {m.kind === 'photo' ? (
                          <img src={m.src} alt="Verified capture" className="h-24 w-24 rounded-xl object-cover ring-2 ring-emerald-500" />
                        ) : (
                          <video src={m.src} className="h-24 w-24 rounded-xl object-cover ring-2 ring-emerald-500" />
                        )}
                        <button type="button" onClick={() => removeCaptured(i)} className="absolute -right-1 -top-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white/90 shadow ring-1 ring-slate-200"><X className="h-3 w-3" aria-hidden /></button>
                        <p className="text-[10px] text-slate-500 text-center mt-1">{m.kind === 'photo' ? 'Photo' : 'Video'} · live</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-emerald-700">
                  Every capture is engraved with live GPS + timestamp and cannot be faked from a gallery.
                </p>
              </div>
            )}
            {!gps && !gpsError && !gpsLoading && <p className="text-xs text-slate-500">Waiting for live GPS lock…</p>}
            {needsLiveMedia && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">At least one live camera photo or video is required for produce listings.</p>}
          </Field>

          {/* Mandatory payout account: the escrow releases the order money into it. */}
          {onPayoutChange && (
            <div className="sm:col-span-2 rounded-2xl bg-white/90 p-3 ring-1 ring-emerald-200">
              <p className="text-sm font-bold text-slate-900">🏦 Farmer Payout Account <span className="text-xs font-medium text-slate-500">(where the escrow releases your payment)</span></p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="Account holder name">
                  <input className={`${INPUT} min-h-11`} value={payout?.account_name ?? ''} onChange={(e) => onPayoutChange({ account_name: e.target.value, upi_id: payout?.upi_id ?? null, account_number: payout?.account_number ?? null, ifsc: payout?.ifsc ?? null, bank_name: payout?.bank_name ?? null })} placeholder="e.g. Waseem Mushtaq Mir" />
                </Field>
                <Field label="UPI ID">
                  <input className={`${INPUT} min-h-11`} value={payout?.upi_id ?? ''} onChange={(e) => onPayoutChange({ account_name: payout?.account_name ?? '', upi_id: e.target.value, account_number: payout?.account_number ?? null, ifsc: payout?.ifsc ?? null, bank_name: payout?.bank_name ?? null })} placeholder="e.g. 6006561291@upi" />
                </Field>
                <Field label="Bank name">
                  <input className={`${INPUT} min-h-11`} value={payout?.bank_name ?? ''} onChange={(e) => onPayoutChange({ account_name: payout?.account_name ?? '', upi_id: payout?.upi_id ?? null, account_number: payout?.account_number ?? null, ifsc: payout?.ifsc ?? null, bank_name: e.target.value })} placeholder="e.g. J&K Grameen Bank" />
                </Field>
                <Field label="Account number">
                  <input className={`${INPUT} min-h-11`} value={payout?.account_number ?? ''} onChange={(e) => onPayoutChange({ account_name: payout?.account_name ?? '', upi_id: payout?.upi_id ?? null, account_number: e.target.value, ifsc: payout?.ifsc ?? null, bank_name: payout?.bank_name ?? null })} inputMode="numeric" />
                </Field>
                <Field label="IFSC code">
                  <input className={`${INPUT} min-h-11`} value={payout?.ifsc ?? ''} onChange={(e) => onPayoutChange({ account_name: payout?.account_name ?? '', upi_id: payout?.upi_id ?? null, account_number: payout?.account_number ?? null, ifsc: e.target.value, bank_name: payout?.bank_name ?? null })} placeholder="e.g. JAKA0GRAMEEN" />
                </Field>
              </div>
              <p className="text-xs text-slate-500">Saved on your profile and filled in next time. Buyers see only your UPI ID and a masked account number on the escrow line of the order.</p>
            </div>
          )}
        </>
      )}
      {!produce && (
        <Field label="Sold per">
          <select className={`${INPUT} min-h-11`} value={v.unit} onChange={(e) => set('unit', e.target.value as ListingInput['unit'])} >
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      )}
      <Field label={`Price (₹ per ${v.unit})`}>
        <input type="number" inputMode="decimal" min={1} step="0.5" className={`${INPUT} min-h-11`} value={v.price || ''} onChange={(e) => set('price', Number(e.target.value))} />
      </Field>
      <Field label={`In stock (${v.unit})`}>
        <input type="number" inputMode={WHOLE_UNITS.includes(v.unit) ? 'numeric' : 'decimal'} min={0} className={`${INPUT} min-h-11`} value={v.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
      </Field>
      <Field label="Your district">
        <input className={`${INPUT} min-h-11`} value={v.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Sopore" />
      </Field>
      <Field label="Shop / seller name">
        <input className={`${INPUT} min-h-11`} value={v.seller_name} onChange={(e) => set('seller_name', e.target.value)} />
      </Field>
      <Field label="Mobile (buyers can call)">
        <input type="tel" inputMode="numeric" autoComplete="tel" className={`${INPUT} min-h-11`} value={v.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. 9876543210" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Details (optional)">
          <textarea rows={2} className={INPUT} value={v.details ?? ''} onChange={(e) => set('details', e.target.value)} placeholder="Delivery area, minimum order, delivery time" />
        </Field>
      </div>
      {produce && !needsLiveMedia && (
        <div className="sm:col-span-2">
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950 ring-1 ring-emerald-100">
            ✅ Live camera capture verified with GPS. Buyers will see the burned-in location stamp on every photo/video.
          </p>
        </div>
      )}
    </div>
  );
}

/** Checks before saving; returns an error message or null. */
export function productProblem(v: ListingInput, opts: { isNew?: boolean } = {}): string | null {
  if (v.product.trim().length < 2) return 'Add the product name.';
  if (!(v.price > 0)) return 'Add a price.';
  if (!(v.quantity >= 0)) return 'Add how many you have in stock.';
  if (v.district.trim().length < 2) return 'Add your district.';
  if (v.seller_name.trim().length < 1) return 'Add your shop or seller name.';
  if (!/^(\+?91)?[6-9]\d{9}$/.test(v.phone.replace(/\s/g, ''))) return 'Add a 10-digit mobile number buyers can call.';
  if (v.category === 'produce' && !v.is_live_camera_verified) return 'Capture at least one live camera photo/video with GPS lock before listing produce.';
  return null;
}
