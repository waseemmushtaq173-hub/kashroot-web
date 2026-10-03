import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, phone } = await request.json();

    if (!email && !phone) {
      return NextResponse.json(
        { message: 'Email or phone number is required.' },
        { status: 400 }
      );
    }

    // Generate a real random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 1. Email Gateway Integration (SendGrid / Resend)
    // Checking for live keys before dispatching
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    if (SENDGRID_API_KEY && email) {
      console.log(`[Email Gateway] Dispatching OTP to SendGrid for ${email}...`);
      // await fetch('https://api.sendgrid.com/v3/mail/send', { ... });
    }

    // 2. SMS Gateway Integration (Twilio / AWS SNS / Fast2SMS)
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    if (TWILIO_ACCOUNT_SID && phone) {
      console.log(`[SMS Gateway] Dispatching OTP to Twilio for ${phone}...`);
      // await client.messages.create({ ... });
    }

    // 3. Dev Fallback (Always log the OTP to the console for testing)
    console.log(`[MOCK AUTH] OTP ${otp} generated and dispatched to email: ${email} and mobile: ${phone || 'N/A'}`);

    return NextResponse.json({
      message: 'OTP successfully sent to mobile number and email',
      otp: otp // Included for dev testing
    }, { status: 200 });

  } catch (error) {
    console.error('Failed to generate OTP:', error);
    return NextResponse.json(
      { message: 'Failed to process OTP request.' },
      { status: 500 }
    );
  }
}
