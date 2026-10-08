import prisma from '../prisma';
import { smsService } from './sms.service';
import { emailService } from './email.service';

export class NotificationService {
  async notify(userId: string, event: { type: string; title: string; message: string; channel: 'SMS' | 'EMAIL' | 'IN_APP', phone?: string, email?: string, templateId?: string }) {
    try {
      // 1. Check preferences (bypassing TS errors for unfinished schema)
      const prefs = await (prisma as any).notification_preferences.findFirst({ where: { user_id: userId } });
      
      const smsEnabled = prefs ? prefs.enabled : true;
      const emailEnabled = prefs ? prefs.enabled : true;

      // 2. Filter by preference
      if (event.channel === 'SMS' && !smsEnabled) return { skipped: true, reason: 'SMS disabled' };
      if (event.channel === 'EMAIL' && !emailEnabled) return { skipped: true, reason: 'Email disabled' };

      // 3. Save pending notification to DB
      const notif = await (prisma as any).notification_queue.create({
        data: {
          id: `notif_${Date.now()}`,
          user_id: userId,
          category: event.type,
          channel: event.channel,
          payload: { title: event.title, message: event.message },
          status: 'PENDING',
        }
      });

      let result;
      // 4. Route to service
      if (event.channel === 'SMS' && event.phone) {
        result = await smsService.sendTransactionalSMS(event.phone, event.message, event.templateId);
      } else if (event.channel === 'EMAIL' && event.email) {
        result = await emailService.sendOrderEmail(event.email, { message: event.message });
      }

      // 5. Update DB status
      await (prisma as any).notification_queue.update({
        where: { id: notif.id },
        data: { 
          status: 'SENT', 
          sent_at: new Date() 
        }
      });

      return { success: true, notificationId: notif.id };
    } catch (e) {
      console.error('Notification error', e);
      return { success: false, error: e };
    }
  }
}

export const notificationService = new NotificationService();
