import { NextResponse } from 'next/server';

// In a fully integrated environment, this would be:
// import { prisma } from '@/lib/prisma';
// but since this repo currently lacks Prisma, we use a strict in-memory DB table.
// NO RANDOMIZATION allowed.

const FERTILIZER_BATCH_DB = [
  {
    batchCode: 'GR053118',
    manufacturer: 'Bayer',
    npk: 'Imidacloprid 17.8% SL',
    mfgDate: '2023-10-12',
    expiry: '2025-10-12',
    complianceStatus: 'APPROVED'
  },
  {
    batchCode: 'IFN123456',
    manufacturer: 'IFFCO',
    npk: '46:0:0',
    mfgDate: '2023-05-15',
    expiry: '2025-05-15',
    complianceStatus: 'APPROVED'
  },
  {
    batchCode: 'SYN1234567',
    manufacturer: 'Syngenta',
    npk: 'Azoxystrobin 23% SC',
    mfgDate: '2024-01-20',
    expiry: '2026-01-20',
    complianceStatus: 'APPROVED'
  }
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { batchCode } = body;

    if (!batchCode) {
      return NextResponse.json({ message: 'Batch code is required' }, { status: 400 });
    }

    // Strict DB lookup equivalent to: prisma.fertilizerBatch.findUnique({ where: { batchCode } })
    const batch = FERTILIZER_BATCH_DB.find((b) => b.batchCode === batchCode.trim().toUpperCase());

    if (!batch) {
      return NextResponse.json(
        { message: 'INVALID BATCH - POTENTIAL COUNTERFEIT' },
        { status: 404 }
      );
    }

    // Precise, authentic manufacturing data
    return NextResponse.json({
      isAuthentic: true,
      data: {
        manufacturer: batch.manufacturer,
        npkRatio: batch.npk,
        productionDate: batch.mfgDate,
        expiryDate: batch.expiry,
        complianceStatus: batch.complianceStatus
      }
    });

  } catch (error) {
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
