/**
 * Design Studio workspace logic: grid snapping, datum planes, camera maths,
 * the toolbar's phase labels and the workspace store. Pure: no browser.
 * Run: npx playwright test tests/cad-model.spec.ts
 */
import { expect, test } from '@playwright/test';

import { DATUM_PLANES, axisName, datumById, planeYAxis } from '@/features/cad/datums';
import { createCadStore } from '@/features/cad/state/store';
import { CURRENT_PHASE, TOOLS, isToolAvailable } from '@/features/cad/tools';
import {
  EMPTY_SCENE_BOUNDS,
  VIEW_DIRECTIONS,
  clippingPlanes,
  cross,
  fitDistance,
  fitView,
  length,
  normalize,
  type Vec3,
} from '@/features/cad/utils/camera';
import { isValidGridSpacing, majorSpacing, snap, snapPoint } from '@/features/cad/utils/grid';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function expectVec(actual: Vec3, expected: Vec3) {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]), `${actual} vs ${expected}`).toBeLessThan(1e-9));
}

test.describe('grid snapping', () => {
  test('snaps to the nearest line in both directions', () => {
    expect(snap(149, 100)).toBe(100);
    expect(snap(151, 100)).toBe(200);
    expect(snap(-149, 100)).toBe(-100);
    expect(snapPoint({ x: 1049, y: -951 }, 100)).toEqual({ x: 1000, y: -1000 });
  });

  test('gives clean numbers: no minus zero, no float noise', () => {
    expect(Object.is(snap(-10, 100), 0)).toBe(true);
    expect(snap(0.1 + 0.2, 0.1)).toBe(0.3);
  });

  test('leaves the value alone when the step cannot be used', () => {
    expect(snap(1234.5678, 0)).toBe(1234.568);
    expect(snap(1234.5678, Number.NaN)).toBe(1234.568);
  });

  test('checks grid spacing limits', () => {
    expect(majorSpacing(100)).toBe(1000);
    expect(isValidGridSpacing(1)).toBe(true);
    expect(isValidGridSpacing(10_000)).toBe(true);
    for (const bad of [0, -100, 0.5, 10_001, Number.NaN, Infinity]) expect(isValidGridSpacing(bad), String(bad)).toBe(false);
  });
});

test.describe('datum planes', () => {
  test('match Replicad 1.2.1 named planes exactly', () => {
    // Copied from replicad's plane table: { dir, xAxis } for XY, XZ and YZ.
    const replicad = { XY: { dir: [0, 0, 1], xAxis: [1, 0, 0] }, XZ: { dir: [0, -1, 0], xAxis: [1, 0, 0] }, YZ: { dir: [1, 0, 0], xAxis: [0, 1, 0] } } as const;
    expect(DATUM_PLANES.map((p) => p.replicadName)).toEqual(['XY', 'XZ', 'YZ']);
    for (const p of DATUM_PLANES) {
      expectVec(p.normal, replicad[p.replicadName].dir);
      expectVec(p.xAxis, replicad[p.replicadName].xAxis);
    }
  });

  test('each plane has a right-handed, orthonormal axis set', () => {
    for (const p of DATUM_PLANES) {
      const y = planeYAxis(p);
      expect(dot(p.xAxis, p.normal)).toBe(0);
      expect(length(y)).toBeCloseTo(1, 12);
      expectVec(cross(p.xAxis, y), p.normal);
    }
    expectVec(planeYAxis(datumById('plane-xy')), [0, 1, 0]);
    expectVec(planeYAxis(datumById('plane-xz')), [0, 0, 1]);
    expectVec(planeYAxis(datumById('plane-yz')), [0, 0, 1]);
  });

  test('names axes for the properties panel', () => {
    expect(axisName([0, 0, 1])).toBe('+Z');
    expect(axisName([0, -1, 0])).toBe('−Y');
  });
});

