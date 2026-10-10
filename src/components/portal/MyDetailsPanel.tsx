'use client';

/**
 * "My details" — each portal's own window for the person's details (farm,
 * shop, vehicles, licence…; see myDetailsConfig). Saved on the account
 * (Supabase user metadata) so it follows the person to any device, with a
 * copy in this browser for instant loading. Render it only while open
 * (it reads its starting values when it mounts).
 */
import { useEffect, useId, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { detailsKey, MY_DETAILS, type DetailField } from '@/components/portal/myDetailsConfig';
import { Btn, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import type { PortalId } from '@/lib/auth/roles';
import { supabase } from '@/lib/supabase';

type Value = string | string[] | boolean;
type Values = Record<string, Value>;

const local = (portal: PortalId) => `kr_${detailsKey(portal)}`;

function filled(field: DetailField, v: Value | undefined) {
  if (field.type === 'multi') return Array.isArray(v) && v.length > 0;
  if (field.type === 'yesno') return typeof v === 'boolean';
  return typeof v === 'string' && v.trim() !== '';
}

export function MyDetailsPanel({ portal, open, onClose, onSaved }: { portal: PortalId; open: boolean; onClose: () => void; onSaved?: () => void }) {
  const form = MY_DETAILS[portal];
  const theme = PORTAL_THEMES[portal === 'logistics' ? 'provider' : (portal as keyof typeof PORTAL_THEMES)] ?? PORTAL_THEMES.farmer;
  const ids = useId();
  // Mounted when opened: start from this browser's copy, then the account's.
  const [values, setValues] = useState<Values>(() => {
    try {
      return JSON.parse(localStorage.getItem(local(portal)) ?? '{}') as Values;
    } catch {
      return {};
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The account copy is authoritative (it follows the person across devices).
  useEffect(() => {
    let live = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        const saved = data.user?.user_metadata?.[detailsKey(portal)] as Values | undefined;
        if (live && saved && typeof saved === 'object') setValues(saved);
      })
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [portal]);

  if (!form) return null;

  const set = (key: string, v: Value) => setValues((all) => ({ ...all, [key]: v }));
  const missing = form.fields.filter((f) => 'required' in f && f.required && !filled(f, values[f.key]));

  const save = async () => {
    if (missing.length > 0) {
      setError(`Please fill: ${missing.map((f) => f.label).join(', ')}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      localStorage.setItem(local(portal), JSON.stringify(values));
      const { error: err } = await supabase.auth.updateUser({ data: { [detailsKey(portal)]: values } });
      if (err) throw err;
      toast.success('Your details are saved');
      onSaved?.();
      onClose();
    } catch {
      // Kept in this browser; the account copy is retried on the next save.
      toast.success('Saved on this device');
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.title}
      wide
      footer={
        <>
          <Btn theme={theme} variant="soft" onClick={onClose}>Cancel</Btn>
          <Btn theme={theme} icon={saving ? Loader2 : Check} onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save my details'}
          </Btn>
        </>
      }
    >
      <p className="text-sm text-slate-600">{form.intro}</p>
      {loading && <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading your saved details…</p>}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {form.fields.map((f, i) => {
          const id = `${ids}-${i}`;
          const wide = f.type === 'multi' || f.type === 'textarea' || f.type === 'choice';
          const label = (
            <span className="block text-sm font-medium text-slate-800">
              {f.label}
              {'required' in f && f.required && <span className="text-rose-600"> *</span>}
            </span>
          );
          if (f.type === 'choice' || f.type === 'multi') {
            const current = values[f.key];
            const picked = (o: string) => (f.type === 'multi' ? Array.isArray(current) && current.includes(o) : current === o);
            return (
              <fieldset key={f.key} className={wide ? 'sm:col-span-2' : ''}>
                <legend>{label}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={picked(o)}
                      onClick={() => {
                        if (f.type === 'multi') {
                          const list = Array.isArray(current) ? current : [];
                          set(f.key, list.includes(o) ? list.filter((x) => x !== o) : [...list, o]);
                        } else set(f.key, o);
                      }}
                      className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-semibold transition ${picked(o) ? theme.solid : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
              </fieldset>
            );
          }
          if (f.type === 'yesno') {
            const v = values[f.key];
            return (
              <fieldset key={f.key} className="sm:col-span-2">
                <legend>{label}</legend>
                <div className="mt-2 flex gap-2">
                  {([['Yes', true], ['No', false]] as const).map(([text, b]) => (
                    <button key={text} type="button" aria-pressed={v === b} onClick={() => set(f.key, b)} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${v === b ? theme.solid : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                      {text}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          }
          return (
            <label key={f.key} htmlFor={id} className={f.type === 'textarea' ? 'block sm:col-span-2' : 'block'}>
              {label}
              {f.type === 'textarea' ? (
                <textarea id={id} rows={3} value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder={'placeholder' in f ? f.placeholder : undefined} className={`${INPUT} mt-1.5`} />
              ) : (
                <input id={id} type={f.type} inputMode={f.type === 'number' ? 'decimal' : undefined} value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder={'placeholder' in f ? f.placeholder : undefined} className={`${INPUT} mt-1.5`} />
              )}
              {f.hint && <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>}
            </label>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
    </Modal>
  );
}
