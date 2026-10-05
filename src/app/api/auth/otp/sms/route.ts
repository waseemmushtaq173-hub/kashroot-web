import { NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json({ message: 'Phone is required.' }, { status: 400 });
    }

    const phoneOtp = crypto.randomInt(100000, 999999).toString();
    const cleanPhone = phone.replace('+91', '').trim();

    if (process.env.USE_REAL_SMS !== 'true') {
      console.log('\n=============================');
      console.log(`📱 MOCK SMS OTP for ${cleanPhone} : ${phoneOtp}`);
      console.log('=============================\n');
      
      // Simulate network delay
      await new Promise(r => setTimeout(r, 1000));
      
      return NextResponse.json({ 
        message: 'Dev Mode: SMS OTP printed to terminal.', 
        phoneOtp, 
        isMock: true 
      }, { status: 200 });
    }
    
    console.log(`[SMS Gateway] Dispatching OTP to Fast2SMS for ${cleanPhone}...`);

    if (!process.env.FAST2SMS_API_KEY) {
      return NextResponse.json({ message: 'CONFIGURATION ERROR: Fast2SMS API key missing.' }, { status: 500 });
    }

    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'q',
        message: 'Your Kashroot verification code is ' + phoneOtp,
        language: 'english',
        flash: 0,
        numbers: cleanPhone
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY
        }
      }
    );

    if (response.data.return === false) {
      return NextResponse.json({ message: response.data.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'OTP sent to mobile', phoneOtp, isMock: false }, { status: 200 });

  } catch (error: any) {
    console.error('Failed to send SMS OTP:', error.response?.data || error.message);
    return NextResponse.json({ message: error.response?.data?.message || error.message || 'Failed to process request.' }, { status: 500 });
  }
}
