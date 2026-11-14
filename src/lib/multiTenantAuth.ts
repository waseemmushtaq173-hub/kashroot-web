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
