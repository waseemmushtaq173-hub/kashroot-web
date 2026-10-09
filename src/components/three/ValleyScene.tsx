'use client';

/**
 * ValleyScene — a live low-poly 3D valley: snow ridges, a lake with moving
 * water, a shikara, chinar trees, drifting clouds and falling chinar leaves
 * (petals in spring, snow in winter). The mood recolours the whole scene.
 *
 * - three.js is imported inside the effect, so it never lands in the initial
 *   bundle and never runs on the server.
 * - Renders only while on screen and the tab is visible; prefers-reduced-motion
 *   gets one still frame.
 * - If WebGL is unavailable nothing is drawn and whatever sits underneath (the
 *   season photo) shows through.
 */
import { useEffect, useRef, useState } from 'react';

export type SceneMood = 'spring' | 'summer' | 'autumn' | 'winter' | 'dusk' | 'dawn';

interface Palette {
  skyTop: string;
  skyBottom: string;
  fog: string;
  far: string;
  near: string;
  snow: string;
  lake: string;
  foliage: string[];
  particles: string[];
  particle: 'leaf' | 'petal' | 'snow';
  sun: string;
  sunIntensity: number;
  snowLine: number;
}

const PALETTES: Record<SceneMood, Palette> = {
  spring: {
    skyTop: '#6db6ea', skyBottom: '#eaf7ff', fog: '#d9eef9', far: '#7f9cbc', near: '#4f8f5b', snow: '#ffffff', lake: '#3d8fb5',
    foliage: ['#7cc36a', '#f4a7c0', '#9fd483'], particles: ['#ffd1dc', '#ffb3c6', '#fff0f5', '#f8a5c2'], particle: 'petal',
    sun: '#fff4e0', sunIntensity: 1.9, snowLine: 0.55,
  },
  summer: {
    skyTop: '#3f9fe0', skyBottom: '#d6efff', fog: '#cde7f6', far: '#7896b2', near: '#3f7d4e', snow: '#ffffff', lake: '#1f78a8',
    foliage: ['#4e9a3f', '#6fb24f', '#3c8a3a'], particles: ['#b6e27a', '#8ccf5f', '#d7f2a1'], particle: 'leaf',
    sun: '#fff8e8', sunIntensity: 2.1, snowLine: 0.72,
  },
  autumn: {
    skyTop: '#6aa6dc', skyBottom: '#fde6c6', fog: '#f4dac0', far: '#8a7f9a', near: '#8c5a2b', snow: '#fff8f0', lake: '#3f7f98',
    foliage: ['#d9480f', '#f08c00', '#c92a2a', '#e8590c'], particles: ['#e8590c', '#c92a2a', '#f59f00', '#d9480f', '#b02525'], particle: 'leaf',
    sun: '#ffe2b8', sunIntensity: 2.0, snowLine: 0.6,
  },
  winter: {
    skyTop: '#93bde4', skyBottom: '#f4f8fc', fog: '#e7eef6', far: '#aebfd2', near: '#dfe8f0', snow: '#ffffff', lake: '#6a91ac',
    foliage: ['#eef4f8', '#d4e0ea'], particles: ['#ffffff'], particle: 'snow',
    sun: '#f4f7ff', sunIntensity: 1.6, snowLine: 0.25,
  },
  dusk: {
    skyTop: '#6c5aa6', skyBottom: '#f9c58d', fog: '#efc1a8', far: '#75669a', near: '#56497a', snow: '#fde2e4', lake: '#6f5fa3',
    foliage: ['#c2185b', '#e64980', '#f06595'], particles: ['#ffd6a5', '#fbc4ab', '#f8a5c2'], particle: 'petal',
    sun: '#ffd2a8', sunIntensity: 1.7, snowLine: 0.55,
  },
  dawn: {
    skyTop: '#7f8fd6', skyBottom: '#eef1ff', fog: '#dfe4fa', far: '#8d97c4', near: '#c9d3ee', snow: '#ffffff', lake: '#5b6fb3',
    foliage: ['#dfe6f7', '#c3cdea'], particles: ['#ffffff'], particle: 'snow',
    sun: '#fff1e6', sunIntensity: 1.7, snowLine: 0.3,
  },
};

