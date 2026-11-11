'use client';

/**
 * VehicleTypeSelector — large icon buttons for choosing a vehicle type.
 * Used when the user says "What vehicle is this?" before plate entry.
 */
import { useState, useEffect } from 'react';
import { Truck, Loader2, HelpCircle } from 'lucide-react';

import { Btn, PORTAL_THEMES } from '@/components/portal/kit';
import { VehicleType, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_ICONS } from '@/lib/vehicle/registry';

const theme = PORTAL_THEMES.dealer;

interface VehicleTypeSelectorProps {
  /** Called when user selects a type. */
  onSelect: (type: VehicleType) => void;
  /** Pre-selected type (if user goes back). */
  initialType?: VehicleType;
  /** Whether to show the "Don't know" option. */
  showUnknown?: boolean;
  /** Disable interaction while verifying. */
  disabled?: boolean;
  /** Additional hint text. */
  hint?: string;
}

export function VehicleTypeSelector({
  onSelect,
  initialType,
  showUnknown = true,
  disabled = false,
  hint,
}: VehicleTypeSelectorProps) {
  const [selected, setSelected] = useState<VehicleType | null>(initialType ?? null);
  const [hovered, setHovered] = useState<VehicleType | null>(null);

  useEffect(() => {
    if (initialType) setSelected(initialType);
  }, [initialType]);

  const types = Object.values(VehicleType).filter((t) => showUnknown || t !== VehicleType.UNKNOWN);

  const handleClick = (type: VehicleType) => {
    if (disabled) return;
    setSelected(type);
    onSelect(type);
  };

  return (
    <div className="space-y-4">
      <p className="text-base font-semibold text-slate-900">What vehicle is this?</p>
      {hint && <p className="text-sm text-slate-600">{hint}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Vehicle type">
        {types.map((type) => {
          const isSelected = selected === type;
          const isHovered = hovered === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => handleClick(type)}
              onMouseEnter={() => setHovered(type)}
              onMouseLeave={() => setHovered(null)}
              className={`
                relative group min-h-[110px] cursor-pointer flex flex-col items-center justify-center gap-3 rounded-2xl p-4
                transition-all duration-200
                ${isSelected
                  ? 'bg-emerald-50 ring-2 ring-emerald-600 shadow-lg'
                  : 'bg-white ring-1 ring-slate-200 hover:ring-emerald-300 hover:bg-emerald-50/50'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span className="text-4xl sm:text-5xl" aria-hidden>{VEHICLE_TYPE_ICONS[type]}</span>
              <span className={`font-semibold text-center ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
                {VEHICLE_TYPE_LABELS[type]}
              </span>
              {isSelected && (
                <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="text-xs text-emerald-700 flex items-center gap-1">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          Selected: <strong>{VEHICLE_TYPE_LABELS[selected]}</strong>. Now enter the registration number.
        </p>
      )}
    </div>
  );
}

/**
 * VehicleVerificationCard — shows the RC record and type conflict warning.
 */
export function VehicleVerificationCard({
  rcRecord,
  typeConflict,
  registration,
  formatted,
  onLink,
  onRetry,
  loading = false,
}: {
  rcRecord: {
    vehicleClass: string;
    maker: string;
    model: string;
    fuel: string;
    bodyType?: string;
    gvwKg?: number;
    unladenKg?: number;
    fitnessValidTo?: string;
    insuranceValidTo?: string;
    taxValidTo?: string;
    pucValidTo?: string;
    rcStatus?: string;
    emissionNorms?: string;
    rto?: string;
    registeredAt?: string;
  } | null;
  typeConflict: {
    conflict: boolean;
    message?: string;
    rcInferredType?: VehicleType;
    chosenType?: VehicleType;
  } | null;
  registration: string;
  formatted: string;
  onLink: () => void;
  onRetry: () => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-200 rounded w-full" />
        <div className="h-4 bg-slate-200 rounded w-2/3" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  if (!rcRecord) {
    return (
      <div className="rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-200">
        <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
          <HelpCircle className="h-5 w-5" aria-hidden />
          No Government record found for <code className="font-mono">{formatted}</code>
        </p>
        <p className="mt-2 text-sm text-rose-700">The plate may be new, from another state, or entered incorrectly.</p>
        <Btn theme={theme} icon={Loader2} onClick={onRetry} className="mt-4 min-h-11">Try again</Btn>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Registration</p>
          <p className="text-lg font-mono font-semibold text-slate-900">{formatted}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Verified ✓
        </span>
      </div>

      {/* Type Conflict Warning */}
      {typeConflict?.conflict && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <HelpCircle className="h-5 w-5" aria-hidden />
            Vehicle type mismatch
          </p>
          <p className="mt-1 text-sm text-amber-800">{typeConflict.message}</p>
          <p className="mt-2 text-xs text-amber-700">Please confirm the correct type before linking.</p>
        </div>
      )}

      {/* RC Details */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
        <div><dt className="text-slate-500">Vehicle class</dt><dd className="font-medium text-slate-900">{rcRecord.vehicleClass}</dd></div>
        <div><dt className="text-slate-500">Maker</dt><dd className="font-medium text-slate-900">{rcRecord.maker}</dd></div>
        <div><dt className="text-slate-500">Model</dt><dd className="font-medium text-slate-900">{rcRecord.model}</dd></div>
        <div><dt className="text-slate-500">Fuel</dt><dd className="font-medium text-slate-900">{rcRecord.fuel}</dd></div>
        {rcRecord.bodyType && <div><dt className="text-slate-500">Body type</dt><dd className="font-medium text-slate-900">{rcRecord.bodyType}</dd></div>}
        {rcRecord.gvwKg && <div><dt className="text-slate-500">GVW</dt><dd className="font-medium text-slate-900">{rcRecord.gvwKg.toLocaleString()} kg</dd></div>}
        {rcRecord.fitnessValidTo && <div><dt className="text-slate-500">Fitness valid to</dt><dd className="font-medium text-slate-900">{new Date(rcRecord.fitnessValidTo).toLocaleDateString('en-IN')}</dd></div>}
        {rcRecord.insuranceValidTo && <div><dt className="text-slate-500">Insurance valid to</dt><dd className="font-medium text-slate-900">{new Date(rcRecord.insuranceValidTo).toLocaleDateString('en-IN')}</dd></div>}
        {rcRecord.pucValidTo && <div><dt className="text-slate-500">PUC valid to</dt><dd className="font-medium text-slate-900">{new Date(rcRecord.pucValidTo).toLocaleDateString('en-IN')}</dd></div>}
        {rcRecord.rcStatus && <div><dt className="text-slate-500">RC status</dt><dd className="font-medium text-slate-900">{rcRecord.rcStatus}</dd></div>}
        {rcRecord.rto && <div><dt className="text-slate-500">RTO</dt><dd className="font-medium text-slate-900">{rcRecord.rto}</dd></div>}
        {rcRecord.registeredAt && <div><dt className="text-slate-500">Registered</dt><dd className="font-medium text-slate-900">{new Date(rcRecord.registeredAt).toLocaleDateString('en-IN')}</dd></div>}
      </dl>

      <p className="text-xs text-slate-500 border-t border-slate-200 pt-3">
        Only non-sensitive fields are stored (registration, type, class, maker, model, fuel).
        Owner name, address, phone, chassis/engine numbers are never saved.
      </p>

      <Btn theme={theme} icon={Truck} onClick={onLink} className="w-full min-h-11" disabled={loading}>
        Link to my account
      </Btn>
    </div>
  );
}