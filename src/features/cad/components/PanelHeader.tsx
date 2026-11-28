'use client';

import { X } from 'lucide-react';

export function PanelHeader({ title, onClose, closeLabel }: { title: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-forest-line px-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{title}</h2>
      <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="rounded p-1 text-ink-soft hover:bg-forest-soft hover:text-ink">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
