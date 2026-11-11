'use client';

import React from 'react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Group, Box3, Vector3, Color, Fog, PerspectiveCamera } from 'three';

import { Btn, PORTAL_THEMES, INPUT, Badge } from '@/components/portal/kit';
import { SpeakButton } from '@/components/voice/VoiceButtons';

const theme = PORTAL_THEMES.dealer;

/** Low-poly design viewer with orbit controls, shadows, measurements, and fallback. */
interface Viewer3DProps {
  /** The design group to render (three.js Group or React element). */
  design: THREE.Group | React.ReactElement | null;
  /** Bounds for camera framing: { width, height, depth } in meters. */
  bounds: { width: number; height: number; depth: number };
  /** Design type for labeling. */
  designType: 'carton' | 'crate' | 'coldStore' | 'truckLoad' | 'orchardLayout';
  /** Design parameters for measurement display. */
  params: Record<string, unknown>;
  /** Callback when user clicks a part (for selection). */
  onSelect?: (name: string, object: THREE.Object3D) => void;
  /** Show measurement labels. */
  showMeasurements?: boolean;
  /** Allow orbit controls. */
  allowOrbit?: boolean;
  /** Callback when screenshot is taken. */
  onScreenshot?: (dataUrl: string) => void;
  /** Function to take screenshot. */
  takeScreenshot?: () => void;
  /** Error fallback message. */
  errorMessage?: string;
  /** Height of the viewer. */
  height?: number | string;
  /** Whether WebGL is available. */
  webglAvailable?: boolean;
}

function Viewer3DCanvas({
  design,
  bounds,
  designType,
  params,
  onSelect,
  showMeasurements = true,
  allowOrbit = true,
  onScreenshot,
  takeScreenshot,
}: Viewer3DProps) {
  const { camera, gl, size } = useThree();
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // Auto-frame camera on mount/bounds change
  useEffect(() => {
    const { width, height, depth } = boundsRef.current;
    const maxDim = Math.max(width, height, depth);
    const distance = maxDim * 2.5;
    
    camera.position.set(distance, distance * 0.7, distance);
    camera.lookAt(0, depth > width ? depth / 2 : 0, 0);
    camera.near = 0.01;
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
  }, [bounds, camera]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (camera instanceof PerspectiveCamera) {
        camera.aspect = size.width / size.height;
        camera.updateProjectionMatrix();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [camera, size]);

  // Raycast for selection
  const handleClick = (event: THREE.Event & { object: THREE.Object3D }) => {
    if (!onSelect) return;
    let obj = event.object;
    while (obj.parent && obj.name === '') obj = obj.parent;
    onSelect(obj.name || obj.uuid, obj);
  };

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <fog attach="fog" args={['#e0e7ef', 10, 100]} />
      
      {/* Environment lighting */}
      <Environment
        preset="warehouse"
        background={false}
        ground={false}
      />
      
      {/* Main design group */}
      {design && (
        <primitive object={design} />
      )}
      
      {/* Contact shadows */}
      <ContactShadows
        opacity={0.3}
        scale={Math.max(bounds.width, bounds.depth) * 1.5}
        position={[0, -0.01, 0] as [number, number, number]}
      />
      
      {/* Measurement labels */}
      {showMeasurements && (
        <MeasurementLabels bounds={bounds} params={params} designType={designType} />
      )}
      
      {/* Camera controls */}
      {allowOrbit && (
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={Math.max(bounds.width, bounds.height, bounds.depth) * 0.5}
          maxDistance={Math.max(bounds.width, bounds.height, bounds.depth) * 10}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI / 2 - 0.05}
          target={[0, bounds.height / 2, 0] as [number, number, number]}
        />
      )}
    </>
  );
}

