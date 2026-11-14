'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Field, INPUT } from '@/components/portal/kit';
import { AppleBox3D } from '@/components/three/AppleBox3D';
import { reverseGeocode, nowIST, type GeoResult, engravePhotoFrame, startEngravedVideo } from '@/lib/geoStampMedia';
import { PRODUCE, SUBCATEGORIES, UNITS, type ListingInput } from '@/lib/db/market';
import type { PayoutAccount } from '@/lib/db/rentals';
import dynamic from 'next/dynamic';

// The native tile map of the orchard pin — no iframe, never blocked by CSP.
const LiveInteractiveMap = dynamic(() => import('@/components/common/LiveInteractiveMap'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

export const MAX_PHOTOS = 3;
/** The longest photo (data URL) the gallery keeps. */
const PHOTO_MAX_CHARS = 590_000;
/** The longest recorded video (data URL) that goes out with the listing. */
const VIDEO_MAX_CHARS = 1_500_000;
/** GPS lock budget: how long the receiver may think before "did not lock" shows. */
const GPS_TIMEOUT_MS = 15_000;
/// A recorded video runs at most this long, then stops itself.
const VIDEO_MAX_MS = 30_000;

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

/** Captured live media (engraved with GPS + timestamp). */
type CapturedMedia = {
  kind: 'photo' | 'video';
  src: string; // blob URL for the strip/preview
  /** The stored form of a photo (data URL), so removing it drops exactly this photo. */
  dataUrl?: string;
  geo: GeoResult;
  capturedAt: string;
};

const commaNum = (n: number) => n.toLocaleString('en-IN');

/** Coordinates as words ("34.05500° N, 74.80000° E"): the pin when no place name was found. */
const coordsText = (g: GeoResult) => `${g.lat.toFixed(5)}° N, ${g.lng.toFixed(5)}° E`;
/** The address is only the coordinates (the place lookup found nothing): never say them twice. */
const addressIsCoords = (a: string) => a.includes('° N,');

/** Produce listings require live camera + GPS — no gallery uploads. Every control is a button the farmer presses. */
export function ProductForm({ value: v, onChange, isNew = false, payout, onPayoutChange, farmerId, listingId }: {
  value: ListingInput;
  onChange: (v: ListingInput) => void;
  /** A new listing (a farm input then needs a photo). */
  isNew?: boolean;
  /** The farmer's payout account the escrow releases into (produce only). */
  payout?: PayoutAccount | null;
  /** Fired on every payout field edit. */
  onPayoutChange?: (p: PayoutAccount) => void;
  /** The signed-in farmer — the photo audit row's owner (Phase 6). */
  farmerId?: string;
  /** The listing being edited, when the capture belongs to one. */
  listingId?: string | null;
}) {
  const produce = v.category === 'produce';
  const photos = photosOf(v);
  const [gps, setGps] = useState<GeoResult | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedMedia[]>([]);
  const [recording, setRecording] = useState(false);
  /** Phase 6: keep even the private raw copy of the capture location out of the audit. */
  const [privacyMasked, setPrivacyMasked] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<{ stop: () => void } | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const autoStopRef = useRef<number | null>(null);
  /** The component across async completions (GPS lock, photo, video end). */
  const later = useRef(v);
  useEffect(() => { later.current = v; });
  const patch = (p: Partial<ListingInput>) => onChange({ ...later.current, ...p });
  /** One synced field edit straight from the typed value. */
  const set = <K extends keyof ListingInput>(k: K, val: ListingInput[K]) => onChange({ ...v, [k]: val });

  // Stop the camera and any recording when the modal closes.
  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
  }, []);

  // The is-live viewfinder receives whatever stream the buttons opened.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !cameraStream) return;
    if (el.srcObject !== cameraStream) {
      el.srcObject = cameraStream;
      el.play().catch(() => undefined);
    }
  }, [cameraStream]);

  /**
   * Step 1 — locks the live GPS. The moment the receiver answers with real
   * coordinates the spinner stops and the pin is set; the human-readable
   * place name (Nominatim reverse lookup) follows a moment later. There is
   * no fake fallback: without a fix nothing is pinned, and the farmer is
   * asked to press step 1 again — outdoors it locks in a few seconds.
   */
  const lockGps = async () => {
    setGpsLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('This device has no location receiver.'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_TIMEOUT_MS });
      });
      // Locked: the loading spinner stops at once and the real coordinates are set.
      setGpsLoading(false);
      const geo: GeoResult = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
        // Coordinates are the lock itself; the place name arrives just below.
        address: `${pos.coords.latitude.toFixed(5)}° N, ${pos.coords.longitude.toFixed(5)}° E`,
      };
      setGps(geo);
      // The locked pin rides along in the listing's own saved fields.
      patch({ seller_lat: geo.lat, seller_lng: geo.lng, seller_location_label: geo.address });
      // The real human-readable place (village, city, state) replaces the raw numbers.
      const address = await reverseGeocode(geo.lat, geo.lng).catch(() => geo.address);
      setGps((cur) => (cur && cur.lat === geo.lat && cur.lng === geo.lng ? { ...cur, address } : cur));
      patch({ seller_lat: geo.lat, seller_lng: geo.lng, seller_location_label: address });
    } catch (err) {
      setGps(null);
      setGpsLoading(false);
      const why = err instanceof Error ? err.message : (err as GeolocationPositionError | undefined)?.message || 'no fix';
      toast.error(`GPS did not lock (${why}). Press “📍 1. Lock Live GPS Location” again — outdoors it locks in a few seconds.`);
    }
  };

  /**
   * Opens the camera (a farmer press unlocks the browser prompt) and shows
   * the live feed. The facing camera is asked for politely with the
   * microphone off; when a device refuses any part of that (Windows laptop
   * webcams, a busy mic, unusual phones), the plain camera — microphone
   * still off — opens instead, so step 2 works on the very first press.
   */
  const openCamera = async (mode: 'environment' | 'user' = facing) => {
    setCameraBusy(true);
    setCameraError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false });
      } catch {
        // Any refusal (OverconstrainedError, NotFoundError, NotReadableError, a busy
        // mic): open whatever camera this device has.
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      // Flip from front to back (or the camera was re-opened): stop the old stream first.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recorderRef.current?.stop();
      if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
      audioTrackRef.current = stream.getAudioTracks()[0] ?? null;
      streamRef.current = stream;
      setCameraStream(stream);
      setFacing(mode);
      setRecording(false);
    } catch {
      setCameraError('The camera did not open. Allow camera permission (the padlock / camera icon in the browser bar), then press “📷 Open Live Camera” again.');
    } finally {
      setCameraBusy(false);
    }
  };

  /** 🔄 Switches between the phone's back and front camera. */
  const switchCamera = () => {
    void openCamera(facing === 'environment' ? 'user' : 'environment');
  };

  /** 📸 Engraves the live frame with the GPS + seller + IST stamp into the picture itself. */
  const capturePhoto = async () => {
    if (!gps) return toast.error('Lock the live GPS first (📍 step 1).');
    const el = videoRef.current;
    if (!el || !cameraStream) return toast.error('Open the live camera first (📷 step 2).');
    try {
      const blob = await engravePhotoFrame(el, gps, later.current.seller_name);
      let dataUrl = await blobToDataUrl(blob);
      dataUrl = await shrinkToBudget(dataUrl);
      const list = [...photosOf(later.current), dataUrl].slice(0, MAX_PHOTOS);
      setCaptured((cur) => [...cur, { kind: 'photo', src: URL.createObjectURL(blob), dataUrl, geo: gps, capturedAt: nowIST() }]);
      patch({
        photos: list,
        photo: list[0] ?? null,
        is_live_camera_verified: true,
        captured_lat: gps.lat, captured_lng: gps.lng,
        captured_accuracy_m: gps.accuracy, captured_address: gps.address, captured_at_iso: new Date().toISOString(),
      });
      // Phase 6: the photo audit — the server computes the SHA-256 over the
      // real bytes, keeps the raw location private and answers with the
      // masked public twin. Fire-and-forget: it never blocks the capture.
      void reportVerification(dataUrl, gps);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not capture the verified photo.');
    }
  };

  /** Reports one captured photo to /api/products/verify-photo (Phase 6). */
  const reportVerification = async (photoDataUrl: string, geo: GeoResult) => {
    try {
      const res = await fetch('/api/products/verify-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECORD',
          farmerId: farmerId || undefined,
          listingId: listingId || undefined,
          deviceLat: geo.lat,
          deviceLng: geo.lng,
          accuracyM: geo.accuracy,
          publicLocalityLabel: addressIsCoords(geo.address) ? '' : geo.address,
          capturedAt: new Date().toISOString(),
          photoDataUrl,
          privacyMasked: privacyMasked,
          originalPhotoUrl: listingId ? `market_listings:${listingId}` : undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; verification?: { verification_state?: string }; note?: string };
      if (data.ok && data.verification?.verification_state === 'DUPLICATE_SUSPECTED') {
        toast.info('Photo audit: this exact photo was verified before on another listing — a fresh capture keeps the listing verified.');
      }
    } catch {
      /* the audit never blocks the capture */
    }
  };

  /** 🎥/⏹️ Records a short engraved video, or stops the running one. A 30-second cap stops it by itself. */
  const toggleVideo = async () => {
    if (recording) {
      recorderRef.current?.stop();
      if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
      setRecording(false);
      return;
    }
    if (!gps) return toast.error('Lock the live GPS first (📍 step 1).');
    const el = videoRef.current;
    if (!el || !cameraStream) return toast.error('Open the live camera first (📷 step 2).');
    const finishVideo = (blob: Blob) => {
      setRecording(false);
      setCaptured((cur) => [...cur, { kind: 'video', src: URL.createObjectURL(blob), geo: gps, capturedAt: nowIST() }]);
      void saveVideoDataUrl(blob, gps);
    };
    try {
      const { stop } = startEngravedVideo(el, gps, later.current.seller_name, finishVideo, audioTrackRef.current ?? undefined);
      recorderRef.current = { stop };
      setRecording(true);
      // The 30-second cap: the recording stops itself and previews below.
      autoStopRef.current = window.setTimeout(() => {
        recorderRef.current?.stop();
        setRecording(false);
      }, VIDEO_MAX_MS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the verified video.');
    }
  };

  /** Saves the recorded video with the listing when its size fits; otherwise it keeps playing from the strip only. */
  const saveVideoDataUrl = async (blob: Blob, geo: GeoResult) => {
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > VIDEO_MAX_CHARS) {
        patch({ video_url: null });
        toast.info('Video kept on this screen (too large to save) — the GPS-stamped photo or video in the listing carries the proof.');
        return;
      }
      patch({ video_url: dataUrl, captured_lat: geo.lat, captured_lng: geo.lng, captured_address: geo.address, captured_at_iso: new Date().toISOString(), is_live_camera_verified: true });
    } catch {
      patch({ video_url: null });
    }
  };

  /** Remove / Retake: clears one captured item (its photo leaves the gallery; a video leaves the save). */
  const removeCaptured = (i: number) => {
    const m = captured[i];
    if (m.src.startsWith('blob:')) URL.revokeObjectURL(m.src);
    const rest = captured.filter((_, j) => j !== i);
    setCaptured(rest);
    if (m.kind === 'photo' && m.dataUrl) {
      const list = photosOf(later.current).filter((p) => p !== m.dataUrl);
      // One patch: the two writes never race with each other.
      patch({ photos: list.length ? list : null, photo: list[0] ?? null, is_live_camera_verified: list.length > 0 || rest.some((r) => r.kind === 'video') });
    } else {
      const last = rest.filter((r) => r.kind === 'video').length > 0;
      if (!last) patch({ video_url: null });
    }
  };

  const capacityKg = Number(v.box_capacity_kg ?? 0);
  const ratePerKg = capacityKg > 0 ? Number(v.price) / capacityKg : null;
  const totalWeight = capacityKg > 0 && v.unit === 'box' ? capacityKg * Number(v.quantity || 0) : null;

  // Produce requires at least one captured live photo/video.
  const needsLiveMedia = produce && captured.length === 0 && photos.length === 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="What are you selling?">
        <select className={`${INPUT} min-h-11`} value={v.category} onChange={(e) => onChange({ ...v, category: e.target.value as ListingInput['category'], subcategory: e.target.value === 'produce' ? 'Apple' : SUBCATEGORIES[0], unit: e.target.value === 'produce' ? 'box' : 'piece' })}>
          <option value="supplies">Farm inputs &amp; supplies</option>
          <option value="produce">Fruit / produce</option>
        </select>
      </Field>
      <Field label={produce ? 'Crop' : 'Type'}>
        <select className={`${INPUT} min-h-11`} value={v.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value)}>
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
            <input type="number" inputMode="decimal" min={0.1} step="0.1" className={`${INPUT} min-h-11 cursor-pointer relative z-10`} value={v.box_capacity_kg ?? ''} placeholder="e.g. 18" onChange={(e) => set('box_capacity_kg', Number(e.target.value) || null)} />
            {/* The 6 quick presets directly below the input. */}
            <div className="pointer-events-auto relative z-10 mt-1.5 flex flex-wrap gap-1.5">
              {CAPACITY_PRESETS.map((p) => (
                <button key={p} type="button" aria-pressed={capacityKg === p} onClick={(e) => { e.preventDefault(); e.stopPropagation(); set('box_capacity_kg', p); }} className={`relative z-10 min-h-9 cursor-pointer rounded-lg border px-3 text-sm font-bold transition-colors ${capacityKg === p ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                  {p} kg
                </button>
              ))}
            </div>
            {/* Live auto-calculated banner: whenever a weight and a price exist. */}
            {capacityKg > 0 && ratePerKg !== null && v.price > 0 && (
              <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-950 ring-1 ring-emerald-200">
                📦 1 box = {commaNum(capacityKg)} kg · Rate: ₹{ratePerKg.toFixed(2)} / kg
                {totalWeight !== null && <span> · Total stock weight: {commaNum(Math.round(totalWeight))} kg ({(totalWeight / 100).toFixed(1)} Quintals)</span>}
              </p>
            )}
            <p className="text-xs text-slate-500">Net weight of one box. Buyers see the rate per kg and total lot weight.</p>
          </Field>
          <Field label="Packing layers (per box)">
            <div className="pointer-events-auto relative z-10 flex flex-wrap gap-1.5">
              {LAYER_PRESETS.map((preset) => (
                <button key={preset.value} type="button" aria-pressed={v.packing_layers === preset.value} onClick={(e) => {
                  // Both fields in ONE patch: a second `set` would spread the
                  // stale value and wipe the layer choice back off.
                  e.preventDefault(); e.stopPropagation();
                  onChange({ ...v, packing_layers: preset.value, apples_per_box: preset.hint.split('·')[1]?.trim() ?? null });
                }} className={`relative z-10 min-h-10 cursor-pointer rounded-lg border-2 px-3 py-1 text-start text-xs leading-tight transition-colors ${v.packing_layers === preset.value ? 'bg-emerald-600 text-white border-emerald-600 font-semibold shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                  <span className="block font-bold">{v.packing_layers === preset.value ? '✓ ' : ''}{preset.label}</span>
                  <span className={`block text-[10px] ${v.packing_layers === preset.value ? 'text-white/85' : 'text-slate-400'}`}>{preset.hint}</span>
                </button>
              ))}
            </div>
            {/* Permanent green confirmation, exactly like the box-capacity bar above. */}
            {(() => {
              const chosen = LAYER_PRESETS.find((p) => p.value === v.packing_layers);
              if (!chosen) return null;
              return (
                <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-950 ring-1 ring-emerald-200">
                  ✓ Selected packing: {chosen.label} ({chosen.hint})
                </p>
              );
            })()}
            {/* The chosen packing, seen in 3D: rotate the box and inspect the layers. */}
            <AppleBox3D layers={v.packing_layers ?? ''} className="mt-3" />
            <p className="text-xs text-slate-500">How the fruit is packed inside one box. 4 Layer = larger fruit, fewer per box; 5 Layer = standard.</p>
          </Field>

          {/* ── Live GPS & Camera: both step buttons are ALWAYS here — nothing waits on a mount-time prompt. ── */}
          <div className="sm:col-span-2 rounded-2xl bg-white/90 p-3 ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-900">📍 Live GPS &amp; Camera (verified capture)</p>
            <p className="text-xs text-slate-500">{isNew ? 'New listing — ' : ''}press step 1, then step 2; every capture gets the GPS stamp burned into it. Nothing auto-starts: pressing the buttons is what opens them.</p>

            {/* Phase 6 privacy choice: masking is always applied to anything public;
                this keeps even the private raw copy out of the audit row. */}
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
              <input type="checkbox" checked={privacyMasked} onChange={(e) => setPrivacyMasked(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-700" />
              <span>
                <strong>Privacy:</strong> keep my exact orchard coordinates out of the photo audit. Buyers only ever see the
                masked location (about 1 km) either way — this also drops the private copy the audit keeps for verification.
              </span>
            </label>

            {/* Top status & action bar — always visible. */}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={gpsLoading} onClick={() => void lockGps()} className={`relative z-10 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-bold ring-1 transition-colors ${gps ? 'bg-emerald-50 text-emerald-900 ring-emerald-400 hover:bg-emerald-100' : 'bg-emerald-700 text-white ring-emerald-700 hover:bg-emerald-800 disabled:opacity-50'}`}>
                📍 1. Lock Live GPS Location
              </button>
              <button type="button" disabled={cameraBusy} onClick={() => void openCamera()} className={`relative z-10 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-bold ring-1 transition-colors ${cameraStream ? 'bg-sky-50 text-sky-900 ring-sky-400 hover:bg-sky-100' : 'bg-sky-700 text-white ring-sky-700 hover:bg-sky-800 disabled:opacity-50'}`}>
                📷 2. Open Live Camera
              </button>
              {gpsLoading && <span className="self-center text-xs font-bold text-slate-600">Locking GPS… allow location access if the browser asks.</span>}
            </div>
            {gps && (
              <p className="mt-1.5 text-xs font-bold text-emerald-700">
                ✓ Live GPS Locked: {addressIsCoords(gps.address) ? gps.address : `${gps.address} · ${coordsText(gps)}`} (±{Math.round(gps.accuracy)} m)
              </p>
            )}
            {gps && <div className="mt-2"><LiveInteractiveMap lat={gps.lat} lng={gps.lng} accuracy={gps.accuracy} label="Orchard / capture spot" /></div>}
            {cameraError && <p className="mt-1 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{cameraError}</p>}

            {/* Live capture controls — inside the box once the camera is open. */}
            {cameraStream ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 aspect-[4/5]">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                    <p className="rounded-lg bg-emerald-950/85 px-3 py-1.5 text-xs font-semibold text-white">
                      🛡️ {gps ? (addressIsCoords(gps.address) ? gps.address : `${coordsText(gps)} · ${gps.address}`) : 'Lock GPS for the stamp'}{gps && gps.accuracy > 0 ? ` ±${Math.round(gps.accuracy)}m` : ''} · {v.seller_name} · {nowIST()}
                    </p>
                  </div>
                  {recording && <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-rose-600/90 px-2.5 py-1 text-xs font-bold text-white">⏺ Recording · stops at 30 s</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void capturePhoto()} className="relative z-10 min-h-11 flex-1 flex-[2_1_0%] cursor-pointer rounded-xl bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800">
                    📸 Capture Live Photo (with GPS Stamp)
                  </button>
                  <button type="button" onClick={() => void toggleVideo()} className={`relative z-10 min-h-11 flex-1 cursor-pointer rounded-xl px-3 text-sm font-bold text-white ${recording ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'}`}>
                    {recording ? '⏹️ Stop Recording' : '🎥 Record Short Video (Up to 30s with GPS Stamp)'}
                  </button>
                  <button type="button" disabled={cameraBusy} onClick={switchCamera} className="relative z-10 min-h-11 cursor-pointer rounded-xl bg-white px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
                    🔄 Switch Front/Back Camera
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Camera closed — pressing “📷 Open Live Camera” opens it live in place (back camera first; 🔄 flips to the front).</p>
            )}

            {/* Captured media preview strip. */}
            {captured.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {captured.map((m, i) => (
                  <div key={`${m.kind}-${i}`} className="relative" style={{ width: 140 }}>
                    {m.kind === 'photo' ? (
                      <img src={m.src} alt="GPS-stamped live capture" className="h-24 w-32 rounded-xl object-cover ring-2 ring-emerald-500" />
                    ) : (
                      <video src={m.src} controls playsInline className="h-24 w-32 rounded-xl bg-slate-900 object-cover ring-2 ring-emerald-500" />
                    )}
                    <button type="button" aria-label="Remove / Retake" onClick={() => removeCaptured(i)} className="absolute -right-1.5 -top-1.5 z-10 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white shadow ring-1 ring-slate-300 hover:bg-rose-50">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <p className="mt-0.5 text-center text-[10px] font-semibold text-slate-600">{m.kind === 'photo' ? '📸 Photo · GPS stamped' : '🎥 Video · GPS stamped'}<span className="block font-normal text-slate-400">Remove / Retake above</span></p>
                  </div>
                ))}
              </div>
            )}

            {needsLiveMedia && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">Capture at least one live photo or video (steps 1 → 2 → 📸) before listing produce.</p>}
          </div>

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
          <select className={`${INPUT} min-h-11`} value={v.unit} onChange={(e) => set('unit', e.target.value as ListingInput['unit'])}>
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

/** A blob as a data URL (the form the listing and the database store). */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not encode the capture.'));
    r.readAsDataURL(blob);
  });
}

/** Re-encodes an engraved photo until it fits the gallery budget (the stamp stays burned in; only the size shrinks). */
async function shrinkToBudget(dataUrl: string): Promise<string> {
  if (dataUrl.length <= PHOTO_MAX_CHARS) return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Could not re-encode the photo.'));
    im.src = dataUrl;
  });
  let scale = 0.8;
  for (let i = 0; i < 4; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(320, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(240, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.9);
    if (out.length <= PHOTO_MAX_CHARS) return out;
    scale *= 0.8;
  }
  return dataUrl; // gallery photos live in a text[] column; nothing is lost either way
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

/** The default export too: either import style works. */
export default ProductForm;
