import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ message: 'Email is required.' }, { status: 400 });
    }

    const emailOtp = crypto.randomInt(100000, 999999).toString();
    console.log(`[Email Gateway] Dispatching OTP to Resend for ${email}...`);

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const resend = new Resend(apiKey || 're_dummy');

    const { data, error } = await resend.emails.send({
      from: 'KashRoot <onboarding@resend.dev>',
      to: email,
      subject: 'Your Kashroot Verification Code',
      html: `<h2>Your Kashroot OTP is: <strong>${emailOtp}</strong></h2><p>Do not share this code with anyone.</p>`
    });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'OTP sent to email', emailOtp }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to send email OTP:', error);
    return NextResponse.json({ message: error.message || 'Failed to process request.' }, { status: 500 });
  }
}
