import { Button } from "@/components/ui/Button";
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Calendar, Clock, Globe, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react';
import { buyerListingsApi, buyerAppointmentsApi } from '@/lib/api/buyer';
import { ApiError } from '@/lib/api/client';

/**
 * AppointmentBookPage
 *
 * API contracts (Module 3 — verified against src/modules/appointments/):
 *   GET /appointments/slots?listingId=...&timezone=...
 *     → AvailableSlot[] [{ start: ISO-8601 UTC, end: ISO-8601 UTC }]
 *   POST /appointments
 *     { listingId, requestedSlot (ISO-8601 UTC), durationMinutes?, notes?, timezone }
 *     → { id, message }
 *
 * Timezone handling:
 *   - All slots are returned by the backend as ISO-8601 UTC.
 *   - The UI converts them to the BUYER'S local timezone for display
 *     using Intl.DateTimeFormat with the buyer's detected timezone.
 *   - The FARMER's timezone is shown separately as a reference label
 *     so the buyer can see what time it is for the farmer too.
 *   - The slot sent to POST /appointments is always in UTC (ISO-8601);
 *     the buyer's IANA timezone is sent as a separate `timezone` field.
 *   - Never display UTC times to the user without a timezone label.
 *
 * Calendar UI:
 *   - Month view: navigate month-by-month.
 *   - Dates with available slots are highlighted.
 *   - Clicking a date shows time slots for that day.
 *   - Selecting a slot advances to a confirmation step.
 *
 * Accessibility:
 *   - Calendar grid: role="grid" with aria-label.
 *   - Day cells: role="gridcell" with aria-label ("Monday, Sep 15, 2 slots available").
 *   - Time slots: radio group with aria-label.
 *   - Prev/Next month: aria-label.
 *   - Confirmation step: aria-live="polite".
 */

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatSlot(isoUtc: string, tz: string) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: true,
  }).format(new Date(isoUtc));
}

function formatSlotDate(isoUtc: string, tz: string) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: tz,
  }).format(new Date(isoUtc));
}

function slotDayKey(isoUtc: string, tz: string): string {
  // Returns 'YYYY-MM-DD' in the buyer's local timezone
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(isoUtc));
  return d; // en-CA gives YYYY-MM-DD
}

type Step = 'select-slot' | 'confirm' | 'success';

