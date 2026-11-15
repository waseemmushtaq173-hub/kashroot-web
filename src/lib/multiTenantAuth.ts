// src/lib/multiTenantAuth.ts
import { SupabaseClient } from '@supabase/supabase-js';

export type PlatformLevelRole =
  | 'PLATFORM_SUPERADMIN'
  | 'PLATFORM_ADMIN'
  | 'PLATFORM_SUPPORT'
  | 'PLATFORM_AUDITOR';

export type BusinessStaffRole =
  | 'COLD_STORAGE_OWNER'
  | 'FACILITY_MANAGER'
  | 'OPERATIONS_MANAGER'
  | 'BOOKING_MANAGER'
  | 'INVENTORY_MANAGER'
  | 'ACCOUNTS_MANAGER'
  | 'TECHNICAL_MANAGER'
  | 'STORAGE_STAFF'
  | 'SOFTWARE_ENGINEER';

export interface StaffPermissionsMatrix {
  manage_facilities: boolean;
  configure_3d_twin: boolean;
  manage_chambers: boolean;
  manage_bins: boolean;
  manage_bookings: boolean;
  manage_inventory: boolean;
  view_temperature_telemetry: boolean;
  manage_financials: boolean;
  manage_staff: boolean;
}

export const ROLE_DEFAULT_PERMISSIONS: Record<BusinessStaffRole, StaffPermissionsMatrix> = {
  COLD_STORAGE_OWNER: {
    manage_facilities: true,
    configure_3d_twin: true,
    manage_chambers: true,
    manage_bins: true,
    manage_bookings: true,
    manage_inventory: true,
    view_temperature_telemetry: true,
    manage_financials: true,
    manage_staff: true,
  },
  FACILITY_MANAGER: {
    manage_facilities: true,
    configure_3d_twin: true,
    manage_chambers: true,
    manage_bins: true,
    manage_bookings: true,
    manage_inventory: true,
    view_temperature_telemetry: true,
    manage_financials: false,
    manage_staff: false,
  },
  OPERATIONS_MANAGER: {
    manage_facilities: false,
    configure_3d_twin: false,
    manage_chambers: true,
    manage_bins: true,
    manage_bookings: true,
    manage_inventory: true,
    view_temperature_telemetry: true,
    manage_financials: false,
    manage_staff: false,
  },
  BOOKING_MANAGER: {
    manage_facilities: false,
    configure_3d_twin: false,
    manage_chambers: false,
    manage_bins: false,
    manage_bookings: true,
    manage_inventory: false,
    view_temperature_telemetry: false,
    manage_financials: false,
    manage_staff: false,
  },
  INVENTORY_MANAGER: {
    manage_facilities: false,
    configure_3d_twin: false,
    manage_chambers: false,
    manage_bins: true,
    manage_bookings: false,
    manage_inventory: true,
    view_temperature_telemetry: true,
    manage_financials: false,
    manage_staff: false,
  },
  ACCOUNTS_MANAGER: {
    manage_facilities: false,
    configure_3d_twin: false,
    manage_chambers: false,
    manage_bins: false,
    manage_bookings: false,
    manage_inventory: false,
    view_temperature_telemetry: false,
    manage_financials: true,
    manage_staff: false,
  },
  TECHNICAL_MANAGER: {
    manage_facilities: false,
    configure_3d_twin: true,
    manage_chambers: true,
    manage_bins: false,
    manage_bookings: false,
    manage_inventory: false,
    view_temperature_telemetry: true,
    manage_financials: false,
    manage_staff: false,
  },
  SOFTWARE_ENGINEER: {
    manage_facilities: true,
    configure_3d_twin: true,
    manage_chambers: true,
    manage_bins: true,
    manage_bookings: false,
    manage_inventory: false,
    view_temperature_telemetry: true,
    manage_financials: false,
    manage_staff: false,
  },
  STORAGE_STAFF: {
    manage_facilities: false,
    configure_3d_twin: false,
    manage_chambers: false,
    manage_bins: false,
    manage_bookings: false,
    manage_inventory: true,
    view_temperature_telemetry: true,
    manage_financials: false,
    manage_staff: false,
  },
};

/** The 8 staff roles an owner assigns, in the order the form lists them. */
export const OWNER_STAFF_ROLES: BusinessStaffRole[] = [
  'FACILITY_MANAGER',
  'OPERATIONS_MANAGER',
  'BOOKING_MANAGER',
  'INVENTORY_MANAGER',
  'ACCOUNTS_MANAGER',
  'TECHNICAL_MANAGER',
  'STORAGE_STAFF',
  'SOFTWARE_ENGINEER',
];

/** The kind of business an owner organization runs (cold_storage_organizations.business_category). */
export type BusinessCategory = 'COLD_STORAGE' | 'WAREHOUSE' | 'LOGISTICS' | 'AGRO_DEALER' | 'MANDI' | 'PACKHOUSE';

export const BUSINESS_CATEGORIES: BusinessCategory[] = ['COLD_STORAGE', 'WAREHOUSE', 'PACKHOUSE', 'LOGISTICS', 'AGRO_DEALER', 'MANDI'];

