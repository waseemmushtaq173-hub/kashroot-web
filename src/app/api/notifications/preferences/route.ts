import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (ipLimited(request, 'notifications-preferences', 30)) return tooMany();
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'mock-user-id';

  try {
    let prefs = await (prisma as any).notification_preferences.findFirst({
      where: { user_id: userId }
    });
    return NextResponse.json(prefs || {});
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (ipLimited(request, 'notifications-preferences', 30)) return tooMany();
  try {
    const body = await request.json();
    // Return mock since schema does not match this implementation
    return NextResponse.json(body);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
