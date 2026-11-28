'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Box3, PerspectiveCamera, Sphere, Vector3, type Object3D } from 'three';

import { useCad } from '@/features/cad/state/CadStoreProvider';
import type { ViewCommand } from '@/features/cad/state/store';
import {
  EMPTY_SCENE_BOUNDS,
  VIEW_DIRECTIONS,
  WORLD_UP,
  clippingPlanes,
  fitView,
  type BoundingSphere,
  type Vec3,
} from '@/features/cad/utils/camera';
import { FIT_ROOT_NAME } from '@/features/cad/viewport/theme';

/** The parts of the orbit controls this rig uses. */
interface OrbitLike {
  target: Vector3;
  update: () => void;
  addEventListener: (type: 'change', listener: () => void) => void;
  removeEventListener: (type: 'change', listener: () => void) => void;
}

function boundsOf(root: Object3D | undefined): BoundingSphere {
  if (!root) return EMPTY_SCENE_BOUNDS;
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return EMPTY_SCENE_BOUNDS;
  const sphere = box.getBoundingSphere(new Sphere());
  return { center: [sphere.center.x, sphere.center.y, sphere.center.z], radius: Math.max(sphere.radius, 1) };
}

/**
 * Moves the camera when the workspace asks (fit view, standard views) and
 * keeps the clipping planes matched to the zoom. Renders nothing.
 */
export function CameraRig() {
  const get = useThree((s) => s.get);
  const controlsReady = useThree((s) => s.controls !== null);
  const command = useCad((s) => s.viewCommand);

  // Clipping follows the zoom.
  useEffect(() => {
    if (!controlsReady) return;
    const { controls } = get();
    const orbit = controls as unknown as OrbitLike;
    const onChange = () => {
      const { camera } = get();
      if (!(camera instanceof PerspectiveCamera)) return;
      const { near, far } = clippingPlanes(camera.position.distanceTo(orbit.target));
      if (Math.abs(camera.near - near) / near > 0.05 || camera.far !== far) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    };
    orbit.addEventListener('change', onChange);
    onChange();
    return () => orbit.removeEventListener('change', onChange);
  }, [controlsReady, get]);

  // Run camera requests; the first one, before any request, is the isometric overview.
  useEffect(() => {
    if (!controlsReady) return;
    const request: ViewCommand = command ?? { kind: 'preset', preset: 'iso' };
    const { camera, controls, scene, size, invalidate } = get();
    if (!(camera instanceof PerspectiveCamera)) return;
    const orbit = controls as unknown as OrbitLike;

    let direction: Vec3 = VIEW_DIRECTIONS.iso;
    if (request.kind === 'preset') {
      direction = VIEW_DIRECTIONS[request.preset];
    } else {
      const current = camera.position.clone().sub(orbit.target);
      if (current.lengthSq() > 1e-6) direction = [current.x, current.y, current.z];
    }

    const placement = fitView(boundsOf(scene.getObjectByName(FIT_ROOT_NAME)), direction, camera.fov, size.width / Math.max(size.height, 1));
    camera.up.set(...WORLD_UP);
    camera.position.set(...placement.position);
    orbit.target.set(...placement.target);
    camera.lookAt(orbit.target);
    orbit.update();
    invalidate();
  }, [command, controlsReady, get]);

  return null;
}
