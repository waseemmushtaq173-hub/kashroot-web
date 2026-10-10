'use client';

/**
 * Advisory: farmers' questions, soil-test bookings and video-call requests,
 * and the replies on each (supabase/migrations: advisory_requests,
 * advisory_messages). Farmers see their own; approved experts see all.
 */
import { dbMessage, supabase } from '@/lib/db/client';

export type RequestKind = 'question' | 'soil_test' | 'video_call';
export type RequestStatus = 'open' | 'accepted' | 'answered' | 'closed';

export interface AdvisoryRequest {
  id: string;
  farmer_id: string;
  farmer_name: string;
  farmer_phone: string | null;
  district: string | null;
  kind: RequestKind;
  crop: string | null;
  message: string;
  photo: string | null;
  preferred_time: string | null;
  lang: 'en' | 'hi' | 'ur' | 'ks';
  status: RequestStatus;
  expert_id: string | null;
  expert_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvisoryMessage {
  id: number;
  request_id: string;
  sender_id: string | null;
  sender_role: 'farmer' | 'expert' | 'ai';
  sender_name: string | null;
  body: string;
  created_at: string;
}

export const KIND_LABEL: Record<RequestKind, string> = { question: 'Question', soil_test: 'Soil test', video_call: 'Video call' };
export const STATUS_LABEL: Record<RequestStatus, string> = { open: 'Waiting for an expert', accepted: 'Expert accepted', answered: 'Expert replied', closed: 'Closed' };

const COLUMNS = 'id, farmer_id, farmer_name, farmer_phone, district, kind, crop, message, photo, preferred_time, lang, status, expert_id, expert_name, created_at, updated_at';

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

export async function listRequests(opts: { mine?: string; status?: RequestStatus[]; kind?: RequestKind } = {}): Promise<AdvisoryRequest[]> {
  let q = supabase.from('advisory_requests').select(COLUMNS).order('updated_at', { ascending: false }).limit(100);
  if (opts.mine) q = q.eq('farmer_id', opts.mine);
  if (opts.status) q = q.in('status', opts.status);
  if (opts.kind) q = q.eq('kind', opts.kind);
  const { data, error } = await q;
  if (error) fail(error, 'Could not load requests.');
  return (data ?? []) as AdvisoryRequest[];
}

export async function getRequest(id: string): Promise<AdvisoryRequest | null> {
  const { data, error } = await supabase.from('advisory_requests').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load this request.');
  return data as AdvisoryRequest | null;
}

export async function createRequest(input: {
  farmer_name: string;
  farmer_phone?: string;
  district?: string;
  kind: RequestKind;
  crop?: string;
  message: string;
  photo?: string | null;
  preferred_time?: string;
  lang: AdvisoryRequest['lang'];
}): Promise<AdvisoryRequest> {
  const { data, error } = await supabase
    .from('advisory_requests')
    .insert({
      farmer_name: input.farmer_name.slice(0, 80),
      farmer_phone: input.farmer_phone?.slice(0, 20) || null,
      district: input.district?.slice(0, 80) || null,
      kind: input.kind,
      crop: input.crop?.slice(0, 60) || null,
      message: input.message.slice(0, 2000),
      photo: input.photo ?? null,
      preferred_time: input.preferred_time?.slice(0, 80) || null,
      lang: input.lang,
    })
    .select(COLUMNS)
    .single();
  if (error) fail(error, 'Could not send your request.');
  return data as AdvisoryRequest;
}

export async function listMessages(requestId: string): Promise<AdvisoryMessage[]> {
  const { data, error } = await supabase.from('advisory_messages').select('*').eq('request_id', requestId).order('id');
  if (error) fail(error, 'Could not load the replies.');
  return (data ?? []) as AdvisoryMessage[];
}

export async function sendMessage(requestId: string, role: AdvisoryMessage['sender_role'], name: string, body: string): Promise<void> {
  const { error } = await supabase.from('advisory_messages').insert({ request_id: requestId, sender_role: role, sender_name: name.slice(0, 80), body: body.slice(0, 4000) });
  if (error) fail(error, 'Could not send your message.');
}

export async function setRequest(requestId: string, action: 'accept' | 'close' | 'reopen', expertName?: string): Promise<void> {
  const { error } = await supabase.rpc('kr_advisory_set', { p_request: requestId, p_action: action, p_name: expertName ?? null });
  if (error) fail(error, 'Could not update the request.');
}

/** Experts and dealers apply; an admin approves (Admin portal → Approvals). */
export async function requestStaffRole(role: 'EXPERT' | 'DEALER', input: { name: string; phone: string; email: string; details: string }): Promise<void> {
  const { error } = await supabase.rpc('kr_request_role', { p_role: role, p_name: input.name, p_phone: input.phone, p_email: input.email, p_details: input.details });
  if (error) fail(error, 'Could not send your application.');
}

export async function myRoleRequest(role: 'EXPERT' | 'DEALER', userId: string): Promise<{ status: string } | null> {
  const { data } = await supabase.from('role_requests').select('status').eq('role', role).eq('user_id', userId).maybeSingle();
  return (data as { status: string } | null) ?? null;
}
