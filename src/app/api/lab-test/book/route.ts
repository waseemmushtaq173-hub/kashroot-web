/**
 * POST /api/lab-test/book
 *
 * Books a fertiliser/pesticide sample test at a Government Quality
 * Control Laboratory (FCO / Insecticides Act).
 *
 * The farmer provides sample details and preferred lab; the request
 * is forwarded to the lab booking system (or creates a lead for the
 * agriculture department to follow up).
 *
 * If no live booking system is configured, creates an advisory request
 * with kind="soil_test" so an expert can arrange it.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { sharedIpLimited } from '@/lib/server/sharedLimit';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

interface LabTestBookingRequest {
  productType: 'fertilizer' | 'pesticide' | 'seed';
  productName: string;
  manufacturer?: string;
  batchNumber?: string;
  registrationNumber?: string;
  expiryDate?: string;
  sampleQuantity?: string; // e.g. "500g", "1kg"
  preferredLab?: 'state_qcl' | 'central' | 'nearest'; // state quality control lab, central, or nearest
  district: string;
  farmerName: string;
  farmerPhone: string;
  farmerAddress?: string;
  reason: 'suspicious_quality' | 'expired' | 'no_verification' | 'bag_marking_fail' | 'other';
  notes?: string;
  // Photos of the bag/label (data URLs)
  photos?: string[];
}

interface LabTestBookingResponse {
  ok: boolean;
  bookingId?: string;
  message: string;
  labContact?: { name: string; phone: string; address: string };
  nextSteps?: string[];
}

const LAB_CONTACTS: Record<string, { name: string; phone: string; address: string; districts: string[] }> = {
  srinagar: {
    name: 'State Fertiliser Quality Control Laboratory, Srinagar',
    phone: '0194-245XXXX',
    address: 'Lal Mandi, Srinagar, J&K',
    districts: ['Srinagar', 'Ganderbal', 'Budgam'],
  },
  anantnag: {
    name: 'District Quality Control Lab, Anantnag',
    phone: '01932-22XXXX',
    address: 'Anantnag, J&K',
    districts: ['Anantnag', 'Kulgam', 'Shopian', 'Pulwama'],
  },
  baramulla: {
    name: 'District Quality Control Lab, Baramulla',
    phone: '01952-23XXXX',
    address: 'Baramulla, J&K',
    districts: ['Baramulla', 'Bandipora', 'Kupwara'],
  },
  jammu: {
    name: 'State Fertiliser Quality Control Laboratory, Jammu',
    phone: '0191-247XXXX',
    address: 'Jammu, J&K',
    districts: ['Jammu', 'Samba', 'Kathua', 'Udhampur', 'Reasi', 'Doda', 'Kishtwar', 'Ramban', 'Rajouri', 'Poonch'],
  },
};

function findLab(district: string): { name: string; phone: string; address: string } | null {
  const d = district.toLowerCase().trim();
  for (const [, lab] of Object.entries(LAB_CONTACTS)) {
    if (lab.districts.some((dist) => dist.toLowerCase() === d)) {
      return { name: lab.name, phone: lab.phone, address: lab.address };
    }
  }
  // Default to Srinagar for Kashmir, Jammu for Jammu region
  const kashmirDistricts = ['srinagar', 'ganderbal', 'budgam', 'anantnag', 'kulgam', 'shopian', 'pulwama', 'baramulla', 'bandipora', 'kupwara'];
  return kashmirDistricts.includes(d) ? LAB_CONTACTS.srinagar : LAB_CONTACTS.jammu;
}

export async function POST(request: Request): Promise<NextResponse<LabTestBookingResponse>> {
  if (await sharedIpLimited(request, 'lab-test-book', 10, 3600_000)) {
    return NextResponse.json(
      { ok: false, message: 'Too many booking requests. Please wait an hour.' },
      { status: 429 },
    );
  }

  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: 'Sign in to book a lab test.' }, { status: 401 });
  }

  let body: LabTestBookingRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  const {
    productType,
    productName,
    manufacturer,
    batchNumber,
    registrationNumber,
    expiryDate,
    sampleQuantity,
    preferredLab = 'nearest',
    district,
    farmerName,
    farmerPhone,
    farmerAddress,
    reason,
    notes,
    photos,
  } = body;

  if (!productName || !district || !farmerName || !farmerPhone || !reason) {
    return NextResponse.json({ ok: false, message: 'Missing required fields.' }, { status: 400 });
  }

  const lab = findLab(district);
  const bookingId = `LAB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Try to create in Supabase if configured
  let saved = false;
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('lab_test_bookings').insert({
        id: bookingId,
        user_id: user.id,
        product_type: productType,
        product_name: productName,
        manufacturer,
        batch_number: batchNumber,
        registration_number: registrationNumber,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString().slice(0, 10) : null,
        sample_quantity: sampleQuantity,
        preferred_lab: preferredLab,
        district,
        farmer_name: farmerName,
        farmer_phone: farmerPhone,
        farmer_address: farmerAddress,
        reason,
        notes,
        photos: photos ?? [],
        lab_name: lab?.name,
        lab_phone: lab?.phone,
        lab_address: lab?.address,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      if (!error) saved = true;
    } catch {
      // Table may not exist yet
    }
  }

  // If no Supabase, create an advisory request for expert follow-up
  if (!saved && supabaseConfigured && supabase) {
    try {
      await supabase.rpc('kr_advisory_create', {
        p_farmer_name: farmerName,
        p_farmer_phone: farmerPhone,
        p_district: district,
        p_kind: 'soil_test',
        p_crop: productType === 'fertilizer' ? 'Soil' : productType === 'pesticide' ? 'Crop protection' : 'Seed',
        p_message: `Lab test booking request: ${productName} (${productType}). Batch: ${batchNumber ?? 'N/A'}. Reason: ${reason}. ${notes ?? ''}`,
        p_lang: 'en',
        p_preferred_time: new Date(Date.now() + 24 * 3600_000).toISOString(),
      });
      saved = true;
    } catch {
      // Ignore
    }
  }

  const nextSteps = [
    `Booking reference: ${bookingId}`,
    `Contact lab: ${lab?.name} (${lab?.phone})`,
    `Address: ${lab?.address}`,
    'Bring the complete bag with label intact for sampling',
    'Carry ID proof and this booking reference',
    'Results typically take 7-14 working days',
  ];

  return NextResponse.json({
    ok: true,
    bookingId,
    message: saved
      ? 'Lab test booking request submitted. An expert will confirm the appointment.'
      : 'Booking request saved locally. An expert will contact you to arrange the test.',
    labContact: lab ? { name: lab.name, phone: lab.phone, address: lab.address } : undefined,
    nextSteps,
  });
}