/** Organizations created before the category column existed are cold storage businesses. */
export const DEFAULT_BUSINESS_CATEGORY: BusinessCategory = 'COLD_STORAGE';

export const BUSINESS_CATEGORY_LABEL: Record<BusinessCategory, string> = {
  COLD_STORAGE: 'Cold storage',
  WAREHOUSE: 'Warehouse',
  PACKHOUSE: 'Packhouse',
  LOGISTICS: 'Logistics',
  AGRO_DEALER: 'Agro-dealer',
  MANDI: 'Mandi',
};

/** The modules of the Owner Admin Console. */
export type OwnerModule =
  | 'overview'
  | 'facilities'
  | 'twin'
  | 'chambers'
  | 'bins'
  | 'bookings'
  | 'inventory'
  | 'telemetry'
  | 'fleet'
  | 'shipments'
  | 'orders'
  | 'trades'
  | 'financial'
  | 'staff';

/** Which modules each category's console shows — a category sees only what its business uses. */
export const CATEGORY_MODULES: Record<BusinessCategory, OwnerModule[]> = {
  COLD_STORAGE: ['overview', 'facilities', 'twin', 'chambers', 'bins', 'bookings', 'inventory', 'telemetry', 'financial', 'staff'],
  WAREHOUSE: ['overview', 'facilities', 'inventory', 'bookings', 'staff', 'financial'],
  PACKHOUSE: ['overview', 'facilities', 'inventory', 'bookings', 'staff', 'financial'],
  LOGISTICS: ['overview', 'fleet', 'shipments', 'staff', 'financial'],
  AGRO_DEALER: ['overview', 'inventory', 'orders', 'staff', 'financial'],
  MANDI: ['overview', 'trades', 'staff', 'financial'],
};

export function isBusinessCategory(value: unknown): value is BusinessCategory {
  return typeof value === 'string' && (BUSINESS_CATEGORIES as string[]).includes(value);
}

/** Upper-cases and checks a category; anything missing or unknown (column not added yet) is cold storage. */
export function normalizeBusinessCategory(value: unknown): BusinessCategory {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return isBusinessCategory(key) ? key : DEFAULT_BUSINESS_CATEGORY;
}

export const categoryHasModule = (category: BusinessCategory, module: OwnerModule) => CATEGORY_MODULES[category].includes(module);

/** The modules each staff permission toggle governs, so a category lists only the toggles it can use. */
const PERMISSION_MODULES: Record<keyof StaffPermissionsMatrix, OwnerModule[]> = {
  manage_facilities: ['facilities'],
  configure_3d_twin: ['twin'],
  manage_chambers: ['chambers'],
  manage_bins: ['bins'],
  manage_bookings: ['bookings', 'shipments', 'orders', 'trades'],
  manage_inventory: ['inventory'],
  view_temperature_telemetry: ['telemetry'],
  manage_financials: ['financial'],
  manage_staff: ['staff'],
};

export const permissionAppliesTo = (permission: string, category: BusinessCategory) =>
  (PERMISSION_MODULES[permission as keyof StaffPermissionsMatrix] ?? []).some((m) => categoryHasModule(category, m));

/** Before 20261123000000_org_business_category.sql is run the business_category column is missing. */
export const noBusinessCategoryColumn = (message?: string) =>
  /business_category/i.test(message ?? '') && /column|schema cache|does not exist/i.test(message ?? '');

export async function recordAdministrativeAuditLog(
  supabase: SupabaseClient,
  entry: {
    actorUserId?: string | null;
    actorName: string;
    actorRole: string;
    isSuperadminOversightAction?: boolean;
    organizationId?: string | null;
    facilityId?: string | null;
    actionCategory:
      | 'OWNER_ONBOARDING'
      | 'OWNER_APPROVAL_DECISION'
      | 'FACILITY_CONFIGURATION'
      | '3D_DIGITAL_TWIN_UPDATE'
      | 'CHAMBER_MANAGEMENT'
      | 'BIN_ALLOCATION'
      | 'BOOKING_DECISION'
      | 'INVENTORY_MOVEMENT'
      | 'FINANCIAL_STATUS_CHANGE'
      | 'STAFF_PERMISSION_CHANGE'
      | 'SUPERADMIN_OVERSIGHT_INSPECTION'
      | 'PLATFORM_SECURITY_ACTION';
    actionSummary: string;
    targetTable?: string;
    targetRecordId?: string;
    beforeValues?: Record<string, unknown> | null;
    afterValues?: Record<string, unknown> | null;
  }
) {
  await supabase.from('platform_audit_logs').insert({
    actor_user_id: entry.actorUserId || null,
    actor_name: entry.actorName,
    actor_role: entry.actorRole,
    is_superadmin_oversight_action: Boolean(entry.isSuperadminOversightAction),
    organization_id: entry.organizationId || null,
    facility_id: entry.facilityId || null,
    action_category: entry.actionCategory,
    action_summary: entry.actionSummary,
    target_table: entry.targetTable || null,
    target_record_id: entry.targetRecordId || null,
    before_values: entry.beforeValues || null,
    after_values: entry.afterValues || null,
  });
}
