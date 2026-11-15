/**
 * Pictures painted on the 3D store, drawn on a canvas when the 3D view opens
 * (no image files to download). Stacks use one picture in two halves: the
 * left half is the side of ONE bin, crate or box (repeated up the stack, one
 * per bin), the right half is the top of the stack.
 */
type Three = typeof import('three');

/** The same "random" apples every time. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

/** Apples seen from above, filling a box. */
function apples(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, seed: number) {
  const rnd = seeded(seed);
  g.fillStyle = '#3f1d12';
  g.fillRect(x, y, w, h);
  const step = r * 1.7;
  for (let j = 0; j * step < h + r; j++) {
    for (let i = 0; i * step < w + r; i++) {
      const cx = x + i * step + (j % 2 ? step / 2 : 0) + (rnd() - 0.5) * r * 0.5;
      const cy = y + j * step + (rnd() - 0.5) * r * 0.5;
      const rr = r * (0.85 + rnd() * 0.25);
      const hue = rnd();
      g.fillStyle = hue < 0.7 ? `hsl(${350 + rnd() * 14}, ${70 + rnd() * 15}%, ${36 + rnd() * 10}%)` : hue < 0.9 ? `hsl(${8 + rnd() * 10}, 75%, 45%)` : `hsl(${70 + rnd() * 15}, 60%, 45%)`;
      g.beginPath();
      g.arc(cx, cy, rr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(cx - rr * 0.35, cy - rr * 0.35, rr * 0.28, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Wood grain over a board. */
function board(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: string, seed: number) {
  const rnd = seeded(seed);
  g.fillStyle = tone;
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(92,52,20,0.28)';
  g.lineWidth = 1;
  for (let i = 0; i < Math.max(2, h / 4); i++) {
    const yy = y + rnd() * h;
    g.beginPath();
    g.moveTo(x, yy);
    g.bezierCurveTo(x + w * 0.3, yy + (rnd() - 0.5) * 3, x + w * 0.7, yy + (rnd() - 0.5) * 3, x + w, yy + (rnd() - 0.5) * 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,240,210,0.18)';
  g.fillRect(x, y, w, Math.max(1, h * 0.15));
  g.fillStyle = 'rgba(60,30,10,0.25)';
  g.fillRect(x, y + h - Math.max(1, h * 0.12), w, Math.max(1, h * 0.12));
}

function finish(T: Three, c: HTMLCanvasElement, repeatY = true) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = T.ClampToEdgeWrapping;
  t.wrapT = repeatY ? T.RepeatWrapping : T.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * A wooden apple bin: slatted sides on a forklift pallet base with corner
 * posts. `filled`: apples show between the slats and across the top; else the
 * bin is empty — a dark cavity between the slats and a bare timber floor — so
 * a vacant bin and a stored one can never be mistaken for each other.
 */
export function binTexture(T: Three, filled = true) {
  const { c, g } = canvas(256, 128);
  if (g) {
    // Side (one bin, 0.76 m with the gap above it).
    g.fillStyle = '#20150d';
    g.fillRect(0, 0, 128, 128);
    if (filled) apples(g, 8, 8, 112, 84, 7, 7);
    else {
      // The far wall's slats seen through the gaps, in shadow.
      for (let i = 0; i < 4; i++) board(g, 8, 8 + i * 21, 112, 19, i % 2 ? '#4a3220' : '#533826', 71 + i);
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.fillRect(8, 8, 112, 84);
    }
    const slats = [[8, 21], [33, 21], [58, 21], [83, 13]];
    slats.forEach(([y, h], i) => board(g, 6, y, 116, h, i % 2 ? '#c8955a' : '#cf9d61', 11 + i));
    board(g, 0, 6, 11, 92, '#a8733d', 31);
    board(g, 117, 6, 11, 92, '#a8733d', 32);
    // Nail heads on the corner posts.
    g.fillStyle = 'rgba(40,30,20,0.7)';
    for (const px of [5, 122]) for (const py of [14, 39, 64, 88]) g.fillRect(px, py, 2, 2);
    // Pallet base: a deck board, three blocks with the fork openings between them.
    board(g, 0, 96, 128, 7, '#9b6a37', 41);
    g.fillStyle = '#1a120b';
    g.fillRect(0, 103, 128, 21);
    board(g, 0, 103, 14, 21, '#8d5f30', 42);
    board(g, 57, 103, 14, 21, '#8d5f30', 43);
    board(g, 114, 103, 14, 21, '#8d5f30', 44);
    board(g, 0, 122, 128, 6, '#85582c', 45);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(0, 0, 128, 6);
    // Top: the rim, apples (or the bare floor boards) inside.
    board(g, 128, 0, 128, 128, '#b9844b', 51);
    if (filled) apples(g, 140, 12, 104, 104, 7.5, 53);
    else for (let i = 0; i < 6; i++) board(g, 140, 12 + i * 17.4, 104, 16.4, i % 2 ? '#8a6038' : '#94683f', 81 + i);
    g.strokeStyle = 'rgba(70,40,15,0.6)';
    g.lineWidth = 2;
    g.strokeRect(140, 12, 104, 104);
  }
  return finish(T, c);
}

/** An apple crate in warm pine (#C89B62 slats, #7A5228 posts): ribbed sides, a hand hole, air slots; apples on top (`filled`) or the bare floor. */
export function crateTexture(T: Three, filled = true) {
  const { c, g } = canvas(256, 128);
  if (g) {
    g.fillStyle = '#2a1a0c';
    g.fillRect(0, 0, 128, 128);
    const body = g.createLinearGradient(0, 10, 0, 128);
    body.addColorStop(0, '#D2A56B');
    body.addColorStop(1, '#B98B52');
    g.fillStyle = body;
    g.fillRect(2, 12, 124, 114);
    // Ribs and the top rim.
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(2, 12, 124, 9);
    g.fillStyle = '#7A5228';
    for (const x of [2, 32, 62, 92, 122]) g.fillRect(x, 21, 4, 105);
    // Hand hole and air slots.
    g.fillStyle = '#2a1a0c';
    if (g.roundRect) {
      g.beginPath();
      g.roundRect(44, 28, 40, 13, 6);
      g.fill();
    } else g.fillRect(44, 28, 40, 13);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillRect(12 + i * 30, 60 + j * 26, 16, 14);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, 128, 12);
    // Top: rim and apples (or the bare ribbed floor of an empty crate).
    g.fillStyle = '#C89B62';
    g.fillRect(128, 0, 128, 128);
    if (filled) apples(g, 138, 10, 108, 108, 10, 61);
    else {
      g.fillStyle = '#9A6E3C';
      g.fillRect(138, 10, 108, 108);
      g.fillStyle = 'rgba(60,35,12,0.5)';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) g.fillRect(144 + i * 17, 16 + j * 26, 11, 16);
    }
    g.strokeStyle = '#7A5228';
    g.lineWidth = 3;
    g.strokeRect(138, 10, 108, 108);
  }
  return finish(T, c);
}

/** Cardboard apple boxes (stores set up before the owner wizard): two boxes across a layer. */
export function cartonTexture(T: Three) {
  const { c, g } = canvas(256, 128);
  if (g) {
    g.fillStyle = '#c9a36b';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#7a5a30';
    g.lineWidth = 4;
    g.strokeRect(2, 4, 60, 122);
    g.strokeRect(66, 4, 60, 122);
    g.fillStyle = '#6b4c25';
    for (const x of [22, 86]) {
      if (g.roundRect) {
        g.beginPath();
        g.roundRect(x, 20, 20, 8, 4);
        g.fill();
      } else g.fillRect(x, 20, 20, 8);
    }
    g.fillStyle = 'rgba(180,30,40,0.55)';
    g.font = '700 13px system-ui, sans-serif';
    g.fillText('APPLES', 9, 84);
    g.fillText('APPLES', 73, 84);
    // Top: flaps and tape.
    g.strokeStyle = '#8c6a3a';
    g.lineWidth = 3;
    g.strokeRect(130, 4, 124, 120);
    g.beginPath();
    g.moveTo(192, 4);
    g.lineTo(192, 124);
    g.stroke();
    g.fillStyle = 'rgba(230,210,170,0.8)';
    g.fillRect(186, 4, 12, 120);
  }
  return finish(T, c);
}

/** An empty place: a faint outline of each bin or crate that fits there (tinted by its state). */
export function ghostTexture(T: Three) {
  const { c, g } = canvas(256, 128);
  if (g) {
    g.clearRect(0, 0, 256, 128);
    for (const x0 of [0, 128]) {
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x0 + 4, 6, 120, 118);
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 5;
      g.strokeRect(x0 + 6, 8, 116, 114);
    }
  }
  return finish(T, c);
}

/** Sealed, power-trowelled concrete with saw-cut joints every few metres and faint trowel swirls. */
export function concreteTexture(T: Three) {
  const { c, g } = canvas(256, 256);
  if (g) {
    const rnd = seeded(5);
    g.fillStyle = '#d5d9dd';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,100,110'},${0.05 + rnd() * 0.08})`;
      g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    // Trowel swirls: long, faint arcs where the machine passed.
    g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '110,120,130'},${0.07 + rnd() * 0.06})`;
      g.beginPath();
      g.arc(rnd() * 256, rnd() * 256, 18 + rnd() * 46, rnd() * 6.28, rnd() * 6.28 + 2.2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(100,116,139,0.45)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Galvanised diamond (tread) plate: the forklift kick-plate along the foot of a wall. */
export function diamondTexture(T: Three) {
  const { c, g } = canvas(128, 128);
  if (g) {
    g.fillStyle = '#b9c2cc';
    g.fillRect(0, 0, 128, 128);
    // Rows of raised lozenges, each row turned across the last.
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const cx = i * 16 + 8 + (j % 2 ? 0 : 0);
        const cy = j * 16 + 8;
        g.save();
        g.translate(cx, cy);
        g.rotate(((i + j) % 2 ? 1 : -1) * Math.PI / 4);
        const hi = g.createLinearGradient(-6, 0, 6, 0);
        hi.addColorStop(0, '#f1f5f9');
        hi.addColorStop(1, '#7b8794');
        g.fillStyle = hi;
        g.fillRect(-6, -1.6, 12, 3.2);
        g.restore();
      }
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A steel grating deck (an upper floor): bars you can see through. */
export function gratingTexture(T: Three) {
  const { c, g } = canvas(64, 64);
  if (g) {
    g.fillStyle = 'rgba(148,163,184,0.08)';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(71,85,105,0.7)';
    for (let i = 0; i < 4; i++) g.fillRect(i * 16, 0, 2, 64);
    g.fillStyle = 'rgba(100,116,139,0.6)';
    for (let i = 0; i < 2; i++) g.fillRect(0, i * 32, 64, 2);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Insulated sandwich panels (PUF between two steel sheets), as cold stores are
 * built: a slight sheen across each panel, fine ribs pressed into the steel,
 * and the joint between two panels — a dark line with a light edge.
 */
export function panelTexture(T: Three) {
  const { c, g } = canvas(256, 256);
  if (g) {
    const sheen = g.createLinearGradient(0, 0, 256, 0);
    sheen.addColorStop(0, '#e6ebf1');
    sheen.addColorStop(0.45, '#f5f8fb');
    sheen.addColorStop(1, '#e8edf2');
    g.fillStyle = sheen;
    g.fillRect(0, 0, 256, 256);
    for (let y = 8; y < 256; y += 16) {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(0, y, 256, 1);
      g.fillStyle = 'rgba(100,116,139,0.16)';
      g.fillRect(0, y + 1, 256, 1);
    }
    g.fillStyle = 'rgba(71,85,105,0.6)';
    g.fillRect(0, 0, 3, 256);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(3, 0, 2, 256);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A cooling fan seen from the front: the dark opening, four blades, the hub and the guard's rings. */
export function fanTexture(T: Three) {
  const { c, g } = canvas(128, 128);
  if (g) {
    g.fillStyle = '#334155';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#0f172a';
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#64748b';
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(64, 64);
      g.rotate((i * Math.PI) / 2 + 0.3);
      g.beginPath();
      g.ellipse(0, -30, 14, 27, 0.45, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#cbd5e1';
    g.beginPath();
    g.arc(64, 64, 11, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(226,232,240,0.55)';
    g.lineWidth = 2;
    for (const r of [22, 36, 50, 60]) {
      g.beginPath();
      g.arc(64, 64, r, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/**
 * A label: a big title and a smaller line under it, as a deep forest green pill with a champagne gold rim
 * (white title, gold second line). `dark` is kept for older calls: every label wears the one look now.
 * `fill`: its own colour inside the same gold rim.
 */
export function labelCanvas(title: string, sub: string, dark = false, fill?: string) {
  const { c, g } = canvas(512, sub ? 168 : 112);
  if (fill) dark = true;
  if (g) {
    dark = true;
    g.fillStyle = fill ?? 'rgba(18,56,46,0.95)';
    g.strokeStyle = '#C6A45B';
    g.lineWidth = 6;
    if (g.roundRect) {
      g.beginPath();
      g.roundRect(6, 6, 500, c.height - 12, 34);
      g.fill();
      g.stroke();
    } else {
      g.fillRect(6, 6, 500, c.height - 12);
      g.strokeRect(6, 6, 500, c.height - 12);
    }
    g.textAlign = 'center';
    g.fillStyle = dark ? '#ffffff' : '#0f172a';
    let px = 64;
    do g.font = `800 ${px}px system-ui, sans-serif`;
    while (g.measureText(title).width > 470 && (px -= 4) > 22);
    g.fillText(title, 256, sub ? 78 : 76);
    if (sub) {
      g.fillStyle = '#E3C877';
      let sp = 42;
      do g.font = `600 ${sp}px system-ui, sans-serif`;
      while (g.measureText(sub).width > 480 && (sp -= 2) > 16);
      g.fillText(sub, 256, 140);
    }
  }
  return c;
}

/**
 * The digital status plaque beside a chamber's door: the chamber's ID, and
 * either its last logged temperature with the time that reading was recorded,
 * or "Sensor not connected" when the database holds no reading for it. Never
 * a made-up or moving number.
 */
export function plaqueCanvas(id: string, reading: { text: string; when: string } | null | 'loading') {
  const { c, g } = canvas(256, 168);
  if (g) {
    g.fillStyle = '#0b1220';
    g.fillRect(0, 0, 256, 168);
    g.strokeStyle = '#64748b';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 252, 164);
    g.textAlign = 'center';
    g.fillStyle = '#e2e8f0';
    let px = 34;
    do g.font = `800 ${px}px system-ui, sans-serif`;
    while (g.measureText(id).width > 230 && (px -= 2) > 14);
    g.fillText(id, 128, 40);
    g.fillStyle = 'rgba(148,163,184,0.5)';
    g.fillRect(14, 52, 228, 2);
    if (reading === 'loading') {
      g.fillStyle = '#94a3b8';
      g.font = '700 30px system-ui, sans-serif';
      g.fillText('Reading…', 128, 120);
    } else if (reading) {
      g.fillStyle = '#4ade80';
      let tp = 62;
      do g.font = `800 ${tp}px ui-monospace, monospace`;
      while (g.measureText(reading.text).width > 230 && (tp -= 2) > 20);
      g.fillText(reading.text, 128, 116);
      g.fillStyle = '#94a3b8';
      let wp = 22;
      do g.font = `600 ${wp}px system-ui, sans-serif`;
      while (g.measureText(reading.when).width > 236 && (wp -= 1) > 11);
      g.fillText(reading.when, 128, 152);
    } else {
      g.fillStyle = '#fbbf24';
      g.font = '800 30px system-ui, sans-serif';
      g.fillText('Sensor not', 128, 100);
      g.fillText('connected', 128, 140);
    }
  }
  return c;
}

/** A row's number plate, as stores hang them: yellow, a black edge, "ROW" over the number. */
export function plateTexture(T: Three, row: number) {
  const { c, g } = canvas(256, 160);
  if (g) {
    g.fillStyle = '#111827';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#facc15';
    g.fillRect(8, 8, 240, 144);
    g.fillStyle = '#111827';
    g.textAlign = 'center';
    g.font = '700 30px system-ui, sans-serif';
    g.fillText('ROW', 128, 44);
    g.font = `900 ${row > 99 ? 76 : 96}px system-ui, sans-serif`;
    g.fillText(String(row), 128, 138);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
