'use client';

/**
 * Soil and lab tests (supabase/migrations/20261128000000_soil_lab_tests.sql): a farmer books a test with a lab, the lab
 * comes to the field, takes the sample and uploads the report on KashRoot, and the farmer reads it and can ask an
 * expert about it. Labs and soil-testing professionals are a kind of business ("soil_lab") with their own admin.
 * Every call goes through a database function that checks who is asking; the emails the database queues are sent by
 * the server right after an action.
 */
import { sendQueuedEmails } from '@/lib/client/mailQueue';
import { dbMessage, supabase } from '@/lib/db/client';

export type LabStatus = 'requested' | 'accepted' | 'sample_collected' | 'report_ready' | 'declined' | 'cancelled';
export type SampleKind = 'soil' | 'water' | 'leaf' | 'fertiliser' | 'pesticide' | 'other';
export type Slot = 'any' | 'morning' | 'afternoon' | 'evening';

export const LAB_STATUS_LABEL: Record<LabStatus, string> = {
  requested: 'Waiting for the lab',
  accepted: 'Accepted: a visit is planned',
  sample_collected: 'Sample collected',
  report_ready: 'Report ready',
  declined: 'Declined by the lab',
  cancelled: 'Cancelled',
};
export const SAMPLE_KINDS: { value: SampleKind; label: string }[] = [
  { value: 'soil', label: 'Soil' },
  { value: 'water', label: 'Irrigation water' },
  { value: 'leaf', label: 'Leaf / plant tissue' },
  { value: 'fertiliser', label: 'Fertiliser' },
  { value: 'pesticide', label: 'Pesticide' },
  { value: 'other', label: 'Other' },
];
export const kindLabel = (k: string) => SAMPLE_KINDS.find((s) => s.value === k)?.label ?? k;
export const SLOTS: { value: Slot; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];
export const slotLabel = (s: string) => SLOTS.find((x) => x.value === s)?.label ?? s;
/** Names of the values a soil report usually has: only labels for blank rows, never numbers. */
export const USUAL_SOIL_VALUES = ['pH', 'Electrical conductivity (EC)', 'Organic carbon', 'Available nitrogen (N)', 'Available phosphorus (P)', 'Available potassium (K)', 'Sulphur (S)', 'Zinc (Zn)', 'Boron (B)'];

export interface LabTest {
  id: string;
  name: string;
  sample_kind: SampleKind;
  price: number;
  visit_fee: number;
  days: number;
  active?: boolean;
}
export interface LabListing {
  org_id: string;
  name: string;
  address: string;
  phone: string | null;
  districts: string[];
  home_visit: boolean;
  about: string | null;
  tests: LabTest[];
}
export interface MyBooking {
  id: string;
  code: string;
  test_name: string;
  sample_kind: SampleKind;
  price: number;
  visit_fee: number;
  status: LabStatus;
  district: string;
  crop: string | null;
  visit_address: string;
  preferred_date: string;
  preferred_slot: Slot;
  scheduled_for: string | null;
  lab_note: string | null;
  created_at: string;
  lab_name: string;
  lab_phone: string | null;
  lab_address: string | null;
  has_report: boolean;
  asked_expert: boolean;
}
export interface LabRequest {
  id: string;
  code: string;
  test_name: string;
  sample_kind: SampleKind;
  price: number;
  visit_fee: number;
  status: LabStatus;
  farmer_name: string;
  farmer_phone: string;
  district: string;
  crop: string | null;
  visit_address: string;
  visit_lat: number | null;
  visit_lng: number | null;
  preferred_date: string;
  preferred_slot: Slot;
  note: string | null;
  scheduled_for: string | null;
  lab_note: string | null;
  created_at: string;
  has_report: boolean;
}
export interface ResultRow {
  parameter: string;
  value: string;
  unit: string;
  rating: string;
}
export interface LabReport {
  booking_id: string;
  code: string;
  test_name: string;
  sample_kind: SampleKind;
  crop: string | null;
  district: string;
  lab_name: string;
  report_no: string | null;
  tested_on: string | null;
  results: ResultRow[];
  remarks: string | null;
  file_name: string | null;
  has_file: boolean;
  uploaded_at: string;
}
export interface LabProfile {
  org_id: string;
  districts: string[];
  address: string;
  phone: string | null;
  home_visit: boolean;
  about: string | null;
}

/** The database has not had the soil and lab update run yet. */
export class LabNotSetUp extends Error {
  constructor() {
    super('Soil and lab tests are not set up on this site yet: the KashRoot team must run supabase/RUN_THIS_ONCE.sql (step 52).');
  }
}
const missing = (e: { code?: string; message?: string }) => e.code === 'PGRST202' || e.code === '42883' || /Could not find the function|schema cache/i.test(e.message ?? '');

async function call<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (missing(error)) throw new LabNotSetUp();
    throw new Error(dbMessage(error, fallback));
  }
  return data as T;
}

// ── the farmer ──
export const labDirectory = (district: string | null) => call<LabListing[]>('kr_lab_directory', { p_district: district }, 'Could not load the labs. Try again.');
export const myLabBookings = () => call<MyBooking[]>('kr_lab_my_bookings', {}, 'Could not load your tests. Try again.');

