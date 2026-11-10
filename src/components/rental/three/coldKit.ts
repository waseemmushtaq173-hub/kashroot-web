/**
 * The Blender kit, loaded once into whichever 3D cold-store view opens.
 *
 * coldstore_kit.glb (scripts/blender_generate_coldstore.py, Blender
 * 5.2.3 LTS) holds six real-world prototypes — the ventilated HDPE crate,
 * the wooden pallet bin, the booked-crate apple crown, the rack post and
 * beam and the triple-fan evaporator. Every proto is cloned and squeezed
 * into the unit cube (centred on X/Z, standing on Y=0): meshes that draw
 * with a unit-box matrix keep working, they just stop looking like cubes.
 *
 * Kit piece coordinates are Z-up (Blender): per-axis scaling keeps every
 * proto filling exactly [0..1] on all three axes, so the web's own level
 * stacks and the instance matrices already in place keep their meaning.
 *
 * Any failure (404, a parse error, a slow network) resolves to null and the
 * scene keeps its own procedural shapes, exactly as they drew before.
 */
'use client';

import type * as Three from 'three';

export type KitGeo = Three.BufferGeometry;

export interface ColdKitGeos {
  crate: KitGeo;
  bin: KitGeo;
  apples: KitGeo;
  post: KitGeo;
  beam: KitGeo;
  evap: KitGeo;
}

type ProtoKey = keyof ColdKitGeos;

/** Node names exactly as the Blender script exports them. */
const NODE: Record<ProtoKey, RegExp> = {
  crate: /^Kit_Crate_HDPE$/,
  bin: /^Kit_Pallet_Bin$/,
  apples: /^Kit_Apples_Cluster$/,
  post: /^Kit_Rack_Post$/,
  beam: /^Kit_Rack_Beam$/,
  evap: /^Kit_Evaporator$/,
};

/** Squeeze a geometry into the unit cube: centres X/Z, foot on Y=0. */
function squeeze(geo: KitGeo): KitGeo {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return geo;
  const sx = Math.max(1e-6, bb.max.x - bb.min.x);
  const sy = Math.max(1e-6, bb.max.y - bb.min.y);
  const sz = Math.max(1e-6, bb.max.z - bb.min.z);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(1 / sx, 1 / sy, 1 / sz);
  geo.computeBoundingBox();
  return geo;
}

/** Resolved when `p` settles, or null if `ms` passes first. */
function softWait<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);
}

/**
 * Load the kit GLB and hand back the six squeezed protos, or null when
 * anything fails or takes too long. The 3D views keep their procedural kit
 * then, unchanged — nothing in the scene waits on a wide network.
 */
export async function loadColdKitGeo(
  T: typeof Three,
  url = '/models/coldstore_kit.glb',
  timeoutMs = 8000,
): Promise<ColdKitGeos | null> {
  try {
    return await softWait(
      (async () => {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`kit ${res.status}`);
        const buf = await res.arrayBuffer();
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const gltf = await new Promise<{ scene: Three.Group }>((ok, bad) =>
          new GLTFLoader().parse(buf, '', (g: { scene: Three.Group }) => ok(g), (e: unknown) => bad(e instanceof Error ? e : new Error('kit parse'))),
        );
        const found: Partial<Record<ProtoKey, KitGeo>> = {};
        gltf.scene.traverse((o) => {
          const mesh = o as unknown as Three.Mesh;
          if (!mesh.isMesh) return;
          for (const key of Object.keys(NODE) as ProtoKey[]) {
            if (NODE[key].test(o.name) && !found[key]) found[key] = (mesh.geometry as KitGeo).clone();
          }
        });
        if (!found.crate || !found.bin || !found.apples || !found.post || !found.beam || !found.evap) return null;
        return {
          crate: squeeze(found.crate),
          bin: squeeze(found.bin),
          apples: squeeze(found.apples),
          post: squeeze(found.post),
          beam: squeeze(found.beam),
          evap: squeeze(found.evap),
        } satisfies ColdKitGeos;
      })(),
      timeoutMs,
    );
  } catch {
    return null;
  }
}
