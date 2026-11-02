/**
 * Wrong passwords, counted per account (the email or phone typed, hashed) and
 * per network across every server instance (lib/server/sharedLimit), and
 * what they lead to — before the request reaches Supabase
 * (app/api/supabase proxy):
 *
 *   3rd–7th wrong in 15 min   a short wait before the next try: 10 s, 30 s, 1 min, 2 min, 5 min
 *   8 wrong in 15 min         paused 15 minutes, and the account gets an email
 *   15 wrong in 24 hours      locked 1 hour, and the account gets an email
 *   40 wrong from one network in 15 min   that network paused 15 minutes
 *
 * The email (20261110000000_signin_lockout.sql) goes at most once an hour,
 * only to an account that exists, and the answer is the same either way. A
 * right password clears the 15-minute count (not the day's). Only Supabase's
 * "invalid_credentials" counts as a wrong password: a refused "I am human"
 * token does not, so a broken bot check never locks real people out.
 * Server-only.
 */
import 'server-only';

import { after } from 'next/server';

import { flushOutbox, queueLockNotice } from '@/lib/server/mail';
import { securityEvent } from '@/lib/server/securityLog';
import { sharedClear, sharedCount, sharedLimited, sharedRecord } from '@/lib/server/sharedLimit';

const MIN = 60_000;
/** Seconds to wait before the next try, after the nth wrong password in 15 minutes. */
const WAIT_S: Record<number, number> = { 3: 10, 4: 30, 5: 60, 6: 120, 7: 300 };

export interface Block {
  message: string;
  retryAfter: number;
}

const minutes = (s: number) => (s < 60 ? `${s} seconds` : s === 60 ? '1 minute' : `${Math.round(s / 60)} minutes`);

/** Is this sign-in held back? `whoKey` (hashed account) may be empty; `ipKey` is the hashed network. */
export async function signinBlock(request: Request, who: string, whoKey: string, ipKey: string): Promise<Block | null> {
  const [mine, network, locked] = await Promise.all([
    whoKey ? sharedCount(`pw-fail:${whoKey}`, 15 * MIN) : 0,
    sharedCount(`pw-fail-ip:${ipKey}`, 15 * MIN),
    whoKey ? sharedCount(`pw-lock:${whoKey}`, 60 * MIN) : 0,
  ]);
  if (locked > 0) {
    securityEvent('signin_paused', { request, account: who, status: 429, detail: 'account: locked 1 hour (15 wrong passwords in 24 h)' });
    return { message: 'Too many wrong passwords today. For safety, sign-in to this account is locked for 1 hour. We have emailed the account. Use “Forgot password” to set a new one.', retryAfter: 3600 };
  }
  if (mine >= 8 || network >= 40) {
    securityEvent('signin_paused', { request, account: who, status: 429, detail: mine >= 8 ? 'account: 8 wrong passwords in 15 min' : 'network: 40 wrong passwords in 15 min' });
    return { message: 'Too many wrong passwords. For safety, sign-in is paused for 15 minutes. Use “Forgot password” if you do not remember it.', retryAfter: 900 };
  }
  const wait = WAIT_S[mine];
  if (whoKey && wait && (await sharedCount(`pw-wait:${whoKey}:${mine}`, wait * 1000)) > 0) {
    return { message: `That password was wrong ${mine} times. Please wait ${minutes(wait)} before trying again — or use “Forgot password”.`, retryAfter: wait };
  }
  return null;
}

/** Supabase said the password was wrong: count it, and set the next wait, pause or lock. */
export async function recordWrongPassword(request: Request, who: string, whoKey: string, ipKey: string): Promise<void> {
  await Promise.all([
    whoKey ? sharedRecord(`pw-fail:${whoKey}`, 15 * MIN) : null,
    whoKey ? sharedRecord(`pw-fail-day:${whoKey}`, 24 * 60 * MIN) : null,
    sharedRecord(`pw-fail-ip:${ipKey}`, 15 * MIN),
  ]);
  securityEvent('signin_fail', { request, account: who, status: 400 });
  if (!whoKey) return;
  const [mine, day] = await Promise.all([sharedCount(`pw-fail:${whoKey}`, 15 * MIN), sharedCount(`pw-fail-day:${whoKey}`, 24 * 60 * MIN)]);
  if (WAIT_S[mine]) await sharedRecord(`pw-wait:${whoKey}:${mine}`, WAIT_S[mine] * 1000);
  let pause = '';
  if (day >= 15) {
    await sharedRecord(`pw-lock:${whoKey}`, 60 * MIN);
    pause = '1 hour';
  } else if (mine >= 8) pause = '15 minutes';
  // The account hears about it — at most once an hour.
  if (pause && who.includes('@') && !(await sharedLimited(`pw-notice:${whoKey}`, 1, 60 * MIN))) {
    const send = async () => {
      await queueLockNotice(who, pause);
      await flushOutbox(3);
    };
    try {
      after(send);
    } catch {
      void send();
    }
  }
}

/** The right password: the 15-minute count starts again (the day's count stays). */
export async function rightPassword(whoKey: string): Promise<void> {
  if (whoKey) await sharedClear(`pw-fail:${whoKey}`);
}
