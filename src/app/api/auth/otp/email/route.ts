import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { email, otp: clientOtp } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const otp = clientOtp || crypto.randomInt(100000, 999999).toString();
    console.log(`[Email Gateway] Dispatching OTP to Nodemailer for ${email}...`);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `'Kashroot Security' <${process.env.GMAIL_USER}>`,
      to: email, 
      subject: 'Your Kashroot Verification Code',
      html: `<h2>Your Kashroot OTP is: <strong>${otp}</strong></h2><p>Do not share this code with anyone.</p>`
    });

    return NextResponse.json({ message: 'OTP sent to email', emailOtp: otp }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to send email OTP:', error);
    return NextResponse.json({ message: error.message || 'Failed to process request.' }, { status: 500 });
  }
}
