import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ message: 'Email is required.' }, { status: 400 });
    }

    const emailOtp = crypto.randomInt(100000, 999999).toString();
    console.log(`[Email Gateway] Dispatching OTP to Nodemailer for ${email}...`);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Kashroot Security" <${process.env.GMAIL_USER}>`,
      to: email, // The user's requested email address
      subject: 'Your Kashroot Verification Code',
      html: `<h2>Your Kashroot OTP is: <strong>${emailOtp}</strong></h2><p>Do not share this code with anyone.</p>`
    });

    return NextResponse.json({ message: 'OTP sent to email', emailOtp }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to send email OTP:', error);
    return NextResponse.json({ message: error.message || 'Failed to process request.' }, { status: 500 });
  }
}
