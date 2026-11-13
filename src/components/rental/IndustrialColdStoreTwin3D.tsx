// src/components/rental/IndustrialColdStoreTwin3D.tsx
'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

export type StorageUnitMode = 'WOODEN_BIN' | 'PLASTIC_CRATE';
export type CorridorLayoutMode = 'LEFT_SIDE' | 'RIGHT_SIDE' | 'BOTH_SIDES' | 'CUSTOM';

export interface StorageSlotRecord {
  slotKey: string;
  facilityCode: string;
  chamberCode: string;
  chamberName: string;
  levelIndex: number;
  levelCode: string;
  row: number;
  col: number;
  unitCode: string;
  unitType: StorageUnitMode;
  capacityKg: number;
  storedKg: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'PENDING_PAYMENT' | 'MY_BOOKING';
  farmerName?: string;
  bookingDate?: string;
  temperatureC?: number;
  temperatureSource?: 'MANUAL_ENTRY' | 'IOT_SENSOR' | 'NONE';
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface Chamber3DConfig {
  id: string;
  code: string;
  name: string;
  side: 'LEFT' | 'RIGHT' | 'BACK' | 'FRONT';
  lengthM: number;
  widthM: number;
  heightM: number;
  levels: number;
  unitType: StorageUnitMode;
  unitCapacityKg: number;
  unitLengthM: number;
  unitWidthM: number;
  unitHeightM: number;
  spacingM: number;
  /** The owner's own chamber code from cold_chambers.chamber_code, when they saved one. */
  chamberCode?: string;
  temperatureC?: number;
  temperatureSource?: 'MANUAL_ENTRY' | 'IOT_SENSOR' | 'NONE';
}

/**
 * The batching tier for massive facilities (Al Noor generates tens of
 * thousands of unit slots): past 1,500 units the twin draws 1,000 evenly
 * spread representative units instead — one procedural THREE.BoxGeometry
 * instanced mesh either way, so the WebGL context never drowns (the
 * directive's hard ceiling: an InstancedMesh never holds more than 1,500
 * stacks) — and an honest badge over the canvas says exactly how many the
 * store really holds.
 */
// The directive's hard ceiling: never more than 1,200 visible stacks
// (1,000 are drawn past the trigger, the rest stay representative).
const SLOT_CAP_TRIGGER = 1200;
const SLOT_CAP_SHOWN = 1000;

export interface IndustrialColdStoreTwinProps {
  facilityCode: string;
  facilityName: string;
  buildingLengthM: number;
  buildingWidthM: number;
  buildingHeightM: number;
  corridorLayout: CorridorLayoutMode;
  chambers: Chamber3DConfig[];
  occupiedAllocations?: Record<
    string,
    { storedKg: number; farmerName: string; isCurrentFarmer?: boolean; bookingDate?: string }
  >;
  selectedSlotKeys: string[];
  onToggleSelectSlot: (slot: StorageSlotRecord) => void;
}

export function IndustrialColdStoreTwin3D({
  facilityCode = '',
  facilityName,
  buildingLengthM,
  buildingWidthM,
  buildingHeightM,
  corridorLayout = 'BOTH_SIDES',
  chambers,
  occupiedAllocations = {},
  selectedSlotKeys,
  onToggleSelectSlot,
}: IndustrialColdStoreTwinProps) {
  const [activeChamberId, setActiveChamberId] = useState<string | 'ALL'>('ALL');
  const [activeLevel, setActiveLevel] = useState<number | 'ALL'>('ALL');
  const [wallMode, setWallMode] = useState<'SOLID' | 'TRANSPARENT' | 'CUTAWAY'>('TRANSPARENT');
  const [inspectedSlot, setInspectedSlot] = useState<StorageSlotRecord | null>(null);

  const operationalBayDepthM = 8.0;
  const corridorWidthM = 4.0;

  const { safeLengthM, safeWidthM, safeHeightM, chamberPlacements, allSlots, corridorCenterX, corridorLenX, bayCenterX } = useMemo(() => {
    const leftChambers = chambers.filter((c) => c.side === 'LEFT');
    const rightChambers = chambers.filter((c) => c.side === 'RIGHT');
    const backChambers = chambers.filter((c) => c.side === 'BACK');
    const frontChambers = chambers.filter((c) => c.side === 'FRONT');

    const sumLen = (arr: Chamber3DConfig[]) =>
      arr.reduce((acc, c) => acc + c.lengthM + 0.6, 0);

    // Dynamic multi-wall banks (supplementary directive): a BACK or FRONT
    // chamber stands across the far or entrance wall — its own widthM is the
    // depth into the building and its lengthM runs along that wall, so the
    // bank stacks along Z and the corridor between the walls stays clear.
    const frontDepthM = frontChambers.reduce((m, c) => Math.max(m, c.widthM), 0);
    const backDepthM = backChambers.reduce((m, c) => Math.max(m, c.widthM), 0);
    const runSpanM = Math.max(sumLen(leftChambers), sumLen(rightChambers));

    const neededLength = Math.max(
      buildingLengthM,
      runSpanM + operationalBayDepthM + 4,
      frontDepthM + operationalBayDepthM + runSpanM + backDepthM + 8,
      frontDepthM + backDepthM + 14
    );
    const maxLeftW = leftChambers.reduce((m, c) => Math.max(m, c.widthM), 0);
    const maxRightW = rightChambers.reduce((m, c) => Math.max(m, c.widthM), 0);
    const neededWidth = Math.max(
      buildingWidthM,
      maxLeftW + maxRightW + corridorWidthM + 3,
      sumLen(backChambers) + 2,
      sumLen(frontChambers) + 2
    );
    const neededHeight = Math.max(
      buildingHeightM,
      chambers.reduce((m, c) => Math.max(m, c.heightM), 7) + 1.2
    );

    const placements: Array<Chamber3DConfig & { centerX: number; centerZ: number; rotated: boolean }> = [];
    const generatedSlots: StorageSlotRecord[] = [];

    // The run the left/right banks occupy: after the front bank and the hall
    // bay, and stopping short of the back bank.
    const frontInnerX = -neededLength / 2 + frontDepthM;
    const backInnerX = neededLength / 2 - backDepthM;
    const runStartX = frontInnerX + operationalBayDepthM + 1.5;

    let cursorLeftX = runStartX;
    let cursorRightX = runStartX;
    let cursorBackZ = -neededWidth / 2 + 1.0;
    let cursorFrontZ = -neededWidth / 2 + 1.0;

    chambers.forEach((ch) => {
      const rotated = ch.side === 'BACK' || ch.side === 'FRONT';
      let cx: number;
      let cz: number;
      if (ch.side === 'BACK') {
        // Along the far wall: the length runs along Z, the depth hugs the +X wall.
        cz = cursorBackZ + ch.lengthM / 2;
        cx = neededLength / 2 - 0.3 - ch.widthM / 2;
        cursorBackZ += ch.lengthM + 0.6;
      } else if (ch.side === 'FRONT') {
        // Along the entrance wall: the length runs along Z, the depth hugs the −X wall.
        cz = cursorFrontZ + ch.lengthM / 2;
        cx = -neededLength / 2 + 0.3 + ch.widthM / 2;
        cursorFrontZ += ch.lengthM + 0.6;
      } else {
        const isLeft = ch.side === 'LEFT';
        cx = (isLeft ? cursorLeftX : cursorRightX) + ch.lengthM / 2;
        cz = isLeft
          ? -(corridorWidthM / 2 + ch.widthM / 2)
          : corridorWidthM / 2 + ch.widthM / 2;
        if (isLeft) cursorLeftX += ch.lengthM + 0.6;
        else cursorRightX += ch.lengthM + 0.6;
      }

      placements.push({ ...ch, centerX: cx, centerZ: cz, rotated });

      const stepX = ch.unitLengthM + ch.spacingM;
      const stepZ = ch.unitWidthM + ch.spacingM;
      const stepY = ch.unitHeightM + 0.14;

      const cols = Math.max(1, Math.floor((ch.lengthM - 1.4) / stepX));
      const rows = Math.max(1, Math.floor((ch.widthM - 1.4) / stepZ));
      const levels = Math.max(1, Math.min(ch.levels || 4, 10));

      let unitCounter = 1;
      for (let lvl = 1; lvl <= levels; lvl++) {
        for (let r = 1; r <= rows; r++) {
          for (let c = 1; c <= cols; c++) {
            const prefix = ch.unitType === 'WOODEN_BIN' ? 'BIN' : 'CRATE';
            const unitCode = `${prefix}-${String(unitCounter).padStart(3, '0')}`;
            const levelCode = `LEVEL-${String(lvl).padStart(2, '0')}`;
            const slotKey = `${ch.code}:${levelCode}:${unitCode}`;

            // Local grid coordinates; BACK/FRONT chambers turn them with the
            // shell (length along Z, depth along X) while the slot keys stay
            // per-chamber, so the "3B" place identity is untouched.
            const lx = -ch.lengthM / 2 + 0.9 + (c - 0.5) * stepX;
            const lz = -ch.widthM / 2 + 0.9 + (r - 0.5) * stepZ;
            const wx = rotated ? (ch.side === 'BACK' ? cx - lz : cx + lz) : cx + lx;
            const wz = rotated ? cz + lx : cz + lz;
            const wy = (lvl - 0.5) * stepY + 0.08;

            const alloc = occupiedAllocations[slotKey];
            generatedSlots.push({
              slotKey,
              facilityCode,
              chamberCode: ch.code,
              chamberName: ch.name,
              levelIndex: lvl,
              levelCode,
              row: r,
              col: c,
              unitCode,
              unitType: ch.unitType,
              capacityKg: ch.unitCapacityKg || (ch.unitType === 'WOODEN_BIN' ? 200 : 16.5),
              storedKg: alloc ? alloc.storedKg : 0,
              status: alloc
                ? alloc.isCurrentFarmer
                  ? 'MY_BOOKING'
                  : 'OCCUPIED'
                : 'AVAILABLE',
              farmerName: alloc?.farmerName,
              bookingDate: alloc?.bookingDate,
              temperatureC: ch.temperatureC,
              temperatureSource: ch.temperatureSource || 'NONE',
              worldX: wx,
              worldY: wy,
              worldZ: wz,
            });
            unitCounter++;
          }
        }
      }
    });

    // The corridor strip runs between the front bank's inner face and the
    // back bank's inner face (the whole span when neither bank exists).
    const corridorStartX = Math.max(frontInnerX, -neededLength / 2) + 6;
    const corridorEndX = Math.min(backInnerX, neededLength / 2) - 2;

    return {
      safeLengthM: neededLength,
      safeWidthM: neededWidth,
      safeHeightM: neededHeight,
      chamberPlacements: placements,
      allSlots: generatedSlots,
      corridorCenterX: (corridorStartX + corridorEndX) / 2,
      corridorLenX: Math.max(4, corridorEndX - corridorStartX),
      // The receiving bay floor sits right after the front bank (at the
      // entrance wall when there is none).
      bayCenterX: frontInnerX + 4,
    };
  }, [
    buildingLengthM,
    buildingWidthM,
    buildingHeightM,
    chambers,
    occupiedAllocations,
    facilityCode,
  ]);

  const visibleSlots = useMemo(() => {
    return allSlots.filter((s) => {
      if (activeChamberId !== 'ALL' && s.chamberCode !== activeChamberId) return false;
      if (activeLevel !== 'ALL' && s.levelIndex !== activeLevel) return false;
      return true;
    });
  }, [allSlots, activeChamberId, activeLevel]);

  // The safety cap: past 2,000 units in this view, draw a stride sample of
  // 1,000 representative units (the full spread of chambers and levels stays
  // covered) and remember the view's true totals for the badge. Clicks map
  // through the same array order, so picking a unit in 3D keeps working.
  const capped = useMemo(() => {
    if (visibleSlots.length <= SLOT_CAP_TRIGGER) {
      return { slots: visibleSlots, summary: null as null | { shown: number; total: number; kg: number } };
    }
    const stride = Math.ceil(visibleSlots.length / SLOT_CAP_SHOWN);
    const sampled: StorageSlotRecord[] = [];
    for (let i = 0; i < visibleSlots.length && sampled.length < SLOT_CAP_SHOWN; i += stride) sampled.push(visibleSlots[i]);
    const kg = visibleSlots.reduce((n, s) => n + s.capacityKg, 0);
    return { slots: sampled, summary: { shown: sampled.length, total: visibleSlots.length, kg } };
  }, [visibleSlots]);

  const maxLevels = useMemo(
    () => chambers.reduce((m, c) => Math.max(m, c.levels || 4), 4),
    [chambers]
  );

  // The owner's own chamber code (cold_chambers.chamber_code) behind the inspected slot, when they saved one.
  const inspectedChamber = inspectedSlot ? chambers.find((ch) => ch.code === inspectedSlot.chamberCode) ?? null : null;

  return (
    <div className="w-full rounded-2xl border border-emerald-900/15 bg-slate-950 text-white overflow-hidden shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-emerald-950/90 border-b border-emerald-800/40 text-xs">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Which chamber to show">
          <span className="font-semibold text-emerald-300 mr-1">
            {facilityCode ? `${facilityCode} · ` : ''}{facilityName}:
          </span>
          <button
            type="button"
            aria-pressed={activeChamberId === 'ALL'}
            onClick={() => setActiveChamberId('ALL')}
            className={`px-2.5 py-1 rounded-full transition ${
              activeChamberId === 'ALL'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            All Chambers ({chambers.length})
          </button>
          {chambers.map((ch) => (
            <button
              key={ch.id}
              type="button"
              aria-pressed={activeChamberId === ch.code}
              onClick={() => setActiveChamberId(ch.code)}
              className={`px-2.5 py-1 rounded-full transition ${
                activeChamberId === ch.code
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {ch.code} ({ch.unitType === 'WOODEN_BIN' ? `${Math.round(ch.unitCapacityKg)}kg Bins` : `${Math.round(ch.unitCapacityKg)}kg Blue Crates`})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Which level to show">
          <span className="text-emerald-300">Level:</span>
          <button
            type="button"
            aria-pressed={activeLevel === 'ALL'}
            onClick={() => setActiveLevel('ALL')}
            className={`px-2 py-1 rounded ${
              activeLevel === 'ALL' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-white/10'
            }`}
          >
            All
          </button>
          {Array.from({ length: maxLevels }, (_, i) => i + 1).map((lvl) => (
            <button
              key={lvl}
              type="button"
              aria-pressed={activeLevel === lvl}
              onClick={() => setActiveLevel(lvl)}
              className={`px-2 py-1 rounded ${
                activeLevel === lvl ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-white/10'
              }`}
            >
              L{lvl}
            </button>
          ))}

          <span className="mx-1 text-emerald-700">|</span>

          <div role="group" aria-label="Wall view" className="flex flex-wrap items-center gap-1.5">
          {(['SOLID', 'TRANSPARENT', 'CUTAWAY'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={wallMode === mode}
              onClick={() => setWallMode(mode)}
              className={`px-2.5 py-1 rounded-full ${
                wallMode === mode
                  ? 'bg-sky-400 text-slate-950 font-semibold'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {mode === 'SOLID' ? 'Solid Walls' : mode === 'TRANSPARENT' ? 'X-Ray Walls' : 'Cutaway'}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="relative w-full h-[540px] bg-gradient-to-b from-slate-900 to-slate-950">
        <Canvas shadows camera={{ position: [0, safeHeightM * 1.8, safeWidthM * 1.4], fov: 45 }}>
          <ambientLight intensity={0.65} />
          <directionalLight
            castShadow
            position={[safeLengthM * 0.5, safeHeightM * 2, safeWidthM * 0.8]}
            intensity={1.2}
          />

          <mesh position={[0, -0.15, 0]} receiveShadow>
            <boxGeometry args={[safeLengthM, 0.3, safeWidthM]} />
            <meshStandardMaterial color="#475569" roughness={0.85} />
          </mesh>

          <mesh position={[bayCenterX, 0.02, 0]} receiveShadow>
            <boxGeometry args={[7.5, 0.04, safeWidthM - 1]} />
            <meshStandardMaterial color="#0f766e" roughness={0.6} />
          </mesh>

          <mesh position={[corridorCenterX, 0.02, 0]} receiveShadow>
            <boxGeometry args={[corridorLenX, 0.03, corridorWidthM]} />
            <meshStandardMaterial color="#eab308" roughness={0.5} />
          </mesh>

          {chamberPlacements.map((ch) => {
            if (wallMode === 'CUTAWAY') return null;
            const opacity = wallMode === 'TRANSPARENT' ? 0.22 : 0.95;
            return (
              <group key={ch.id} position={[ch.centerX, ch.heightM / 2, ch.centerZ]}>
                <mesh>
                  <boxGeometry
                    args={ch.rotated ? [ch.widthM, ch.heightM, ch.lengthM] : [ch.lengthM, ch.heightM, ch.widthM]}
                  />
                  <meshStandardMaterial
                    color="#e2e8f0"
                    transparent={wallMode === 'TRANSPARENT'}
                    opacity={opacity}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </group>
            );
          })}

          {/* Ceiling LED strip luminaires — two per chamber and the corridor
              hall (visual requirement #6: lights in, fans out; CA blower unit
              coolers stay on the corridor wall, out of the fruit airspace). */}
          {chamberPlacements.map((ch) => (
            <group key={`led-${ch.id}`} position={[ch.centerX, ch.heightM - 0.22, ch.centerZ]}>
              {[-0.22, 0.22].map((off) => (
                <mesh
                  key={off}
                  position={ch.rotated ? [off * ch.widthM, 0, 0] : [0, 0, off * ch.widthM]}
                >
                  <boxGeometry
                    args={ch.rotated ? [0.15, 0.06, ch.lengthM * 0.6] : [ch.lengthM * 0.6, 0.06, 0.15]}
                  />
                  <meshStandardMaterial
                    color="#fffbe8"
                    emissive="#fff1b8"
                    emissiveIntensity={1.4}
                    roughness={0.4}
                  />
                </mesh>
              ))}
            </group>
          ))}
          {[-corridorWidthM / 4, corridorWidthM / 4].map((off) => (
            <mesh key={`led-hall-${off}`} position={[corridorCenterX, safeHeightM - 0.3, off]}>
              <boxGeometry args={[Math.max(6, corridorLenX * 0.7), 0.06, 0.15]} />
              <meshStandardMaterial
                color="#fffbe8"
                emissive="#fff1b8"
                emissiveIntensity={1.4}
                roughness={0.4}
              />
            </mesh>
          ))}

          <InstancedStorageUnits
            slots={capped.slots}
            selectedSlotKeys={selectedSlotKeys}
            onSelectSlot={(slot) => {
              setInspectedSlot(slot);
              onToggleSelectSlot(slot);
            }}
          />

          {inspectedSlot && (
            <Html
              position={[
                inspectedSlot.worldX,
                inspectedSlot.worldY + 0.9,
                inspectedSlot.worldZ,
              ]}
              center
            >
              <div className="w-64 rounded-xl bg-slate-950/95 border border-emerald-400/60 p-3 text-xs text-white shadow-2xl pointer-events-auto">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5">
                  <span className="font-bold text-emerald-400">
                    {inspectedSlot.facilityCode} → {inspectedSlot.chamberCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectedSlot(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1 text-[11px]">
                  {inspectedChamber?.chamberCode && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Owner code:</span>
                      <span className="font-semibold">{inspectedChamber.chamberCode}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Level / Unit:</span>
                    <span className="font-semibold">
                      {inspectedSlot.levelCode} · {inspectedSlot.unitCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Position:</span>
                    <span>
                      Row {inspectedSlot.row}, Column {inspectedSlot.col} · level {inspectedSlot.levelIndex} of {inspectedChamber?.levels ?? inspectedSlot.levelIndex}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Storage Type:</span>
                    <span>
                      {inspectedSlot.unitType === 'WOODEN_BIN'
                        ? 'Wooden Apple Bin'
                        : 'Blue Plastic Crate'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Capacity:</span>
                    <span>{inspectedSlot.capacityKg} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stored Quantity:</span>
                    <span>{inspectedSlot.storedKg} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Farmer:</span>
                    <span className="text-amber-300">
                      {inspectedSlot.farmerName || 'Available (Unbooked)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Chamber Temp:</span>
                    <span>
                      {typeof inspectedSlot.temperatureC === 'number'
                        ? `${inspectedSlot.temperatureC.toFixed(1)}°C (${
                            inspectedSlot.temperatureSource === 'IOT_SENSOR'
                              ? 'IoT Sensor'
                              : 'Manual Reading'
                          })`
                        : 'No sensor reading recorded'}
                    </span>
                  </div>
                </div>
              </div>
            </Html>
          )}

          <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={safeLengthM * 1.5} blur={2} />
          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.04} />
        </Canvas>
        {capped.summary && (
          <p role="status" className="pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto w-fit max-w-full rounded-full bg-slate-950/80 px-3.5 py-1.5 text-center text-[11px] font-semibold text-emerald-200 shadow-lg ring-1 ring-emerald-500/30">
            Showing optimized 3D instanced view of {capped.summary.total.toLocaleString('en-IN')} storage units · {capped.summary.kg.toLocaleString('en-IN')} kg total capacity
          </p>
        )}
      </div>

      {/* Quick Unit & Level Selector Bar — every unit the view shows, as real
          buttons: Tab to move, Enter or Space to choose, exactly like tapping
          the unit in the 3D view. Screen readers hear the unit code, its kind
          and capacity, and whether it is free or whose booking it is. */}
      <section
        role="region"
        aria-label="Quick unit and level selector"
        className="max-h-64 overflow-y-auto border-t border-emerald-800/40 bg-emerald-950/70 px-4 py-3"
      >
        <p className="text-xs font-semibold text-emerald-300">
          Select units — Tab / Enter / Space or tap: {Math.min(capped.slots.length, 200)} of {capped.summary ? capped.summary.total.toLocaleString('en-IN') : capped.slots.length} shown in 3D
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(capped.slots.length > 200 ? capped.slots.slice(0, 200) : capped.slots).map((s) => {
            const selected = selectedSlotKeys.includes(s.slotKey);
            const statusText =
              s.status === 'MY_BOOKING'
                ? 'your booking'
                : s.status === 'OCCUPIED'
                  ? `booked by ${s.farmerName ?? 'another farmer'}`
                  : s.status === 'PENDING_PAYMENT'
                    ? 'held for payment'
                    : 'available';
            return (
              <button
                key={s.slotKey}
                type="button"
                aria-pressed={selected}
                aria-label={`${s.unitCode}, ${s.unitType === 'WOODEN_BIN' ? 'wooden bin' : 'blue plastic crate'}, capacity ${s.capacityKg} kg, ${statusText}${typeof s.temperatureC === 'number' ? `, chamber at ${s.temperatureC.toFixed(1)} degrees` : ''}`}
                title={`${s.unitCode} · ${statusText}`}
                onClick={() => {
                  setInspectedSlot(s);
                  onToggleSelectSlot(s);
                }}
                className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
                  selected
                    ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                    : s.status === 'OCCUPIED'
                      ? 'bg-rose-950/70 text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-900/70'
                      : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20'
                }`}
              >
                {s.unitCode}
              </button>
            );
          })}
          {capped.slots.length === 0 && (
            <p className="text-xs text-slate-400">No units in this view — choose All Chambers or another level above.</p>
          )}
          {capped.slots.length > 200 && (
            <p className="text-xs text-slate-400">Showing the first 200. Pick a single chamber above to see all of its units.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function InstancedStorageUnits({
  slots,
  selectedSlotKeys,
  onSelectSlot,
}: {
  slots: StorageSlotRecord[];
  selectedSlotKeys: string[];
  onSelectSlot: (slot: StorageSlotRecord) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectedSet = useMemo(() => new Set(selectedSlotKeys), [selectedSlotKeys]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    slots.forEach((slot, idx) => {
      dummy.position.set(slot.worldX, slot.worldY, slot.worldZ);
      if (slot.unitType === 'WOODEN_BIN') {
        dummy.scale.set(1.15, 0.72, 0.95);
      } else {
        dummy.scale.set(0.54, 0.29, 0.36);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      if (selectedSet.has(slot.slotKey) || slot.status === 'MY_BOOKING') {
        color.setHex(0x10b981);
      } else if (slot.status === 'OCCUPIED') {
        color.setHex(0xef4444);
      } else if (slot.unitType === 'WOODEN_BIN') {
        color.setHex(0xc28e5c);
      } else {
        color.setHex(0x1d4ed8);
      }
      mesh.setColorAt(idx, color);
    });

    mesh.count = slots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [slots, selectedSet]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (typeof e.instanceId === 'number' && slots[e.instanceId]) {
      onSelectSlot(slots[e.instanceId]);
    }
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(slots.length, 1)]}
      castShadow
      receiveShadow
      frustumCulled
      onClick={handleClick}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.45} metalness={0.08} />
    </instancedMesh>
  );
}
