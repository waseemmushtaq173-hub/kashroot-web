import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import twilio from 'twilio';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

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
    const errors: string[] = [];

    // 1. Email Gateway Integration (Resend)
    if (resend && email) {
      console.log(`[Email Gateway] Dispatching OTP to Resend for ${email}...`);
      try {
        const { error } = await resend.emails.send({
          from: 'KashRoot Auth <auth@kashroot.com>', // MUST be verified domain on Resend
          to: email,
          subject: 'KashRoot Verification Code',
          html: `<div style="font-family: sans-serif; text-align: center; padding: 20px;">
                  <h2>Welcome to KashRoot</h2>
                  <p>Your verification code is:</p>
                  <h1 style="font-size: 32px; letter-spacing: 4px; color: #000;">${otp}</h1>
                  <p>This code expires in 10 minutes. Do not share it with anyone.</p>
                 </div>`
        });
        if (error) {
          console.error('[Email Gateway Error]', error);
          errors.push(`Email Error: ${error.message}`);
        }
      } catch (err: any) {
        console.error('[Email Gateway Exception]', err);
        errors.push(`Email Exception: ${err.message}`);
      }
    }

    // 2. SMS Gateway Integration (Twilio)
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER && phone) {
      console.log(`[SMS Gateway] Dispatching OTP to Twilio for ${phone}...`);
      try {
        await twilioClient.messages.create({
          body: `Your KashRoot Verification Code is: ${otp}. Do not share this with anyone.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phone
        });
      } catch (err: any) {
        console.error('[SMS Gateway Exception]', err);
        errors.push(`SMS Exception: ${err.message}`);
      }
    }

    // 3. Dev Fallback (Always log the OTP to the console for testing)
    console.log(`[MOCK AUTH] OTP ${otp} generated and dispatched to email: ${email} and mobile: ${phone || 'N/A'}`);

    if (errors.length > 0) {
      // If either API fails to deliver, catch the error and surface it to the UI
      return NextResponse.json(
        { message: 'Failed to deliver OTP: ' + errors.join(', ') },
        { status: 502 } // Bad Gateway
      );
    }

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

