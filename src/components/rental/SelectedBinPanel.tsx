'use client';

/**
 * The place a farmer just chose, like a seat on a flight: which bin it is,
 * what it holds, what is taken, what is still free, the rent, and how many
 * of their own bins or crates go on it — with the price as they change the
 * number. The same panel whether the place was tapped on the drawing, in the
 * 3D view or on the walk inside (all three call the booking's one `toggle`).
 *
 * Every number is the database's: the capacity is the chamber's saved
 * boxes_per_slot, "taken" is what cold_slot_bookings holds for the months
 * chosen. A farmer sees only a total for other farmers — never who they are.
 */
import { ArrowRight, Minus, Plus, Trash2 } from 'lucide-react';

import { inr } from '@/lib/db/client';
import { planOf, showLength } from '@/lib/coldLayout';
import { countText, UNIT_WORDS } from '@/lib/coldStore';
import { parsePlace, placeLabel, type ColdChamber } from '@/lib/db/coldMap';

/** "C2-R3-S4" (chamber 2, row 3, stack 4); with floors, "C2-F3-R3-S4". Made only from the chamber's saved row and the place's own code. */
export function binCode(c: Pick<ColdChamber, 'chamber_no' | 'name' | 'floor' | 'size'>, slot: string): string {
  const { row, stack } = parsePlace(slot);
  const chamber = c.chamber_no !== null ? `C${c.chamber_no}` : c.name.replace(/\s+/g, '').slice(0, 8).toUpperCase();
  const floor = (c.size?.floors ?? 1) > 1 ? `-F${c.floor}` : '';
  return `${chamber}${floor}-R${row}-S${stack}`;
}

