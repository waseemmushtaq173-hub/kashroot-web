'use client';

/**
 * Real photos of a cold store (rental_listings.photos, lib/db/rentals).
 *   StorePhotosEditor  the owner adds up to 8 photos (made smaller on the
 *                      phone), writes a few words under each and saves them.
 *   StorePhotosView    a farmer sees them, one big at a time, beside the
 *                      drawing, the 3D view and the walk inside.
 */
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, ImageOff, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Btn, INPUT, Modal, type PortalTheme } from '@/components/portal/kit';
import { compressImage } from '@/lib/client/image';
import { toast } from '@/lib/client/toast';
import { MAX_STORE_PHOTOS, STORE_PHOTO_MAX_CHARS, saveStorePhotos, storePhotos, type StorePhoto } from '@/lib/db/rentals';

/** The photos of one store, read once it is shown (null while reading). */
function usePhotos(listingId: string) {
  const [got, setGot] = useState<{ id: string; photos: StorePhoto[]; error: string | null } | null>(null);
  useEffect(() => {
    let on = true;
    storePhotos(listingId).then(
      (photos) => on && setGot({ id: listingId, photos, error: null }),
      (e: unknown) => on && setGot({ id: listingId, photos: [], error: e instanceof Error ? e.message : 'Could not load the photos.' }),
    );
    return () => {
      on = false;
    };
  }, [listingId]);
  return got?.id === listingId ? got : null;
}

export function StorePhotosEditor({ listingId, title, theme, onClose }: { listingId: string; title: string; theme: PortalTheme; onClose: () => void }) {
  const got = usePhotos(listingId);
  const [edited, setEdited] = useState<StorePhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const photos = edited ?? got?.photos ?? [];
  const set = (list: StorePhoto[]) => setEdited(list);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setAdding(true);
    const list = [...photos];
    for (const file of Array.from(files)) {
      if (list.length >= MAX_STORE_PHOTOS) {
        toast.error(`Up to ${MAX_STORE_PHOTOS} photos. Remove one to add another.`);
        break;
      }
      try {
        let src = await compressImage(file, 1280, 0.8);
        // A very detailed photo can stay large: make it smaller again.
        if (src.length > STORE_PHOTO_MAX_CHARS) src = await compressImage(file, 900, 0.65);
        if (src.length > STORE_PHOTO_MAX_CHARS) src = await compressImage(file, 700, 0.55);
        if (src.length > STORE_PHOTO_MAX_CHARS) {
          toast.error('This photo is too big to send. Choose another one.');
          continue;
        }
        list.push({ src, note: '' });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not use that photo. Try another one.');
      }
    }
    set(list);
    setAdding(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveStorePhotos(listingId, photos);
      toast.success(photos.length ? 'Photos saved — farmers see them in “Photos”' : 'Photos removed');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the photos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Photos · ${title}`}
      wide
      footer={
        <>
          <Btn theme={theme} variant="ghost" className="min-h-[44px]" onClick={onClose}>Cancel</Btn>
          <Btn theme={theme} className="min-h-[44px]" icon={CheckCircle2} disabled={busy || adding || !got || edited === null} onClick={() => void save()}>{busy ? 'Saving…' : 'Save photos'}</Btn>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Farmers see these photos beside the drawing and the 3D view of your store. Take clear photos of the building, the main door, the passage and the inside of each chamber, and write a few words under each. Up to {MAX_STORE_PHOTOS}.
        </p>
        {!got ? (
          <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the photos…</p>
        ) : (
          <>
            {got.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{got.error}</p>}
            <ol className="grid gap-3 sm:grid-cols-2">
              {photos.map((p, i) => (
                <li key={i} className="flex gap-3 rounded-2xl bg-white p-2 ring-1 ring-slate-900/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.note || `Store photo ${i + 1}`} className="h-24 w-28 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      What it shows
                      <input
                        className={`${INPUT} mt-1 min-h-[44px] text-sm`}
                        maxLength={80}
                        value={p.note}
                        placeholder="e.g. Main door · Chamber 2, bins"
                        onChange={(e) => set(photos.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {i > 0 && (
                        <button type="button" aria-label={`Move photo ${i + 1} first`} onClick={() => set([p, ...photos.filter((_, j) => j !== i)])} className="min-h-[40px] cursor-pointer rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-200">
                          Show first
                        </button>
                      )}
                      {i === 0 && photos.length > 1 && <span className="inline-flex min-h-[40px] items-center rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">Shown first</span>}
                      <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => set(photos.filter((_, j) => j !== i))} className="inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-lg bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100">
                        <X className="h-3.5 w-3.5" aria-hidden /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {photos.length < MAX_STORE_PHOTOS && (
              <label className="flex min-h-[64px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">
                {adding ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
                {adding ? 'Making the photos smaller…' : photos.length ? 'Add more photos' : 'Add photos of your store'}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const f = e.target.files; void add(f).finally(() => { e.target.value = ''; }); }} />
              </label>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function StorePhotosView({ listingId }: { listingId: string }) {
  const got = usePhotos(listingId);
  const [at, setAt] = useState(0);
  if (!got) return <p className="grid min-h-[280px] place-items-center rounded-3xl bg-slate-50 text-sm text-slate-500 ring-1 ring-slate-900/5">Loading the photos…</p>;
  const { photos } = got;
  if (!photos.length) {
    return (
      <div className="grid min-h-[220px] place-items-center rounded-3xl bg-slate-50 p-6 text-center ring-1 ring-slate-900/5">
        <div className="space-y-2">
          <ImageOff className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="font-semibold text-slate-800">{got.error ?? 'The owner has not added photos of this store yet.'}</p>
          <p className="text-sm text-slate-600">Call the owner to ask, or visit the store before you bring your apples.</p>
        </div>
      </div>
    );
  }
  const i = Math.min(at, photos.length - 1);
  const p = photos[i];
  return (
    <section aria-label="Photos of the store" className="space-y-3">
      <figure className="relative overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-900/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt={p.note || `Photo ${i + 1} of the store`} className="mx-auto max-h-[62vh] w-full object-contain" />
        <figcaption className="flex items-center justify-between gap-2 bg-slate-950/80 px-4 py-2 text-sm text-white">
          <span className="min-w-0 truncate">{p.note || 'Photo of the store'}</span>
          <span className="shrink-0 tabular-nums text-slate-300">{i + 1} of {photos.length}</span>
        </figcaption>
        {photos.length > 1 && (
          <>
            <button type="button" aria-label="Photo before" onClick={() => setAt((i - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/90 text-slate-900 shadow hover:bg-white"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
            <button type="button" aria-label="Next photo" onClick={() => setAt((i + 1) % photos.length)} className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/90 text-slate-900 shadow hover:bg-white"><ArrowRight className="h-5 w-5" aria-hidden /></button>
          </>
        )}
      </figure>
      {photos.length > 1 && (
        <div role="group" aria-label="All photos" className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((x, j) => (
            <button key={j} type="button" aria-label={`Show photo ${j + 1}${x.note ? `: ${x.note}` : ''}`} aria-pressed={j === i} onClick={() => setAt(j)} className={`shrink-0 cursor-pointer overflow-hidden rounded-xl ring-2 ${j === i ? 'ring-emerald-600' : 'ring-transparent hover:ring-slate-300'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={x.src} alt="" className="h-16 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
