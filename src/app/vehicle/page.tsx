'use client';

/**
 * VehiclePage — complete vehicle flow:
 * 1. Select type (large icons)
 * 2. Enter registration number
 * 3. Verify against Government RC (ULIP/VAHAN)
 * 4. Show type conflict if RC class ≠ chosen type
 * 5. Link to account (stores only non-sensitive fields)
 * 6. Track vehicle (FASTag + driver GPS only, no simulated routes)
 */
import { useState, useCallback } from 'react';
import { ArrowLeft, Truck, ShieldCheck, Loader2, RotateCcw, Link2, AlertCircle } from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { Btn, PORTAL_THEMES } from '@/components/portal/kit';
import { VehicleType, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_ICONS, isValidRegistration, normaliseRegistration, formatRegistration } from '@/lib/vehicle/registry';
import { VehicleTypeSelector, VehicleVerificationCard } from '@/components/vehicle/VehicleTypeSelector';
import { VehicleTracker } from '@/components/vehicle/VehicleTracker';

const theme = PORTAL_THEMES.dealer;

type Step = 'type' | 'plate' | 'verify' | 'linked' | 'track';

export default function VehiclePage() {
  const [step, setStep] = useState<Step>('type');
  const [chosenType, setChosenType] = useState<VehicleType | null>(null);
  const [plate, setPlate] = useState('');
  const [formattedPlate, setFormattedPlate] = useState('');
  const [rcRecord, setRcRecord] = useState<{
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
  } | null>(null);
  const [typeConflict, setTypeConflict] = useState<{ conflict: boolean; message?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [linking, setLinking] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTypeSelect = useCallback((type: VehicleType) => {
    setChosenType(type);
    setStep('plate');
    setError(null);
  }, []);

  const handlePlateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setPlate(value);
    // Format as user types
    const formatted = formatRegistration(value);
    setFormattedPlate(formatted);
    e.target.value = formatted;
  }, []);

  const handleVerify = useCallback(async () => {
    if (!chosenType || !isValidRegistration(plate)) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch('/api/vehicle/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration: plate, chosenType }),
      });
      const data = await res.json();
      if (data.ok) {
        setRcRecord(data.rcRecord);
        setTypeConflict(data.typeConflict ?? { conflict: false });
        setStep('verify');
      } else {
        setError(data.error ?? 'Verification failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }, [chosenType, plate]);

  const handleLink = useCallback(async () => {
    if (!rcRecord || !chosenType) return;
    setLinking(true);
    try {
      const res = await fetch('/api/vehicle/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration: plate, chosenType, rcRecord }),
      });
      const data = await res.json();
      if (data.ok) {
        setVehicleId(data.vehicleId);
        setStep('linked');
      } else {
        setError(data.error ?? 'Could not link vehicle');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Linking failed');
    } finally {
      setLinking(false);
    }
  }, [plate, chosenType, rcRecord]);

  const goBack = () => {
    if (step === 'plate') setStep('type');
    else if (step === 'verify') setStep('plate');
    else if (step === 'linked') setStep('verify');
    else if (step === 'track') setStep('linked');
    setError(null);
  };

  const renderStep = () => {
    switch (step) {
      case 'type':
        return (
          <VehicleTypeSelector
            onSelect={handleTypeSelect}
            hint="Choose the type of vehicle you want to track. This helps us check if the registration matches."
          />
        );

      case 'plate':
        return (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <span className="text-2xl" aria-hidden>{VEHICLE_TYPE_ICONS[chosenType!]}</span>
              {VEHICLE_TYPE_LABELS[chosenType!]} selected
            </p>
            <label className="block text-sm font-medium text-slate-700">Registration number</label>
            <input
              type="text"
              value={formattedPlate}
              onChange={handlePlateChange}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
              placeholder="JK01AB1234"
              className="block w-full rounded-xl border-0 bg-white px-4 py-3 text-lg font-mono font-semibold tracking-wider placeholder:text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-700"
            />
            <p className="text-xs text-slate-500">Format: JK-01-AB-1234 (separators added automatically)</p>
            {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
            <div className="flex gap-2">
              <Btn theme={theme} variant="ghost" icon={ArrowLeft} onClick={goBack} className="min-h-11 flex-1">Back</Btn>
              <Btn theme={theme} icon={ShieldCheck} onClick={handleVerify} disabled={!isValidRegistration(plate)} className="min-h-11 flex-1">Verify</Btn>
            </div>
          </div>
        );

      case 'verify':
        return (
          <VehicleVerificationCard
            rcRecord={rcRecord}
            typeConflict={typeConflict}
            registration={plate}
            formatted={formattedPlate}
            onLink={handleLink}
            onRetry={() => setStep('plate')}
            loading={verifying}
          />
        );

      case 'linked':
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Link2 className="h-8 w-8 text-emerald-700" aria-hidden />
            </div>
            <p className="text-lg font-semibold text-slate-900">Vehicle linked to your account</p>
            <p className="text-sm text-slate-600">
              <code className="font-mono">{formattedPlate}</code> ({VEHICLE_TYPE_LABELS[chosenType!]}) is now tracked on your orders.
            </p>
            <dl className="mx-auto max-w-xs grid gap-2 text-sm text-left">
              <div><dt className="text-slate-500">Maker</dt><dd className="font-medium">{rcRecord?.maker}</dd></div>
              <div><dt className="text-slate-500">Model</dt><dd className="font-medium">{rcRecord?.model}</dd></div>
              <div><dt className="text-slate-500">Class</dt><dd className="font-medium">{rcRecord?.vehicleClass}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Only non-sensitive fields stored. Owner details never saved.</p>
            <div className="flex gap-2">
              <Btn theme={theme} variant="ghost" icon={ArrowLeft} onClick={goBack} className="min-h-11">Back</Btn>
              <Btn theme={theme} icon={Truck} onClick={() => setStep('track')} className="min-h-11 flex-1">Track vehicle</Btn>
            </div>
          </div>
        );

      case 'track':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeft className="h-5 w-5 text-slate-500" />
                <p className="text-base font-semibold text-slate-900">Tracking {formattedPlate}</p>
              </div>
              <Btn theme={theme} variant="ghost" icon={RotateCcw} size="sm" onClick={() => { setStep('track'); }} className="min-h-10" disabled={linking}>Refresh</Btn>
            </div>
            <VehicleTracker
              registration={plate}
              // If you have an order/consignment, pass it here for driver GPS
              // orderId="..."
              // consignmentCode="..."
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <PortalShell
      standalone
      theme="dealer"
      eyebrow="Vehicle tracking"
      title="What vehicle is this?"
      description="Enter the registration number. We'll check it against Government RC records, warn you if the vehicle class doesn't match, and track it using real FASTag toll crossings and driver GPS."
    >
      <div className="max-w-xl mx-auto">
        {renderStep()}
      </div>
    </PortalShell>
  );
}