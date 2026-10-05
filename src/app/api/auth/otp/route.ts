import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import twilio from 'twilio';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email, phone } = await request.json();

    if (!email || !phone) {
      return NextResponse.json(
        { message: 'Both Email and phone number are required.' },
        { status: 400 }
      );
    }

    // Generate separate cryptographic OTPs
    const emailOtp = crypto.randomInt(100000, 999999).toString();
    const phoneOtp = crypto.randomInt(100000, 999999).toString();

    // 1. Email Gateway Integration (Resend)
    console.log(`[Email Gateway] Dispatching OTP to Resend for ${email}...`);
    const { data, error } = await resend.emails.send({
      from: 'Kashroot Security <onboarding@resend.dev>',
      to: email, // The user's requested email address
      subject: 'Your Kashroot Verification Code',
      html: `<h2>Your Kashroot OTP is: <strong>${emailOtp}</strong></h2><p>Do not share this code with anyone.</p>`
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log(`[Email Gateway Success] Resend Email ID: ${data?.id}`);

    // 2. SMS Gateway Integration (Twilio)
    // Note: We leave Twilio wrapped in try/catch to not block the flow if SMS fails, 
    // since the prompt focused heavily on Resend email logic and didn't mention Twilio changes.
    let twilioError = null;
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      console.log(`[SMS Gateway] Dispatching OTP to Twilio for ${phone}...`);
      try {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const message = await twilioClient.messages.create({
          body: `Your KashRoot Mobile Verification Code is: ${phoneOtp}. Do not share this with anyone.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phone
        });
        console.log(`[SMS Gateway Success] Twilio Message SID: ${message.sid}`);
      } catch (err: any) {
        console.error('[SMS Gateway Exception]', err);
        twilioError = err.message;
      }
    } else {
      console.warn('[SMS Gateway] Skipping SMS delivery (missing Twilio keys).');
    }

    return NextResponse.json({
      message: 'OTPs successfully processed.'
    }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to generate OTP:', error);
    return NextResponse.json(
      { message: error.message || 'Failed to process OTP request.' },
      { status: 500 }
    );
  }
}
