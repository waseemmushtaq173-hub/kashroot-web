'use client';

import { useState } from 'react';

import { formatNumber, parseLength, type LengthRules, type Millimetres } from '@/features/cad/types/units';
import { cx } from '@/features/cad/utils/cx';

interface Props {
  id: string;
  label: string;
  valueMm: Millimetres;
  onCommit: (mm: Millimetres) => void;
  rules?: LengthRules;
  hint?: string;
}

/**
 * A length field in millimetres. Accepts "12000", "12,000", "12 m" or
 * "250 cm"; the value is applied on Enter or when the field loses focus, and
 * only if it passes the checks. Escape puts the last good value back.
 */
export function LengthInput({ id, label, valueMm, onCommit, rules, hint }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? formatNumber(valueMm);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const commit = () => {
    if (draft === null) return;
    const result = parseLength(draft, rules);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setDraft(null);
    onCommit(result.mm);
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={shown}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setDraft(null);
              setError(null);
              e.currentTarget.blur();
            }
          }}
          className={cx(
            'block w-full rounded-md border bg-white py-1.5 pl-2.5 pr-10 font-mono text-sm tabular-nums text-ink focus:outline-none focus:ring-2',
            error ? 'border-red-500 focus:ring-red-200' : 'border-forest-line focus:border-forest focus:ring-forest/20',
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-ink-soft">mm</span>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
