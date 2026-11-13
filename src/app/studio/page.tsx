'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html, Environment } from '@react-three/drei';
import * as THREE from 'three';

import { Btn, PORTAL_THEMES, Badge, INPUT } from '@/components/portal/kit';
import { SpeakButton } from '@/components/voice/VoiceButtons';
import { Viewer3D } from '@/components/studio/Viewer3D';
import { StudioForm, getFieldsForDesignType, getDefaultsForDesignType } from '@/components/studio/StudioForm';
import { saveDesign, loadDesign, listDesigns, deleteDesign, duplicateDesign, exportDesign, importDesign, validateDesign } from '@/lib/studio/persistence';
import { createCarton, createCrate, createColdStore, createTruckLoad, createOrchardLayout } from '@/lib/studio/registry';
import { cartonSummary, crateSummary, coldStoreSummary, truckLoadSummary, orchardLayoutSummary, estimateCartonBounds, estimateCrateBounds, estimateColdStoreBounds, estimateTruckLoadBounds, estimateOrchardLayoutBounds } from '@/lib/studio/registry';
import { CartonSchema, CrateSchema, ColdStoreSchema, TruckLoadSchema, OrchardLayoutSchema } from '@/lib/studio/registry';

import { PortalShell } from '@/components/layout/PortalShell';
import { Box, CheckCircle2, XCircle, Loader2, Download, Upload, Copy, Trash2, Share2, RotateCcw, Eye, Edit2, Plus } from 'lucide-react';

const theme = PORTAL_THEMES.dealer;

type DesignType = 'carton' | 'crate' | 'coldStore' | 'truckLoad' | 'orchardLayout';

const DESIGN_TYPES: { type: DesignType; label: string; icon: React.ReactNode }[] = [
  { type: 'carton', label: 'Carton', icon: <span>📦</span> },
  { type: 'crate', label: 'Crate', icon: <span>📦</span> },
  { type: 'coldStore', label: 'Cold Store', icon: <span>❄️</span> },
  { type: 'truckLoad', label: 'Truck Load', icon: <span>🚛</span> },
  { type: 'orchardLayout', label: 'Orchard', icon: <span>🌳</span> },
];

