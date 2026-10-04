import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(request: Request, context: any) {
  const params = await context.params;
  const id = params.id;

  try {
    const notification = await prisma.notification.update({
      where: { id },
      data: { status: 'READ' }
    });
    return NextResponse.json(notification);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