export function SelectedBinPanel({
  facility,
  chamber: c,
  slot,
  room,
  mineStored,
  boxes,
  rate,
  months,
  minUnits,
  totalChosen,
  onBoxes,
  onRemove,
  onBook,
}: {
  facility: string;
  chamber: ColdChamber;
  slot: string;
  /** Units that still fit on this place for the months chosen, before this farmer's choice. */
  room: number;
  /** The farmer's own units already booked on this place. */
  mineStored: number;
  /** Units the farmer is choosing now. */
  boxes: number;
  /** Rent for one unit for one month. */
  rate: number;
  months: number;
  /** The store's smallest booking, over all chosen places. */
  minUnits: number;
  /** Units chosen over all places (this one included). */
  totalChosen: number;
  onBoxes: (n: number) => void;
  onRemove: () => void;
  onBook: () => void;
}) {
  const st = c.storage;
  const words = UNIT_WORDS[st];
  const capacity = c.boxes_per_slot;
  const taken = Math.max(0, capacity - room);
  const others = Math.max(0, taken - mineStored);
  const left = Math.max(0, room - boxes);
  const kg = (n: number) => (c.unit_kg ? ` · ${Math.round(n * c.unit_kg).toLocaleString('en-IN')} kg` : '');
  const plan = c.size ? planOf(c.size) : null;
  const dims = c.size && plan ? `${showLength(plan.placeW, c.size.unit)} × ${showLength(plan.placeD, c.size.unit)} × ${showLength(plan.stackHeight, c.size.unit)}` : null;
  const floors = c.size?.floors ?? 1;
  const price = Math.round(boxes * rate * months * 100) / 100;
  const set = (n: number) => onBoxes(Math.min(room, Math.max(1, Math.floor(n) || 1)));
  const short = totalChosen < minUnits;
  const pct = (n: number) => `${capacity > 0 ? Math.min(100, (n / capacity) * 100) : 0}%`;
  const row = (label: string, value: string, strong = false) => (
    <>
      <dt className="text-[#718078]">{label}</dt>
      <dd className={strong ? 'font-semibold text-forest' : 'text-[#24243F]'}>{value}</dd>
    </>
  );
  const step = 'grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-white text-forest ring-1 ring-[#E0E3F5] transition hover:bg-forest-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section aria-label={`Selected bin ${binCode(c, slot)}`} data-testid="selected-bin-panel" className="rounded-2xl bg-white p-4 text-sm ring-2 ring-[#C6A45B]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#718078]">Selected bin</p>
          <h4 className="text-xl font-bold tabular-nums tracking-wide text-forest" data-testid="selected-bin-id">{binCode(c, slot)}</h4>
          <p className="text-[#718078]">{c.name} · {placeLabel(slot)}</p>
        </div>
        <button type="button" onClick={onRemove} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl px-3 font-semibold text-[#991B1B] hover:bg-[#FEE2E2]">
          <Trash2 className="h-4 w-4" aria-hidden /> Remove
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {row('Facility', facility)}
        {row('Floor', floors > 1 ? `Floor ${c.floor} of ${floors}` : 'Ground floor')}
        {row('Chamber', c.chamber_no !== null && c.name !== `Chamber ${c.chamber_no}` ? `Chamber ${c.chamber_no} (${c.name})` : c.name)}
        {row('Place size (L × W × H)', dims ?? 'Not measured by the owner')}
        {row('Total capacity', `${countText(capacity, st)}${kg(capacity)}`)}
        {row('Occupied', `${countText(taken, st)}${kg(taken)}${mineStored > 0 ? ` (yours: ${mineStored.toLocaleString('en-IN')}, other farmers: ${others.toLocaleString('en-IN')})` : ''}`)}
        {row('Remaining free', `${countText(room, st)}${kg(room)}`, true)}
        {row('Rate', rate > 0 ? `${inr(rate)} a ${words.one} a month` : 'Ask the owner')}
      </dl>

      {/* Capacity bar: taken, this choice, still free. */}
      <div className="mt-3" aria-hidden>
        <div className="flex h-3 overflow-hidden rounded-full bg-forest-soft ring-1 ring-[#E0E3F5]">
          <span style={{ width: pct(taken) }} className="bg-[#64748B]" />
          <span style={{ width: pct(boxes) }} className="bg-forest" />
        </div>
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-[#718078]">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#64748B]" />taken {taken.toLocaleString('en-IN')}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-forest" />your choice {boxes.toLocaleString('en-IN')}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-forest-soft ring-1 ring-forest-mid" />free after {left.toLocaleString('en-IN')}</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-forest-soft p-3">
        <div>
          <label htmlFor="kr-bin-qty" className="block text-xs font-semibold text-[#24243F]">How many {words.many} here? (1 to {room.toLocaleString('en-IN')})</label>
          <div className="mt-1 flex items-center gap-2">
            <button type="button" aria-label={`One ${words.one} fewer`} className={step} disabled={boxes <= 1} onClick={() => set(boxes - 1)}><Minus className="h-4 w-4" aria-hidden /></button>
            <input
              id="kr-bin-qty"
              data-testid="selected-bin-qty"
              type="number"
              inputMode="numeric"
              min={1}
              max={room}
              value={boxes || ''}
              onChange={(e) => onBoxes(Math.min(room, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
              className="min-h-[44px] w-24 rounded-xl border-0 bg-white px-3 text-center text-base font-bold tabular-nums text-[#24243F] ring-1 ring-inset ring-[#E0E3F5] focus:ring-2 focus:ring-forest-mid"
            />
            <button type="button" aria-label={`One ${words.one} more`} className={step} disabled={boxes >= room} onClick={() => set(boxes + 1)}><Plus className="h-4 w-4" aria-hidden /></button>
            <button type="button" className="min-h-[44px] cursor-pointer rounded-xl px-3 text-sm font-semibold text-forest hover:bg-white" onClick={() => set(room)}>All {room.toLocaleString('en-IN')}</button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#718078]">{boxes.toLocaleString('en-IN')} × {inr(rate)} × {months} month{months === 1 ? '' : 's'}</p>
          <p className="text-2xl font-bold tabular-nums text-forest" data-testid="selected-bin-price" aria-live="polite">{inr(price)}</p>
        </div>
      </div>

      {short && <p className="mt-2 text-xs text-[#6B4F0F]">This cold store takes at least {countText(minUnits, st)} in one booking. You have chosen {totalChosen.toLocaleString('en-IN')} so far: add more here or on another place.</p>}
      <button type="button" data-testid="book-selected-bin" onClick={onBook} disabled={boxes < 1} className="kr-btn-primary mt-3 w-full">
        Book Selected Bin Capacity <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}
