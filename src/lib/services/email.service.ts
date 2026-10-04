export class EmailService {
  private provider: string;

  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'RESEND';
  }

  async sendVerificationEmail(email: string, code: string) {
    console.log(`[Email] Sending Verification code ${code} to ${email} via ${this.provider}`);
    // Nodemailer / Resend logic here
    return { success: true, providerId: 'eml_' + Date.now() };
  }

  async sendOrderEmail(email: string, orderDetails: any) {
    console.log(`[Email] Sending Order Details to ${email} via ${this.provider}`);
    // Nodemailer / Resend logic here
    return { success: true, providerId: 'eml_' + Date.now() };
  }
}

export const emailService = new EmailService();
