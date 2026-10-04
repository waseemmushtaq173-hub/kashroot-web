import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  // In a real app, parse the session/JWT.
  // For demo, we assume user_id is passed in headers or query.
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'mock-user-id';

  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
    return NextResponse.json(notifications);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
