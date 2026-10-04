import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import twilio from 'twilio';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { email, phone } = await request.json();

    if (!email || !phone) {
      return NextResponse.json(
        { message: 'Both Email and phone number are required.' },
        { status: 400 }
      );
    }

    // 1. Enforce strict presence of live API keys
    const missingKeys = !process.env.RESEND_API_KEY || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER;
    
    if (missingKeys) {
      console.error('[Gateway Error] Live API keys missing from environment');
      return NextResponse.json(
        { message: 'Live API keys missing from environment' },
        { status: 500 }
      );
    }

    // 2. Generate separate cryptographic OTPs
    const emailOtp = crypto.randomInt(100000, 999999).toString();
    const phoneOtp = crypto.randomInt(100000, 999999).toString();

    const errors: string[] = [];
    const resend = new Resend(process.env.RESEND_API_KEY);
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // 3. Email Gateway Integration (Resend)
    console.log(`[Email Gateway] Dispatching OTP to Resend for ${email}...`);
    try {
      const { data, error } = await resend.emails.send({
        from: 'KashRoot Auth <auth@kashroot.com>', // MUST be verified domain on Resend
        to: email,
        subject: 'KashRoot Verification Code',
        html: `<div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h2>Welcome to KashRoot</h2>
                <p>Your Email verification code is:</p>
                <h1 style="font-size: 32px; letter-spacing: 4px; color: #000;">${emailOtp}</h1>
                <p>This code expires in 10 minutes. Do not share it with anyone.</p>
                </div>`
      });
      if (error) {
        console.error('[Email Gateway Error]', error);
        errors.push(`Email Error: ${error.message}`);
      } else {
        console.log(`[Email Gateway Success] Resend Email ID: ${data?.id}`);
      }
    } catch (err: any) {
      console.error('[Email Gateway Exception]', err);
      errors.push(`Email Exception: ${err.message}`);
    }

    // 4. SMS Gateway Integration (Twilio)
    console.log(`[SMS Gateway] Dispatching OTP to Twilio for ${phone}...`);
    try {
      const message = await twilioClient.messages.create({
        body: `Your KashRoot Mobile Verification Code is: ${phoneOtp}. Do not share this with anyone.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      });
      console.log(`[SMS Gateway Success] Twilio Message SID: ${message.sid}`);
    } catch (err: any) {
      console.error('[SMS Gateway Exception]', err);
      errors.push(`SMS Exception: ${err.message}`);
    }

    // 5. Enforce failure if gateway dispatch failed
    if (errors.length > 0) {
      return NextResponse.json(
        { message: 'Failed to deliver OTP: ' + errors.join(', ') },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: 'OTPs successfully sent to mobile number and email'
      // Note: We no longer return the plain OTPs to the client.
    }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to generate OTP:', error);
    return NextResponse.json(
      { message: error.message || 'Failed to process OTP request.' },
      { status: 500 }
    );
  }
}
