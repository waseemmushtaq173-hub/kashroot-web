import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, fullName, phone, role } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        password, // In a real app, hash this!
        fullName,
        phone,
        role: role || 'FARMER',
      },
    });

    return NextResponse.json({ message: 'Registration successful', user }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'User already exists with this email address.' }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || 'Database connection failed' },
      { status: 500 }
    );
  }
}
