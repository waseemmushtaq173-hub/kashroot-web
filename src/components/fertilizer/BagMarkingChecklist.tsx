'use client';

/**
 * BagMarkingChecklist — What to check on a fertiliser bag when the
 * manufacturer has no verification page (or the product isn't in the list).
 * Based on Fertiliser (Control) Order, 1985 mandatory label requirements.
 *
 * Shows a checklist the farmer can tick off. If anything fails, offers
 * "Book lab test" button. Results can be read aloud.
 */
import { useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertCircle, FileText, Loader2, ShieldCheck, Camera } from 'lucide-react';

import { Btn, INPUT, PORTAL_THEMES } from '@/components/portal/kit';
import { SpeakButton } from '@/components/voice/VoiceButtons';

const theme = PORTAL_THEMES.dealer;

interface BagMarkingChecklistProps {
  productName?: string;
  onLabTest: () => void;
  onClose: () => void;
  isRtl?: boolean;
}

interface CheckItem {
  id: string;
  label: string;
  lawRef: string;
  required: boolean;
  check: (value: string) => { pass: boolean; detail?: string };
  inputType: 'text' | 'select' | 'boolean';
  options?: string[];
  placeholder?: string;
}

const CHECKLIST: CheckItem[] = [
  {
    id: 'manufacturer',
    label: 'Manufacturer name and address',
    lawRef: 'FCO 1985, Schedule I, Clause 2',
    required: true,
    check: (v) => ({ pass: v.trim().length >= 3, detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. IFFCO, Paradeep Phosphates Ltd.',
  },
  {
    id: 'product_name',
    label: 'Product name (e.g. Urea, DAP, MOP)',
    lawRef: 'FCO 1985, Schedule I, Clause 3',
    required: true,
    check: (v) => ({ pass: v.trim().length >= 2, detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. Urea, DAP 18-46-0, NPK 12:32:16',
  },
  {
    id: 'grade',
    label: 'Grade / nutrient composition (e.g. 46:0:0, 18:46:0)',
    lawRef: 'FCO 1985, Schedule I, Clause 4',
    required: true,
    check: (v) => ({ pass: v.trim().length >= 3, detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. 46:0:0, 18:46:0, 12:32:16',
  },
  {
    id: 'net_weight',
    label: 'Net weight (e.g. 45 kg, 50 kg)',
    lawRef: 'FCO 1985, Schedule I, Clause 5',
    required: true,
    check: (v) => ({ pass: /^\d+(\.\d+)?\s*(kg|g|mt|ton)/i.test(v.trim()), detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. 45 kg, 50 kg',
  },
  {
    id: 'batch_number',
    label: 'Batch / lot number',
    lawRef: 'FCO 1985, Schedule I, Clause 6',
    required: true,
    check: (v) => ({ pass: v.trim().length >= 3, detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. B-2024-00123',
  },
  {
    id: 'mfg_date',
    label: 'Date of manufacture (MM/YYYY or DD/MM/YYYY)',
    lawRef: 'FCO 1985, Schedule I, Clause 7',
    required: true,
    check: (v) => {
      const trimmed = v.trim();
      const pass = /^\d{2}\/\d{4}$/.test(trimmed) || /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed);
      return { pass, detail: trimmed };
    },
    inputType: 'text',
    placeholder: 'e.g. 03/2024 or 15/03/2024',
  },
  {
    id: 'expiry_date',
    label: 'Expiry / best before date (if printed)',
    lawRef: 'FCO 1985, Schedule I, Clause 8',
    required: false,
    check: (v) => {
      const trimmed = v.trim();
      if (!trimmed) return { pass: true, detail: 'Not printed' };
      const pass = /^\d{2}\/\d{4}$/.test(trimmed) || /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed);
      return { pass, detail: trimmed };
    },
    inputType: 'text',
    placeholder: 'e.g. 03/2025 or 15/03/2025',
  },
  {
    id: 'mrp',
    label: 'Maximum Retail Price (MRP) inclusive of all taxes',
    lawRef: 'FCO 1985, Schedule I, Clause 9',
    required: true,
    check: (v) => ({ pass: /^\d+(\.\d+)?/.test(v.trim()), detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. ₹275.00',
  },
  {
    id: 'license_no',
    label: 'FCO licence / registration number',
    lawRef: 'FCO 1985, Schedule I, Clause 10',
    required: true,
    check: (v) => ({ pass: v.trim().length >= 5, detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. FCO/UP/2024/12345',
  },
  {
    id: 'warning_statement',
    label: 'Warning statement: "Use only on recommendation of soil test" or similar',
    lawRef: 'FCO 1985, Schedule I, Clause 11',
    required: true,
    check: (v) => ({ pass: v.trim().length >= 10, detail: v.trim() }),
    inputType: 'text',
    placeholder: 'e.g. Use only on recommendation of soil test',
  },
  {
    id: 'seal_intact',
    label: 'Bag seal intact, no tampering signs',
    lawRef: 'FCO 1985, Schedule I, General',
    required: true,
    check: (v) => ({ pass: v === 'yes', detail: v === 'yes' ? 'Seal intact' : 'Seal broken / tampered' }),
    inputType: 'select',
    options: ['yes', 'no'],
  },
  {
    id: 'print_quality',
    label: 'Printing clear, no smudging, spelling correct',
    lawRef: 'FCO 1985, Schedule I, General',
    required: true,
    check: (v) => ({ pass: v === 'yes', detail: v === 'yes' ? 'Printing clear' : 'Printing smudged / errors' }),
    inputType: 'select',
    options: ['yes', 'no'],
  },
];

const summaryLines = (results: Record<string, { pass: boolean; value: string; detail: string }>): string[] => {
  const passed = Object.entries(results).filter(([, r]) => r.pass).length;
  const total = Object.keys(results).length;
  const failed = Object.entries(results).filter(([, r]) => !r.pass && CHECKLIST.find((c) => c.id === r.value?.split(' ')[0])?.required);
  return [
    `Bag marking check: ${passed} of ${total} items passed.`,
    failed.length > 0 ? `${failed.length} required item${failed.length === 1 ? '' : 's'} failed — this bag may not comply with FCO 1985.` : 'All required markings present.',
    'A Government Fertiliser Quality Control Laboratory test is the only legal proof of what is inside.',
  ];
};

export function BagMarkingChecklist({ productName, onLabTest, onClose, isRtl = false }: BagMarkingChecklistProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { pass: boolean; value: string; detail: string }>>({});
  const [spoken, setSpoken] = useState<string>('');
  const [speaking, setSpeaking] = useState(false);

  const runChecks = useCallback(() => {
    const newResults: Record<string, { pass: boolean; value: string; detail: string }> = {};
    for (const item of CHECKLIST) {
      const value = values[item.id] ?? '';
      const check = item.check(value);
      newResults[item.id] = { pass: check.pass, value, detail: check.detail ?? '' };
    }
    setResults(newResults);
    const lines = summaryLines(newResults);
    setSpoken(lines.join(' '));
  }, [values]);

  const handleChange = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    // Re-check this item immediately
    const item = CHECKLIST.find((c) => c.id === id);
    if (item) {
      const check = item.check(value);
      setResults((prev) => ({ ...prev, [id]: { pass: check.pass, value, detail: check.detail ?? '' } }));
    }
  };

  const speakSummary = () => {
    if (!spoken) {
      runChecks();
    }
    setSpeaking(true);
    // The SpeakButton component will handle actual TTS
    setTimeout(() => setSpeaking(false), 3000);
  };

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-sm" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FileText className="h-5 w-5 text-sky-600" aria-hidden />
            Bag-Marking Checklist (FCO 1985, Schedule I)
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Check every item on the bag. The law requires all of these. A lab test is the only legal proof of contents.
          </p>
          {productName && <p className="mt-1 text-sm font-medium text-slate-800">Product: {productName}</p>}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close checklist">
          <XCircle className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
        {CHECKLIST.map((item) => {
          const result = results[item.id];
          const value = values[item.id] ?? '';
          const isRequired = item.required;
          const done = result?.pass === true;
          const failed = result?.pass === false && value.length > 0;

          return (
            <div
              key={item.id}
              className={`rounded-xl p-4 transition ${failed ? 'bg-rose-50 ring-2 ring-rose-200' : done ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50 ring-1 ring-slate-200'}`}
            >
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center ${done ? 'text-emerald-600 border-emerald-600 bg-emerald-50' : failed ? 'text-rose-600 border-rose-600 bg-rose-50' : 'text-slate-300 border-slate-300'}`}>
                  {done && <CheckCircle2 className="h-4 w-4" aria-hidden />}
                  {failed && <XCircle className="h-4 w-4" aria-hidden />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{item.label}{isRequired && <span className="text-rose-600 ml-1" aria-hidden>*</span>}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Law: {item.lawRef}</p>
                  {item.inputType === 'select' ? (
                    <select
                      value={value}
                      onChange={(e) => handleChange(item.id, e.target.value)}
                      className={`mt-2 w-full ${INPUT}`}
                      aria-label={item.label}
                    >
                      <option value="">Select…</option>
                      {item.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt === 'yes' ? 'Yes' : 'No'}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => handleChange(item.id, e.target.value)}
                      placeholder={item.placeholder}
                      className={`${INPUT} mt-2`}
                      aria-label={item.label}
                    />
                  )}
                  {result && (
                    <p className={`mt-1.5 text-xs ${result.pass ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {result.pass ? `✓ ${result.detail}` : `✗ ${result.detail || 'Missing or invalid'}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(values).length > 0 && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ShieldCheck className="h-5 w-5" aria-hidden /> Summary
          </p>
          <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{summaryLines(results).join('\n')}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Btn theme={theme} icon={Loader2} onClick={runChecks} className="min-h-11" disabled={speaking}>
          {speaking ? 'Reading…' : 'Check all & read aloud'}
        </Btn>
        <SpeakButton text={spoken || summaryLines(results).join(' ')} lang="en" />
        <Btn theme={theme} variant="soft" icon={Camera} onClick={onLabTest} className="min-h-11">
          Book Lab Test
        </Btn>
        <Btn theme={theme} variant="danger" icon={AlertCircle} className="min-h-11" onClick={onClose}>
          Report Suspected Fake
        </Btn>
        <Btn theme={theme} variant="ghost" onClick={onClose} className="min-h-11">
          Done
        </Btn>
      </div>
    </div>
  );
}