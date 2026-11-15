'use client';

import { useMemo } from 'react';
import { z, ZodTypeAny, ZodObject, ZodRawShape } from 'zod';
import { Btn, INPUT, PORTAL_THEMES, Badge } from '@/components/portal/kit';
import { SpeakButton } from '@/components/voice/VoiceButtons';

const theme = PORTAL_THEMES.dealer;

/** Field configuration for form rendering */
interface FieldConfig {
  key: string;
  label: { en: string; hi: string; ur: string; ks: string };
  type: 'number' | 'select' | 'boolean' | 'text';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: { en: string; hi: string; ur: string; ks: string } }[];
  placeholder?: { en: string; hi: string; ur: string; ks: string };
  helpText?: { en: string; hi: string; ur: string; ks: string };
  presets?: number[];
}

interface StudioFormProps<T extends Record<string, unknown>> {
  /** Zod schema for validation. */
  schema: ZodObject<ZodRawShape>;
  /** Default values. */
  defaults: T;
  /** Current values (controlled). */
  values: T;
  /** Callback when a field value changes. */
  onChange: (key: string, value: unknown) => void;
  /** Field configurations for rendering. */
  fields: FieldConfig[];
  /** Design type for context. */
  designType: 'carton' | 'crate' | 'coldStore' | 'truckLoad' | 'orchardLayout';
  /** Current locale. */
  locale: 'en' | 'hi' | 'ur' | 'ks';
  /** Whether form is disabled. */
  disabled?: boolean;
  /** Callback when form is reset. */
  onReset?: () => void;
  /** Whether to show validation errors. */
  showErrors?: boolean;
}

const LANG_LABELS: Record<'en' | 'hi' | 'ur' | 'ks', string> = {
  en: 'English', hi: 'हिन्दी', ur: 'اردو', ks: 'کٲشُر'
};

function getLocalized(obj: { en: string; hi: string; ur: string; ks: string }, locale: 'en' | 'hi' | 'ur' | 'ks'): string {
  return obj[locale];
}

function t(obj: { en: string; hi: string; ur: string; ks: string }, locale: 'en' | 'hi' | 'ur' | 'ks'): string {
  return obj[locale];
}

