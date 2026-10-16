'use client';

/**
 * The Kashmiri letters and vowel marks most phone keyboards lack — one tap
 * each, typed where the cursor is in the field next to it.
 */
import type { RefObject } from 'react';

const LETTERS = ['ٲ', 'ٳ', 'ۄ', 'ۆ', 'ێ', 'ؠ', 'ۍ', 'ے'];
/** [mark, name] — shown on a dotted circle so the mark is visible on its own. */
const MARKS: [string, string][] = [
  ['\u064E', 'zabar'],
  ['\u0650', 'zer'],
  ['\u064F', 'pesh'],
  ['\u0655', 'hamza below'],
  ['\u0654', 'hamza above'],
  ['\u065A', 'small v above'],
  ['\u065B', 'inverted small v above'],
  ['\u0657', 'inverted pesh'],
  ['\u065F', 'wavy hamza below'],
  ['\u0653', 'madd'],
];

export function KashmiriKeys({
  target,
  value,
  onChange,
  className = '',
}: {
  target: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const type = (ch: string) => {
    const el = target.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + ch + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + ch.length, start + ch.length);
    });
  };
  const key = 'grid h-9 min-w-9 cursor-pointer place-items-center rounded-lg bg-white px-1.5 text-lg text-slate-900 ring-1 ring-slate-900/10 transition hover:bg-amber-50 hover:ring-amber-300';
  return (
    <div role="group" aria-label="Kashmiri letters and vowel marks" dir="rtl" lang="ks" className={`flex flex-wrap gap-1 ${className}`}>
      {LETTERS.map((ch) => (
        // Keeps the cursor in the field while tapping.
        <button key={ch} type="button" className={key} onMouseDown={(e) => e.preventDefault()} onClick={() => type(ch)} aria-label={`Type ${ch}`}>
          {ch}
        </button>
      ))}
      {MARKS.map(([mark, name]) => (
        <button key={name} type="button" className={key} title={name} onMouseDown={(e) => e.preventDefault()} onClick={() => type(mark)} aria-label={`Vowel mark ${name}`}>
          {`\u25CC${mark}`}
        </button>
      ))}
    </div>
  );
}
