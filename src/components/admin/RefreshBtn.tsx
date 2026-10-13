'use client';

/**
 * The Refresh button of the Admin panels: spins while it reloads, then says
 * "Updated 14:32" so the admin can see it worked even when nothing changed.
 */
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Btn, PORTAL_THEMES, type PortalTheme } from '@/components/portal/kit';

const time = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export function RefreshBtn({
  onRefresh,
  theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert,
  variant = 'soft',
}: {
  onRefresh: () => Promise<unknown>;
  theme?: PortalTheme;
  variant?: 'soft' | 'ghost';
}) {
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      await onRefresh();
      const now = time(new Date());
      setAt(now);
      toast.success(`Updated at ${now}`, { duration: 2000 });
    } catch {
      toast.error('Could not refresh. Check the internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      {at && !busy && <span className="text-xs text-slate-500" aria-live="polite">Updated {at}</span>}
      <Btn theme={theme} size="sm" variant={variant} disabled={busy} aria-busy={busy} onClick={() => void run()}>
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden />
        {busy ? 'Refreshing…' : 'Refresh'}
      </Btn>
    </span>
  );
}