test.describe('camera', () => {
  test('standard views point the right way in a Z-up world', () => {
    for (const d of Object.values(VIEW_DIRECTIONS)) expect(length(d)).toBeCloseTo(1, 12);
    expectVec(VIEW_DIRECTIONS.front, [0, -1, 0]);
    expectVec(VIEW_DIRECTIONS.right, [1, 0, 0]);
    expect(VIEW_DIRECTIONS.top[2]).toBeGreaterThan(0.999);
    expect(VIEW_DIRECTIONS.top[1]).toBeLessThan(0);
    expect(VIEW_DIRECTIONS.iso.every((c) => Math.abs(Math.abs(c) - 1 / Math.sqrt(3)) < 1e-12)).toBe(true);
  });

  test('fit distance keeps the whole model in view at any window shape', () => {
    for (const radius of [10, 1500, 20_000]) {
      for (const aspect of [0.5, 1, 1.6, 3]) {
        const d = fitDistance(radius, 40, aspect);
        const vertical = (40 * Math.PI) / 180;
        const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
        const subtended = Math.asin(radius / d);
        expect(subtended, `r=${radius} aspect=${aspect}`).toBeLessThanOrEqual(Math.min(vertical, horizontal) / 2 + 1e-12);
      }
    }
    expect(fitDistance(2000, 40, 1.6)).toBeCloseTo(2 * fitDistance(1000, 40, 1.6), 6);
    expect(fitDistance(1000, 40, 0.5)).toBeGreaterThan(fitDistance(1000, 40, 2));
  });

  test('fit places the camera along the asked direction', () => {
    const placement = fitView(EMPTY_SCENE_BOUNDS, VIEW_DIRECTIONS.iso, 40, 1.6);
    expectVec(placement.target, EMPTY_SCENE_BOUNDS.center);
    expectVec(normalize(placement.position), VIEW_DIRECTIONS.iso);
  });

  test('clipping planes follow the zoom and stay valid', () => {
    for (const distance of [0, 10, 1000, 5000, 100_000, 2_000_000]) {
      const { near, far } = clippingPlanes(distance);
      expect(near, String(distance)).toBeGreaterThan(0);
      expect(far, String(distance)).toBeGreaterThan(near);
      expect(far).toBeGreaterThanOrEqual(200_000);
      if (distance >= 10) expect(near).toBeLessThan(distance);
    }
  });

  test('refuses to normalise a zero vector', () => {
    expect(() => normalize([0, 0, 0])).toThrow();
  });
});

test.describe('toolbar phases', () => {
  test('every tool the workspace promises is listed once, with a real phase', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['new', 'open', 'save', 'undo', 'redo', 'select', 'sketch', 'extrude', 'revolve', 'box', 'cylinder', 'union', 'cut', 'intersect', 'measure', 'fit', 'grid', 'axes', 'export', 'settings']) {
      expect(ids, id).toContain(id);
    }
    for (const t of TOOLS) {
      expect(t.phase, t.id).toBeGreaterThanOrEqual(1);
      expect(t.phase, t.id).toBeLessThanOrEqual(7);
      expect(t.hint.length, t.id).toBeGreaterThan(10);
    }
  });

  test('phase 1 enables only the tools that work', () => {
    // Raise this list together with CURRENT_PHASE, never ahead of the code.
    expect(CURRENT_PHASE).toBe(1);
    expect(TOOLS.filter((t) => isToolAvailable(t)).map((t) => t.id)).toEqual(['select', 'fit', 'grid', 'axes', 'settings']);
  });
});

test.describe('workspace store', () => {
  test('starts with the defaults the workspace documents', () => {
    const s = createCadStore().getState();
    expect(s.selection).toBeNull();
    expect(s.showGrid && s.showAxes && s.snap).toBe(true);
    expect(s.gridMm).toBe(100);
    expect(Object.values(s.datumVisible)).toEqual([true, true, true]);
    expect(s.panels).toEqual({ tree: true, inspector: true });
    expect(createCadStore({ compact: true }).getState().panels).toEqual({ tree: false, inspector: false });
  });

  test('a hidden plane cannot stay selected or hovered, or be selected', () => {
    const store = createCadStore();
    store.getState().select({ kind: 'datum', id: 'plane-xz' });
    store.getState().setHover({ kind: 'datum', id: 'plane-xz' });
    store.getState().setDatumVisible('plane-xz', false);
    expect(store.getState().selection).toBeNull();
    expect(store.getState().hover).toBeNull();
    store.getState().select({ kind: 'datum', id: 'plane-xz' });
    expect(store.getState().selection).toBeNull();
    store.getState().select({ kind: 'datum', id: 'plane-xy' });
    store.getState().setAllDatumsVisible(false);
    expect(store.getState().selection).toBeNull();
  });

  test('refuses grid spacing outside 1 mm to 10 m and keeps the old value', () => {
    const store = createCadStore();
    for (const bad of [0, -50, Number.NaN, 20_000]) {
      expect(store.getState().setGridMm(bad), String(bad)).toBe(false);
      expect(store.getState().gridMm).toBe(100);
    }
    expect(store.getState().setGridMm(50)).toBe(true);
    expect(store.getState().gridMm).toBe(50);
  });

  test('asking for the same view twice runs it twice', () => {
    const store = createCadStore();
    store.getState().requestView({ kind: 'fit' });
    const first = store.getState().viewCommand?.seq;
    store.getState().requestView({ kind: 'fit' });
    expect(store.getState().viewCommand?.seq).toBe((first ?? 0) + 1);
  });

  test('an unchanged pointer position does not wake the screen', () => {
    const store = createCadStore();
    let updates = 0;
    store.subscribe(() => updates++);
    store.getState().setCursor({ x: 100, y: 200 });
    store.getState().setCursor({ x: 100, y: 200 });
    store.getState().select(null);
    store.getState().setHover(null);
    expect(updates).toBe(1);
  });
});
