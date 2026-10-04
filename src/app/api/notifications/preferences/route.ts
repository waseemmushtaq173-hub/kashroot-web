import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'mock-user-id';

  try {
    let prefs = await prisma.notificationPreference.findUnique({
      where: { user_id: userId }
    });
    return NextResponse.json(prefs || {});
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const userId = body.userId || 'mock-user-id';

    const prefs = await prisma.notificationPreference.upsert({
      where: { user_id: userId },
      update: {
        sms_enabled: body.sms_enabled,
        email_enabled: body.email_enabled,
        order_notifications: body.order_notifications,
        security_notifications: body.security_notifications,
        marketing_notifications: body.marketing_notifications,
      },
      create: {
        user_id: userId,
        sms_enabled: body.sms_enabled ?? true,
        email_enabled: body.email_enabled ?? true,
        order_notifications: body.order_notifications ?? true,
        security_notifications: body.security_notifications ?? true,
        marketing_notifications: body.marketing_notifications ?? false,
      }
    });
    return NextResponse.json(prefs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
