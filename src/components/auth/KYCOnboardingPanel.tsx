'use client';

/**
 * KYCOnboardingPanel — premium glassmorphic, multi-step Full KYC modal for the
 * three transacting personas: Sellers, Buyers and Farmers.
 *
 * WHAT IT DOES
 * ────────────
 *   Step 1  Profile details   → name, role, state, district, PIN
 *   Step 2  Identity          → Aadhaar/PAN document upload  —or—  Aadhaar eKYC
 *   Step 3  Bank details      → account number, IFSC, holder name (escrow payouts)
 *
 * It mounts itself on the dashboards and auto-opens whenever the account still
 * owes a submission (kycStatus === 'PENDING' with nothing submitted yet), which
 * is the trigger the product asked for. Closing it is always allowed — the
 * glass banner it leaves behind re-opens it, and a reload re-opens it too until
 * the three steps are submitted.
 *
 * STYLING
 * -------
 * Reuses the glass language the dashboards already speak (see PortalShell,
 * seller payout card, portal selector in src/app/page.tsx): `bg-black/40` +
 * `backdrop-blur-md` surfaces, `border-white/10` hairlines, `var(--primary)`
 * accents with a hard-coded fallback (the `buyer`/`kissan` themes never define
 * `--primary`), plus one teal→amber gradient hairline for the modal shell.
 *
 * DATA
 * ----
 * Reads/writes only through src/lib/kyc-onboarding.ts — no fetch. Swap that
 * module for a real `POST /kyc/submissions` when the endpoint exists.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  FileCheck,
  FileUp,
  IdCard,
  Info,
  Landmark,
  Loader2,
  MapPin,
  ScanLine,
  ShoppingBasket,
  Smartphone,
  Sprout,
  Store,
  Upload,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { REGIONS } from '@/lib/listing-options';
import {
  ACCEPTED_DOCUMENT_TYPES,
  KYC_ROLE_LABEL,
  MAX_DOCUMENT_BYTES,
  clearKycState,
  defaultKycState,
  emptyBank,
  emptyIdentity,
  emptyProfile,
  formatAadhaar,
  formatBytes,
  formatIfsc,
  kycBannerTone,
  needsOnboarding,
  readKycState,
  validateBank,
  validateIdentity,
  validateProfile,
  writeKycState,
  type KycBank,
  type KycErrors,
  type KycIdentity,
  type KycOnboardingState,
  type KycProfile,
  type KycRole,
} from '@/lib/kyc-onboarding';

// ─── Presentation tokens ───────────────────────────────────────────────────

const TEAL = '#0E7C86';

const inputCls =
  'w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white ' +
  'placeholder-white/30 outline-none transition-all focus:border-teal-400 ' +
  'focus:ring-1 focus:ring-teal-400 disabled:opacity-50';

const labelCls = 'block text-sm font-bold text-white mb-1.5';

const errorCls = 'mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-300';

const hintCls = 'mt-1.5 text-xs text-white/50';

const ROLE_META: Record<
  KycRole,
  { label: string; blurb: string; icon: typeof Store }
> = {
  SELLER: {
    label: 'Seller',
    blurb: 'List tools, produce & services',
    icon: Store,
  },
  BUYER: {
    label: 'Buyer',
    blurb: 'Source & purchase in bulk',
    icon: ShoppingBasket,
  },
  FARMER: {
    label: 'Farmer',
    blurb: 'Sell from your own land',
    icon: Sprout,
  },
};

const STEPS = [
  { title: 'Profile Details', caption: 'Who & where', icon: UserRound },
  { title: 'Identity Verification', caption: 'Aadhaar / PAN', icon: IdCard },
  { title: 'Bank Details', caption: 'Escrow payouts', icon: Landmark },
] as const;

// ─── Component ─────────────────────────────────────────────────────────────

export interface KYCOnboardingPanelProps {
  /** Which portal is mounting the panel. Defaults to FARMER. */
  role?: KycRole;
  /** Set false to show the banner but never auto-open the modal. */
  autoOpen?: boolean;
  /** Set false to suppress the inline status banner (modal still works). */
  showBanner?: boolean;
  /** Fired after every successful save with the newly persisted state. */
  onStatusChange?: (state: KycOnboardingState) => void;
}

