'use client';

/**
 * The owner wizard's form pieces: a labelled box that shows its own problem
 * right under it (red: fix it; orange: please check) with a one-tap fix,
 * big picture buttons for a wall and for bins or crates, a feet / metres
 * switch, and a − / + counter. Every box is at least 44 px tall.
 */
import { useId, type ReactNode } from 'react';
import { CircleAlert, Minus, Plus, TriangleAlert, Wand2 } from 'lucide-react';

import { INPUT } from '@/components/portal/kit';
import type { Issue, Packed, SizeUnit, Wall } from '@/lib/coldStore';

/** Inputs are big enough to tap and to read. */
export const BIG = `${INPUT} min-h-[48px] text-base`;

/** The problems with one box, shown under it. */
export function Problems({ issues, onFix }: { issues: Issue[]; onFix?: (field: string, value: string) => void }) {
  if (!issues.length) return null;
  return (
    <span className="mt-1.5 block space-y-1.5">
      {issues.map((i) => (
        <span key={i.message} role={i.level === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-start gap-x-2 gap-y-1.5 rounded-xl px-3 py-2 text-sm ${i.level === 'error' ? 'bg-rose-50 text-rose-900 ring-1 ring-rose-200' : 'bg-amber-50 text-amber-950 ring-1 ring-amber-300'}`}>
          {i.level === 'error' ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span className="min-w-0 flex-1">{i.message}</span>
          {i.fix && onFix && (
            <button type="button" onClick={() => onFix(i.fix!.field, i.fix!.value)} className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50">
              <Wand2 className="h-4 w-4" aria-hidden /> {i.fix.label}
            </button>
          )}
        </span>
      ))}
    </span>
  );
}

/** A labelled text or number box with its problems. */
export function Box({
  label,
  hint,
  value,
  onChange,
  issues = [],
  onFix,
  number = false,
  whole = false,
  type = 'text',
  placeholder,
  autoComplete,
  name,
  maxLength,
  onBlur,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  issues?: Issue[];
  onFix?: (field: string, value: string) => void;
  /** A number: decimal keypad (or the number keypad for `whole`). */
  number?: boolean;
  whole?: boolean;
  type?: 'text' | 'tel';
  placeholder?: string;
  autoComplete?: string;
  /** Where the box is (data-field), to scroll to it. */
  name?: string;
  maxLength?: number;
  /** Left the box: its problems show from now on. */
  onBlur?: () => void;
}) {
  const id = useId();
  const bad = issues.some((i) => i.level === 'error');
  return (
    <div data-field={name}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      <input
        id={id}
        className={`${BIG} mt-1.5 ${bad ? 'ring-2 ring-rose-400' : ''}`}
        type={type}
        inputMode={number ? (whole ? 'numeric' : 'decimal') : type === 'tel' ? 'tel' : undefined}
        aria-invalid={bad || undefined}
        aria-describedby={hint || issues.length ? `${id}-about` : undefined}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <span id={`${id}-about`} className="block">
        {hint && <span className="mt-1 block text-xs text-slate-600">{hint}</span>}
        <Problems issues={issues} onFix={onFix} />
      </span>
    </div>
  );
}

/** A labelled list to choose from. */
export function Choose({ label, value, options, onChange, issues = [], name, placeholder }: { label: string; value: string; options: string[]; onChange: (v: string) => void; issues?: Issue[]; name?: string; placeholder?: string }) {
  const id = useId();
  const bad = issues.some((i) => i.level === 'error');
  return (
    <div data-field={name}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      <select id={id} className={`${BIG} mt-1.5 ${bad ? 'ring-2 ring-rose-400' : ''}`} value={value} aria-invalid={bad || undefined} aria-describedby={issues.length ? `${id}-about` : undefined} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span id={`${id}-about`} className="block"><Problems issues={issues} /></span>
    </div>
  );
}

const WALL_TEXT: Record<Wall, string> = { front: 'Front wall', back: 'Back wall', left: 'Left wall', right: 'Right wall' };

/** A small building from above with one wall marked (front at the bottom). */
function WallIcon({ wall, on }: { wall: Wall; on: boolean }) {
  const line = { front: [6, 34, 42, 34], back: [6, 6, 42, 6], left: [6, 6, 6, 34], right: [42, 6, 42, 34] }[wall];
  return (
    <svg aria-hidden width="48" height="40" viewBox="0 0 48 40">
      <rect x="6" y="6" width="36" height="28" rx="2" fill={on ? '#ede9fe' : '#f8fafc'} stroke="#94a3b8" strokeWidth="2" />
      <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke="#d97706" strokeWidth="6" strokeLinecap="round" />
      <text x="24" y="39.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#64748b">FRONT</text>
    </svg>
  );
}

/** Which wall a door is in: four big picture buttons. */
export function WallPicker({ label, value, onChange, name }: { label: string; value: Wall; onChange: (w: Wall) => void; name?: string }) {
  return (
    <fieldset data-field={name}>
      <legend className="text-sm font-semibold text-slate-800">{label}</legend>
      <div role="radiogroup" aria-label={label} className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['front', 'back', 'left', 'right'] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={value === w}
            onClick={() => onChange(w)}
            className={`flex min-h-[64px] cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold ring-2 transition ${value === w ? 'bg-emerald-700 text-white ring-emerald-700' : 'bg-white text-slate-800 ring-slate-200 hover:ring-emerald-300'}`}
          >
            <span className="shrink-0 rounded-lg bg-white p-0.5"><WallIcon wall={w} on={value === w} /></span>
            {WALL_TEXT[w]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A wooden pallet bin or a plastic crate, drawn. */
function StorageIcon({ kind }: { kind: Packed }) {
  return kind === 'bins' ? (
    <svg aria-hidden width="64" height="52" viewBox="0 0 64 52">
      <rect x="6" y="6" width="52" height="34" rx="2" fill="#d6a46b" stroke="#92400e" strokeWidth="2" />
      {[16, 26, 36].map((y) => <line key={y} x1="6" y1={y} x2="58" y2={y} stroke="#92400e" strokeWidth="1.5" />)}
      <rect x="4" y="40" width="56" height="5" fill="#a16207" />
      <rect x="10" y="45" width="8" height="5" fill="#a16207" />
      <rect x="28" y="45" width="8" height="5" fill="#a16207" />
      <rect x="46" y="45" width="8" height="5" fill="#a16207" />
    </svg>
  ) : (
    <svg aria-hidden width="64" height="52" viewBox="0 0 64 52">
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(0 ${i * 22})`}>
          <rect x="10" y="6" width="44" height="18" rx="3" fill="#60a5fa" stroke="#1d4ed8" strokeWidth="2" />
          {[18, 26, 34, 42].map((x) => <line key={x} x1={x} y1="10" x2={x} y2="20" stroke="#1d4ed8" strokeWidth="2" />)}
          <rect x="26" y="8" width="12" height="3" rx="1.5" fill="#1d4ed8" />
        </g>
      ))}
    </svg>
  );
}

