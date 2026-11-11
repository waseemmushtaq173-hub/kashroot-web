/**
 * Geo-Tag Engraving Engine — permanently burns live GPS location + timestamp
 * into the pixels of captured photos and videos (not just a CSS overlay).
 *
 * Used by the Farmer listing modal so every product photo/video carries a
 * tamper-evident corner stamp:
 *   🛡️ KASHROOT VERIFIED LIVE CAPTURE
 *   📍 <village>, <district> (±<accuracy>m)
 *   👤 <seller> · <IST datetime>
 *
 * Photo: draw the <video> frame onto an offscreen canvas, render the badge,
 * export via canvas.toBlob('image/jpeg').
 * Video: requestAnimationFrame loop draws each frame + live-updating badge
 * onto a canvas, capture via canvas.captureStream(30) + mic track, record
 * with MediaRecorder.
 */

/**
 * Reverse-geocode live coordinates into a human-readable place: the app's
 * own server lookup first (/api/geo/reverse — the User-Agent contact and
 * both upstream providers live there, so the browser never depends on a
 * third party's CORS policy), with the same Nominatim lookup straight from
 * the browser as a fallback. When everything is unreachable the coordinates
 * themselves are the label — the camera stamp and the pin still carry the
 * place.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
    if (res.ok) {
      const d = (await res.json()) as { formattedAddress?: unknown };
      const a = typeof d?.formattedAddress === 'string' ? d.formattedAddress.trim() : '';
      if (a) return a;
    }
  } catch {
    // The fallback below answers.
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
    const data = await res.json();
    const addr = data.address ?? {};
    // The nearest named place first (a locality at zoom 16), then the city, state and country.
    const parts = [addr.neighbourhood || addr.suburb || addr.village || addr.hamlet || addr.quarter, addr.city || addr.town || addr.municipality, addr.state, addr.country].filter(Boolean);
    return [...new Set(parts)].join(', ') || `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
  } catch {
    return `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
  }
}

/** Current date/time in Indian Standard Time, formatted. */
export function nowIST(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** GPS position with high accuracy, no cache. */
export function getLiveGPS(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not available.'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  });
}

/** GPS + address result. */
export interface GeoResult {
  lat: number;
  lng: number;
  accuracy: number;
  address: string;
}

/** Draw the tamper-evident badge onto a canvas context. */
export function drawGeoBadge(ctx: CanvasRenderingContext2D, geo: GeoResult, seller: string): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const pad = Math.max(6, Math.round(w * 0.025));
  const lineH = Math.max(10, Math.round(h * 0.045));
  const f1 = Math.max(10, Math.round(h * 0.05));
  const f2 = Math.max(8, Math.round(h * 0.035));

  ctx.save();
  const badgeW = Math.min(w * 0.92, Math.max(260, ctx.measureText(`📍 ${geo.address}`).width + pad * 2 + 40));
  const badgeH = lineH * 3 + pad * 2;
  const x = pad;
  const y = h - badgeH - pad;
  ctx.fillStyle = 'rgba(6, 38, 26, 0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, badgeW, badgeH, 8);
  ctx.fill();

  ctx.fillStyle = '#10b981';
  ctx.font = `bold ${f1}px sans-serif`;
  ctx.fillText('🛡️ KASHROOT VERIFIED LIVE CAPTURE', x + pad, y + lineH);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${f2}px sans-serif`;
  ctx.fillText(`📍 ${geo.address} (±${Math.round(geo.accuracy)}m)`, x + pad, y + lineH * 2);

  ctx.font = `${f2}px sans-serif`;
  ctx.fillText(`👤 ${seller} · ${nowIST()}`, x + pad, y + lineH * 3);
  ctx.restore();
}

/** Engrave a live <video> frame into an offscreen canvas and return a JPEG blob. */
export async function engravePhotoFrame(
  video: HTMLVideoElement,
  geo: GeoResult,
  seller: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  drawGeoBadge(ctx, geo, seller);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('canvas toBlob returned null')), 'image/jpeg', 0.92));
}

/** Start recording an engraved video stream (canvas frames + mic audio). */
export function startEngravedVideo(
  video: HTMLVideoElement,
  geo: GeoResult,
  seller: string,
  onDataAvailable: (chunk: Blob) => void,
  audioTrack?: MediaStreamTrack,
): { stop: () => void; canvas: HTMLCanvasElement; stream: MediaStream } {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d')!;

  let raf: number;
  const drawFrame = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawGeoBadge(ctx, geo, seller);
    raf = requestAnimationFrame(drawFrame);
  };
  raf = requestAnimationFrame(drawFrame);

  const stream = canvas.captureStream(30);
  if (audioTrack) stream.addTrack(audioTrack);

  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    cancelAnimationFrame(raf);
    const blob = new Blob(chunks, { type: 'video/webm' });
    onDataAvailable(blob);
  };
  recorder.start(1000);

  return {
    canvas,
    stream,
    stop: () => {
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