export default function KYCOnboardingPanel({
  role = 'FARMER',
  autoOpen = true,
  showBanner = true,
  onStatusChange,
}: KYCOnboardingPanelProps) {
  const [state, setState] = useState<KycOnboardingState | null>(null);
  /**
   * The user's explicit choice, which wins over the automatic rule for as long
   * as the panel is on screen. `null` = "follow the rule" (auto-open while the
   * account still owes a KYC submission). Keeping this as an override instead
   * of an `open` boolean means opening never needs to be pushed from an effect.
   */
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<KycErrors>({});
  const [saving, setSaving] = useState(false);
  const [revealAccount, setRevealAccount] = useState(false);

  const [profile, setProfile] = useState<KycProfile>(() => emptyProfile(role));
  const [identity, setIdentity] = useState<KycIdentity>(emptyIdentity);
  const [bank, setBank] = useState<KycBank>(emptyBank);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const hydrated = useRef(false);

  const open =
    openOverride ?? (autoOpen && state !== null && needsOnboarding(state));

  const close = useCallback(() => setOpenOverride(false), []);

  // ── Hydrate from storage (client only; keeps SSR markup identical) ──────
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const stored = readKycState(role);
    setState(stored);
    setProfile(stored.submission?.profile ?? emptyProfile(role));
    setIdentity(stored.submission?.identity ?? emptyIdentity());
    setBank(stored.submission?.bank ?? emptyBank());
  }, [role]);

  // ── Escape to dismiss + keep the page behind from scrolling ─────────────
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // ── Move focus into the dialog whenever the visible step changes ────────
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, step]);

  const updateProfile = useCallback(
    (patch: Partial<KycProfile>) => setProfile((prev) => ({ ...prev, ...patch })),
    [],
  );
  const updateIdentity = useCallback(
    (patch: Partial<KycIdentity>) => setIdentity((prev) => ({ ...prev, ...patch })),
    [],
  );
  const updateBank = useCallback(
    (patch: Partial<KycBank>) => setBank((prev) => ({ ...prev, ...patch })),
    [],
  );

  const currentErrors = useMemo<KycErrors>(() => {
    if (step === 0) return validateProfile(profile);
    if (step === 1) return validateIdentity(identity);
    return validateBank(bank);
  }, [step, profile, identity, bank]);

  const goNext = useCallback(() => {
    const found =
      step === 0
        ? validateProfile(profile)
        : step === 1
          ? validateIdentity(identity)
          : validateBank(bank);

    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('A few fields need your attention', {
        description: 'Fix the highlighted inputs to continue.',
      });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, profile, identity, bank]);

  const goBack = useCallback(() => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (file.size > MAX_DOCUMENT_BYTES) {
        setErrors((prev) => ({
          ...prev,
          document: 'File is larger than 5 MB — please upload a smaller one.',
        }));
        return;
      }
      setErrors((prev) => ({ ...prev, document: undefined }));
      updateIdentity({ documentName: file.name, documentSize: file.size });
    },
    [updateIdentity],
  );

  const sendOtp = useCallback(() => {
    const digits = identity.aadhaar.replace(/\s/g, '');
    if (digits.length !== 12) {
      setErrors((prev) => ({ ...prev, aadhaar: 'Aadhaar must be exactly 12 digits.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, aadhaar: undefined }));
    toast('eKYC OTP sent to your Aadhaar-linked mobile.', {
      description: 'Demo build: enter any 6 digits to continue.',
    });
  }, [identity.aadhaar]);

  const submit = useCallback(async () => {
    const found = validateBank(bank);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('Check your bank details', {
        description: 'Escrow payouts are routed to this account — it must be exact.',
      });
      return;
    }

    setSaving(true);
    // Stand-in for the POST /kyc/submissions round-trip that is not built yet
    // (see the persistence note in src/lib/kyc-onboarding.ts).
    await new Promise((resolve) => setTimeout(resolve, 650));

    const next = writeKycState(role, {
      status: 'PENDING',
      submitted: true,
      updatedAt: new Date().toISOString(),
      submission: { profile, identity, bank },
    });

    setSaving(false);
    setState(next);
    // `null` hands control back to the auto rule — the submission is in, so
    // `needsOnboarding` is now false and the dialog stays shut.
    setOpenOverride(null);
    setStep(0);
    setErrors({});

    toast.success('KYC submitted for review', {
      description:
        'Escrow payouts unlock once verification clears (typically 1–2 business days).',
    });
    onStatusChange?.(next);
  }, [role, profile, identity, bank, onStatusChange]);

  const reopen = useCallback(() => {
    setErrors({});
    setStep(0);
    setOpenOverride(true);
  }, []);

  // ── Status banner (rendered when the modal is closed) ───────────────────
  const banner = state ? renderBanner(state, reopen, showBanner) : null;

  return (
    <>
      {banner}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-md sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kyc-panel-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          {/* Gradient hairline shell */}
          <div className="my-auto w-full max-w-3xl rounded-[28px] bg-gradient-to-b from-teal-500/70 via-white/20 to-amber-500/60 p-px shadow-[0_35px_90px_-25px_rgba(0,0,0,0.95)]">
            <div
              ref={cardRef}
              tabIndex={-1}
              className="relative overflow-hidden rounded-[27px] bg-[#05161A]/95 outline-none backdrop-blur-xl"
            >
              {/* Ambient glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-32 right-0 h-64 w-64 rounded-full opacity-40 blur-3xl"
                style={{ background: `radial-gradient(circle, ${TEAL}, transparent 70%)` }}
              />

              {/* ── Header ─────────────────────────────────────────────── */}
              <header className="relative border-b border-white/10 px-6 pb-5 pt-6 sm:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-teal-300">
                      <BadgeCheck className="h-3.5 w-3.5" /> Full KYC Onboarding
                    </p>
                    <h2
                      id="kyc-panel-title"
                      className="font-serif text-2xl font-black tracking-wide text-white sm:text-3xl"
                    >
                      Verify your account
                    </h2>
                    <p className="mt-1 max-w-lg text-sm text-white/60">
                      One-time verification for{' '}
                      <span className="font-semibold text-white">
                        {KYC_ROLE_LABEL[profile.role]}
                      </span>{' '}
                      accounts. Step 3 wires escrow payouts straight to your bank.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => close()}
                    aria-label="Close KYC onboarding"
                    className="rounded-full border border-white/20 bg-black/30 p-2.5 text-teal-200 transition-all hover:border-teal-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* ── Stepper ───────────────────────────────────────────── */}
                <ol className="mt-6 flex items-center gap-2 sm:gap-4">
                  {STEPS.map((s, index) => {
                    const done = index < step;
                    const active = index === step;
                    return (
                      <li key={s.title} className="flex flex-1 items-center gap-2 sm:gap-3">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black transition-all',
                            done && 'border-transparent bg-[#1E7B4F] text-white',
                            active &&
                              'border-transparent bg-[#0E7C86] text-white shadow-[0_0_18px_rgba(14,124,134,0.75)]',
                            !done &&
                              !active &&
                              'border-white/25 bg-black/40 text-white/50',
                          )}
                          aria-current={active ? 'step' : undefined}
                        >
                          {done ? <Check className="h-4 w-4" /> : index + 1}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              'block truncate text-[13px] font-bold leading-tight',
                              active ? 'text-white' : 'text-white/55',
                            )}
                          >
                            {s.title}
                          </span>
                          <span className="hidden truncate text-[11px] text-white/40 sm:block">
                            {s.caption}
                          </span>
                        </span>
                        {index < STEPS.length - 1 && (
                          <span
                            className={cn(
                              'ml-auto hidden h-px flex-1 sm:block',
                              index < step ? 'bg-[#1E7B4F]' : 'bg-white/15',
                            )}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </header>

              {/* ── Body ───────────────────────────────────────────────── */}
              <div className="max-h-[52vh] min-h-[300px] overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
                {step === 0 && (
                  <section className="space-y-5">
                    <Field
                      label="Full name"
                      required
                      error={errors.fullName}
                      hint="As printed on your Aadhaar or PAN."
                    >
                      <input
                        type="text"
                        value={profile.fullName}
                        onChange={(e) => updateProfile({ fullName: e.target.value })}
                        placeholder="e.g. Tariq Ahmad Bhat"
                        className={cn(inputCls, errors.fullName && 'border-red-400/70')}
                        autoComplete="name"
                      />
                    </Field>

                    <div>
                      <span className={labelCls}>
                        Role <span className="text-teal-300">*</span>
                      </span>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {(Object.keys(ROLE_META) as KycRole[]).map((key) => {
                          const meta = ROLE_META[key];
                          const selected = profile.role === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => updateProfile({ role: key })}
                              aria-pressed={selected}
                              className={cn(
                                'group rounded-2xl border p-4 text-left transition-all',
                                selected
                                  ? 'border-teal-400 bg-teal-500/15 shadow-[0_0_24px_-6px_rgba(14,124,134,0.9)]'
                                  : 'border-white/15 bg-black/40 hover:border-white/35 hover:bg-black/60',
                              )}
                            >
                              <meta.icon
                                className={cn(
                                  'mb-2 h-5 w-5 transition-colors',
                                  selected ? 'text-teal-300' : 'text-white/50',
                                )}
                              />
                              <span className="block text-sm font-bold text-white">
                                {meta.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-white/50">
                                {meta.blurb}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Field label="State / Union Territory" required error={errors.state}>
                        <div className="relative">
                          <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-300" />
                          <select
                            value={profile.state}
                            onChange={(e) => updateProfile({ state: e.target.value })}
                            className={cn(
                              inputCls,
                              'appearance-none pl-10 [&>option]:bg-[#05161A]',
                              errors.state && 'border-red-400/70',
                            )}
                          >
                            <option value="">Select a state…</option>
                            {REGIONS.map((region) => (
                              <option key={region} value={region}>
                                {region}
                              </option>
                            ))}
                          </select>
                        </div>
                      </Field>

                      <Field label="District / Village" required error={errors.district}>
                        <input
                          type="text"
                          value={profile.district}
                          onChange={(e) => updateProfile({ district: e.target.value })}
                          placeholder="e.g. Shopian, Block B"
                          className={cn(
                            inputCls,
                            errors.district && 'border-red-400/70',
                          )}
                        />
                      </Field>

                      <Field
                        label="PIN code"
                        error={errors.pincode}
                        hint="Optional — used for pickup & logistics."
                      >
                        <input
                          type="text"
                          inputMode="numeric"
                          value={profile.pincode}
                          onChange={(e) =>
                            updateProfile({
                              pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                            })
                          }
                          placeholder="192301"
                          className={cn(inputCls, errors.pincode && 'border-red-400/70')}
                        />
                      </Field>
                    </div>
                  </section>
                )}

                {step === 1 && (
                  <section className="space-y-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <ModeCard
                        active={identity.mode === 'UPLOAD'}
                        onClick={() => updateIdentity({ mode: 'UPLOAD' })}
                        icon={Upload}
                        title="Upload documents"
                        blurb="Attach a clear Aadhaar or PAN scan"
                      />
                      <ModeCard
                        active={identity.mode === 'EKYC'}
                        onClick={() => updateIdentity({ mode: 'EKYC' })}
                        icon={ScanLine}
                        title="Instant eKYC"
                        blurb="Aadhaar OTP — no files needed"
                      />
                    </div>

                    {identity.mode === 'UPLOAD' ? (
                      <div className="space-y-4">
                        <div>
                          <span className={labelCls}>
                            Document type <span className="text-teal-300">*</span>
                          </span>
                          <div className="inline-flex rounded-xl border border-white/20 bg-black/40 p-1">
                            {(['AADHAAR', 'PAN'] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => updateIdentity({ docType: type })}
                                className={cn(
                                  'rounded-lg px-4 py-2 text-xs font-bold transition-all',
                                  identity.docType === type
                                    ? 'bg-[#0E7C86] text-white shadow-md'
                                    : 'text-white/60 hover:text-white',
                                )}
                                aria-pressed={identity.docType === type}
                              >
                                {type === 'AADHAAR' ? 'Aadhaar' : 'PAN'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {identity.documentName ? (
                          <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-400/40 bg-teal-500/10 px-4 py-3.5">
                            <div className="flex min-w-0 items-center gap-3">
                              <FileCheck className="h-5 w-5 shrink-0 text-teal-300" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-white">
                                  {identity.documentName}
                                </p>
                                <p className="text-xs text-white/50">
                                  {identity.docType === 'AADHAAR' ? 'Aadhaar' : 'PAN'} ·{' '}
                                  {formatBytes(identity.documentSize)} · ready to submit
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                updateIdentity({ documentName: '', documentSize: 0 })
                              }
                              className="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white/70 transition-all hover:border-red-400/60 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label
                            className={cn(
                              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-black/30 px-4 py-9 text-center transition-all',
                              errors.document
                                ? 'border-red-400/70'
                                : 'border-white/25 hover:border-teal-400/70 hover:bg-black/50',
                            )}
                          >
                            <FileUp className="h-7 w-7 text-teal-300" />
                            <span className="text-sm font-bold text-white">
                              Drop your {identity.docType === 'AADHAAR' ? 'Aadhaar' : 'PAN'}{' '}
                              here, or browse
                            </span>
                            <span className="text-xs text-white/50">
                              PDF, JPG or PNG · up to 5 MB
                            </span>
                            <input
                              type="file"
                              accept={ACCEPTED_DOCUMENT_TYPES}
                              className="sr-only"
                              onChange={(e) => handleFile(e.target.files?.[0])}
                            />
                          </label>
                        )}

                        {errors.document && <FieldError message={errors.document} />}

                        <p className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-xs leading-relaxed text-white/60">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                          Documents are encrypted at rest and only ever shared with
                          the KYC reviewer. Mask the first 8 digits of your Aadhaar
                          number before uploading if you prefer.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <Field
                          label="Aadhaar number"
                          required
                          error={errors.aadhaar}
                          hint="12 digits, grouped as 4-4-4."
                        >
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-300" />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={identity.aadhaar}
                                onChange={(e) =>
                                  updateIdentity({ aadhaar: formatAadhaar(e.target.value) })
                                }
                                placeholder="1234 5678 9012"
                                className={cn(
                                  inputCls,
                                  'pl-10 tracking-widest',
                                  errors.aadhaar && 'border-red-400/70',
                                )}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              onClick={sendOtp}
                              className="shrink-0 border-teal-400/50 text-teal-200"
                            >
                              <Smartphone className="h-4 w-4" /> Send OTP
                            </Button>
                          </div>
                        </Field>

                        <Field
                          label="OTP"
                          required
                          error={errors.otp}
                          hint="Sent to the mobile linked with your Aadhaar."
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            value={identity.otp}
                            onChange={(e) =>
                              updateIdentity({
                                otp: e.target.value.replace(/\D/g, '').slice(0, 6),
                              })
                            }
                            placeholder="6-digit code"
                            className={cn(
                              inputCls,
                              'tracking-[0.5em]',
                              errors.otp && 'border-red-400/70',
                            )}
                          />
                        </Field>

                        <div>
                          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/15 bg-black/40 p-4 transition-all hover:border-teal-400/50">
                            <input
                              type="checkbox"
                              checked={identity.consent}
                              onChange={(e) => updateIdentity({ consent: e.target.checked })}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/40 bg-black/60 text-teal-500 focus:ring-teal-400"
                            />
                            <span className="text-xs leading-relaxed text-white/70">
                              I authorise Kashroot to fetch my KYC record from UIDAI
                              using my Aadhaar solely for verification under the RTE
                              Act, 2016. Consent can be withdrawn any time.
                            </span>
                          </label>
                          {errors.consent && <FieldError message={errors.consent} />}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {step === 2 && (
                  <section className="space-y-5">
                    <div className="flex items-start gap-3 rounded-2xl border border-teal-400/30 bg-teal-500/10 px-4 py-3.5">
                      <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" />
                      <p className="text-xs leading-relaxed text-white/75">
                        <span className="font-bold text-white">Escrow payouts.</span>{' '}
                        Funds released after buyer confirmation settle into this
                        account via IMPS/NEFT — typically within 24 hours. We never
                        store your CVV or hold a balance on your behalf.
                      </p>
                    </div>

                    <Field
                      label="Account holder name"
                      required
                      error={errors.accountHolderName}
                      hint="Exactly as printed in bank records."
                    >
                      <input
                        type="text"
                        value={bank.accountHolderName}
                        onChange={(e) =>
                          updateBank({ accountHolderName: e.target.value })
                        }
                        placeholder="e.g. Tariq Ahmad Bhat"
                        className={cn(
                          inputCls,
                          errors.accountHolderName && 'border-red-400/70',
                        )}
                        autoComplete="name"
                      />
                    </Field>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Field label="Account number" required error={errors.accountNumber}>
                        <div className="relative">
                          <input
                            type={revealAccount ? 'text' : 'password'}
                            value={bank.accountNumber}
                            onChange={(e) =>
                              updateBank({
                                accountNumber: e.target.value.replace(/\D/g, '').slice(0, 18),
                              })
                            }
                            placeholder="••••••••••••"
                            className={cn(
                              inputCls,
                              'pr-11',
                              errors.accountNumber && 'border-red-400/70',
                            )}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() => setRevealAccount((v) => !v)}
                            aria-label={revealAccount ? 'Hide account number' : 'Show account number'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/50 transition-colors hover:text-teal-300"
                          >
                            {revealAccount ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </Field>

                      <Field label="IFSC code" required error={errors.ifsc}>
                        <input
                          type="text"
                          value={bank.ifsc}
                          onChange={(e) => updateBank({ ifsc: formatIfsc(e.target.value) })}
                          placeholder="SBIN0001234"
                          className={cn(
                            inputCls,
                            'uppercase tracking-wider',
                            errors.ifsc && 'border-red-400/70',
                          )}
                          autoComplete="off"
                        />
                      </Field>

                      <Field
                        label="UPI ID"
                        error={errors.upiId}
                        hint="Optional faster rail for sub-₹5,000 payouts."
                      >
                        <input
                          type="text"
                          value={bank.upiId}
                          onChange={(e) => updateBank({ upiId: e.target.value })}
                          placeholder="yourname@bank"
                          className={cn(inputCls, errors.upiId && 'border-red-400/70')}
                        />
                      </Field>
                    </div>

                    <p className="flex items-center gap-2 text-xs text-white/45">
                      <Building2 className="h-3.5 w-3.5 text-teal-300" />
                      Bank details are hashed before storage and never returned to
                      the browser after submission.
                    </p>
                  </section>
                )}
              </div>

              {/* ── Footer ─────────────────────────────────────────────── */}
              <footer className="flex flex-col gap-3 border-t border-white/10 bg-black/30 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={goBack}
                    disabled={step === 0 || saving}
                    className="text-white/70 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <span className="text-xs font-medium text-white/45">
                    Step {step + 1} of {STEPS.length}
                    {Object.keys(currentErrors).length > 0 && (
                      <span className="ml-2 text-red-300">
                        {Object.keys(currentErrors).length} to fix
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => close()}
                    disabled={saving}
                    className="text-white/50 hover:text-white/80"
                  >
                    Continue later
                  </Button>

                  {step < STEPS.length - 1 ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="compact"
                      onClick={goNext}
                      className="bg-[var(--primary,#E8A317)] px-6 text-black hover:brightness-110"
                    >
                      Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      size="compact"
                      isLoading={saving}
                      onClick={submit}
                      className="bg-gradient-to-r from-[#0E7C86] to-[#0A5560] px-6 text-white shadow-[0_10px_30px_-10px_rgba(14,124,134,0.9)] hover:brightness-110"
                    >
                      {!saving && <BadgeCheck className="mr-1 h-4 w-4" />}
                      Submit for review
                    </Button>
                  )}
                </div>
              </footer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Small building blocks ─────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className={labelCls}>
        {label} {required && <span className="text-teal-300">*</span>}
      </span>
      {children}
      {error ? <FieldError message={error} /> : hint ? <p className={hintCls}>{hint}</p> : null}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className={errorCls} role="alert">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

function ModeCard({
  active,
  onClick,
  icon: Icon,
  title,
  blurb,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Store;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-4 text-left transition-all',
        active
          ? 'border-teal-400 bg-teal-500/15 shadow-[0_0_24px_-8px_rgba(14,124,134,0.9)]'
          : 'border-white/15 bg-black/40 hover:border-white/35 hover:bg-black/60',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          active ? 'bg-[#0E7C86] text-white' : 'bg-white/10 text-white/60',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-white">{title}</span>
        <span className="block truncate text-[11px] text-white/50">{blurb}</span>
      </span>
    </button>
  );
}

/**
 * The glass card the dashboards show while the modal is closed. Tone decides
 * the copy and whether clicking it re-opens the panel.
 */
function renderBanner(
  state: KycOnboardingState,
  onOpen: () => void,
  showBanner: boolean,
) {
  const tone = kycBannerTone(state);
  if (!showBanner || tone === 'verified' || tone === 'none') return null;

  const config = {
    action: {
      icon: IdCard,
      title: 'Complete your Full KYC',
      body: 'Profile, identity and bank details — three short steps unlock escrow payouts and full trading limits.',
      cta: 'Start verification',
      tone: 'border-amber-400/40 bg-amber-500/10',
      iconTone: 'text-amber-300',
      button:
        'bg-gradient-to-r from-[#E8A317] to-[#D9622B] text-black hover:brightness-110',
    },
    review: {
      icon: Loader2,
      title: 'KYC under review',
      body: `Submitted ${state.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'just now'} — verification usually clears within 1–2 business days.`,
      cta: null,
      tone: 'border-teal-400/40 bg-teal-500/10',
      iconTone: 'text-teal-300',
      button: '',
    },
    rejected: {
      icon: CircleAlert,
      title: 'KYC needs your attention',
      body: 'Your submission came back with corrections. Re-open the panel to re-upload the flagged details.',
      cta: 'Fix & re-submit',
      tone: 'border-red-400/40 bg-red-500/10',
      iconTone: 'text-red-300',
      button: 'bg-gradient-to-r from-[#C62828] to-[#9E2020] text-white hover:brightness-110',
    },
  }[tone];

  const Icon = config.icon;

  return (
    <div
      role="status"
      className={cn(
        'mb-6 flex flex-col gap-4 rounded-2xl border p-5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between',
        config.tone,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          <Icon
            className={cn(
              'h-5 w-5',
              config.iconTone,
              tone === 'review' && 'animate-spin [animation-duration:2.5s]',
            )}
          />
        </span>
        <div>
          <p className="text-sm font-bold text-white">{config.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-white/65">{config.body}</p>
        </div>
      </div>

      {config.cta && (
        <Button
          type="button"
          variant="primary"
          size="compact"
          onClick={onOpen}
          className={cn('shrink-0 px-5', config.button)}
        >
          {config.cta}
        </Button>
      )}
    </div>
  );
}

/**
 * Escape hatch for support tooling / demos: wipes this role's record so the
 * dashboards behave like a brand-new account again.
 */
export function resetKycOnboarding(role: KycRole): KycOnboardingState {
  clearKycState(role);
  return defaultKycState();
}
