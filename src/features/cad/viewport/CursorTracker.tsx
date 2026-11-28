'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

import { useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import { roundMm } from '@/features/cad/types/units';
import { snapPoint } from '@/features/cad/utils/grid';

/** Beyond 10 km the pointer is near the horizon and the reading means nothing. */
const MAX_READING_MM = 10_000_000;

/**
 * Reports where the pointer meets the floor (the XY plane, z = 0), snapped
 * to the grid when snapping is on. At most once per animation frame.
 */
export function CursorTracker() {
  const api = useCadStoreApi();
  const get = useThree((s) => s.get);

  useEffect(() => {
    const element = get().gl.domElement;
    const raycaster = new Raycaster();
    const floor = new Plane(new Vector3(0, 0, 1), 0);
    const hit = new Vector3();
    const pointer = new Vector2();
    let frame = 0;
    let last: PointerEvent | null = null;

    const update = () => {
      frame = 0;
      const state = api.getState();
      if (!last) return;
      const rect = element.getBoundingClientRect();
      pointer.set(((last.clientX - rect.left) / rect.width) * 2 - 1, -((last.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, get().camera);
      const p = raycaster.ray.intersectPlane(floor, hit);
      if (!p || Math.abs(p.x) > MAX_READING_MM || Math.abs(p.y) > MAX_READING_MM) {
        state.setCursor(null);
        return;
      }
      state.setCursor(state.snap ? snapPoint({ x: p.x, y: p.y }, state.gridMm) : { x: roundMm(Math.round(p.x)), y: roundMm(Math.round(p.y)) });
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      last = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      api.getState().setCursor(null);
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [api, get]);

  return null;
}
