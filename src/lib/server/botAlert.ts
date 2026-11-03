/**
 * An email to the support inbox when "I am human" failures spike: more than
 * 30 in 10 minutes, not mostly from one network (one network is usually a
 * single bot or someone testing — the network limits handle that). At most
 * one email an hour. Counts are shared by every server instance
 * (lib/server/sharedLimit); the email holds counts only, never anyone's data.
 * Server-only.
 */
import 'server-only';

import { after } from 'next/server';

import { sendLetter, supportInbox } from '@/lib/server/mail';
import { hashed, sharedCount, sharedLimited, sharedRecord } from '@/lib/server/sharedLimit';
import { clientIp } from '@/lib/server/sign';
import { SITE_URL } from '@/lib/site';

const TEN_MIN = 10 * 60_000;

/** Count one security-check failure; email the inbox when they spike. */
export function noteBotFailure(request: Request): void {
  const work = async () => {
    const net = `bot-fail-net:${hashed(`ip|${clientIp(request)}`)}`;
    await Promise.all([sharedRecord('bot-fail-all', TEN_MIN), sharedRecord(net, TEN_MIN)]);
    const [all, mine] = await Promise.all([sharedCount('bot-fail-all', TEN_MIN), sharedCount(net, TEN_MIN)]);
    if (all <= 30 || mine * 2 > all) return; // not a spike, or mostly one network
    if (await sharedLimited('bot-alert', 1, 60 * 60_000)) return; // one email an hour
    await sendLetter({
      to: supportInbox(),
      subject: `KashRoot: “I am human” failures are spiking (${all} in 10 minutes)`,
      lines: [
        `${all} security-check failures in the last 10 minutes, from more than one network.`,
        'It can be a bot attack, or real people unable to pass the check (a Cloudflare problem, a wrong key or secret, or a browser setting).',
        'Admin → Security shows the codes and what each one means; /status → Test the security check tests it end to end.',
      ],
      action: { label: 'Open Admin → Security', href: `${SITE_URL}/admin/dashboard?tab=security` },
    });
  };
  try {
    after(work);
  } catch {
    void work();
  }
}