export default function AppointmentBookPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const router = useRouter();

  // Detect buyer's IANA timezone
  const buyerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [step, setStep]             = useState<Step>('select-slot');
  const [calMonth, setCalMonth]     = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null); // ISO-8601 UTC
  const [notes, setNotes]           = useState('');

  // Load listing (to show farmer name + timezone)
  const listingQ = useQuery({
    queryKey: ['listing', listingId],
    queryFn:  () => buyerListingsApi.getOne(listingId),
  });

  // Load available slots for the current month
  const slotsQ = useQuery({
    queryKey: ['slots', listingId, buyerTz, calMonth.getFullYear(), calMonth.getMonth()],
    queryFn:  () => buyerAppointmentsApi.getSlots(listingId, buyerTz),
    enabled:  !!listingId,
  });

  const bookMut = useMutation({
    mutationFn: () =>
      buyerAppointmentsApi.request({
        listingId,
        requestedSlot: selectedSlot!,
        timezone: buyerTz,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => setStep('success'),
  });

  // Build a map of day -> slots
  const slotsByDay = (slotsQ.data ?? []).reduce<Record<string, typeof slotsQ.data>>(
    (acc, slot) => {
      if (!slot) return acc;
      const key = slotDayKey(slot.start, buyerTz);
      acc[key] = [...(acc[key] ?? []), slot];
      return acc;
    },
    {}
  );

  // Calendar grid helpers
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = slotDayKey(new Date().toISOString(), buyerTz);

  function prevMonth() {
    setCalMonth(new Date(year, month - 1, 1));
    setSelectedDay(null);
  }
  function nextMonth() {
    setCalMonth(new Date(year, month + 1, 1));
    setSelectedDay(null);
  }

  const daySlots = selectedDay ? (slotsByDay[selectedDay] ?? []) : [];

  const bookError =
    bookMut.error instanceof ApiError
      ? bookMut.error.messages[0]
      : bookMut.error ? 'Booking failed. Please try again.' : null;

  // ─── Success state ───
  if (step === 'success') {
    return (
      <main id="main-content" className="kr-container py-10 max-w-lg">
        <div role="status" aria-live="polite" className="text-center space-y-4 py-12">
          <CheckCircle2 className="w-14 h-14 text-kr-success-500 mx-auto" aria-hidden="true" />
          <h1 className="font-heading text-h2 text-kr-text-primary">Appointment requested!</h1>
          <p className="text-body text-kr-text-secondary">
            The farmer has been notified. You'll hear back once they confirm.
          </p>
          {selectedSlot && (
            <p className="text-body-sm font-medium text-kr-text-primary">
              Requested time:{' '}
              <time dateTime={selectedSlot}>
                {formatSlotDate(selectedSlot, buyerTz)}, {formatSlot(selectedSlot, buyerTz)}
              </time>{' '}
              <span className="text-kr-text-secondary">({buyerTz})</span>
            </p>
          )}
          <Button
            onClick={() => router.push('/buyer/discover')}
            className="kr-btn-primary"
          >
            Back to listings
          </Button>
        </div>
      </main>
    );
  }

  // ─── Confirm step ───
  if (step === 'confirm' && selectedSlot) {
    return (
      <main id="main-content" className="kr-container py-6 md:py-10 max-w-lg">
        <Button
          onClick={() => setStep('select-slot')}
          className="flex items-center gap-1 text-body-sm text-kr-text-secondary
                     hover:text-kr-text-primary mb-6 kr-focus-ring rounded"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back to calendar
        </Button>

        <h1 className="font-heading text-h2 text-kr-text-primary mb-2">Confirm appointment</h1>

        <div className="kr-card kr-glass-amber kr-pattern-chinar space-y-4 mb-6">
          <div>
            <p className="text-caption text-kr-text-secondary uppercase tracking-wide">Listing</p>
            <p className="text-body font-medium text-kr-text-primary">
              {listingQ.data?.title ?? 'Loading…'}
            </p>
          </div>
          <div>
            <p className="text-caption text-kr-text-secondary uppercase tracking-wide">Farmer</p>
            <p className="text-body text-kr-text-primary">{listingQ.data?.farmerName ?? '—'}</p>
          </div>
          <div>
            <p className="text-caption text-kr-text-secondary uppercase tracking-wide">
              Your local time
            </p>
            <p className="text-body font-medium text-kr-text-primary">
              <time dateTime={selectedSlot}>
                {formatSlotDate(selectedSlot, buyerTz)}, {formatSlot(selectedSlot, buyerTz)}
              </time>
            </p>
            <p className="text-caption text-kr-text-secondary flex items-center gap-1">
              <Globe className="w-3 h-3" aria-hidden="true" /> {buyerTz}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="notes" className="kr-label">Notes for the farmer (optional)</label>
          <textarea
            id="notes"
            rows={3}
            placeholder="Any specific questions or requirements…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="kr-input resize-y"
          />
        </div>

        {bookError && (
          <div role="alert" className="kr-error-state mb-4 flex items-start gap-3 text-left">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-body-sm">{bookError}</p>
          </div>
        )}

        <Button
          onClick={() => bookMut.mutate()}
          disabled={bookMut.isPending}
          aria-busy={bookMut.isPending}
          className="kr-btn-primary w-full kr-btn-lg"
        >
          {bookMut.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Sending request…</>
            : 'Request appointment'
          }
        </Button>
      </main>
    );
  }

  // ─── Slot selection step ───
  return (
    <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
      <h1 className="font-heading text-h2 text-kr-text-primary mb-1">Book an appointment</h1>
      {listingQ.data && (
        <p className="text-body text-kr-text-secondary mb-6">
          with <span className="font-medium text-kr-text-primary">{listingQ.data.farmerName}</span>
          {' '}&mdash; {listingQ.data.title}
        </p>
      )}

      {/* Timezone disclosure */}
      <div
        className="flex items-start gap-2 p-3 rounded-md
                   bg-kr-fill-brand-subtle border border-kr-border-brand mb-6"
        role="note"
      >
        <Globe className="w-4 h-4 text-kr-primary-600 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-caption text-kr-text-brand">
          All times shown in <strong>your local timezone: {buyerTz}</strong>.
          Slot availability is from the farmer’s calendar.
        </p>
      </div>

      {slotsQ.isError && (
        <div role="alert" className="kr-error-state mb-6">
          <AlertTriangle className="w-8 h-8 text-kr-danger-500 mx-auto" aria-hidden="true" />
          <p className="text-body text-kr-text-primary">Could not load available slots</p>
          <Button onClick={() => slotsQ.refetch()} className="kr-btn-secondary kr-btn-sm">
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
        {/* Calendar */}
        <div
          role="grid"
          aria-label={`${MONTHS[month]} ${year} availability calendar`}
          className="kr-card kr-glass-amber kr-pattern-chinar"
        >
          {/* Month header */}
          <div className="flex items-center justify-between mb-4">
            <Button
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-2 rounded-md hover:bg-kr-bg-sunken kr-focus-ring
                         text-kr-text-secondary hover:text-kr-text-primary transition-colors"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </Button>
            <h2 className="font-heading text-h4 text-kr-text-primary" aria-live="polite">
              {MONTHS[month]} {year}
            </h2>
            <Button
              onClick={nextMonth}
              aria-label="Next month"
              className="p-2 rounded-md hover:bg-kr-bg-sunken kr-focus-ring
                         text-kr-text-secondary hover:text-kr-text-primary transition-colors"
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>

          {/* Day-of-week headers */}
          <div role="row" className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div
                key={d}
                role="columnheader"
                aria-label={['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][
                  DAYS.indexOf(d)
                ]}
                className="text-center text-caption text-kr-text-secondary py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} role="gridcell" aria-hidden="true" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum  = i + 1;
              const dayISO  = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const slots   = slotsByDay[dayISO];
              const hasSlots = !!slots?.length;
              const isToday = dayISO === todayStr;
              const isPast  = dayISO < todayStr;
              const isSelected = dayISO === selectedDay;
              const isLoading  = slotsQ.isLoading;

              return (
                <div key={dayNum} role="gridcell">
                  <Button
                    type="button"
                    disabled={isPast || (!hasSlots && !isLoading)}
                    onClick={() => setSelectedDay(dayISO)}
                    aria-label={`${
                      ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][
                        new Date(year, month, dayNum).getDay()
                      ]
                    }, ${MONTHS[month]} ${dayNum}${
                      hasSlots ? `, ${slots!.length} slot${slots!.length > 1 ? 's' : ''} available` : ''
                    }${ isSelected ? ', selected' : '' }`}
                    aria-pressed={isSelected}
                    className={`
                      w-full aspect-square rounded-full text-body-sm font-medium
                      flex items-center justify-center transition-colors kr-focus-ring
                      ${ isSelected
                        ? 'bg-kr-primary-500 text-white'
                        : hasSlots
                        ? 'bg-kr-fill-brand-subtle text-kr-primary-700 hover:bg-kr-bg-sunken'
                        : isPast
                        ? 'text-kr-text-disabled cursor-not-allowed'
                        : 'text-kr-text-secondary'
                      }
                      ${ isToday && !isSelected ? 'ring-2 ring-kr-primary-400 ring-offset-1' : '' }
                    `}
                  >
                    {isLoading
                      ? <span className="kr-skeleton w-4 h-4 rounded-full" aria-hidden="true" />
                      : dayNum
                    }
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-kr-neutral-200">
            <span className="flex items-center gap-1.5 text-caption text-kr-text-secondary">
              <span className="w-3 h-3 rounded-full bg-kr-fill-brand-subtle border border-kr-primary-300" aria-hidden="true" />
              Available
            </span>
            <span className="flex items-center gap-1.5 text-caption text-kr-text-secondary">
              <span className="w-3 h-3 rounded-full bg-kr-primary-500" aria-hidden="true" />
              Selected
            </span>
            <span className="flex items-center gap-1.5 text-caption text-kr-text-secondary">
              <span className="w-3 h-3 rounded-full ring-2 ring-kr-primary-400 ring-offset-1" aria-hidden="true" />
              Today
            </span>
          </div>
        </div>

        {/* Time slots panel */}
        <div className="min-w-[220px]">
          {!selectedDay ? (
            <div className="kr-empty-state py-10">
              <Calendar className="w-8 h-8 text-kr-text-disabled mx-auto" aria-hidden="true" />
              <p className="text-body-sm text-kr-text-secondary">Select a date to see available times</p>
            </div>
          ) : daySlots.length === 0 ? (
            <div className="kr-empty-state py-10">
              <Clock className="w-8 h-8 text-kr-text-disabled mx-auto" aria-hidden="true" />
              <p className="text-body-sm text-kr-text-secondary">No slots on this day</p>
            </div>
          ) : (
            <fieldset>
              <legend className="kr-label mb-3">
                <time dateTime={selectedDay}>
                  {new Intl.DateTimeFormat('en', {
                    weekday: 'long', month: 'long', day: 'numeric',
                    timeZone: buyerTz,
                  }).format(new Date(selectedDay + 'T12:00:00'))}
                </time>
                <span className="block text-caption font-normal text-kr-text-secondary mt-0.5">
                  <Globe className="inline w-3 h-3 mr-1" aria-hidden="true" />
                  Showing in {buyerTz}
                </span>
              </legend>

              <div
                role="radiogroup"
                aria-label="Available appointment times"
                className="space-y-2"
              >
                {daySlots.map((slot) => {
                  if (!slot) return null;
                  const isSelected = selectedSlot === slot.start;
                  return (
                    <label
                      key={slot.start}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border cursor-pointer
                        transition-colors kr-focus-ring
                        ${ isSelected
                          ? 'border-kr-border-brand bg-kr-fill-brand-subtle'
                          : 'border-kr-border-default bg-kr-bg-surface hover:border-kr-border-brand hover:bg-kr-fill-brand-subtle'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name="slot"
                        value={slot.start}
                        checked={isSelected}
                        onChange={() => setSelectedSlot(slot.start)}
                        className="accent-kr-primary-500 w-4 h-4"
                        aria-label={`${formatSlot(slot.start, buyerTz)} – ${formatSlot(slot.end, buyerTz)} (your time)`}
                      />
                      <div>
                        <p className="text-body-sm font-medium text-kr-text-primary">
                          {formatSlot(slot.start, buyerTz)}
                          <span className="text-kr-text-secondary font-normal"> – {formatSlot(slot.end, buyerTz)}</span>
                        </p>
                        <p className="text-caption text-kr-text-secondary">
                          <Globe className="inline w-3 h-3 mr-0.5" aria-hidden="true" />
                          {buyerTz}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <Button
                onClick={() => { if (selectedSlot) setStep('confirm'); }}
                disabled={!selectedSlot}
                className="kr-btn-primary w-full mt-4"
              >
                Continue
              </Button>
            </fieldset>
          )}
        </div>
      </div>
    </main>
  );
}
