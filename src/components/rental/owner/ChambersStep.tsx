'use client';

/**
 * Owner wizard, step 3 — the chambers. For each: its number, bins or crates,
 * how many and how many kg in one (the tonnes worked out, and checked against
 * what the owner says), how many floors, its size, its own door and the rent.
 * "Copy this chamber" and "How many more like this?" add chambers that are
 * the same. Beside the form (below it on a phone) the whole store is drawn
 * from above, the open chamber from the side, and in 3D — all from the very
 * rows that will be saved, redrawn as the owner types.
 */
import { useState } from 'react';
import { Box as BoxIcon, CheckCircle2, CircleAlert, Copy, DoorOpen, Layers, Map as MapIcon, Plus, Ruler, Trash2, TriangleAlert } from 'lucide-react';

import { Btn, PORTAL_THEMES } from '@/components/portal/kit';
import { ChamberSide, floorText } from '@/components/rental/owner/ChamberSide';
import { Counter, Problems, StoragePicker, WallPicker } from '@/components/rental/owner/fields';
import { Preview3D } from '@/components/rental/owner/Preview3D';
import { StoreDrawing } from '@/components/rental/owner/StoreDrawing';
import { KitBox, type Kit } from '@/components/rental/owner/StoreSteps';
import { blankChamber, copyChamber, countText, nextNumber, nice, PACKING, readNumber, UNIT_WORDS, type ChamberDraft } from '@/lib/coldStore';
import type { ColdChamber } from '@/lib/db/coldMap';

const theme = PORTAL_THEMES.rental;
const EMPTY = 'Add the building’s size and its main door (step 2, The building) to see your chambers drawn inside it. The 3D view works now.';

