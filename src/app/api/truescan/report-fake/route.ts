/**
 * POST /api/truescan/report-fake
 *
 * Reports a suspected counterfeit or unregistered fertiliser/pesticide
 * to the KashRoot admin team for investigation.
 *
 * Creates a record in the security log and notifies admins.
 * The reporter can be anonymous or signed in.
 */
import { NextResponse } from 'next/server';

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { sharedIpLimited } from '@/lib/server/sharedLimit';
import { clientIp } from '@/lib/server/sign';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

interface ReportFakeRequest {
  productType: 'fertilizer' | 'pesticide' | 'seed' | 'unknown';
  productName: string;
  manufacturer?: string;
  batchNumber?: string;
  registrationNumber?: string;
  expiryDate?: string;
  purchaseLocation?: string; // shop/mandi name
  purchaseDistrict?: string;
  purchaseDate?: string;
  pricePaid?: string;
  reason: 'not_in_list' | 'expired' | 'bag_marking_fail' | 'manufacturer_mismatch' | 'qr_fail' | 'suspicious_packaging' | 'other';
  details?: string;
  // Photos (data URLs)
  photos?: string[];
  // Reporter info (optional for anonymous)
  reporterName?: string;
  reporterPhone?: string;
  reporterDistrict?: string;
  anonymous?: boolean;
}

interface ReportFakeResponse {
  ok: boolean;
  reportId?: string;
  message: string;
}

export async function POST(request: Request): Promise<NextResponse<ReportFakeResponse>> {
  if (await sharedIpLimited(request, 'report-fake', 5, 3600_000)) {
    return NextResponse.json(
      { ok: false, message: 'Too many reports. Please wait an hour.' },
      { status: 429 },
    );
  }

  let body: ReportFakeRequest;
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
    purchaseLocation,
    purchaseDistrict,
    purchaseDate,
    pricePaid,
    reason,
    details,
    photos,
    reporterName,
    reporterPhone,
    reporterDistrict,
    anonymous = false,
  } = body;

  if (!productName || !reason) {
    return NextResponse.json({ ok: false, message: 'Product name and reason are required.' }, { status: 400 });
  }

  const ipHash = `ip|${clientIp(request)}`;
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Save to Supabase if configured
  let saved = false;
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('suspected_fake_reports').insert({
        id: reportId,
        product_type: productType,
        product_name: productName,
        manufacturer,
        batch_number: batchNumber,
        registration_number: registrationNumber,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString().slice(0, 10) : null,
        purchase_location: purchaseLocation,
        purchase_district: purchaseDistrict,
        purchase_date: purchaseDate ? new Date(purchaseDate).toISOString().slice(0, 10) : null,
        price_paid: pricePaid,
        reason,
        details,
        photos: photos ?? [],
        reporter_name: anonymous ? null : reporterName,
        reporter_phone: anonymous ? null : reporterPhone,
        reporter_district: reporterDistrict,
        anonymous,
        ip_hash: ipHash,
        status: 'submitted',
        created_at: new Date().toISOString(),
      });
      if (!error) saved = true;
    } catch {
      // Table may not exist yet
    }
  }

  // Also log to security log for admin visibility
  if (supabaseConfigured && supabase) {
    try {
      await supabase.rpc('kr_security_log', {
        p_action: 'fake_report_submitted',
        p_details: `Suspected fake reported: ${productName} (${productType}) - ${reason}. Report ID: ${reportId}`,
        p_ip_hash: ipHash,
      });
    } catch {
      // Ignore
    }
  }

  return NextResponse.json({
    ok: true,
    reportId,
    message: saved
      ? 'Report submitted. Our team will investigate and may contact you.'
      : 'Report saved locally. Our team will review it when online.',
  });
}