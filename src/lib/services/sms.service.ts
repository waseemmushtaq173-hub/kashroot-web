export class SMSService {
  private provider: string;
  private apiKey: string;
  private twilioNumber?: string;

  constructor() {
    this.provider = process.env.SMS_PROVIDER || 'TWILIO';
    this.apiKey = process.env.SMS_API_KEY || '';
    this.twilioNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  async sendOTP(phone: string, code: string, templateId?: string) {
    console.log(`[SMS] Sending OTP ${code} to ${phone} via ${this.provider} (Template: ${templateId})`);
    // Twilio/Fast2SMS logic here based on provider
    return { success: true, providerId: 'msg_' + Date.now() };
  }

  async sendTransactionalSMS(phone: string, message: string, templateId?: string) {
    console.log(`[SMS] Sending TXN to ${phone}: ${message} via ${this.provider} (Template: ${templateId})`);
    // Twilio/Fast2SMS logic here
    return { success: true, providerId: 'msg_' + Date.now() };
  }
}

export const smsService = new SMSService();