export function ChambersStep({
  kit,
  listingId,
  selected,
  onSelect,
  older,
  onRemoveOlder,
}: {
  kit: Kit;
  listingId: string;
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Chambers set up before the wizard (kept as they are). */
  older: ColdChamber[];
  onRemoveOlder: (c: ColdChamber) => void;
}) {
  const { draft, model, shown } = kit;
  const [view, setView] = useState<'drawing' | '3d'>('drawing');
  const [more, setMore] = useState('1');
  const open = draft.chambers.find((c) => c.key === selected) ?? draft.chambers[0] ?? null;
  const openShown = open ? shown.chambers.find((mc) => mc.key === open.key) ?? null : null;
  const openNow = open ? model.chambers.find((mc) => mc.key === open.key) ?? null : null;
  const taken = older.length;

  const add = () => {
    const c = blankChamber(nextNumber(draft.chambers, taken), draft.chambers.at(-1)?.storage ?? 'bins');
    kit.update((d) => ({ ...d, chambers: [...d.chambers, c] }));
    onSelect(c.key);
  };
  const copies = (from: ChamberDraft, n: number) => {
    const list: ChamberDraft[] = [];
    let no = nextNumber(draft.chambers, taken);
    for (let i = 0; i < n; i++) list.push(copyChamber(from, no++));
    kit.update((d) => ({ ...d, chambers: [...d.chambers, ...list] }));
    onSelect(list[0]?.key ?? from.key);
  };
  const remove = (c: ChamberDraft) => {
    if (!window.confirm(`Remove Chamber ${c.no}? (If a farmer has booked a place in it, it cannot be removed when you save.)`)) return;
    const rest = draft.chambers.filter((x) => x.key !== c.key);
    kit.update((d) => ({ ...d, chambers: d.chambers.filter((x) => x.key !== c.key) }));
    onSelect(rest[0]?.key ?? null);
  };
  const state = (c: ChamberDraft) => {
    const mine = model.issues.filter((i) => i.field.startsWith(`${c.key}.`));
    return mine.some((i) => i.level === 'error') ? 'error' : mine.length ? 'warn' : 'ok';
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-5">
        <p className="flex items-start gap-2 text-base text-slate-700">
          <BoxIcon className="mt-1 h-5 w-5 shrink-0 text-violet-700" aria-hidden /> Add each chamber: what it holds, its floors, its size and its door. KashRoot lays out the stacks — always exactly your count.
        </p>
        <div role="tablist" aria-label="Your chambers" className="flex flex-wrap gap-2">
          {draft.chambers.map((c) => {
            const st = state(c);
            const on = open?.key === c.key;
            const mc = model.chambers.find((x) => x.key === c.key);
            return (
              <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => onSelect(c.key)} className={`inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-2 transition ${on ? 'bg-violet-700 text-white ring-violet-700' : 'bg-white text-slate-800 ring-slate-200 hover:ring-violet-300'}`}>
                {st === 'ok' ? <CheckCircle2 className={`h-4 w-4 ${on ? 'text-white' : 'text-emerald-600'}`} aria-label="ready" /> : st === 'warn' ? <TriangleAlert className={`h-4 w-4 ${on ? 'text-amber-200' : 'text-amber-600'}`} aria-label="please check" /> : <CircleAlert className={`h-4 w-4 ${on ? 'text-rose-200' : 'text-rose-600'}`} aria-label="needs fixing" />}
                Chamber {c.no || '?'}
                {mc?.count ? <span className={`font-normal ${on ? 'text-violet-100' : 'text-slate-500'}`}>· {countText(mc.count, c.storage)}</span> : null}
              </button>
            );
          })}
          <button type="button" onClick={add} className="inline-flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-xl bg-violet-50 px-3.5 text-sm font-semibold text-violet-800 ring-2 ring-violet-200 hover:bg-violet-100">
            <Plus className="h-4 w-4" aria-hidden /> Add a chamber
          </button>
        </div>
        <Problems issues={kit.issuesOf('chambers')} />

        {older.length > 0 && (
          <div className="space-y-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-950 ring-1 ring-sky-200">
            <p className="font-semibold">Chambers you set up before (kept as they are)</p>
            <p>These were set up before a chamber could have floors, bins or crates, so farmers see each as one plain room of boxes. Add your real chambers below — each with its size, floors and bins or crates — then remove the old ones.</p>
            <ul className="space-y-1.5">
              {older.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{c.name} · {c.rows} rows × {c.cols} stacks · {((c.rows * c.cols - c.blocked.length) * c.boxes_per_slot).toLocaleString('en-IN')} boxes</span>
                  <Btn theme={theme} size="sm" variant="danger" icon={Trash2} onClick={() => onRemoveOlder(c)}>Remove {c.name}</Btn>
                </li>
              ))}
            </ul>
          </div>
        )}

        {open ? (
          <ChamberEditor kit={kit} c={open} done={openNow} onCopy={() => copies(open, 1)} onMore={() => copies(open, Math.min(50, Math.max(1, Math.floor(Number(more)) || 1)))} more={more} setMore={setMore} onRemove={() => remove(open)} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
            <p className="text-base text-slate-700">No chambers yet. Add your first chamber.</p>
            <Btn theme={theme} className="mt-3 min-h-[48px]" icon={Plus} onClick={add}>Add a chamber</Btn>
          </div>
        )}
      </div>

      <section aria-label="Live drawing of your cold store" className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="See your store" className="flex gap-1 rounded-2xl bg-sky-50 p-1 ring-1 ring-sky-200">
            {([['drawing', 'Drawing', MapIcon], ['3d', '3D view', Layers]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${view === id ? 'bg-sky-700 text-white shadow' : 'text-sky-900 hover:bg-sky-100'}`}>
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-700">
            {[shown.totals.bins ? countText(shown.totals.bins, 'bins') : '', shown.totals.crates ? countText(shown.totals.crates, 'crates') : ''].filter(Boolean).join(' + ') || 'Nothing yet'}
            {shown.totals.tonnes ? ` · ${nice(shown.totals.tonnes)} tonnes` : ''}
          </p>
        </div>
        {view === 'drawing' ? (
          <>
            <StoreDrawing model={shown} selected={open?.key ?? null} onPick={onSelect} title={draft.title.trim() || undefined} empty={EMPTY} />
            {openShown && (
              <section aria-label={`${openShown.name} from the side`} className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">{openShown.name} from the side</p>
                <ChamberSide chamber={openShown} />
              </section>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700">Your store in 3D, exactly as farmers will see it. Drag to turn it.</p>
            <Preview3D model={shown} listingId={listingId} selected={open?.key ?? null} onPick={onSelect} />
          </>
        )}
        {draft.chambers.filter((c) => !shown.chambers.some((mc) => mc.key === c.key)).map((c) => (
          <p key={c.key} className="text-xs text-slate-600">Chamber {c.no || '?'} is drawn once its length, width and height are filled in.</p>
        ))}
      </section>
    </div>
  );
}

function ChamberEditor({
  kit,
  c,
  done,
  onCopy,
  onMore,
  more,
  setMore,
  onRemove,
}: {
  kit: Kit;
  c: ChamberDraft;
  done: Kit['model']['chambers'][number] | null;
  onCopy: () => void;
  onMore: () => void;
  more: string;
  setMore: (v: string) => void;
  onRemove: () => void;
}) {
  const u = kit.draft.unit;
  const W = UNIT_WORDS[c.storage];
  const k = c.key;
  const count = readNumber(c.count);
  const kg = readNumber(c.kg);
  const calc = count && kg && Number.isFinite(count) && Number.isFinite(kg) ? Math.round(count * kg) / 1000 : null;
  const most = done?.floors[0]?.fits;
  const name = `Chamber ${c.no || '?'}`;
  return (
    <section aria-label={name} className="space-y-5 rounded-3xl bg-white/90 p-4 ring-1 ring-slate-900/10 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900">{name}</h3>
        <div className="w-36"><KitBox kit={kit} field={`${k}.no`} label="Chamber number" number whole /></div>
      </div>
      <StoragePicker name={`${k}.storage`} value={c.storage} onChange={(v) => kit.set(`${k}.storage`, v)} />
      <div className="grid gap-5 sm:grid-cols-2">
        <KitBox kit={kit} field={`${k}.count`} label={`How many ${W.many} does it hold?`} number whole />
        <KitBox kit={kit} field={`${k}.kg`} label={`Kg of apples in one ${W.one}`} number hint="A wooden apple bin usually holds about 200–400 kg; a plastic crate about 20 kg." />
      </div>
      <KitBox
        kit={kit}
        field={`${k}.tonnes`}
        label="Capacity (metric tonnes)"
        number
        value={c.tonnes || (calc !== null ? String(calc) : '')}
        hint={calc !== null ? `${countText(count!, c.storage)} × ${nice(kg!)} kg = ${nice(calc)} tonnes. Change it if your number is different.` : `Worked out from the ${W.many} and the kg — or write it.`}
      />
      <Counter
        label="How many floors?"
        name={`${k}.floors`}
        value={c.floors}
        min={1}
        max={10}
        onChange={(v) => kit.set(`${k}.floors`, v)}
        issues={kit.issuesOf(`${k}.floors`)}
        hint="Floors one above the other inside the chamber. 1 if there are none."
      />

      <fieldset className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-900/5">
        <legend className="sr-only">Size</legend>
        <p className="flex items-center gap-2 text-base font-semibold text-slate-900"><Ruler className="h-5 w-5 text-violet-700" aria-hidden /> Size inside the chamber</p>
        <div className="grid gap-5 sm:grid-cols-3">
          <KitBox kit={kit} field={`${k}.length`} label={`Length, along the front (${u})`} number />
          <KitBox kit={kit} field={`${k}.width`} label={`Width, front to back (${u})`} number />
          <KitBox kit={kit} field={`${k}.height`} label={`Height, floor to ceiling (${u})`} number />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200">
        <legend className="sr-only">The chamber’s door</legend>
        <p className="flex items-center gap-2 text-base font-semibold text-amber-950"><DoorOpen className="h-5 w-5" aria-hidden /> The door of {name}</p>
        <WallPicker label={`Which wall is the door of ${name} in?`} name={`${k}.door.wall`} value={c.door.wall} onChange={(w) => kit.set(`${k}.door.wall`, w)} />
        <KitBox kit={kit} field={`${k}.door.from`} label={`Door: distance from the left corner (${u})`} number hint={`Stand outside the chamber, facing its ${c.door.wall} wall. Measure from the corner on your left to the door. At the corner: write 0.`} />
        <div className="grid gap-5 sm:grid-cols-2">
          <KitBox kit={kit} field={`${k}.door.width`} label={`Door: width (${u})`} number />
          <KitBox kit={kit} field={`${k}.door.height`} label={`Door: height (${u})`} number />
        </div>
      </fieldset>

      <KitBox kit={kit} field={`${k}.rate`} label={`Rent for one ${W.one} for one month (₹)`} number hint={`Farmers pay this for each ${W.one} they keep here, each month.`} />

      {done && done.floors.length > 0 && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200" aria-live="polite">
          <p className="font-semibold">How {name} is laid out</p>
          <ul className="mt-1 space-y-0.5">
            {done.floors.map((f) => <li key={f.floor}>{floorText(done, f)}</li>)}
          </ul>
          <p className="mt-1 text-emerald-900">Farmers book any number of {W.many}; a stack can be shared.</p>
        </div>
      )}
      <Problems issues={[...kit.issuesOf(`${k}.fit`), ...kit.issuesOf(`${k}.spot`)]} onFix={kit.fix} />

      <details className="group rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-900/5">
        <summary className="min-h-[44px] cursor-pointer list-none py-2 text-sm font-semibold text-slate-800">More details (optional) — how high you stack, where the chamber stands</summary>
        <div className="mt-3 space-y-5">
          <KitBox kit={kit} field={`${k}.stackHigh`} label={`How many ${W.many} high do you stack? (optional)`} number whole hint={most ? `Leave it empty and KashRoot stacks as high as fits under each floor’s ceiling: up to ${most} ${W.many}.` : 'Leave it empty: as high as fits.'} />
          <p className="text-sm text-slate-700">Where {name} stands inside the building (leave empty and it is drawn in order along the back wall):</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <KitBox kit={kit} field={`${k}.spotX`} label={`From the building’s left wall (${u})`} number />
            <KitBox kit={kit} field={`${k}.spotY`} label={`From the building’s front wall (${u})`} number />
          </div>
          <p className="text-xs text-slate-600">{c.storage === 'bins' ? `A bin stands about ${u === 'ft' ? '4 × 4 ft' : '1.2 × 1.2 m'} and adds ${u === 'ft' ? '2.5 ft' : `${PACKING.bins.size.h} m`} to a stack.` : `A crate stands about ${u === 'ft' ? '2 × 1.3 ft' : '0.6 × 0.4 m'} and adds ${u === 'ft' ? '1 ft' : `${PACKING.crates.size.h} m`} to a stack.`}</p>
        </div>
      </details>

      <div className="flex flex-wrap items-end gap-3 border-t border-slate-900/5 pt-4">
        <Btn theme={theme} variant="soft" className="min-h-[48px]" icon={Copy} onClick={onCopy}>Copy this chamber</Btn>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800">How many more chambers like this?</span>
            <input className="mt-1.5 block min-h-[48px] w-20 rounded-xl border-0 bg-white px-3 text-center text-base font-bold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500" inputMode="numeric" value={more} onChange={(e) => setMore(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <Btn theme={theme} variant="soft" className="min-h-[48px]" icon={Plus} onClick={onMore}>Add {Math.min(50, Math.max(1, Math.floor(Number(more)) || 1))} more like this</Btn>
        </div>
        <Btn theme={theme} variant="danger" className="min-h-[48px]" icon={Trash2} onClick={onRemove}>Remove {name}</Btn>
      </div>
    </section>
  );
}
