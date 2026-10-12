import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: any) {
  if (ipLimited(request, 'notifications-id-read', 60)) return tooMany();
  const params = await context.params;
  const id = params.id;

  try {
    const notification = await (prisma as any).notification_queue.update({
      where: { id },
      data: { status: 'READ' }
    });
    return NextResponse.json(notification);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