/** Measurement labels overlay */
function MeasurementLabels({ bounds, params, designType }: { bounds: { width: number; height: number; depth: number }; params: Record<string, unknown>; designType: string }) {
  const { width, height, depth } = bounds;
  
  if (designType === 'orchardLayout') {
    // Orchard: show plot dimensions and tree count
    const orchardContent = React.createElement(
      'div',
      { className: "text-center text-xs bg-white/90 px-2 py-1 rounded ring-1 ring-slate-200" },
      React.createElement('p', { className: "font-semibold text-slate-900" }, `Plot: ${bounds.width.toFixed(1)}m × ${bounds.depth.toFixed(1)}m`),
      React.createElement('p', { className: "text-slate-600" }, `${params.totalTrees || '—'} trees • ${params.hectares || '—'} ha`)
    );
    return (
      <Html position={[0, bounds.height + 1, 0]} center>
        {orchardContent}
      </Html>
    );
  }
  
  // Standard 3D objects: show L×W×H
  const dims = [
    { label: 'Length', value: bounds.width, unit: 'm', pos: [bounds.width / 2 + 0.3, 0.1, 0] as [number, number, number] },
    { label: 'Width', value: bounds.depth, unit: 'm', pos: [bounds.width / 2 + 0.1, 0.1, bounds.depth / 2 + 0.3] as [number, number, number] },
    { label: 'Height', value: bounds.height, unit: 'm', pos: [0, bounds.height / 2, -bounds.depth / 2 - 0.3] as [number, number, number] },
  ];
  
  return (
    <>
      {dims.map((d) => {
        const labelContent = React.createElement(
          'div',
          { className: "text-[11px] bg-white/95 px-1.5 py-0.5 rounded ring-1 ring-slate-200 whitespace-nowrap shadow-sm" },
          React.createElement('span', { className: "text-slate-500" }, d.label),
          React.createElement('span', { className: "ml-1 font-semibold text-slate-900" }, d.value.toFixed(d.value < 1 ? 3 : 2)),
          React.createElement('span', { className: "text-slate-400 ml-0.5" }, d.unit)
        );
        return (
          <Html key={d.label} position={d.pos} center>
            {labelContent}
          </Html>
        );
      })}
    </>
  );
}

