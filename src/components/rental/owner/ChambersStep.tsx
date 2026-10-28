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
import { Box as BoxIcon, CheckCircle2, CircleAlert, Copy, DoorOpen, Layers, Map as MapIcon, Plus, Ruler, Snowflake, Trash2, TriangleAlert } from 'lucide-react';

import { Btn, PORTAL_THEMES } from '@/components/portal/kit';
import { ChamberSide, floorText } from '@/components/rental/owner/ChamberSide';
import { Counter, Problems, StoragePicker, WallPicker } from '@/components/rental/owner/fields';
import { Preview3D } from '@/components/rental/owner/Preview3D';
import { StoreDrawing } from '@/components/rental/owner/StoreDrawing';
import { KitBox, type Kit } from '@/components/rental/owner/StoreSteps';
import { blankChamber, copyChamber, countText, DEFAULT_AISLE, nextNumber, nice, PACKING, readNumber, typed, UNIT_WORDS, type ChamberDraft } from '@/lib/coldStore';
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
          <BoxIcon className="mt-1 h-5 w-5 shrink-0 text-emerald-700" aria-hidden /> Add each chamber: what it holds, its floors, its size and its door. KashRoot lays out the stacks — always exactly your count.
        </p>
        <div role="tablist" aria-label="Your chambers" className="flex flex-wrap gap-2">
          {draft.chambers.map((c) => {
            const st = state(c);
            const on = open?.key === c.key;
            const mc = model.chambers.find((x) => x.key === c.key);
            return (
              <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => onSelect(c.key)} className={`inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-2 transition ${on ? 'bg-emerald-700 text-white ring-emerald-700' : 'bg-white text-slate-800 ring-slate-200 hover:ring-emerald-300'}`}>
                {st === 'ok' ? <CheckCircle2 className={`h-4 w-4 ${on ? 'text-white' : 'text-emerald-600'}`} aria-label="ready" /> : st === 'warn' ? <TriangleAlert className={`h-4 w-4 ${on ? 'text-amber-200' : 'text-amber-600'}`} aria-label="please check" /> : <CircleAlert className={`h-4 w-4 ${on ? 'text-rose-200' : 'text-rose-600'}`} aria-label="needs fixing" />}
                Chamber {c.no || '?'}
                {mc?.count ? <span className={`font-normal ${on ? 'text-emerald-100' : 'text-slate-500'}`}>· {countText(mc.count, c.storage)}</span> : null}
              </button>
            );
          })}
          <button type="button" onClick={add} className="inline-flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-800 ring-2 ring-emerald-200 hover:bg-emerald-100">
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
  const P = PACKING[c.storage];
  const count = readNumber(c.count);
  const kg = readNumber(c.kg) ?? P.defaultKg;
  const calc = count && kg && Number.isFinite(count) && Number.isFinite(kg) ? Math.round(count * kg) / 1000 : null;
  const most = done?.floors.length ? Math.min(...done.floors.map((f) => f.fits)) : undefined;
  const name = `Chamber ${c.no || '?'}`;
  /** A default in the owner's unit, as shown in an empty box. */
  const def = (m: number) => typed(m, u);
  const floors = Math.max(1, Math.min(10, Math.floor(Number(c.floors)) || 1));
  return (
    <section aria-label={name} className="space-y-5 rounded-3xl bg-white/90 p-4 ring-1 ring-slate-900/10 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900">{name}</h3>
        <div className="w-36"><KitBox kit={kit} field={`${k}.no`} label="Chamber number" number whole /></div>
      </div>
      <StoragePicker name={`${k}.storage`} value={c.storage} onChange={(v) => kit.set(`${k}.storage`, v)} />
      <div className="grid gap-5 sm:grid-cols-2">
        <KitBox kit={kit} field={`${k}.count`} label={`How many ${W.many} does it hold?`} number whole />
        <KitBox kit={kit} field={`${k}.kg`} label={`Kg of apples in one ${W.one}`} number placeholder={String(P.defaultKg)} hint={`Empty: ${P.defaultKg} kg (the usual). A wooden apple bin holds about 200–400 kg; a plastic crate about 20 kg.`} />
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
        <p className="flex items-center gap-2 text-base font-semibold text-slate-900"><Ruler className="h-5 w-5 text-emerald-700" aria-hidden /> Size inside the chamber</p>
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

      {floors > 1 && <FloorHeights kit={kit} c={c} floors={floors} />}

      <fieldset className="space-y-4 rounded-2xl bg-sky-50/70 p-4 ring-1 ring-sky-200">
        <legend className="sr-only">One {W.one} and how you stack</legend>
        <p className="flex items-center gap-2 text-base font-semibold text-sky-950"><BoxIcon className="h-5 w-5" aria-hidden /> One {W.one} and how you stack</p>
        <p className="text-sm text-sky-950">Empty boxes use the usual sizes shown in them. Change any to match your store.</p>
        <div className="grid gap-5 sm:grid-cols-3">
          <KitBox kit={kit} field={`${k}.unitL`} label={`${W.title.slice(0, -1)} length (${u})`} number placeholder={def(P.size.l)} />
          <KitBox kit={kit} field={`${k}.unitW`} label={`${W.title.slice(0, -1)} width (${u})`} number placeholder={def(P.size.w)} />
          <KitBox kit={kit} field={`${k}.unitH`} label={`${W.title.slice(0, -1)} height (${u})`} number placeholder={def(P.size.h)} hint="With the gap above it in a stack." />
        </div>
        <KitBox kit={kit} field={`${k}.stackHigh`} label={`How many ${W.many} high in one stack?`} number whole placeholder={most ? String(most) : undefined} hint={most ? `Empty: as high as fits under each floor’s ceiling — up to ${most}.` : 'Empty: as high as fits.'} />
        <div className="grid gap-5 sm:grid-cols-3">
          <KitBox kit={kit} field={`${k}.aisle`} label={`Main aisle width (${u})`} number placeholder={def(DEFAULT_AISLE)} hint="The forklift aisle in from the door. 0: no aisle." />
          <KitBox kit={kit} field={`${k}.stackGap`} label={`Gap between stacks (${u})`} number placeholder={def(P.gap)} />
          <KitBox kit={kit} field={`${k}.wallGap`} label={`Gap at the walls (${u})`} number placeholder={def(P.wallGap)} />
        </div>
      </fieldset>

      {done && done.fitsByMeasure > 0 && (
        <p className="rounded-2xl bg-white p-4 text-sm text-slate-800 ring-1 ring-slate-900/10" aria-live="polite">
          <strong className="text-slate-900">By its size</strong>, {name} fits about <strong>{countText(done.fitsByMeasure, c.storage)}</strong> = <strong>{nice(Math.round(done.tonnesByMeasure * 10) / 10)} tonnes</strong> ({floors > 1 ? `${floors} floors, ` : ''}aisle and gaps kept clear).
          {done.count > 0 && done.count > done.fitsByMeasure ? <span className="text-amber-800"> You wrote {countText(done.count, c.storage)} — more than fit. Check the count or the size.</span> : null}
        </p>
      )}

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
        <summary className="min-h-[44px] cursor-pointer list-none py-2 text-sm font-semibold text-slate-800">More details (optional) — where the chamber stands, its cooling</summary>
        <div className="mt-3 space-y-5">
          <p className="text-sm text-slate-700">Where {name} stands inside the building (leave empty and it is drawn in order along the back wall):</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <KitBox kit={kit} field={`${k}.spotX`} label={`From the building’s left wall (${u})`} number />
            <KitBox kit={kit} field={`${k}.spotY`} label={`From the building’s front wall (${u})`} number />
          </div>
          <p className="flex items-center gap-2 pt-2 text-sm font-semibold text-slate-900"><Snowflake className="h-4 w-4 text-sky-700" aria-hidden /> Cooling (optional — shown to farmers when you fill it in)</p>
          <Pick
            label="Which wall are the cooling units on?"
            name={`${k}.coolerWall`}
            value={c.coolerWall}
            options={[['', 'Facing the door'], ['front', 'Door wall'], ['left', 'Left wall'], ['right', 'Right wall'], ['back', 'Back wall']]}
            onChange={(v) => kit.set(`${k}.coolerWall`, v)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Pick label="Cooling gas" name={`${k}.coolant`} value={c.coolant} options={[['', 'Not said'], ['ammonia', 'Ammonia'], ['freon', 'Freon']]} onChange={(v) => kit.set(`${k}.coolant`, v)} />
            <Pick label="Controlled atmosphere (CA)?" name={`${k}.ca`} value={c.ca} options={[['', 'Not said'], ['yes', 'Yes, CA'], ['no', 'No']]} onChange={(v) => kit.set(`${k}.ca`, v)} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <KitBox kit={kit} field={`${k}.temperature`} label="Temperature kept" maxLength={30} placeholder="e.g. 0 to 2 °C" />
            <KitBox kit={kit} field={`${k}.humidity`} label="Humidity (%)" number placeholder="e.g. 92" />
          </div>
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

/**
 * Each floor's clear height, lowest first — floor (or grating) to the grating
 * above, or to the ceiling. Kept as one list ("12, 10, 10"); all empty: the
 * chamber's height shared evenly, shown in each box.
 */
function FloorHeights({ kit, c, floors }: { kit: Kit; c: ChamberDraft; floors: number }) {
  const u = kit.draft.unit;
  const field = `${c.key}.floorHeights`;
  const parts = c.floorHeights.split(/[,;]+|\s+/).filter(Boolean);
  const values = Array.from({ length: floors }, (_, i) => parts[i] ?? '');
  const H = readNumber(c.height);
  const even = H && !Number.isNaN(H) ? typed((H * (u === 'ft' ? 0.3048 : 1)) / floors, u) : '';
  const put = (i: number, v: string) => {
    const next = values.map((x, j) => (j === i ? v.trim() : x));
    // All empty: back to sharing the height evenly. Otherwise every floor needs its number (the model says which is missing).
    kit.set(field, next.every((x) => !x) ? '' : next.map((x) => x || '?').join(', '));
  };
  return (
    <fieldset data-field={field} className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-900/5">
      <legend className="sr-only">Height of each floor</legend>
      <p className="flex items-center gap-2 text-base font-semibold text-slate-900"><Layers className="h-5 w-5 text-emerald-700" aria-hidden /> Height of each floor ({u})</p>
      <p className="text-sm text-slate-700">Measure from the floor (or grating) up to the grating above — or to the ceiling for the top floor. Leave them all empty to share the chamber’s height evenly{even ? ` (${even} ${u} each)` : ''}.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {values.map((v, i) => (
          <label key={i} className="block">
            <span className="block text-sm font-semibold text-slate-800">Floor {i + 1}</span>
            <input
              className="mt-1.5 block min-h-[48px] w-full rounded-xl border-0 bg-white px-3 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
              inputMode="decimal"
              value={v === '?' ? '' : v}
              placeholder={even || undefined}
              onChange={(e) => put(i, e.target.value.replace(/[^\d.]/g, ''))}
              onBlur={() => kit.touch(field)}
            />
          </label>
        ))}
      </div>
      <Problems issues={kit.issuesOf(field)} onFix={kit.fix} />
    </fieldset>
  );
}

/** A choice of a few, as big buttons (44 px or more). */
function Pick<V extends string>({ label, name, value, options, onChange }: { label: string; name: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div data-field={name} role="radiogroup" aria-label={label}>
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button key={v || 'none'} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`min-h-[44px] cursor-pointer rounded-xl px-3 text-sm font-semibold ring-2 transition ${value === v ? 'bg-emerald-700 text-white ring-emerald-700' : 'bg-white text-slate-800 ring-slate-200 hover:ring-emerald-300'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