/** Schema-driven form component */
export function StudioForm<T extends Record<string, unknown>>({
  schema,
  defaults,
  values,
  onChange,
  fields,
  designType,
  locale,
  disabled = false,
  onReset,
  showErrors = true,
}: StudioFormProps<T>) {
  // Validate current values against schema
  const validation = useMemo(() => schema.safeParse(values), [values, schema]);
  const errors = validation.success ? {} : validation.error.flatten().fieldErrors;

  const handleChange = (key: string, value: unknown) => {
    onChange(key, value);
  };

  const handleReset = () => {
    // Reset each field to default
    Object.entries(defaults).forEach(([key, value]) => {
      onChange(key, value);
    });
    onReset?.();
  };

  const handlePreset = (key: string, presetValue: number) => {
    onChange(key, presetValue);
  };

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm font-medium text-slate-700">Language:</span>
        <div className="flex gap-1">
          {(['en', 'hi', 'ur', 'ks'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={`min-h-9 min-w-9 cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold transition ${locale === l ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-emerald-50 ring-1 ring-slate-200'}`}
              onClick={() => window.dispatchEvent(new CustomEvent('studio:locale', { detail: l }))}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {fields.map((field) => {
          const error = showErrors && errors[field.key] ? errors[field.key]![0] : null;
          const label = getLocalized(field.label, locale);
          const placeholder = field.placeholder ? getLocalized(field.placeholder, locale) : undefined;
          const helpText = field.helpText ? getLocalized(field.helpText, locale) : null;
          const unit = field.unit ? getLocalized({ en: field.unit, hi: field.unit, ur: field.unit, ks: field.unit }, locale) : '';
          
          return (
            <div key={field.key} className={`rounded-xl p-4 transition ${error ? 'bg-rose-50 ring-2 ring-rose-200' : 'bg-white ring-1 ring-slate-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                  {label}
                  {field.unit && <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{unit}</span>}
                  {field.type === 'select' && field.options && (
                    <span className="text-xs text-slate-500">({field.options.length} options)</span>
                  )}
                </label>
                {field.presets && field.presets.length > 0 && (
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`${label} presets`}>
                    {field.presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`min-h-8 cursor-pointer rounded-lg px-2 py-0.5 text-xs font-semibold transition ${values[field.key] === preset ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-emerald-50 ring-1 ring-slate-200'}`}
                        onClick={() => handlePreset(field.key, preset)}
                        disabled={disabled}
                        aria-pressed={values[field.key] === preset}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {field.type === 'number' && (
                  <>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step || 1}
                      value={values[field.key] as number}
                      onChange={(e) => handleChange(field.key, Number(e.target.value))}
                      placeholder={placeholder}
                      className={`${INPUT} w-full sm:w-48`}
                      disabled={disabled}
                      aria-invalid={!!error}
                      aria-describedby={error ? `${field.key}-error` : helpText ? `${field.key}-help` : undefined}
                    />
                    {unit && <span className="text-sm text-slate-500">{unit}</span>}
                  </>
                )}
                
                {field.type === 'select' && field.options && (
                  <select
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className={`${INPUT} min-w-[180px]`}
                    disabled={disabled}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${field.key}-error` : helpText ? `${field.key}-help` : undefined}
                  >
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {getLocalized(opt.label, locale)}
                      </option>
                    ))}
                  </select>
                )}
                
                {field.type === 'boolean' && (
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={values[field.key] as boolean}
                      onChange={(e) => handleChange(field.key, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      disabled={disabled}
                    />
                    <span className="text-sm text-slate-700">{t({ en: 'Yes', hi: 'हाँ', ur: 'جی ہاں', ks: 'ہ۠' }, locale)}</span>
                  </label>
                )}
                
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={placeholder}
                    className={`${INPUT} flex-1 min-w-[200px]`}
                    disabled={disabled}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${field.key}-error` : helpText ? `${field.key}-help` : undefined}
                  />
                )}
              </div>
              
              {(helpText || error) && (
                <div className="mt-2 flex items-start gap-1 text-xs">
                  {error && (
                    <span id={`${field.key}-error`} className="text-rose-700" role="alert">
                      ⚠ {error}
                    </span>
                  )}
                  {helpText && !error && (
                    <span id={`${field.key}-help`} className="text-slate-500">
                      ℹ {helpText}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 flex flex-wrap gap-2">
        {onReset && (
          <Btn theme={theme} variant="ghost" onClick={handleReset} disabled={disabled} className="min-h-11">
            ↺ Reset to defaults
          </Btn>
        )}
        <div className="flex-1" />
        <SpeakButton
          text={`Form for ${designType}. Current values: ${Object.entries(values).map(([k, v]) => `${k} ${v}`).join(', ')}`}
          lang={locale}
          className="min-h-11"
        />
      </div>
    </form>
  );
}

/** Predefined field configurations for each design type */
export const CARTON_FIELDS: FieldConfig[] = [
  {
    key: 'length',
    label: { en: 'Length', hi: 'लंबाई', ur: 'لمبائی', ks: 'لۂمبائی' },
    type: 'number',
    unit: 'mm',
    min: 100,
    max: 2000,
    step: 10,
    presets: [300, 400, 500, 600],
    helpText: { en: 'Internal length of the carton', hi: 'कार्टन की आंतरिक लंबाई', ur: 'کارٹن کی اندرونی لمبائی', ks: 'کارٹن چھِ اندرونی لۂمبائی' },
  },
  {
    key: 'width',
    label: { en: 'Width', hi: 'चौड़ाई', ur: 'چوڑائی', ks: 'چھوڑإئ' },
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 1000,
    step: 10,
    presets: [200, 300, 400],
    helpText: { en: 'Internal width of the carton', hi: 'कार्टन की आंतरिक चौड़ाई', ur: 'کارٹن کی اندرونی چوڑائی', ks: 'کارٹن چھِ اندرونی چھوڑإئ' },
  },
  {
    key: 'height',
    label: { en: 'Height', hi: 'ऊंचाई', ur: 'اونچائی', ks: 'اُنٛچھإئ' },
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 1000,
    step: 10,
    presets: [150, 200, 250, 300],
    helpText: { en: 'Internal height of the carton', hi: 'कार्टन की आंतरिक ऊंचाई', ur: 'کارٹن کی اندرونی اونچائی', ks: 'کارٹن چھِ اندرونی اُنٛچھإئ' },
  },
  {
    key: 'flapStyle',
    label: { en: 'Flap Style', hi: 'फ्लैप शैली', ur: 'فلیپ اسٹائل', ks: 'فلیپ اسٹائل' },
    type: 'select',
    options: [
      { value: 'tuck', label: { en: 'Tuck', hi: 'टक', ur: 'ٹک', ks: 'ٹک' } },
      { value: 'lock', label: { en: 'Lock', hi: 'लॉक', ur: 'لاک', ks: 'لاک' } },
      { value: 'glued', label: { en: 'Glued', hi: 'ग्लूड', ur: 'گلूڈ', ks: 'گلूڈ' } },
      { value: 'stapled', label: { en: 'Stapled', hi: 'स्टेपल्ड', ur: 'سٹيپلیڈ', ks: 'سٹيپلیڈ' } },
    ],
    helpText: { en: 'How the carton flaps close', hi: 'कार्टन के फ्लैप कैसे बंद होते हैं', ur: 'کارٹن کے فلیپ کیسے بند ہوتے ہیں', ks: 'کارٹن چھِ فلیپ کٔہیٖن بٔنٛد ہونٛت چھُنٛ' },
  },
  {
    key: 'material',
    label: { en: 'Material', hi: 'सामग्री', ur: 'مواد', ks: 'مواد' },
    type: 'select',
    options: [
      { value: 'corrugated', label: { en: 'Corrugated', hi: 'कॉरुगेटेड', ur: 'کارتن', ks: 'کارٹن' } },
      { value: 'solid', label: { en: 'Solid Board', hi: 'सॉलिड बोर्ड', ur: 'سالڈ بورڈ', ks: 'سالڈ بورڈ' } },
      { value: 'kraft', label: { en: 'Kraft', hi: 'क्राफ्ट', ur: 'کرافٹ', ks: 'کرافٹ' } },
    ],
    helpText: { en: 'Carton material type', hi: 'कार्टन सामग्री का प्रकार', ur: 'کارٹن کی مواد کی قسم', ks: 'کارٹن چھِ مواد چھِ قسم' },
  },
  {
    key: 'ply',
    label: { en: 'Ply', hi: 'प्लाई', ur: 'پلی', ks: 'پلی' },
    type: 'select',
    options: [
      { value: '3', label: { en: '3-ply', hi: '३-प्लाई', ur: '۳-پلی', ks: '۳-پلی' } },
      { value: '5', label: { en: '5-ply', hi: '५-प्लाई', ur: '۵-پلی', ks: '۵-پلی' } },
      { value: '7', label: { en: '7-ply', hi: '७-प्लाई', ur: '۷-پلی', ks: '۷-پلی' } },
    ],
    helpText: { en: 'Number of layers in the cardboard', hi: 'कार्डबोर्ड में परतों की संख्या', ur: 'کارڈ بورڈ میں پرتوں کی تعداد', ks: 'کارڈ بورڈ مانز پرتوٗن چھِ تعداد' },
  },
  {
    key: 'qrPosition',
    label: { en: 'QR Position', hi: 'QR स्थिति', ur: 'QR پوزیشن', ks: 'QR پوزیشن' },
    type: 'select',
    options: [
      { value: 'top', label: { en: 'Top', hi: 'ऊपर', ur: 'اوپر', ks: 'اُپر' } },
      { value: 'side', label: { en: 'Side', hi: 'पक्ष', ur: 'پہلو', ks: 'پہلو' } },
      { value: 'front', label: { en: 'Front', hi: 'सामने', ur: 'سامنے', ks: 'سامنٛی' } },
      { value: 'back', label: { en: 'Back', hi: 'पीछे', ur: 'پیچھے', ks: 'پچھے' } },
    ],
    helpText: { en: 'Where the QR code label is placed', hi: 'QR कोड लेबल कहाँ लगाया जाता है', ur: 'QR کوڈ لیبل کہاں لگایا جاتا ہے', ks: 'QR کوڈ لیبل کٔہٕ لٔگوٗنٛ وؤں' },
  },
  {
    key: 'dividers',
    label: { en: 'Internal Dividers', hi: 'आंतरिक विभाजक', ur: 'اندرونی تقسیم', ks: 'اندرونی تقسیم' },
    type: 'number',
    min: 0,
    max: 10,
    step: 1,
    presets: [0, 1, 2, 3],
    helpText: { en: 'Number of internal dividers', hi: 'आंतरिक विभाजकों की संख्या', ur: 'اندرونی تقسیموں کی تعداد', ks: 'اندرونی تقسیموٗن چھِ تعداد' },
  },
];

export const CRATE_FIELDS: FieldConfig[] = [
  {
    key: 'length',
    label: { en: 'Length', hi: 'लंबाई', ur: 'لمبائی', ks: 'لۂمبائی' },
    type: 'number',
    unit: 'mm',
    min: 200,
    max: 2000,
    step: 50,
    presets: [400, 500, 600, 800, 1000],
    helpText: { en: 'Crate internal length', hi: 'क्रेट की आंतरिक लंबाई', ur: 'کریٹ کی اندرونی لمبائی', ks: 'کریٹ چھِ اندرونی لۂمبائی' },
  },
  {
    key: 'width',
    label: { en: 'Width', hi: 'चौड़ाई', ur: 'چوڑائی', ks: 'چھوڑإئ' },
    type: 'number',
    unit: 'mm',
    min: 150,
    max: 1500,
    step: 50,
    presets: [300, 400, 500, 600],
    helpText: { en: 'Crate internal width', hi: 'क्रेट की आंतरिक चौड़ाई', ur: 'کریٹ کی اندرونی چوڑائی', ks: 'کریٹ چھِ اندرونی چھوڑإئ' },
  },
  {
    key: 'height',
    label: { en: 'Height', hi: 'ऊंचाई', ur: 'اونچائی', ks: 'اُنٛچھإئ' },
    type: 'number',
    unit: 'mm',
    min: 100,
    max: 1500,
    step: 50,
    presets: [200, 300, 400, 500],
    helpText: { en: 'Crate internal height', hi: 'क्रेट की आंतरिक ऊंचाई', ur: 'کریٹ کی اندرونی اونچائی', ks: 'کریٹ چھِ اندرونی اُنٛچھإئ' },
  },
  {
    key: 'slotCount',
    label: { en: 'Ventilation Slots', hi: 'वेंटिलेशन स्लॉट', ur: 'ونٹلیشن سلوٹ', ks: 'ونٹلیشن سلوٹ' },
    type: 'number',
    min: 0,
    max: 50,
    step: 1,
    presets: [4, 6, 8, 10, 12],
    helpText: { en: 'Number of ventilation slots per side', hi: 'प्रति पक्ष वेंटिलेशन स्लॉट की संख्या', ur: 'ہر پہلو پر وینٹلیشن سلوٹ کی تعداد', ks: 'ہر پہلو تہٕ وینٹلیشن سلوٹ چھِ تعداد' },
  },
  {
    key: 'slotWidth',
    label: { en: 'Slot Width', hi: 'स्लॉट चौड़ाई', ur: 'سلوٹ چوڑائی', ks: 'سلوٹ چھوڑإئ' },
    type: 'number',
    unit: 'mm',
    min: 2,
    max: 20,
    step: 1,
    presets: [3, 5, 8, 10],
    helpText: { en: 'Width of each ventilation slot', hi: 'प्रत्येक वेंटिलेशन स्लॉट की चौड़ाई', ur: 'ہر وینٹلیشن سلوٹ کی چوڑائی', ks: 'ہر وینٹلیشن سلوٹ چھِ چھوڑإئ' },
  },
  {
    key: 'material',
    label: { en: 'Material', hi: 'सामग्री', ur: 'مواد', ks: 'مواد' },
    type: 'select',
    options: [
      { value: 'plastic', label: { en: 'Plastic (HDPE)', hi: 'प्लास्टिक (HDPE)', ur: 'پلسٹک (HDPE)', ks: 'پلسٹک (HDPE)' } },
      { value: 'wood', label: { en: 'Wood', hi: 'लकड़ी', ur: 'لکڑی', ks: 'لکڑی' } },
      { value: 'bamboo', label: { en: 'Bamboo', hi: 'बांस', ur: 'بانس', ks: 'بانس' } },
    ],
    helpText: { en: 'Crate material', hi: 'क्रेट सामग्री', ur: 'کریٹ کی مواد', ks: 'کریٹ چھِ مواد' },
  },
  {
    key: 'handles',
    label: { en: 'Handles', hi: 'हैंडल', ur: 'ہینڈل', ks: 'ہینڈل' },
    type: 'boolean',
    helpText: { en: 'Whether the crate has carrying handles', hi: 'क्या क्रेट में हैंडल हैं', ur: 'کیا کریٹ میں ہینڈل ہیں', ks: 'کریٹ مانز ہینڈل چھُنٛ' },
  },
  {
    key: 'stackable',
    label: { en: 'Stackable', hi: 'स्टैकेबल', ur: 'اسٹیکبل', ks: 'اسٹیکبل' },
    type: 'boolean',
    helpText: { en: 'Whether crates can be safely stacked', hi: 'क्या क्रेट सुरक्षित रूप से रखे जा सकते हैं', ur: 'کیا کریٹ محفوظ طور پر رکھے جا سکتے ہیں', ks: 'کریٹ محفوظ طور تہٕ رکھے جاسٕک چھُنٛ' },
  },
];

export const COLD_STORE_FIELDS: FieldConfig[] = [
  {
    key: 'buildingLength',
    label: { en: 'Building Length', hi: 'इमारत की लंबाई', ur: 'عمارت کی لمبائی', ks: 'عمارت چھِ لۂمبائی' },
    type: 'number',
    unit: 'm',
    min: 5,
    max: 200,
    step: 1,
    presets: [10, 20, 30, 40, 50],
    helpText: { en: 'Total building length', hi: 'कुल इमारत की लंबाई', ur: 'کل عمارت کی لمبائی', ks: 'کول عمارت چھِ لۂمبائی' },
  },
  {
    key: 'buildingWidth',
    label: { en: 'Building Width', hi: 'इमारत की चौड़ाई', ur: 'عمارت کی چوڑائی', ks: 'عمارت چھِ چھوڑإئ' },
    type: 'number',
    unit: 'm',
    min: 5,
    max: 100,
    step: 1,
    presets: [10, 15, 20, 25],
    helpText: { en: 'Total building width', hi: 'कुल इमारत की चौड़ाई', ur: 'کل عمارت کی چوڑائی', ks: 'کول عمارت چھِ چھوڑإئ' },
  },
  {
    key: 'buildingHeight',
    label: { en: 'Building Height', hi: 'इमारत की ऊंचाई', ur: 'عمارت کی اونچائی', ks: 'عمارت چھِ اُنٛچھإئ' },
    type: 'number',
    unit: 'm',
    min: 3,
    max: 20,
    step: 1,
    presets: [4, 5, 6, 8, 10],
    helpText: { en: 'Total building height', hi: 'कुल इमारत की ऊंचाई', ur: 'کل عمارت کی اونچائی', ks: 'کول عمارت چھِ اُنٛچھإئ' },
  },
  {
    key: 'wallThickness',
    label: { en: 'Wall Thickness', hi: 'दीवार की मोटाई', ur: 'دیوار کی موٹائی', ks: 'دیوار چھِ موٗٹإئ' },
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 300,
    step: 10,
    presets: [100, 150, 200, 250],
    helpText: { en: 'Insulated wall panel thickness', hi: 'इन्सुलेटेड दीवार पैनल की मोटाई', ur: 'ان슲لیٹڈ دیوار پینل کی موٹائی', ks: 'ان슲لیٹڈ دیوار پینل چھِ موٗٹإئ' },
  },
  {
    key: 'wallMaterial',
    label: { en: 'Insulation Material', hi: 'इन्सुलेशन सामग्री', ur: 'ان슲لیشن مواد', ks: 'ان슲لیشن مواد' },
    type: 'select',
    options: [
      { value: 'puff', label: { en: 'PUF Panel', hi: 'पफ पैनल', ur: 'پف پینل', ks: 'پف پینل' } },
      { value: 'eps', label: { en: 'EPS', hi: 'ईपीएस', ur: 'ای پی ایس', ks: 'ای پی ایس' } },
      { value: 'rockwool', label: { en: 'Rockwool', hi: 'रॉकवूल', ur: 'راک وول', ks: 'راک وول' } },
    ],
    helpText: { en: 'Wall insulation material type', hi: 'दीवार इन्सुलेशन सामग्री का प्रकार', ur: 'دیوار ان슲لیشن مواد کی قسم', ks: 'دیوار ان슲لیشن مواد چھِ قسم' },
  },
  {
    key: 'chamberCount',
    label: { en: 'Chambers', hi: 'चेंबर', ur: 'چیمبر', ks: 'چیمبر' },
    type: 'number',
    min: 1,
    max: 20,
    step: 1,
    presets: [2, 3, 4, 5, 6, 8, 10],
    helpText: { en: 'Number of independent cold chambers', hi: 'स्वतंत्र कोल्ड चेंबर की संख्या', ur: 'آزاد کولڈ چیمبر کی تعداد', ks: 'آزाद کولڈ چیمبر چھِ تعداد' },
  },
  {
    key: 'chamberTemp',
    label: { en: 'Chamber Temp', hi: 'चेंबर तापमान', ur: 'چیمبر درجہ حرارت', ks: 'چیمبر درجہ حرارت' },
    type: 'number',
    unit: '°C',
    min: -30,
    max: 15,
    step: 1,
    presets: [-25, -18, -5, 0, 2, 4, 8, 10],
    helpText: { en: 'Target temperature for chambers', hi: 'चेंबर के लिए लक्ष्य तापमान', ur: 'چیمبر کے لئے ٹارگٹ درجہ حرارت', ks: 'چیمبر لہٕ ٹارگٹ درجہ حرارت' },
  },
  {
    key: 'rackHeight',
    label: { en: 'Rack Height', hi: 'रैक ऊंचाई', ur: 'ریک اونچائی', ks: 'ریک اُنٛچھإئ' },
    type: 'number',
    unit: 'm',
    min: 1,
    max: 10,
    step: 0.5,
    presets: [2, 3, 4, 5, 6],
    helpText: { en: 'Height of storage racks', hi: 'स्टोरेज रैक की ऊंचाई', ur: 'اسٹوریج ریک کی اونچائی', ks: 'اسٹوریج ریک چھِ اُنٛچھإئ' },
  },
  {
    key: 'aisleWidth',
    label: { en: 'Aisle Width', hi: 'गलियारा चौड़ाई', ur: 'گلیارہ چوڑائی', ks: 'گلیارہ چھوڑإئ' },
    type: 'number',
    unit: 'm',
    min: 0.8,
    max: 3,
    step: 0.1,
    presets: [1, 1.2, 1.5, 1.8, 2],
    helpText: { en: 'Width of aisles between racks', hi: 'रैक के बीच गलियारे की चौड़ाई', ur: 'ریک کے درمیان گلیارے کی چوڑائی', ks: 'ریک چھِ درمیإن گلیارہ چھِ چھوڑإئ' },
  },
  {
    key: 'bayWidth',
    label: { en: 'Bay Width', hi: 'बे चौड़ाई', ur: 'بے چوڑائی', ks: 'بے چھوڑإئ' },
    type: 'number',
    unit: 'm',
    min: 0.8,
    max: 3,
    step: 0.1,
    presets: [0.9, 1.2, 1.5, 1.8],
    helpText: { en: 'Width of each storage bay', hi: 'प्रत्येक स्टोरेज बे की चौड़ाई', ur: 'ہر اسٹوریج بے کی چوڑائی', ks: 'ہر اسٹوریج بے چھِ چھوڑإئ' },
  },
  {
    key: 'doorType',
    label: { en: 'Door Type', hi: 'दरवाजा प्रकार', ur: 'دروازے کی قسم', ks: 'دروازہ چھِ قسم' },
    type: 'select',
    options: [
      { value: 'hinged', label: { en: 'Hinged', hi: 'हिंज्ड', ur: 'ہنجڈ', ks: 'ہنجڈ' } },
      { value: 'sliding', label: { en: 'Sliding', hi: 'स्लाइडिंग', ur: 'سلائیڈنگ', ks: 'سلائیڈنگ' } },
      { value: 'rollup', label: { en: 'Roll-up', hi: 'रोल-अप', ur: 'رول-اَپ', ks: 'رول-اَپ' } },
    ],
    helpText: { en: 'Cold chamber door type', hi: 'कोल्ड चेंबर दरवाजे का प्रकार', ur: 'کولڈ چیمبر دروازے کی قسم', ks: 'کولڈ چیمبر دروازہ چھِ قسم' },
  },
];

export const TRUCK_LOAD_FIELDS: FieldConfig[] = [
  {
    key: 'cargoLength',
    label: { en: 'Cargo Length', hi: 'कार्गो लंबाई', ur: 'کارگو لمبائی', ks: 'کارگو لۂمبائی' },
    type: 'number',
    unit: 'm',
    min: 2,
    max: 20,
    step: 0.5,
    presets: [6, 8, 10, 12, 14],
    helpText: { en: 'Internal cargo length', hi: 'आंतरिक कार्गो लंबाई', ur: 'اندرونی کارگو لمبائی', ks: 'اندرونی کارگو لۂمبائی' },
  },
  {
    key: 'cargoWidth',
    label: { en: 'Cargo Width', hi: 'कार्गो चौड़ाई', ur: 'کارگو چوڑائی', ks: 'کارگو چھوڑإئ' },
    type: 'number',
    unit: 'm',
    min: 1,
    max: 3,
    step: 0.1,
    presets: [2, 2.2, 2.4, 2.5],
    helpText: { en: 'Internal cargo width', hi: 'आंतरिक कार्गो चौड़ाई', ur: 'اندرونی کارگو چوڑائی', ks: 'کارگو چھِ اندرونی چھوڑإئ' },
  },
  {
    key: 'cargoHeight',
    label: { en: 'Cargo Height', hi: 'कार्गो ऊंचाई', ur: 'کارگو اونچائی', ks: 'کارگو اُنٛچھإئ' },
    type: 'number',
    unit: 'm',
    min: 1,
    max: 3,
    step: 0.1,
    presets: [2, 2.2, 2.5, 2.7],
    helpText: { en: 'Internal cargo height', hi: 'आंतरिक कार्गो ऊंचाई', ur: 'اندرونی کارگو اونچائی', ks: 'کارگو چھِ اندرونی اُنٛچھإئ' },
  },
  {
    key: 'boxLength',
    label: { en: 'Box Length', hi: 'बॉक्स लंबाई', ur: 'بکس لمبائی', ks: 'بکس لۂمبائی' },
    type: 'number',
    unit: 'mm',
    min: 100,
    max: 2000,
    step: 50,
    presets: [300, 400, 500, 600],
    helpText: { en: 'Box length in mm', hi: 'बॉक्स की लंबाई मिमी में', ur: 'بکس کی لمبائی ملی میٹر میں', ks: 'بکس چھِ لۂمبائی ملی میٹر مانز' },
  },
  {
    key: 'boxWidth',
    label: { en: 'Box Width', hi: 'बॉक्स चौड़ाई', ur: 'بکس چوڑائی', ks: 'بکس چھوڑإئ' },
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 1000,
    step: 50,
    presets: [200, 300, 400, 500],
    helpText: { en: 'Box width in mm', hi: 'बॉक्स की चौड़ाई मिमी में', ur: 'بکس کی چوڑائی ملی میٹر میں', ks: 'بکس چھِ اندرونی چھوڑإئ ملی میٹر مانز' },
  },
  {
    key: 'boxHeight',
    label: { en: 'Box Height', hi: 'बॉक्स ऊंचाई', ur: 'بکس اونچائی', ks: 'بکس اُنٛچھإئ' },
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 1000,
    step: 50,
    presets: [150, 200, 250, 300],
    helpText: { en: 'Box height in mm', hi: 'बॉक्स की ऊंचाई मिमी में', ur: 'بکس کی اونچائی ملی میٹر میں', ks: 'بکس چھِ اندرونی اُنٛچھإئ ملی میٹر مانز' },
  },
  {
    key: 'maxStackHeight',
    label: { en: 'Max Stack Height', hi: 'अधिकतम स्टैक ऊंचाई', ur: 'ماکسیمم اسٹیک اونچائی', ks: 'ماکسیمم اسٹیک اُنٛچھإئ' },
    type: 'number',
    unit: 'boxes',
    min: 1,
    max: 10,
    step: 1,
    presets: [4, 5, 6, 7, 8],
    helpText: { en: 'Maximum boxes high in stack', hi: 'स्टैक में अधिकतम बॉक्स', ur: 'اسٹیک میں زیادہ سے زیادہ بکس', ks: 'اسٹیک مانز زیٖدہ تر بکس' },
  },
  {
    key: 'stackPattern',
    label: { en: 'Stack Pattern', hi: 'स्टैक पैटर्न', ur: 'اسٹیک پیٹرن', ks: 'اسٹیک پیٹرن' },
    type: 'select',
    options: [
      { value: 'column', label: { en: 'Column', hi: 'कॉलम', ur: 'کالم', ks: 'کالم' } },
      { value: 'interlock', label: { en: 'Interlock', hi: 'इंटरलॉक', ur: 'انٹرلاک', ks: 'انٹرلاک' } },
      { value: 'brick', label: { en: 'Brick', hi: 'ब्रिक', ur: 'برک', ks: 'برک' } },
    ],
    helpText: { en: 'How boxes are stacked', hi: 'बॉक्स कैसे रखे जाते हैं', ur: 'بکس کیسے رکھے جاتے ہیں', ks: 'بکس کٔہیٖن رکھے جاسٕک چھُنٛ' },
  },
  {
    key: 'maxWeightPerBox',
    label: { en: 'Max Weight/Box', hi: 'प्रति बॉक्स अधिकतम वजन', ur: 'فی بکس زیادہ سے زیادہ وزن', ks: 'فی بکس زیٖدہ تر وٕزن' },
    type: 'number',
    unit: 'kg',
    min: 1,
    max: 100,
    step: 1,
    presets: [10, 15, 20, 25, 30],
    helpText: { en: 'Maximum weight per box', hi: 'प्रति बॉक्स अधिकतम वजन', ur: 'فی بکس زیادہ سے زیادہ وزن', ks: 'فی بکس زیٖدہ تر وٕزن' },
  },
  {
    key: 'truckMaxPayload',
    label: { en: 'Truck Max Payload', hi: 'ट्रक अधिकतम पेलोड', ur: 'ٹرک ماکسیمم پیلوڈ', ks: 'ٹرک ماکسیمم پیلوڈ' },
    type: 'number',
    unit: 'kg',
    min: 500,
    max: 30000,
    step: 500,
    presets: [5000, 7000, 9000, 12000, 16000],
    helpText: { en: 'Truck maximum payload capacity', hi: 'ट्रक की अधिकतम पेलोड क्षमता', ur: 'ٹرک کی زیادہ سے زیادہ پیلوڈ قلیت', ks: 'ٹرک چھِ زیٖدہ تر پیلوڈ قلیت' },
  },
];

export const ORCHARD_LAYOUT_FIELDS: FieldConfig[] = [
  {
    key: 'plotLength',
    label: { en: 'Plot Length', hi: 'प्लॉट लंबाई', ur: 'پلاٹ لمبائی', ks: 'پلاٹ لۂمبائی' },
    type: 'number',
    unit: 'm',
    min: 10,
    max: 1000,
    step: 10,
    presets: [50, 100, 200, 500, 1000],
    helpText: { en: 'Orchard plot length', hi: 'बाग के प्लॉट की लंबाई', ur: 'باغ کے پلاٹ کی لمبائی', ks: 'باغ چھِ پلاٹ لۂمبائی' },
  },
  {
    key: 'plotWidth',
    label: { en: 'Plot Width', hi: 'प्लॉट चौड़ाई', ur: 'پلاٹ چوڑائی', ks: 'پلاٹ چھوڑإئ' },
    type: 'number',
    unit: 'm',
    min: 10,
    max: 1000,
    step: 10,
    presets: [50, 100, 200, 500],
    helpText: { en: 'Orchard plot width', hi: 'बाग के प्लॉट की चौड़ाई', ur: 'باغ کے پلاٹ کی چوڑائی', ks: 'باغ چھِ پلاٹ چھوڑإئ' },
  },
  {
    key: 'rowSpacing',
    label: { en: 'Row Spacing', hi: 'पंक्ति अंतर', ur: 'قطار فاصلہ', ks: 'قطار فَاصلہ' },
    type: 'number',
    unit: 'm',
    min: 1,
    max: 10,
    step: 0.5,
    presets: [3, 4, 5, 6, 8],
    helpText: { en: 'Distance between tree rows', hi: 'पेड़ की पंक्तियों के बीच दूरी', ur: 'درختوں کی قطاروں کے درمیان فاصلہ', ks: 'درختوٗن چھِ قطاروٗن مَنٛد فاصلہ' },
  },
  {
    key: 'treeSpacing',
    label: { en: 'Tree Spacing', hi: 'पेड़ अंतर', ur: 'درخت فاصلہ', ks: 'درخت فَاصلہ' },
    type: 'number',
    unit: 'm',
    min: 0.5,
    max: 5,
    step: 0.5,
    presets: [2, 3, 4, 5],
    helpText: { en: 'Distance between trees in a row', hi: 'एक पंक्ति में पेड़ों के बीच दूरी', ur: 'ایک قطار میں درختوں کے درمیان فاصلہ', ks: 'اَکھ قطار مانز درختوٗن مَنٛد فاصلہ' },
  },
  {
    key: 'system',
    label: { en: 'Planting System', hi: 'रोपण प्रणाली', ur: 'لگانے کی نظام', ks: 'لگانے چھِ نظام' },
    type: 'select',
    options: [
      { value: 'traditional', label: { en: 'Traditional', hi: 'पारंपरिक', ur: 'رسمی', ks: 'رسمی' } },
      { value: 'high-density', label: { en: 'High Density', hi: 'उच्च घनत्व', ur: 'عالی کثافت', ks: 'عالی کثافت' } },
      { value: 'ultra-high-density', label: { en: 'Ultra High Density', hi: 'अति उच्च घनत्व', ur: 'انہائی عالی کثافت', ks: 'انہائی عالی کثافت' } },
      { value: 'espalier', label: { en: 'Espalier', hi: 'एस्पेलियर', ur: 'اسپیلر', ks: 'اسپیلر' } },
    ],
    helpText: { en: 'Tree planting system', hi: 'पेड़ लगाने की प्रणाली', ur: 'درخت لگانے کی نظام', ks: 'درخت لگانے چھِ نظام' },
  },
  {
    key: 'variety',
    label: { en: 'Variety', hi: 'किस्म', ur: 'قسم', ks: 'قسم' },
    type: 'text',
    placeholder: { en: 'e.g., Apple - Delicious', hi: 'जैसे, सेब - डेलिशियस', ur: 'مثال کے طور پر، سیب - ڈیلیشس', ks: 'مثال چھِ طور تہٕ، سیب - ڈیلیشس' },
    helpText: { en: 'Crop variety name', hi: 'फसल की किस्म का नाम', ur: 'فصل کی قسم کا نام', ks: 'فصل چھِ قسم چھِ ناو' },
  },
  {
    key: 'irrigation',
    label: { en: 'Irrigation', hi: 'सिंचाई', ur: 'آبپاشی', ks: 'آبپاشی' },
    type: 'select',
    options: [
      { value: 'drip', label: { en: 'Drip', hi: 'ड्रिप', ur: 'ڈرپ', ks: 'ڈرپ' } },
      { value: 'flood', label: { en: 'Flood', hi: 'फ्लड', ur: 'ف्लڈ', ks: 'ف्लڈ' } },
      { value: 'sprinkler', label: { en: 'Sprinkler', hi: 'स्प्रिंकलर', ur: 'اسپرینکلر', ks: 'اسپرینکلر' } },
      { value: 'none', label: { en: 'None', hi: 'कोई नहीं', ur: 'کوئی نہیں', ks: 'کٔہ نٕہ' } },
    ],
    helpText: { en: 'Irrigation method', hi: 'सिंचाई की विधि', ur: 'آبپاشی کا طریقہ', ks: 'آبپاشی چھِ طریقہ' },
  },
  {
    key: 'boundaryOffset',
    label: { en: 'Boundary Offset', hi: 'सीमा से दूरी', ur: 'حد سے فاصلہ', ks: 'حد مَنٛد فاصلہ' },
    type: 'number',
    unit: 'm',
    min: 0,
    max: 10,
    step: 0.5,
    presets: [1, 2, 3, 5],
    helpText: { en: 'Distance from plot edge to first tree', hi: 'प्लॉट के किनारे से पहले पेड़ की दूरी', ur: 'پلاٹ کے کنارے سے پہلے درخت کا فاصلہ', ks: 'پلاٹ چھِ کنإرے تہٕ پہلؠ درخت فاصلہ' },
  },
];

/** Get fields for a design type */
export function getFieldsForDesignType(type: 'carton' | 'crate' | 'coldStore' | 'truckLoad' | 'orchardLayout'): FieldConfig[] {
  switch (type) {
    case 'carton': return CARTON_FIELDS;
    case 'crate': return CRATE_FIELDS;
    case 'coldStore': return COLD_STORE_FIELDS;
    case 'truckLoad': return TRUCK_LOAD_FIELDS;
    case 'orchardLayout': return ORCHARD_LAYOUT_FIELDS;
    default: return [];
  }
}

/** Get default values for a design type */
export function getDefaultsForDesignType<T>(type: 'carton' | 'crate' | 'coldStore' | 'truckLoad' | 'orchardLayout'): T {
  // These match the schema defaults in registry.ts
  const defaults: Record<string, Record<string, unknown>> = {
    carton: { length: 400, width: 300, height: 200, flapStyle: 'tuck', material: 'corrugated', ply: '5', qrPosition: 'side', dividers: 0 },
    crate: { length: 600, width: 400, height: 300, slotCount: 8, slotWidth: 5, material: 'plastic', handles: true, stackable: true },
    coldStore: { buildingLength: 30, buildingWidth: 20, buildingHeight: 6, wallThickness: 150, wallMaterial: 'puff', chamberCount: 4, chamberTemp: 2, rackHeight: 4, rackDepth: 1, aisleWidth: 1.5, bayWidth: 1.2, doorCount: 2, doorType: 'sliding', evaporatorType: 'ceiling', compressorCount: 2, bookedBays: [] },
    truckLoad: { cargoLength: 8, cargoWidth: 2.4, cargoHeight: 2.5, boxLength: 400, boxWidth: 300, boxHeight: 200, maxStackHeight: 6, stackPattern: 'interlock', maxWeightPerBox: 20, truckMaxPayload: 9000 },
    orchardLayout: { plotLength: 100, plotWidth: 100, rowSpacing: 4, treeSpacing: 3, system: 'high-density', variety: 'Apple - Delicious', irrigation: 'drip', boundaryOffset: 2 },
  };
  return defaults[type] as T;
}