/**
 * Standard pack sizes for agricultural trade in Kashmir/India.
 * 
 * VERIFY WITH LOCAL STANDARDS: These are common sizes seen in trade listings.
 * Actual standards may vary by region, commodity, and market.
 * Update after consultation with local agricultural authorities.
 */
export const STANDARD_PACK_SIZES_KG = [
  { value: 10, label: '10 kg', commonFor: ['Apple (small)', 'Cherry', 'Saffron'] },
  { value: 14, label: '14 kg', commonFor: ['Apple (delicious)'] },
  { value: 16, label: '16 kg', commonFor: ['Apple (golden)'] },
  { value: 20, label: '20 kg', commonFor: ['Apple (standard)', 'Walnut'] },
  { value: 21, label: '21 kg', commonFor: ['Apple (large)'] },
] as const;

export type StandardPackSize = typeof STANDARD_PACK_SIZES_KG[number]['value'];

/** Get pack sizes filtered by commodity (optional filter). */
export function getPackSizesForCommodity(commodity?: string): typeof STANDARD_PACK_SIZES_KG {
  if (!commodity) return STANDARD_PACK_SIZES_KG;
  const c = commodity.toLowerCase();
  const filtered = STANDARD_PACK_SIZES_KG.filter((s) =>
    s.commonFor.some((cf) => cf.toLowerCase().includes(c) || c.includes(cf.toLowerCase())),
  );
  return filtered as unknown as typeof STANDARD_PACK_SIZES_KG;
}

/** All standard sizes as plain numbers for form presets. */
export const PACK_SIZE_PRESETS = STANDARD_PACK_SIZES_KG.map((s) => s.value);