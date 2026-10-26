/**
 * The small map in the corner of the walk inside: the building, its chambers
 * and doors from above (front at the bottom), and a red arrow — "you are
 * here", pointing the way you face. Drawn on a canvas each time you move.
 */
import type { StoreScene, Vec } from '@/components/rental/three/storeScene';

export function drawMiniMap(cv: HTMLCanvasElement, scene: StoreScene, at: Vec, heading: number, level: number, inside: number) {
  const g = cv.getContext('2d');
  if (!g) return;
  const css = cv.clientWidth || 140;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // A square, as sharp as the screen (a new canvas starts 300 × 150).
  const size = Math.round(css * dpr);
  if (cv.width !== size || cv.height !== size) {
    cv.width = size;
    cv.height = size;
  }
  const S = cv.width;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillRect(0, 0, S, S);
  const b = scene.bounds;
  const m = 6 * dpr;
  const k = Math.min((S - 2 * m) / Math.max(1, b.w), (S - 2 * m) / Math.max(1, b.d));
  const ox = m + (S - 2 * m - b.w * k) / 2;
  const oy = m + (S - 2 * m - b.d * k) / 2;
  const X = (x: number) => ox + (x - b.x) * k;
  const Y = (y: number) => S - oy - (y - b.y) * k;
  // The building.
  if (scene.building) {
    g.fillStyle = '#e2e8f0';
    g.fillRect(X(scene.hall.x), Y(scene.hall.y + scene.hall.d), scene.hall.w * k, scene.hall.d * k);
    g.strokeStyle = '#334155';
    g.lineWidth = 2 * dpr;
    g.strokeRect(X(scene.hall.x), Y(scene.hall.y + scene.hall.d), scene.hall.w * k, scene.hall.d * k);
  }
  // Chambers, the one you are in filled.
  for (const c of scene.chambers) {
    const r = c.rect;
    const here = inside === c.index || (at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.d);
    g.fillStyle = here ? '#bae6fd' : '#ffffff';
    g.fillRect(X(r.x), Y(r.y + r.d), r.w * k, r.d * k);
    g.strokeStyle = c.fits ? '#0369a1' : '#e11d48';
    g.lineWidth = 1.5 * dpr;
    g.strokeRect(X(r.x), Y(r.y + r.d), r.w * k, r.d * k);
    if (c.door) {
      g.strokeStyle = '#d97706';
      g.lineWidth = 3 * dpr;
      g.beginPath();
      g.moveTo(X(c.door.x1), Y(c.door.y1));
      g.lineTo(X(c.door.x2), Y(c.door.y2));
      g.stroke();
    }
    const label = c.no !== null ? String(c.no) : c.name.slice(0, 3);
    const px = Math.max(8 * dpr, Math.min(14 * dpr, Math.min(r.w, r.d) * k * 0.5));
    g.font = `700 ${px}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#0f172a';
    g.fillText(label, X(r.x + r.w / 2), Y(r.y + r.d / 2));
  }
  if (scene.mainDoor) {
    const s = scene.mainDoor.seg;
    g.strokeStyle = '#d97706';
    g.lineWidth = 5 * dpr;
    g.beginPath();
    g.moveTo(X(s.x1), Y(s.y1));
    g.lineTo(X(s.x2), Y(s.y2));
    g.stroke();
  }
  // You: a red arrow the way you face.
  const px = X(at.x);
  const py = Y(at.y);
  const hx = Math.cos(heading);
  const hy = -Math.sin(heading);
  const r = 7 * dpr;
  g.fillStyle = '#dc2626';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2 * dpr;
  g.beginPath();
  g.moveTo(px + hx * r * 1.6, py + hy * r * 1.6);
  g.lineTo(px - hy * r * 0.9 - hx * r * 0.6, py + hx * r * 0.9 - hy * r * 0.6);
  g.lineTo(px + hy * r * 0.9 - hx * r * 0.6, py - hx * r * 0.9 - hy * r * 0.6);
  g.closePath();
  g.fill();
  g.stroke();
  if (level > 1) {
    g.font = `700 ${11 * dpr}px system-ui, sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = '#0f172a';
    g.fillText(`Floor ${level}`, 5 * dpr, 4 * dpr);
  }
}