/** Main Viewer3D component with fallback and error boundary */
export function Viewer3D({
  design,
  bounds,
  designType,
  params,
  onSelect,
  showMeasurements = true,
  allowOrbit = true,
  onScreenshot,
  errorMessage,
  height = 400,
  webglAvailable = true,
}: Viewer3DProps) {
  const [canvasError, setCanvasError] = useState<Error | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  // Screenshot handler
  const takeScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onScreenshot?.(dataUrl);
    }
  }, [onScreenshot]);

  if (!webglAvailable || showFallback) {
    return (
      <FallbackViewer
        designType={designType}
        bounds={bounds}
        params={params}
        errorMessage={errorMessage || canvasError?.message}
        onRetry={() => { setCanvasError(null); setShowFallback(false); }}
      />
    );
  }

  return (
    <div style={{ height, width: '100%', position: 'relative' }} className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <Canvas
        camera={{ fov: 50, near: 0.01, far: 1000 }}
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); }}
        onError={(e: any) => { 
          setCanvasError(new Error('Canvas error')); 
          setShowFallback(true); 
        }}>
        <Viewer3DCanvas
          design={design}
          bounds={bounds}
          designType={designType}
          params={params}
          onSelect={onSelect}
          showMeasurements={showMeasurements}
          allowOrbit={allowOrbit}
          onScreenshot={onScreenshot}
          takeScreenshot={takeScreenshot}
        />
      </Canvas>
      
      {/* Toolbar */}
      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 p-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <Badge tone="blue">{bounds.width.toFixed(bounds.width < 1 ? 3 : 2)}m</Badge>
          <Badge tone="blue">{bounds.depth.toFixed(bounds.depth < 1 ? 3 : 2)}m</Badge>
          <Badge tone="blue">{bounds.height.toFixed(bounds.height < 1 ? 3 : 2)}m</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {onScreenshot && (
            <Btn theme={theme} size="sm" variant="soft" onClick={takeScreenshot}>
              📸 Screenshot
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/** 2D SVG Fallback when WebGL is unavailable */
function FallbackViewer({ designType, bounds, params, errorMessage, onRetry }: { designType: string; bounds: { width: number; height: number; depth: number }; params: Record<string, unknown>; errorMessage?: string; onRetry: () => void }) {
  const { width, height, depth } = bounds;
  const scale = Math.min(300 / Math.max(width, depth), 1);
  const svgWidth = width * scale;
  const svgHeight = depth * scale;
  
  return (
    <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-6 flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-xl ring-1 ring-amber-200 text-sm">
        <span>⚠️</span>
        <span>WebGL not available — showing 2D diagram</span>
      </div>
      
      {errorMessage && (
        <p className="text-sm text-rose-700 bg-rose-50 px-3 py-2 rounded-xl ring-1 ring-rose-200 text-center">
          {errorMessage}
        </p>
      )}
      
      <div className="flex flex-col items-center gap-4">
        {/* Top-down SVG */}
        <svg viewBox={`0 0 ${width * 100} ${depth * 100}`} width={svgWidth * 100} height={svgHeight * 100} className="bg-slate-50 rounded-xl ring-1 ring-slate-200">
          {/* Ground */}
          <rect x="0" y="0" width={width * 100} height={depth * 100} fill="#f1f5f9" />
          
          {/* Design-specific 2D representation */}
          {designType === 'coldStore' && (
            <ColdStore2D width={width} depth={depth} params={params} />
          )}
          {designType === 'truckLoad' && (
            <TruckLoad2D width={width} depth={depth} params={params} />
          )}
          {designType === 'orchardLayout' && (
            <OrchardLayout2D width={width} depth={depth} params={params} />
          )}
          {designType === 'carton' && (
            <Carton2D width={width} depth={depth} params={params} />
          )}
          {designType === 'crate' && (
            <Crate2D width={width} depth={depth} params={params} />
          )}
        </svg>
        
        {/* Dimensions */}
        <div className="flex flex-wrap gap-2 justify-center text-sm text-slate-600">
          <span>Length: {width.toFixed(width < 1 ? 3 : 2)}m</span>
          <span>Width: {depth.toFixed(depth < 1 ? 3 : 2)}m</span>
          <span>Height: {bounds.height.toFixed(bounds.height < 1 ? 3 : 2)}m</span>
        </div>
      </div>
      
      <Btn theme={theme} variant="soft" onClick={onRetry} className="min-h-11">
        🔄 Retry 3D
      </Btn>
    </div>
  );
}

/** 2D SVG components for fallback */
function ColdStore2D({ width, depth, params }: { width: number; depth: number; params: Record<string, unknown> }) {
  const chamberCount = (params.chamberCount as number) || 4;
  const chamberWidth = depth / chamberCount;
  
  return (
    <g>
      {/* Building outline */}
      <rect x="0" y="0" width={width * 100} height={depth * 100} fill="none" stroke="#64748b" strokeWidth="2" />
      
      {/* Chambers */}
      {[...Array(chamberCount)].map((_, i) => (
        <g key={i}>
          <rect x="500" y={i * (depth / chamberCount) * 100} width={(width - 10) * 100} height={chamberWidth * 100 - 100} fill="#fef3e2" stroke="#ea580c" strokeWidth="1" rx="4" />
          <text x={width * 50} y={i * (depth / chamberCount) * 100 + (chamberWidth * 100) / 2} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#64748b">
            Chamber {i + 1}
          </text>
        </g>
      ))}
    </g>
  );
}

function TruckLoad2D({ width, depth, params }: { width: number; depth: number; params: Record<string, unknown> }) {
  const boxLength = ((params.boxLength as number) || 400) / 1000;
  const boxWidth = ((params.boxWidth as number) || 300) / 1000;
  const cargoLength = (params.cargoLength as number) || 8;
  const cargoWidth = (params.cargoWidth as number) || 2.4;
  
  const bl = boxLength / cargoLength;
  const bw = boxWidth / cargoWidth;
  
  const boxesX = Math.floor(1 / bl);
  const boxesZ = Math.floor(1 / bw);
  
  return (
    <g>
      {/* Cargo outline */}
      <rect x="0" y="0" width={width * 100} height={depth * 100} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5,5" />
      
      {/* Boxes */}
      {[...Array(boxesX)].map((_, x) => [...Array(boxesZ)].map((_, z) => (
        <rect key={`${x}-${z}`} x={x * bl * width * 100 + 50} y={z * bw * depth * 100 + 50} width={bl * width * 100 - 10} height={bw * depth * 100 - 10} fill="#fef3e2" stroke="#ea580c" strokeWidth="1" rx="2" />
      )))}
    </g>
  );
}

function OrchardLayout2D({ width, depth, params }: { width: number; depth: number; params: Record<string, unknown> }) {
  const rowSpacing = (params.rowSpacing as number) || 4;
  const treeSpacing = (params.treeSpacing as number) || 3;
  const boundaryOffset = (params.boundaryOffset as number) || 2;
  const system = (params.system as string) || 'high-density';
  
  const effectiveLength = width - 2 * boundaryOffset;
  const effectiveWidth = depth - 2 * boundaryOffset;
  const rows = Math.floor(effectiveLength / rowSpacing) + 1;
  const treesPerRow = Math.floor(effectiveWidth / treeSpacing) + 1;
  
  return (
    <g>
      {/* Plot outline */}
      <rect x="0" y="0" width={width * 100} height={depth * 100} fill="none" stroke="#64748b" strokeWidth="2" />
      
      {/* Trees */}
      {[...Array(rows)].map((_, r) => [...Array(treesPerRow)].map((_, t) => {
        let x = boundaryOffset + r * rowSpacing;
        let z = boundaryOffset + t * treeSpacing;
        if (system === 'high-density' && r % 2 === 1) {
          x += rowSpacing * 0.5;
        }
        return (
          <circle key={`${r}-${t}`} cx={x * 100} cy={z * 100} r="6" fill="#2d5a2d" stroke="#166534" strokeWidth="1" />
        );
      }))}
    </g>
  );
}

function Carton2D({ width, depth, params }: { width: number; depth: number; params: Record<string, unknown> }) {
  const flapStyle = (params.flapStyle as string) || 'tuck';
  
  return (
    <g>
      <rect x="0" y="0" width={width * 100} height={depth * 100} fill="#fef3e2" stroke="#ea580c" strokeWidth="2" rx="4" />
      {flapStyle !== 'glued' && (
        <rect x="20" y="20" width={width * 100 - 40} height={depth * 100 * 0.15} fill="#fde68a" stroke="#ea580c" strokeWidth="1" rx="2" />
      )}
      <text x={width * 50} y={depth * 50} textAnchor="middle" dominantBaseline="middle" fontSize="14" fill="#64748b">
        QR Code
      </text>
    </g>
  );
}

function Crate2D({ width, depth, params }: { width: number; depth: number; params: Record<string, unknown> }) {
  const slotCount = (params.slotCount as number) || 8;
  const slotWidth = ((params.slotWidth as number) || 5) / 1000;
  const l = width;
  
  return (
    <g>
      <rect x="0" y="0" width={width * 100} height={depth * 100} fill="none" stroke="#64748b" strokeWidth="2" />
      {/* Ventilation slots on front/back */}
      {[...Array(slotCount)].map((_, i) => (
        <rect key={i} x={(i + 1) * (l / (slotCount + 1)) * 100 - slotWidth * 100 / 2} y="20" width={slotWidth * 100} height={depth * 100 - 40} fill="none" stroke="#ea580c" strokeWidth="1.5" />
      ))}
    </g>
  );
}