export default function StudioPage() {
  const [designType, setDesignType] = useState<DesignType>('carton');
  // Seeded with the initial design's defaults (never {}): the first render
  // builds a real design, so getMaterial never sees an undefined key.
  const [params, setParams] = useState<Record<string, unknown>>(() => getDefaultsForDesignType('carton') as Record<string, unknown>);
  const [savedDesigns, setSavedDesigns] = useState<Array<{ id: string; type: string; name: string; updated_at: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [importJson, setImportJson] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<'en' | 'hi' | 'ur' | 'ks'>('en');
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);

  // Load saved designs on mount
  useEffect(() => {
    loadSavedDesigns();
  }, []);

  const loadSavedDesigns = async () => {
    const { ok, designs, error } = await listDesigns();
    if (ok && designs) setSavedDesigns(designs);
    else if (error) setError(error);
  };

  // Initialize params when design type changes
  useEffect(() => {
    const defaults = getDefaultsForDesignType(designType) as Record<string, unknown>;
    setParams(defaults);
    setSelectedDesignId(null);
  }, [designType]);

  // Generate 3D design from params
  const design3D = useMemo(() => {
    try {
      switch (designType) {
        case 'carton': return createCarton(params as any);
        case 'crate': return createCrate(params as any);
        case 'coldStore': return createColdStore(params as any);
        case 'truckLoad': return createTruckLoad(params as any);
        case 'orchardLayout': return createOrchardLayout(params as any);
        default: return null;
      }
    } catch (e) {
      console.error('Design generation error:', e);
      return null;
    }
  }, [designType, params]);

  // Compute bounds for camera framing
  const bounds = useMemo(() => {
    switch (designType) {
      case 'carton': return estimateCartonBounds(params as any);
      case 'crate': return estimateCrateBounds(params as any);
      case 'coldStore': return estimateColdStoreBounds(params as any);
      case 'truckLoad': return estimateTruckLoadBounds(params as any);
      case 'orchardLayout': return estimateOrchardLayoutBounds(params as any);
      default: return { width: 1, height: 1, depth: 1 };
    }
  }, [designType, params]);

  // Generate summary text
  const summary = useMemo((): Record<'en' | 'hi' | 'ur' | 'ks', string> => {
    switch (designType) {
      case 'carton': return cartonSummary(params as any);
      case 'crate': return crateSummary(params as any);
      case 'coldStore': return coldStoreSummary(params as any);
      case 'truckLoad': return truckLoadSummary(params as any);
      case 'orchardLayout': return orchardLayoutSummary(params as any);
      default: return { en: '', hi: '', ur: '', ks: '' };
    }
  }, [designType, params]);

// Helper to get localized summary
  const getSummaryText = (locale: 'en' | 'hi' | 'ur' | 'ks'): string => {
    return summary[locale] ?? (summary as { en: string }).en;
  };

  const handleParamChange = (key: string, value: unknown) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    const name = prompt('Enter a name for this design:');
    if (!name) { setSaving(false); return; }

    const { ok, id, error } = await saveDesign(designType, params as any, name);
    if (ok) {
      await loadSavedDesigns();
      setError(null);
    } else {
      setError(error || 'Save failed');
    }
    setSaving(false);
  };

  const handleLoad = async (id: string) => {
    setLoading(true);
    const { ok, design, error } = await loadDesign(id);
    if (ok && design) {
      setDesignType(design.type);
      setParams(design.params as Record<string, unknown>);
      setSelectedDesignId(design.id);
      setShowSaved(false);
    } else {
      setError(error || 'Load failed');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this design?')) return;
    const { ok, error } = await deleteDesign(id);
    if (ok) await loadSavedDesigns();
    else setError(error || 'Delete failed');
  };

  const handleDuplicate = async (id: string) => {
    const name = prompt('Enter name for duplicate:');
    if (!name) return;
    const { ok, error } = await duplicateDesign(id, name);
    if (ok) await loadSavedDesigns();
    else setError(error || 'Duplicate failed');
  };

  const handleExport = async () => {
    const designRecord = { 
      id: selectedDesignId || 'temp', 
      user_id: '', 
      type: designType, 
      params: params as any, 
      version: 1, 
      created_at: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    };
    const json = exportDesign(designRecord);
    navigator.clipboard.writeText(json);
    alert('Design JSON copied to clipboard!');
  };

  const handleImport = async () => {
    if (!importJson.trim()) return;
    const { ok, type, params: importedParams, error } = importDesign(importJson);
    if (ok && type && importedParams) {
      setDesignType(type);
      setParams(importedParams);
      setShowImport(false);
      setImportJson('');
    } else {
      setError(error || 'Import failed');
    }
  };

  const handleScreenshot = (dataUrl: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${designType}-${Date.now()}.png`;
    link.click();
  };

  const handleLocaleChange = (l: 'en' | 'hi' | 'ur' | 'ks') => {
    setLocale(l);
  };

  // Listen for locale changes from StudioForm
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail && ['en', 'hi', 'ur', 'ks'].includes(e.detail)) {
        setLocale(e.detail);
      }
    };
    window.addEventListener('studio:locale', handler as EventListener);
    return () => window.removeEventListener('studio:locale', handler as EventListener);
  }, []);

  const handleReset = () => {
    const defaults = getDefaultsForDesignType(designType) as Record<string, unknown>;
    setParams(defaults);
  };

  const currentSummary = summary[locale];

  return (
    <PortalShell
      standalone
      theme="dealer"
      eyebrow="3D Design Studio"
      title="Create exact 3D designs from your numbers"
      description="Enter validated dimensions with units — get a precise 3D model, measurements, and a spoken description. Save, share, and export your designs."
      kpis={[
        { label: 'Design', value: DESIGN_TYPES.find(d => d.type === designType)?.label || designType, trend: 'Active' },
        { label: 'Measurements', value: showMeasurements ? 'On' : 'Off', trend: showMeasurements ? 'Visible' : 'Hidden' },
        { label: 'Locale', value: LANG_LABELS[locale], trend: locale },
        { label: 'Saved', value: savedDesigns.length.toString(), trend: 'Designs' },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Sidebar: Form & Controls ───────────────────────── */}
        <div className="lg:sticky lg:top-6 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
          {/* Design Type Selector */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Design Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DESIGN_TYPES.map((dt) => (
                <button
                  key={dt.type}
                  type="button"
                  onClick={() => setDesignType(dt.type)}
                  className={`flex flex-col items-center gap-2 min-h-[80px] cursor-pointer rounded-xl p-3 text-sm font-semibold transition ${designType === dt.type ? 'bg-emerald-50 ring-2 ring-emerald-600' : 'bg-white hover:bg-emerald-50 ring-1 ring-slate-200'}`}
                >
                  <span className="text-2xl">{dt.icon}</span>
                  <span>{dt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Schema-driven Form */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <StudioForm
              designType={designType}
              locale={locale}
              schema={getSchemaForType(designType)}
              defaults={getDefaultsForDesignType(designType) as Record<string, unknown>}
              values={params}
              onChange={handleParamChange}
              fields={getFieldsForDesignType(designType)}
              disabled={loading || saving}
              onReset={handleReset}
            />
          </div>

          {/* Locale Selector */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Language / زبان / کٲشُر</label>
            <div className="flex flex-wrap gap-2">
              {(['en', 'hi', 'ur', 'ks'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleLocaleChange(l)}
                  className={`min-h-10 min-w-10 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-bold ring-1 transition ${locale === l ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-600 ring-slate-900/10 hover:bg-emerald-50'}`}
                >
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>
          </div>

          {/* View Options */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <label className="block text-sm font-semibold text-slate-700 mb-2">View Options</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowMeasurements(!showMeasurements)}
                className={`min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition ${showMeasurements ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-emerald-50 ring-1 ring-slate-200'}`}
              >
                📏 Measurements
              </button>
              <button
                type="button"
                onClick={() => setShowWireframe(!showWireframe)}
                className={`min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition ${showWireframe ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-emerald-50 ring-1 ring-slate-200'}`}
              >
                🔍 Wireframe
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Btn theme={theme} onClick={handleSave} disabled={saving} className="flex-1 min-h-11">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  '💾 Save Design'
                )}
              </Btn>
              <button
                type="button"
                onClick={handleExport}
                className="min-h-11 cursor-pointer flex-1 rounded-xl bg-white px-4 py-2 font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50"
              >
                <Download className="inline h-4 w-4 mr-1" /> Export
              </button>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="min-h-11 cursor-pointer rounded-xl bg-white px-4 py-2 font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50"
              >
                <Upload className="inline h-4 w-4 mr-1" /> Import
              </button>
            </div>
            <button type="button" onClick={handleReset} className="w-full min-h-10 cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50">
              <RotateCcw className="inline h-4 w-4 mr-1" /> Reset to Defaults
            </button>
            <SpeakButton
              text={getSummaryText(locale) ?? `Design parameters for ${designType}`}
              lang={locale}
            />
          </div>

          {/* Summary Card */}
          <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <CheckCircle2 className="h-4 w-4" /> Summary
            </p>
            <p className="mt-2 text-sm text-emerald-800 leading-relaxed">{getSummaryText(locale)}</p>
          </div>

          {/* Voice */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <SpeakButton
              text={String(getSummaryText(locale) ?? `Design parameters for ${designType}`)}
              lang={locale}
            />
          </div>
        </div>

        {/* ── Main: 3D Viewer ────────────────────────────────── */}
        <div className="space-y-4">
          {/* 3D Viewer */}
          <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
            <Viewer3D
              design={design3D}
              bounds={bounds}
              designType={designType}
              params={params}
              showMeasurements={showMeasurements}
              allowOrbit={true}
              onScreenshot={handleScreenshot}
              height={500}
            />
            
            {/* Viewer Toolbar */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 p-2 pointer-events-none">
              <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
                <Badge tone="blue">{bounds.width.toFixed(bounds.width < 1 ? 3 : 2)}m</Badge>
                <Badge tone="blue">{bounds.depth.toFixed(bounds.depth < 1 ? 3 : 2)}m</Badge>
                <Badge tone="blue">{bounds.height.toFixed(bounds.height < 1 ? 3 : 2)}m</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    const canvas = document.querySelector('canvas');
                    if (canvas) {
                      const dataUrl = canvas.toDataURL('image/png');
                      const link = document.createElement('a');
                      link.href = dataUrl;
                      link.download = `${designType}-${Date.now()}.png`;
                      link.click();
                    }
                  }}
                  className="min-h-10 cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
                >
                  📸 Screenshot
                </button>
              </div>
            </div>
          </div>

          {/* Summary & Voice */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-slate-900">Live Summary</p>
                <p className="mt-1 text-sm text-slate-700 leading-relaxed">{getSummaryText(locale)}</p>
              </div>
              <SpeakButton text={getSummaryText(locale)} lang={locale} />
            </div>
          </div>

          {/* Saved Designs Panel */}
          {showSaved && savedDesigns.length > 0 && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-slate-900">Saved Designs ({savedDesigns.length})</p>
                <button onClick={() => setShowSaved(false)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {savedDesigns.map((d) => (
                  <div key={d.id} className={`rounded-xl p-3 flex items-center justify-between gap-2 ${selectedDesignId === d.id ? 'bg-emerald-50 ring-2 ring-emerald-600' : 'bg-white hover:bg-emerald-50 ring-1 ring-slate-200'}`}>
                    <button onClick={() => handleLoad(d.id)} className="flex-1 text-left flex items-center gap-2">
                      <span className="text-lg">{DESIGN_TYPES.find(t => t.type === d.type)?.icon || '📦'}</span>
                      <div>
                        <p className="font-semibold text-slate-900 truncate">{d.name}</p>
                        <p className="text-xs text-slate-500">{d.type} • {new Date(d.updated_at).toLocaleDateString('en-IN')}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDuplicate(d.id)} title="Duplicate" className="p-1.5 rounded hover:bg-emerald-100"><Copy className="h-4 w-4" /></button>
                      <button onClick={() => { navigator.clipboard.writeText(exportDesign({ id: d.id, user_id: '', type: d.type as any, params: {} as any, version: 1, created_at: d.created_at, updated_at: d.updated_at })); }} title="Export JSON" className="p-1.5 rounded hover:bg-emerald-100"><Download className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(d.id)} title="Delete" className="p-1.5 rounded hover:bg-rose-100 text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Import Design JSON</h2>
              <button onClick={() => setShowImport(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste design JSON here..."
              className={`${INPUT} min-h-[200px] font-mono text-sm`}
            />
            <div className="flex gap-2">
              <Btn theme={theme} onClick={handleImport} className="flex-1">Import</Btn>
              <Btn theme={theme} variant="ghost" onClick={() => setShowImport(false)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200 shadow-lg flex items-center gap-2 animate-slide-up">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">✕</button>
        </div>
      )}
    </PortalShell>
  );
}

/** Get Zod schema for a design type */
function getSchemaForType(type: DesignType) {
  const schemas = {
    carton: CartonSchema,
    crate: CrateSchema,
    coldStore: ColdStoreSchema,
    truckLoad: TruckLoadSchema,
    orchardLayout: OrchardLayoutSchema,
  };
  return schemas[type];
}

const LANG_LABELS: Record<'en' | 'hi' | 'ur' | 'ks', string> = {
  en: 'English', hi: 'हिन्दी', ur: 'اردو', ks: 'کٲشُر'
};