/**
 * An owner cannot book their own cold store, and used to see only a "Your listing" badge where a customer sees
 * "Choose your place" and then pays. Now the owner gets a note and "Preview what customers see": the real booking
 * screens, with the last step (the booking itself) switched off. Source guards, no server needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('an owner sees what a customer sees, but cannot book or pay on their own store', () => {
  const page = read('src/app/(dashboards)/rental/dashboard/page.tsx');
  // The card: own listing → a note and the preview button; anyone else → "Choose your place" and "Book nearest the door".
  const own = page.slice(page.indexOf('{own ? ('), page.indexOf(') : (', page.indexOf('{own ? (')));
  expect(own).toContain('Preview what customers see');
  expect(own).toContain('You cannot book your own store');
  expect(own).not.toContain('onBook(');
  // An owner has a button to fill in or change the store's details (the owner tools live under the Business admin).
  expect(own).toContain('{fillIn}');
  expect(page).toContain('href="/business/cold-store?tab=stores"');
  expect(page).toContain('Fill in or change my cold store details');
  expect(page).toContain('>Choose your place</Btn>');
  expect(page).toContain('preview={booking.preview}');
  expect(page).toContain('onPreview={() => setBooking(l, null, true)}');

  const dialog = read('src/components/rental/ColdBooking.tsx');
  // The booking itself is refused in the preview, before anything is saved, and its button is off.
  const book = dialog.slice(dialog.indexOf('const book = async () => {'), dialog.indexOf('setTried(true);', dialog.indexOf('const book = async () => {')));
  expect(book).toContain("if (preview) return toast.error('This is a preview: you cannot book your own store.');");
  expect(dialog).toContain('disabled={busy || preview}');
  expect(dialog).toContain('Preview: this is what a customer sees.');
  expect(dialog).toMatch(/pay you directly by UPI or bank/);
});