/** Chinar (Platanus orientalis) leaf outline, 100×100 units, as cubic curves. */
const LEAF_PATH: [number, number][][] = [
  [[47, 22], [36, 28], [28, 32]],
  [[34, 36], [33, 42], [22, 46]],
  [[32, 50], [31, 60], [25, 68]],
  [[35, 66], [38, 72], [35, 84]],
  [[43, 76], [47, 79], [50, 92]],
  [[53, 79], [57, 76], [65, 84]],
  [[62, 72], [65, 66], [75, 68]],
  [[69, 60], [68, 50], [78, 46]],
  [[67, 42], [66, 36], [72, 32]],
  [[64, 28], [53, 22], [50, 8]],
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in [-1, 1]. */
function makeNoise(seed: number) {
  const rnd = mulberry32(seed);
  const perm = Array.from({ length: 256 }, () => rnd() * 2 - 1);
  const at = (x: number, y: number) => perm[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 256];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf;
    return a + (b - a) * yf;
  };
  return (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.12;
}

export function ValleyScene({ mood = 'autumn', className = '', particleCount = 70 }: { mood?: SceneMood; className?: string; particleCount?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import('three');
      if (disposed) return;

      const pal = PALETTES[mood];
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const rnd = mulberry32(mood.length * 977 + 13);

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      } catch {
        return; // No WebGL: leave the fallback underneath visible.
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const disposables: { dispose: () => void }[] = [];
      const track = <T extends { dispose: () => void }>(item: T) => {
        disposables.push(item);
        return item;
      };

      // Sky gradient
      const skyCanvas = document.createElement('canvas');
      skyCanvas.width = 2;
      skyCanvas.height = 256;
      const ctx = skyCanvas.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, pal.skyTop);
      grad.addColorStop(0.75, pal.skyBottom);
      grad.addColorStop(1, pal.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 2, 256);
      const skyTex = track(new THREE.CanvasTexture(skyCanvas));
      skyTex.colorSpace = THREE.SRGBColorSpace;
      scene.background = skyTex;
      scene.fog = new THREE.Fog(pal.fog, 55, 210);

      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 320);
      camera.position.set(0, 3.2, 15);
      const lookTarget = new THREE.Vector3(0, 6.5, -24);
      camera.lookAt(lookTarget);

      scene.add(new THREE.HemisphereLight(pal.skyBottom, pal.near, 1.15));
      const sun = new THREE.DirectionalLight(pal.sun, pal.sunIntensity);
      sun.position.set(-12, 18, 10);
      scene.add(sun);

      // Mountains: faceted ridges coloured per face (rock → snow).
      const noise = makeNoise(42);
      const ridge = (zCenter: number, amp: number, seedX: number, colorLow: string, snowLine: number) => {
        const geo = new THREE.PlaneGeometry(200, 44, 90, 22);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const back = THREE.MathUtils.clamp((22 - z) / 44, 0, 1); // 0 front → 1 back
          const n = noise(x * 0.045 + seedX, z * 0.07);
          const peaks = Math.pow(Math.abs(Math.sin(x * 0.055 + seedX)), 2.4);
          const h = Math.max(0, (n * 0.55 + 0.45) * 0.6 + peaks * 0.55) * amp * Math.pow(back, 1.1);
          pos.setY(i, h);
        }
        const flat = geo.toNonIndexed();
        geo.dispose();
        const p = flat.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const low = new THREE.Color(colorLow);
        const mid = new THREE.Color(pal.far);
        const snow = new THREE.Color(pal.snow);
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i += 3) {
          const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
          const t = y / amp;
          if (t > snowLine) c.copy(snow);
          else c.copy(low).lerp(mid, Math.min(1, t / snowLine));
          c.offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
          for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
        }
        flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        flat.computeVertexNormals();
        track(flat);
        const mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
        const mesh = new THREE.Mesh(flat, mat);
        mesh.position.z = zCenter;
        scene.add(mesh);
      };
      ridge(-78, 34, 3.1, pal.far, pal.snowLine);
      ridge(-44, 13, 9.7, pal.near, Math.min(0.95, pal.snowLine + 0.2));

      // Lake with gentle waves.
      const lakeGeo = track(new THREE.PlaneGeometry(220, 60, 70, 24));
      lakeGeo.rotateX(-Math.PI / 2);
      const lakeMat = track(new THREE.MeshStandardMaterial({ color: pal.lake, metalness: 0.15, roughness: 0.35, flatShading: true, emissive: pal.skyBottom, emissiveIntensity: 0.12 }));
      const lake = new THREE.Mesh(lakeGeo, lakeMat);
      lake.position.set(0, 0, -6);
      scene.add(lake);
      const lakePos = lakeGeo.attributes.position;
      const lakeBase = Float32Array.from({ length: lakePos.count * 2 }, (_, i) => (i % 2 === 0 ? lakePos.getX(i >> 1) : lakePos.getZ(i >> 1)));

      // Chinar trees on both shores.
      const trunkGeo = track(new THREE.CylinderGeometry(0.09, 0.16, 1.3, 6));
      const trunkMat = track(new THREE.MeshStandardMaterial({ color: '#5c3b23', flatShading: true }));
      const crownGeo = track(new THREE.IcosahedronGeometry(1, 0));
      const crownMats = pal.foliage.map((col) => track(new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.8 })));
      const treeSpots: [number, number][] = [[-15, -16], [-12.5, -19], [-10, -15], [-17.5, -21], [12, -17], [14.5, -20], [10.5, -21], [17, -16]];
      for (const [x, z] of treeSpots) {
        const s = 0.8 + rnd() * 0.7;
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, 0.65 * s, z);
        trunk.scale.setScalar(s);
        const crown = new THREE.Mesh(crownGeo, crownMats[Math.floor(rnd() * crownMats.length)]);
        crown.position.set(x, 1.9 * s, z);
        crown.scale.set(1.25 * s, 1.05 * s, 1.25 * s);
        crown.rotation.set(rnd(), rnd(), rnd());
        scene.add(trunk, crown);
      }

      // Shikara: a tapered walnut hull with a maroon canopy.
      const hullGeo = track(new THREE.BoxGeometry(2.8, 0.22, 0.62, 12, 1, 1));
      const hp = hullGeo.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i);
        const over = Math.max(0, Math.abs(x) - 0.9) / 0.5;
        hp.setZ(i, hp.getZ(i) * Math.max(0.08, 1 - over * 0.9));
        hp.setY(i, hp.getY(i) + over * over * 0.32);
      }
      hullGeo.computeVertexNormals();
      const shikara = new THREE.Group();
      shikara.add(new THREE.Mesh(hullGeo, track(new THREE.MeshStandardMaterial({ color: '#6b3b1f', flatShading: true, roughness: 0.7 }))));
      const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.36, 0.56)), track(new THREE.MeshStandardMaterial({ color: '#a61e3a', flatShading: true })));
      canopy.position.y = 0.42;
      const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.25, 0.06, 0.66)), track(new THREE.MeshStandardMaterial({ color: '#f2c14e', flatShading: true })));
      roof.position.y = 0.63;
      shikara.add(canopy, roof);
      shikara.position.set(4.5, 0.12, 2.5);
      shikara.rotation.y = 0.35;
      scene.add(shikara);

      // Clouds.
      const cloudGeo = track(new THREE.IcosahedronGeometry(1, 1));
      const cloudMat = track(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.55, transparent: true, opacity: 0.94 }));
      const clouds: InstanceType<typeof THREE.Group>[] = [];
      for (let i = 0; i < 5; i++) {
        const g = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const puff = new THREE.Mesh(cloudGeo, cloudMat);
          puff.position.set(k * 1.3 - 2, rnd() * 0.5, rnd() * 0.6);
          puff.scale.setScalar(0.9 + rnd() * 0.9);
          g.add(puff);
        }
        g.position.set(-40 + i * 20 + rnd() * 6, 15 + rnd() * 5, -48 - rnd() * 10);
        clouds.push(g);
        scene.add(g);
      }

      // Falling particles.
      type Drift = { x: number; y: number; z: number; vy: number; sway: number; freq: number; rx: number; ry: number; rz: number; sx: number; sy: number; phase: number };
      const drifts: Drift[] = [];
      const spawn = (initial: boolean): Drift => ({
        x: (rnd() - 0.5) * 30,
        y: initial ? rnd() * 13 : 13 + rnd() * 3,
        z: -14 + rnd() * 24,
        vy: pal.particle === 'snow' ? 0.5 + rnd() * 0.6 : 0.6 + rnd() * 0.7,
        sway: 0.4 + rnd() * 0.9,
        freq: 0.6 + rnd() * 1.1,
        rx: rnd() * Math.PI,
        ry: rnd() * Math.PI,
        rz: rnd() * Math.PI,
        sx: (rnd() - 0.5) * 2.4,
        sy: (rnd() - 0.5) * 2.4,
        phase: rnd() * Math.PI * 2,
      });
      for (let i = 0; i < particleCount; i++) drifts.push(spawn(true));

      let particleGeo: InstanceType<typeof THREE.ShapeGeometry> | InstanceType<typeof THREE.IcosahedronGeometry>;
      if (pal.particle === 'leaf') {
        const shape = new THREE.Shape();
        shape.moveTo((50 - 50) / 100, -(8 - 50) / 100);
        for (const [[c1x, c1y], [c2x, c2y], [ex, ey]] of LEAF_PATH) {
          shape.bezierCurveTo((c1x - 50) / 100, -(c1y - 50) / 100, (c2x - 50) / 100, -(c2y - 50) / 100, (ex - 50) / 100, -(ey - 50) / 100);
        }
        particleGeo = new THREE.ShapeGeometry(shape, 6);
        particleGeo.scale(0.6, 0.6, 0.6);
      } else if (pal.particle === 'petal') {
        const shape = new THREE.Shape();
        shape.absellipse(0, 0, 0.15, 0.09, 0, Math.PI * 2, false, 0);
        particleGeo = new THREE.ShapeGeometry(shape, 8);
      } else {
        particleGeo = new THREE.IcosahedronGeometry(0.06, 0);
      }
      track(particleGeo);
      const particleMat = track(
        // Unlit, so leaves keep their colour whichever side faces the camera.
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
      );
      const particles = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);
      const tint = new THREE.Color();
      for (let i = 0; i < particleCount; i++) particles.setColorAt(i, tint.set(pal.particles[i % pal.particles.length]));
      scene.add(particles);
      track(particles);
      const dummy = new THREE.Object3D();

      // Sizing, visibility, input.
      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = w / h < 1 ? 50 : 40;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(() => {
        resize();
        if (reduceMotion) renderer.render(scene, camera);
      });
      ro.observe(host);

      let onScreen = true;
      const io = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
      });
      io.observe(host);

      const pointer = { x: 0, y: 0 };
      const onPointer = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      };
      window.addEventListener('pointermove', onPointer, { passive: true });

      const clock = new THREE.Clock();
      let frame = 0;
      const tick = () => {
        frame = requestAnimationFrame(tick);
        if (!onScreen || document.hidden) {
          clock.getDelta();
          return;
        }
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

        for (let i = 0; i < lakePos.count; i++) {
          const x = lakeBase[i * 2];
          const z = lakeBase[i * 2 + 1];
          lakePos.setY(i, Math.sin(x * 0.35 + t * 0.9) * 0.05 + Math.cos(z * 0.5 + t * 0.7) * 0.04);
        }
        lakePos.needsUpdate = true;
        lakeGeo.computeVertexNormals();

        shikara.position.y = 0.12 + Math.sin(t * 1.3) * 0.05;
        shikara.rotation.z = Math.sin(t * 1.1) * 0.03;
        shikara.position.x = 4.5 + Math.sin(t * 0.08) * 2.5;

        for (const cl of clouds) {
          cl.position.x += dt * 0.6;
          if (cl.position.x > 55) cl.position.x = -55;
        }

        for (let i = 0; i < drifts.length; i++) {
          const d = drifts[i];
          d.y -= d.vy * dt;
          if (d.y < -0.2) drifts[i] = spawn(false);
          const dd = drifts[i];
          dd.rx += dd.sx * dt;
          dd.ry += dd.sy * dt;
          dummy.position.set(dd.x + Math.sin(t * dd.freq + dd.phase) * dd.sway, dd.y, dd.z);
          dummy.rotation.set(dd.rx, dd.ry, dd.rz);
          dummy.updateMatrix();
          particles.setMatrixAt(i, dummy.matrix);
        }
        particles.instanceMatrix.needsUpdate = true;

        camera.position.x += (pointer.x * 1.4 - camera.position.x) * 0.03;
        camera.position.y += (3.2 - pointer.y * 0.5 - camera.position.y) * 0.03;
        camera.lookAt(lookTarget);
        renderer.render(scene, camera);
      };

      if (reduceMotion) {
        for (let i = 0; i < drifts.length; i++) {
          const d = drifts[i];
          dummy.position.set(d.x, d.y, d.z);
          dummy.rotation.set(d.rx, d.ry, d.rz);
          dummy.updateMatrix();
          particles.setMatrixAt(i, dummy.matrix);
        }
        renderer.render(scene, camera);
      } else {
        tick();
      }
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener('pointermove', onPointer);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [mood, particleCount]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`absolute inset-0 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  );
}
