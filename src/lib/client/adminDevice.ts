'use client';

/**
 * The Admin card and menu item are hidden from the public. They show only on
 * a phone or computer that belongs to an admin: one where an admin account is
 * signed in, or one that has opened the staff QR / the Admin sign-in page
 * (remembered on that device). Showing the card unlocks nothing — the Admin
 * portal still needs an admin account and that admin's own code.
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';

import { loadAccount } from '@/lib/db/client';

const KEY = 'kr_admin_device';

export function rememberAdminDevice() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode: the card just stays hidden */
  }
}

let checked: Promise<boolean> | null = null;

async function isAdminDevice(): Promise<boolean> {
  try {
    if (localStorage.getItem(KEY) === '1') return true;
  } catch {
    return false;
  }
  checked ??= loadAccount()
    .then((a) => Boolean(a?.staff.includes('ADMIN')))
    .catch(() => false);
  const admin = await checked;
  if (admin) rememberAdminDevice();
  return admin;
}

export function useShowAdmin(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    const run = async () => {
      const yes = await isAdminDevice();
      if (live) setShow(yes);
    };
    void run();
    return () => {
      live = false;
    };
  }, []);
  return show;
}

/** Marks this device when the Admin sign-in page is opened (e.g. from the staff QR). */
export function RememberAdminDevice() {
  useEffect(() => rememberAdminDevice(), []);
  return null;
}

/**
 * The owner's private way in on a new laptop or phone: tap the KashRoot logo
 * in the top bar 5 times within 3 seconds. It opens the Admin sign-in, and
 * from then on that device shows the Admin card. Nobody else is told about
 * it, and it still needs an admin account and the admin code.
 */
export function useSecretAdminTap() {
  const taps = useRef<number[]>([]);
  const router = useRouter();
  return (e: MouseEvent) => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      e.preventDefault();
      taps.current = [];
      rememberAdminDevice();
      router.push('/login/admin');
    }
  };
}