export interface BookInput {
  testId: string;
  name: string;
  phone: string;
  district: string;
  crop: string;
  address: string;
  lat: number | null;
  lng: number | null;
  date: string;
  slot: Slot;
  note: string;
}
export async function bookLabTest(i: BookInput): Promise<string> {
  const id = await call<string>(
    'kr_lab_book',
    { p_test: i.testId, p_name: i.name, p_phone: i.phone, p_district: i.district, p_crop: i.crop || null, p_address: i.address, p_lat: i.lat, p_lng: i.lng, p_date: i.date, p_slot: i.slot, p_note: i.note || null },
    'Could not book the test. Try again.',
  );
  sendQueuedEmails();
  return id;
}
export async function cancelLabBooking(id: string): Promise<void> {
  await call<null>('kr_lab_cancel', { p_booking: id }, 'Could not cancel. Try again.');
  sendQueuedEmails();
}
export const labReport = (bookingId: string) => call<LabReport | null>('kr_lab_report', { p_booking: bookingId }, 'Could not load the report. Try again.');
export const labReportFile = (bookingId: string) => call<{ name: string; data: string } | null>('kr_lab_report_file', { p_booking: bookingId }, 'Could not load the lab’s file. Try again.');
export const askExpertAboutReport = (bookingId: string, question: string) => call<string>('kr_lab_ask_expert', { p_booking: bookingId, p_question: question }, 'Could not send your question. Try again.');

// ── the lab ──
export const labMine = (org: string) => call<{ profile: LabProfile | null; tests: LabTest[] }>('kr_lab_mine', { p_org: org }, 'Could not load your lab. Try again.');
export const labRequests = (org: string) => call<LabRequest[]>('kr_lab_org_bookings', { p_org: org }, 'Could not load the requests. Try again.');
export const saveLabProfile = (org: string, p: { districts: string[]; address: string; phone: string; homeVisit: boolean; about: string }) =>
  call<null>('kr_lab_save_profile', { p_org: org, p_districts: p.districts, p_address: p.address, p_phone: p.phone || null, p_home_visit: p.homeVisit, p_about: p.about || null }, 'Could not save the lab’s details.');
export const saveLabTest = (org: string, t: { id: string | null; name: string; sample: SampleKind; price: number; visitFee: number; days: number; active: boolean }) =>
  call<string>('kr_lab_save_test', { p_org: org, p_id: t.id, p_name: t.name, p_sample: t.sample, p_price: t.price, p_visit_fee: t.visitFee, p_days: t.days, p_active: t.active }, 'Could not save the test.');
export async function setLabStatus(booking: string, status: 'accepted' | 'sample_collected' | 'declined', when: string | null, note: string): Promise<void> {
  await call<null>('kr_lab_set_status', { p_booking: booking, p_status: status, p_when: when, p_note: note || null }, 'Could not update the request.');
  sendQueuedEmails();
}
export async function addLabReport(booking: string, r: { reportNo: string; testedOn: string; results: ResultRow[]; remarks: string; fileName: string; fileData: string | null }): Promise<void> {
  await call<null>(
    'kr_lab_add_report',
    { p_booking: booking, p_report_no: r.reportNo || null, p_tested_on: r.testedOn || null, p_results: cleanResults(r.results), p_remarks: r.remarks || null, p_file_name: r.fileData ? r.fileName : null, p_file_data: r.fileData },
    'Could not upload the report.',
  );
  sendQueuedEmails();
}

// ── helpers shared by the screens ──
/**
 * The values as the database keeps them: trimmed, and only the rows with a result. A row with a name and no result (the
 * names "Add the usual soil values" puts in, left unfilled) is left out; a result with no name is kept, so it is refused
 * and the lab is told to name it.
 */
export function cleanResults(rows: ResultRow[]): ResultRow[] {
  return rows
    .map((r) => ({ parameter: r.parameter.trim(), value: r.value.trim(), unit: r.unit.trim(), rating: r.rating.trim() }))
    .filter((r) => r.value !== '');
}

export const MAX_FILE_BYTES = 2_000_000;
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
/** Why a chosen file cannot be uploaded, in words; null when it can. */
export function fileProblem(file: { size: number; type: string }): string | null {
  if (!FILE_TYPES.includes(file.type)) return 'Choose a PDF or a photo (JPG, PNG or WebP).';
  if (file.size > MAX_FILE_BYTES) return 'The file is larger than 2 MB. Save the PDF smaller, or take the photo at a lower quality.';
  return null;
}
/**
 * The file a lab uploaded (a data: address) as a Blob, decoded here. fetch() of a data: address is blocked by the site's
 * Content-Security-Policy (connect-src), so it is never used for this.
 */
export function dataUrlToBlob(data: string): Blob {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(data);
  if (!m) throw new Error('The lab’s file could not be read.');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

/** The visit, in the farmer's words: "Tue 24 Nov, 10:00 am". */
export const visitText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
export const dayText = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** What the farmer pays the lab: the test and, when the lab comes to the field, the visit. */
export const totalFee = (price: number, visitFee: number) => Number(price) + Number(visitFee);

// ── oversight (Super Admin, and team members ticked for Businesses): no phone numbers, no addresses ──
export interface OversightBooking {
  code: string;
  lab: string;
  test_name: string;
  farmer: string;
  district: string;
  status: LabStatus;
  price: number;
  created_at: string;
  scheduled_for: string | null;
  has_report: boolean;
}
export const labOversight = () => call<{ labs: number; bookings: OversightBooking[] }>('kr_lab_oversight', {}, 'Could not load the lab tests. Try again.');
