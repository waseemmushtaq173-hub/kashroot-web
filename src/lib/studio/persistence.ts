'use client';

/**
 * Design persistence layer — saves design parameters to Supabase.
 * 
 * Table: designs (id, user_id, type, params jsonb, version, created_at, updated_at)
 * RLS: users can only access their own designs.
 */

import { createClient } from '@/lib/supabase/client';
import type { CartonParams, CrateParams, ColdStoreParams, TruckLoadParams, OrchardLayoutParams } from '@/lib/studio/registry';
import { z } from 'zod';

export type DesignType = 'carton' | 'crate' | 'coldStore' | 'truckLoad' | 'orchardLayout';
export type DesignParams = CartonParams | CrateParams | ColdStoreParams | TruckLoadParams | OrchardLayoutParams;

export interface DesignRecord {
  id: string;
  user_id: string;
  type: DesignType;
  params: DesignParams;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DesignSummary {
  id: string;
  type: DesignType;
  name: string;
  created_at: string;
  updated_at: string;
  version: number;
}

/** Get Supabase client (browser-safe) */
function getSupabase() {
  return createClient();
}

/** Save a design (upsert by user_id + type + name) */
export async function saveDesign(
  type: DesignType,
  params: DesignParams,
  name: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = getSupabase();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('designs')
    .upsert({
      user_id: user.id,
      type,
      params,
      name,
      version: 1, // Increment on each save
    }, { onConflict: 'user_id,type,name' })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Load a design by ID */
export async function loadDesign(id: string): Promise<{ ok: boolean; design?: DesignRecord; error?: string }> {
  const supabase = getSupabase();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('designs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Design not found' };
  return { ok: true, design: data as DesignRecord };
}

/** Load all designs for current user */
export async function listDesigns(): Promise<{ ok: boolean; designs?: DesignSummary[]; error?: string }> {
  const supabase = getSupabase();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('designs')
    .select('id, type, name, version, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, designs: (data as DesignSummary[]) || [] };
}

/** Delete a design */
export async function deleteDesign(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from('designs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Duplicate a design */
export async function duplicateDesign(id: string, newName: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = getSupabase();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  // Load original
  const { data: original, error: loadError } = await supabase
    .from('designs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (loadError || !original) return { ok: false, error: loadError?.message || 'Design not found' };

  // Create duplicate
  const { data, error } = await supabase
    .from('designs')
    .insert({
      user_id: user.id,
      type: original.type,
      params: original.params,
      name: newName,
      version: 1,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Export design as JSON (for sharing) */
export function exportDesign(design: DesignRecord): string {
  return JSON.stringify({
    type: design.type,
    params: design.params,
    version: design.version,
    exportedAt: new Date().toISOString(),
    exportedBy: 'kashroot-studio',
  }, null, 2);
}

/** Import design from JSON */
export function importDesign(json: string): { ok: boolean; type?: DesignType; params?: DesignParams; error?: string } {
  try {
    const data = JSON.parse(json);
    if (!data.type || !data.params) {
      return { ok: false, error: 'Invalid design format' };
    }
    if (!['carton', 'crate', 'coldStore', 'truckLoad', 'orchardLayout'].includes(data.type)) {
      return { ok: false, error: 'Unknown design type' };
    }
    return { ok: true, type: data.type, params: data.params };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

/** Generate read-only share link */
export function generateShareLink(designId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/studio/shared/${designId}`;
}

/** Validate design parameters against schema */
export async function validateDesign(type: DesignType, params: DesignParams): Promise<{ ok: boolean; errors?: string[] }> {
  // Dynamic import to avoid circular deps
  const { CartonSchema, CrateSchema, ColdStoreSchema, TruckLoadSchema, OrchardLayoutSchema } = await import('@/lib/studio/registry');
  
  const schemas: Record<DesignType, z.ZodTypeAny> = {
    carton: CartonSchema,
    crate: CrateSchema,
    coldStore: ColdStoreSchema,
    truckLoad: TruckLoadSchema,
    orchardLayout: OrchardLayoutSchema,
  };
  
  const schema = schemas[type];
  const result = schema.safeParse(params);
  
  if (result.success) return { ok: true };
  const zodError = result.error as z.ZodError<DesignParams>;
  const issues = (zodError as { issues: z.ZodIssue[] }).issues;
  return { ok: false, errors: issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`) };
}