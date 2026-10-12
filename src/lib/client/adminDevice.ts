'use client';

/**
 * The Admin card and menu item are hidden from the public. They show only on
 * a phone or computer that belongs to an admin: one where an admin account is
 * signed in, or one that has opened the staff QR / the Admin sign-in page
 * (remembered on that device). Showing the card unlocks nothing — the Admin
 * portal still needs an admin account and that admin's own code.
 */
import { useEffect, useState } from 'react';

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
