import prisma from '../prisma';
import { smsService } from './sms.service';
import { emailService } from './email.service';

export class NotificationService {
  async notify(userId: string, event: { type: string; title: string; message: string; channel: 'SMS' | 'EMAIL' | 'IN_APP', phone?: string, email?: string, templateId?: string }) {
    // 1. Check preferences
    const prefs = await prisma.notificationPreference.findUnique({ where: { user_id: userId } });
    
    // If not found, assume defaults or skip. We'll proceed with defaults.
    const smsEnabled = prefs ? prefs.sms_enabled : true;
    const emailEnabled = prefs ? prefs.email_enabled : true;

    // 2. Filter by preference
    if (event.channel === 'SMS' && !smsEnabled) return { skipped: true, reason: 'SMS disabled' };
    if (event.channel === 'EMAIL' && !emailEnabled) return { skipped: true, reason: 'Email disabled' };

    // 3. Save pending notification to DB
    const notif = await prisma.notification.create({
      data: {
        user_id: userId,
        type: event.type,
        title: event.title,
        message: event.message,
        channel: event.channel,
        status: 'PENDING',
      }
    });

    try {
      let result;
      // 4. Route to service
      if (event.channel === 'SMS' && event.phone) {
        result = await smsService.sendTransactionalSMS(event.phone, event.message, event.templateId);
      } else if (event.channel === 'EMAIL' && event.email) {
        result = await emailService.sendOrderEmail(event.email, { message: event.message });
      }

      // 5. Update DB status
      await prisma.notification.update({
        where: { id: notif.id },
        data: { 
          status: 'SENT', 
          provider_message_id: result?.providerId, 
          sent_at: new Date() 
        }
      });

      return { success: true, notificationId: notif.id };
    } catch (e) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'FAILED' }
      });
      return { success: false, error: e };
    }
  }
}

export const notificationService = new NotificationService();
