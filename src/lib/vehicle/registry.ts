/**
 * Vehicle Type Registry — canonical types with Indian vehicle class mapping.
 */
export enum VehicleType {
  TRUCK = 'truck',           // Heavy goods vehicle (>12t)
  MINI_TRUCK = 'mini_truck', // Light goods vehicle (3.5t–12t)
  TEMPO = 'tempo',           // Three-wheeler goods (auto-rickshaw chassis)
  COLD_VAN = 'cold_van',     // Refrigerated goods vehicle
  PICKUP = 'pickup',         // Pickup truck / light commercial
  CAR = 'car',               // Passenger car / SUV
  UNKNOWN = 'unknown',       // User doesn't know
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  [VehicleType.TRUCK]: 'Truck',
  [VehicleType.MINI_TRUCK]: 'Mini-truck',
  [VehicleType.TEMPO]: 'Tempo / 3-wheeler',
  [VehicleType.COLD_VAN]: 'Cold van',
  [VehicleType.PICKUP]: 'Pickup',
  [VehicleType.CAR]: 'Car / SUV',
  [VehicleType.UNKNOWN]: 'Don\'t know',
};

export const VEHICLE_TYPE_ICONS: Record<VehicleType, string> = {
  [VehicleType.TRUCK]: '🚛',
  [VehicleType.MINI_TRUCK]: '🚚',
  [VehicleType.TEMPO]: '🛺',
  [VehicleType.COLD_VAN]: '❄️🚐',
  [VehicleType.PICKUP]: '🛻',
  [VehicleType.CAR]: '🚗',
  [VehicleType.UNKNOWN]: '❓',
};

/** VAHAN vehicle class codes → our VehicleType (approximate mapping) */
export const VAHAN_CLASS_TO_TYPE: Record<string, VehicleType> = {
  // Goods vehicles
  'Goods Vehicle': VehicleType.TRUCK,
  'Heavy Goods Vehicle': VehicleType.TRUCK,
  'Light Goods Vehicle': VehicleType.MINI_TRUCK,
  'Mini Truck': VehicleType.MINI_TRUCK,
  'Three Wheeler Goods': VehicleType.TEMPO,
  'Tractor': VehicleType.TRUCK,
  'Trailer': VehicleType.TRUCK,
  'Tanker': VehicleType.TRUCK,
  'Container': VehicleType.TRUCK,
  'Refrigerated Van': VehicleType.COLD_VAN,
  // Passenger
  'Motor Car': VehicleType.CAR,
  'Jeep': VehicleType.CAR,
  'SUV': VehicleType.CAR,
  'Omni Bus': VehicleType.CAR,
  // Others
  'Pickup Van': VehicleType.PICKUP,
};

/** Normalise a vehicle number to uppercase, no separators. */
export function normaliseRegistration(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Indian registration format: 2 letters, 1-2 digits, 0-3 letters, 1-4 digits, or BH series. */
export const REGISTRATION_PATTERN = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/;

/** Check if a string looks like an Indian registration number. */
export function isValidRegistration(raw: string): boolean {
  const norm = normaliseRegistration(raw);
  return REGISTRATION_PATTERN.test(norm);
}

/** Pretty-print with separators: JK01AB1234 → JK-01-AB-1234. */
export function formatRegistration(norm: string, original?: string): string {
  // BH series: 22BH1234AB → 22-BH-1234-AB
  const bh = norm.match(/^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/);
  if (bh) return `${bh[1]}-${bh[2]}-${bh[3]}-${bh[4]}`;

  // Standard: JK01AB1234 → JK-01-AB-1234
  const std = norm.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (std) {
    const parts = [std[1], std[2]];
    if (std[3]) parts.push(std[3]);
    parts.push(std[4]);
    return parts.join('-');
  }

  return original ?? norm;
}

/** Map VAHAN class description to our VehicleType. */
export function vahanClassToType(vahanClass: string): VehicleType {
  const lower = vahanClass.toLowerCase();
  for (const [key, type] of Object.entries(VAHAN_CLASS_TO_TYPE)) {
    if (lower.includes(key.toLowerCase())) return type;
  }
  return VehicleType.UNKNOWN;
}

/** Check if the RC class conflicts with the user-chosen type. */
export function checkTypeConflict(rcClass: string, chosenType: VehicleType): { conflict: boolean; message?: string } {
  const inferred = vahanClassToType(rcClass);
  if (inferred === VehicleType.UNKNOWN || chosenType === VehicleType.UNKNOWN) {
    return { conflict: false };
  }
  if (inferred !== chosenType) {
    return {
      conflict: true,
      message: `This number belongs to a ${VEHICLE_TYPE_LABELS[inferred].toLowerCase()} (${rcClass}), not a ${VEHICLE_TYPE_LABELS[chosenType].toLowerCase()}.`,
    };
  }
  return { conflict: false };
}