'use client';

/**
 * Admin → Setup check: which database setup files have been run in Supabase
 * (kr_setup_status, 20261031000000_setup_check.sql). The same rows end
 * supabase/RUN_THIS_ONCE.sql in the SQL Editor.
 */
import { dbMessage, isSetupMissing, supabase } from '@/lib/db/client';

export interface SetupStep {
  step: number;
  /** The part of KashRoot it serves ("Cold store: owner wizard"). */
  part: string;
  file: string;
  done: boolean;
}

/** The steps, or 'not-installed' when the setup check itself has not been run yet. */
export async function setupStatus(): Promise<SetupStep[] | 'not-installed'> {
  const { data, error } = await supabase.rpc('kr_setup_status');
  if (error && isSetupMissing(error)) return 'not-installed';
  if (error) throw new Error(dbMessage(error, 'Could not check the database setup.'));
  return ((data ?? []) as { step: number; part: string; file: string; done: string }[]).map((r) => ({ step: r.step, part: r.part, file: r.file, done: r.done === 'yes' }));
}
