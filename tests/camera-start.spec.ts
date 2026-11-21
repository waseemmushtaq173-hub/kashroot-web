/**
 * Starting the camera for the QR / label scanner. A person who took longer than 1.5 s to tap "Allow" in the browser's
 * camera box was shown "Could not start camera: Camera took too long to start" while the box was still open, and the
 * stream that arrived after Allow was thrown away. The timeout now applies only once the camera is already allowed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { cameraTimeoutMs, isPermissionDenied, requestStreamWithTimeout } from '@/lib/fertilizer/cameraStart';

const fakeStream = () => {
  const stops: string[] = [];
  const track = { stop: () => stops.push('stopped') };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, stops };
};
const later = <T,>(ms: number, v: () => T) => new Promise<T>((r) => setTimeout(() => r(v()), ms));

test('no timeout while the person may still be answering the browser box', () => {
  expect(cameraTimeoutMs('prompt', 'rich')).toBe(0);
  expect(cameraTimeoutMs('prompt', 'plain')).toBe(0);
  expect(cameraTimeoutMs('unknown', 'rich')).toBe(0);
  expect(cameraTimeoutMs('granted', 'rich')).toBe(1500);
  expect(cameraTimeoutMs('granted', 'plain'), 'the last attempt gets longer than the first').toBeGreaterThan(cameraTimeoutMs('granted', 'rich'));
});

test('a camera request that arrives late (after the person taps Allow) is used, not thrown away', async () => {
  const { stream, stops } = fakeStream();
  const got = await requestStreamWithTimeout({ video: true }, 0, { getUserMedia: () => later(300, () => stream) });
  expect(got).toBe(stream);
  expect(stops, 'the camera is not switched off').toEqual([]);
});

test('with a timeout (camera already allowed), a stuck request fails and its late stream is stopped', async () => {
  const { stream, stops } = fakeStream();
  await expect(requestStreamWithTimeout({ video: true }, 50, { getUserMedia: () => later(250, () => stream) })).rejects.toThrow('Camera took too long to start');
  await new Promise((r) => setTimeout(r, 400));
  expect(stops, 'no camera stays on').toEqual(['stopped']);
});

test('a refusal comes back at once and is recognised', async () => {
  const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  const t0 = Date.now();
  const err = await requestStreamWithTimeout({ video: true }, 0, { getUserMedia: () => Promise.reject(denied) }).catch((e) => e);
  expect(Date.now() - t0).toBeLessThan(200);
  expect(isPermissionDenied(err)).toBe(true);
  expect(isPermissionDenied(new Error('x'))).toBe(false);
});

test('a page with no camera access says so in words', async () => {
  const err = await requestStreamWithTimeout({ video: true }, 0, undefined).catch((e) => e);
  expect(String(err.message)).toContain('Upload a photo or enter the code');
});

test('the scanner uses these rules and tells the person to tap Allow', () => {
  const card = readFileSync(join(process.cwd(), 'src/components/fertilizer/QRCodeScanner.tsx'), 'utf8');
  expect(card).toContain("from '@/lib/fertilizer/cameraStart'");
  expect(card).toContain('Waiting for camera permission. Tap Allow');
  expect(card, 'the old fixed 1.5 s race is gone from the component').not.toContain('requestStreamWithTimeout(\n          {');
  expect(card).not.toContain('function requestStreamWithTimeout');
});