/** Bins or crates: two big picture buttons. */
export function StoragePicker({ value, onChange, name }: { value: Packed; onChange: (v: Packed) => void; name?: string }) {
  const option = (kind: Packed, title: string, text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === kind}
      aria-label={title}
      onClick={() => onChange(kind)}
      className={`flex min-h-[88px] cursor-pointer items-center gap-3 rounded-2xl p-3 text-left ring-2 transition ${value === kind ? 'bg-emerald-700 text-white ring-emerald-700 shadow-md' : 'bg-white text-slate-800 ring-slate-200 hover:ring-emerald-300'}`}
    >
      <span className="shrink-0 rounded-xl bg-white p-1"><StorageIcon kind={kind} /></span>
      <span>
        <span className="block text-base font-bold">{title}</span>
        <span className={`block text-xs ${value === kind ? 'text-emerald-100' : 'text-slate-600'}`}>{text}</span>
      </span>
    </button>
  );
  return (
    <fieldset data-field={name}>
      <legend className="text-sm font-semibold text-slate-800">What do you store apples in?</legend>
      <div role="radiogroup" aria-label="What do you store apples in?" className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {option('bins', 'Bins', 'Big wooden bins, stacked by forklift')}
        {option('crates', 'Crates', 'Plastic crates, about 20 kg each')}
      </div>
    </fieldset>
  );
}

/** Feet or metres. */
export function UnitSwitch({ value, onChange }: { value: SizeUnit; onChange: (u: SizeUnit) => void }) {
  return (
    <div role="radiogroup" aria-label="Measured in" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
      {(['ft', 'm'] as const).map((u) => (
        <button key={u} type="button" role="radio" aria-checked={value === u} onClick={() => onChange(u)} className={`min-h-[44px] cursor-pointer rounded-lg px-5 text-sm font-semibold transition ${value === u ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}>
          {u === 'ft' ? 'Feet' : 'Metres'}
        </button>
      ))}
    </div>
  );
}

/** A whole number with − and + buttons (and a box to type it). */
export function Counter({ label, value, onChange, min, max, issues = [], name, hint }: { label: string; value: string; onChange: (v: string) => void; min: number; max: number; issues?: Issue[]; name?: string; hint?: string }) {
  const id = useId();
  const n = Math.floor(Number(value)) || 0;
  const step = (d: number) => onChange(String(Math.min(max, Math.max(min, (Number.isFinite(n) ? n : min) + d))));
  const btn = 'grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-xl bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div data-field={name}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" className={btn} aria-label={`One less: ${label}`} disabled={n <= min} onClick={() => step(-1)}><Minus className="h-5 w-5" aria-hidden /></button>
        <input id={id} className={`${BIG.replace('block w-full', 'block w-20 shrink-0')} text-center font-bold`} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={issues.some((i) => i.level === 'error') || undefined} />
        <button type="button" className={btn} aria-label={`One more: ${label}`} disabled={n >= max} onClick={() => step(1)}><Plus className="h-5 w-5" aria-hidden /></button>
      </div>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
      <Problems issues={issues} />
    </div>
  );
}
