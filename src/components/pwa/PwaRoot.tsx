'use client';

/**
 * Online-first root for KashRoot.
 * - On mount, clears legacy offline-queue storage keys and unregisters any
 *   stale service workers (src/lib/onlineFirstClient.ts), so the old
 *   offline/saved-copy workflow can never come back.
 * - Runs the real connectivity checks (src/lib/connectivity.ts): a live
 *   /api/health probe against Supabase, not just navigator.onLine. Kept as
 *   infrastructure for feature flows — nothing here renders a banner.
 * - Sends kept actions (advisory questions, mandi rates, listing drafts)
 *   silently in the background while that account is signed in. Each sent
 *   item announces itself (outboxSend), so no "Back online. Sending N
 *   items…" banner is needed.
 * - There is NO offline mode, NO global offline banner, NO saved-copy
 *   notice: when a specific request fails, the page that made it shows a
 *   specific, honest error (classifyFetchError, dbMessage).
 */

import { useEffect, useRef, useState } from 'react';

import { supabase, supabaseConfigured } from '@/lib/supabase';
import { startOnlineFirstChecks, useOnlineFirst } from '@/lib/connectivity';
import { clearLegacyOfflineStorage } from '@/lib/onlineFirstClient';

import { currentUserId, flushOutbox } from './outboxSend';

export function PwaRoot() {
  const connectivity = useOnlineFirst();
  const [userId, setUserId] = useState<string | null>(null);
  const wasOnline = useRef(false);
  const flushedFor = useRef<string | null>(null);

  // One-time mount: stale offline-queue keys and legacy service workers go.
  useEffect(() => {
    clearLegacyOfflineStorage();
  }, []);

  // Connectivity checks (real health checks, not just navigator.onLine).
  useEffect(() => {
    const stop = startOnlineFirstChecks();
    return () => stop();
  }, []);

  // The account signed in on this phone (drives the silent background flush).
  useEffect(() => {
    if (!supabaseConfigured) return;
    let live = true;
    const read = () => void currentUserId().then((id) => live && setUserId(id));
    read();
    const { data } = supabase.auth.onAuthStateChange(() => read());
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);

  // Silent background flush: once when the account is known and online,
  // again whenever the connection returns. No toast — items announce
  // themselves as they are sent (outboxSend.ts).
  useEffect(() => {
    if (!userId || !connectivity.online) return;
    const first = flushedFor.current !== userId;
    const cameBack = !wasOnline.current;
    wasOnline.current = true;
    if (first || cameBack) {
      flushedFor.current = userId;
      void flushOutbox(userId).catch(() => 0);
    }
  }, [userId, connectivity.online]);

  return null;
}
