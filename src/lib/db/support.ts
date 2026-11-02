'use client';

/**
 * Admin → Help desk: every help request (20261105000000_support_desk.sql;
 * admins read all through RLS), KashRoot's replies (kr_support_reply), the
 * status (kr_support_set_status) and internal notes the customer never sees
 * (kr_support_note, 20261109000000_support_tracking.sql).
 */
import { sendQueuedEmails } from '@/lib/client/mailQueue';
import { dbMessage, isSetupMissing, SETUP_NEEDED, supabase } from '@/lib/db/client';
import type { SupportTopic } from '@/lib/helpTopics';

export interface DeskMessage {
  author: 'customer' | 'kashroot' | 'internal';
  author_name: string | null;
  body: string;
  created_at: string;
}
/** Received → Being looked at → Answered → Resolved. */
export type SupportStatus = 'open' | 'in_progress' | 'answered' | 'closed';

export interface DeskRequest {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  topic: SupportTopic;
  portal: string | null;
  lang: string;
  message: string;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  signedIn: boolean;
  messages: DeskMessage[];
}

/** Requests, waiting ones first (newest first within each). */
export async function deskRequests(show: 'waiting' | 'all'): Promise<DeskRequest[]> {
  let q = supabase
    .from('support_requests')
    .select('id, code, name, phone, email, topic, portal, lang, message, status, created_at, updated_at, user_id, support_messages(author, author_name, body, created_at)')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (show === 'waiting') q = q.in('status', ['open', 'in_progress']);
  const { data, error } = await q;
  if (error && isSetupMissing(error)) throw new Error(SETUP_NEEDED);
  if (error) throw new Error(dbMessage(error, 'Could not load the help requests.'));
  return (data ?? []).map(({ user_id, support_messages, ...r }) => ({
    ...(r as Omit<DeskRequest, 'signedIn' | 'messages'>),
    signedIn: Boolean(user_id),
    messages: ((support_messages ?? []) as DeskMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

/** Reply (and close, or leave it answered). An empty reply with `close` just closes it. */
export async function replyToRequest(id: string, body: string, close: boolean): Promise<void> {
  const { error } = await supabase.rpc('kr_support_reply', { p_id: id, p_body: body, p_close: close });
  if (error) throw new Error(dbMessage(error, 'Could not send the reply.'));
  // The reply queued an email to the customer (when they gave one): send it now.
  if (body.trim()) sendQueuedEmails();
}

/** Set the status (Received, Being looked at, Answered, Resolved). Resolved emails the person, when they gave an email. */
export async function setRequestStatus(id: string, status: SupportStatus): Promise<void> {
  const { error } = await supabase.rpc('kr_support_set_status', { p_id: id, p_status: status });
  if (error && isSetupMissing(error)) throw new Error(SETUP_NEEDED);
  if (error) throw new Error(dbMessage(error, 'Could not change the status.'));
  if (status === 'closed') sendQueuedEmails();
}

/** A note for KashRoot staff only: never shown to the customer, never emailed. */
export async function addInternalNote(id: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('kr_support_note', { p_id: id, p_body: body });
  if (error && isSetupMissing(error)) throw new Error(SETUP_NEEDED);
  if (error) throw new Error(dbMessage(error, 'Could not save the note.'));
}
