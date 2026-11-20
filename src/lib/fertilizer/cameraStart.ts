/**
 * Starting the camera for the QR / label scanner.
 *
 * The scanner used to give up on a camera request after 1.5 s. That clock also ran while the browser's own
 * "Allow camera?" box was open, so a person who took two seconds to tap Allow was shown "Camera took too long to start"
 * (and the stream that arrived a moment later was thrown away). The wait now depends on the camera permission:
 *  - already granted: the camera itself is slow, so a short guard falls back to the plainest request;
 *  - not yet decided (or unknown): the person is answering the browser's box, so there is no timeout at all.
 *    A refusal arrives at once as an error, and the person can always close the scanner.
 */
export type CameraPermission = 'prompt' | 'granted' | 'denied' | 'unknown';

export async function cameraPermission(): Promise<CameraPermission> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state === 'granted' || status.state === 'denied' || status.state === 'prompt' ? status.state : 'unknown';
  } catch {
    return 'unknown'; // some browsers do not know the "camera" permission name
  }
}

/** Milliseconds to wait for a camera request; 0 means wait without a limit. */
export function cameraTimeoutMs(permission: CameraPermission, step: 'rich' | 'plain'): number {
  if (permission !== 'granted') return 0;
  return step === 'rich' ? 1500 : 8000;
}

/** True when the person (or the browser's settings) refused the camera. */
export function isPermissionDenied(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

export const PERMISSION_DENIED_TEXT =
  'Camera permission was not given. Tap Allow in your browser\'s box, or the lock icon next to the address, then press Try again.';

/**
 * getUserMedia raced against a timeout (`ms` > 0). A request abandoned after the timeout has its tracks stopped if it
 * ever resolves, so no camera stays on. With `ms` of 0 there is no timeout.
 */
export function requestStreamWithTimeout(
  constraints: MediaStreamConstraints,
  ms: number,
  devices: Pick<MediaDevices, 'getUserMedia'> | undefined = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
): Promise<MediaStream> {
  if (!devices?.getUserMedia) {
    return Promise.reject(new Error('This browser cannot open the camera on this page. Upload a photo or enter the code instead.'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = devices.getUserMedia(constraints);
    const timer =
      ms > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true; // a stream that arrives later is stopped below, so no camera stays on
            reject(new Error('Camera took too long to start'));
          }, ms)
        : null;
    void request.then(
      (stream) => {
        if (settled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(stream);
      },
      (err) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      },
    );
  });
}
