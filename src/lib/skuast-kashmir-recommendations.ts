/**
 * SKUAST-Kashmir Official University Recommendations & Spray Schedule
 *
 * Official guidance from SKUAST-Kashmir (Sher-e-Kashmir University of
 * Agricultural Sciences and Technology of Kashmir), Directorate of Extension,
 * Apple Spray Schedule and horticulture recommendations for Kashmir orchards.
 *
 * Nothing here is invented by KashRoot — these are the official university
 * recommendations for Kashmir's horticulture sector.
 */

export interface SkuastRecommendation {
  /** Active molecule name (e.g. "Dodine", "Mancozeb") */
  molecule: string;
  /** Common formulations (e.g. "Dodine 65 WP") */
  formulations: string[];
  /** SKUAST-K recommended dosage per 100 litres of water */
  dosagePer100L: string;
  /** Application timing / stage */
  timing: string[];
  /** Target pests / diseases */
  targets: string[];
  /** Strict waiting period (PHI) before harvest in days */
  waitingPeriodDays: number;
  /** Mixing rules / incompatibilities */
  mixingRules: string[];
  /** Additional Kashmir-specific notes */
  notes: string[];
}

/**
 * Official SKUAST-Kashmir approved fungicides & insecticides for Kashmir
 * horticulture (apple, pear, cherry, walnut, saffron, etc.).
 */
export const SKUAST_RECOMMENDATIONS: SkuastRecommendation[] = [
  {
    molecule: 'Dodine',
    formulations: ['Dodine 65 WP'],
    dosagePer100L: '60 g / 100 L water',
    timing: ['Pink bud stage', 'Petal fall', 'Pre-rain sprays'],
    targets: ['Apple scab', 'Powdery mildew'],
    waitingPeriodDays: 14,
    mixingRules: [
      'Do NOT mix with stickers or spreaders',
      'Do NOT mix with oil-based sprays',
      'Maintain 3–4 days gap between Dodine and other fungicides',
    ],
    notes: [
      'Dodine is a protectant fungicide — apply before infection period',
      'Re-apply after heavy rain',
    ],
  },
  {
    molecule: 'Zineb',
    formulations: ['Zineb 68% + Hexaconazole 5%'],
    dosagePer100L: '125 g / 100 L water',
    timing: ['Pink bud stage', 'Petal fall', 'Fruit development stage'],
    targets: ['Apple scab', 'Powdery mildew', 'Alternaria leaf spot'],
    waitingPeriodDays: 14,
    mixingRules: [
      'Compatible with most fungicides',
      'Do NOT mix with highly alkaline materials',
    ],
    notes: ['Zineb is a protectant fungicide effective against apple scab'],
  },
  {
    molecule: 'Metiram',
    formulations: ['Metiram 55% + Pyraclostrobin 5% WG'],
    dosagePer100L: '100 g / 100 L water',
    timing: ['Pink bud stage', 'Petal fall', 'Pre-harvest sprays'],
    targets: ['Apple scab', 'Powdery mildew', 'Alternaria leaf spot'],
    waitingPeriodDays: 14,
    mixingRules: ['Compatible with most fungicides and insecticides'],
    notes: ['Metiram is a protectant fungicide; Pyraclostrobin adds curative action'],
  },
  {
    molecule: 'Tebuconazole',
    formulations: ['Tebuconazole + Captan'],
    dosagePer100L: 'As per product label',
    timing: ['Pink bud stage', 'Petal fall', 'Pre-harvest sprays'],
    targets: ['Apple scab', 'Powdery mildew', 'Brown rot'],
    waitingPeriodDays: 14,
    mixingRules: ['Compatible with most fungicides'],
    notes: ['Tebuconazole is a systemic fungicide with curative action'],
  },
  {
    molecule: 'Hexaconazole',
    formulations: ['Hexaconazole 5% EC / SC'],
    dosagePer100L: 'As per product label',
    timing: ['Pink bud stage', 'Petal fall', 'Pre-harvest sprays'],
    targets: ['Apple scab', 'Powdery mildew'],
    waitingPeriodDays: 14,
    mixingRules: ['Compatible with most fungicides'],
    notes: ['Hexaconazole is a systemic fungicide for apple scab control'],
  },
  {
    molecule: 'Mancozeb',
    formulations: ['Mancozeb 75 WP'],
    dosagePer100L: '300 g / 100 L water',
    timing: ['Pink bud stage', 'Petal fall', 'Pre-harvest sprays'],
    targets: ['Apple scab', 'Powdery mildew', 'Alternaria leaf spot'],
    waitingPeriodDays: 14,
    mixingRules: [
      'Compatible with most fungicides',
      'Do NOT mix with highly alkaline materials',
    ],
    notes: ['Mancozeb is a broad-spectrum protectant fungicide'],
  },
  {
    molecule: 'Chlorpyriphos',
    formulations: ['Chlorpyriphos 20 EC'],
    dosagePer100L: '100 ml / 100 L water',
    timing: ['Pre-bloom', 'Petal fall', 'Fruit development stage'],
    targets: ['San Jose scale', 'Woolly apple aphid', 'Leaf miner', 'Codling moth'],
    waitingPeriodDays: 14,
    mixingRules: [
      'Do NOT mix with fungicides containing copper',
      'Maintain 3–4 days gap between insecticide and fungicide sprays',
    ],
    notes: ['Chlorpyriphos is a broad-spectrum insecticide for scale and sucking pests'],
  },
  {
    molecule: 'Quinalphos',
    formulations: ['Quinalphos 25 EC'],
    dosagePer100L: 'As per product label',
    timing: ['Pre-bloom', 'Petal fall', 'Fruit development stage'],
    targets: ['San Jose scale', 'Woolly apple aphid', 'Leaf miner'],
    waitingPeriodDays: 14,
    mixingRules: ['Maintain 3–4 days gap between insecticide and fungicide sprays'],
    notes: ['Quinalphos is an organophosphate insecticide for sucking pests'],
  },
  {
    molecule: 'Thiacloprid',
    formulations: ['Thiacloprid 21.7 SC'],
    dosagePer100L: '40 ml / 100 L water',
    timing: ['Petal fall', 'Fruit development stage'],
    targets: ['Woolly apple aphid', 'San Jose scale', 'Leaf miner'],
    waitingPeriodDays: 14,
    mixingRules: ['Compatible with most fungicides'],
    notes: ['Thiacloprid is a neonicotinoid insecticide for sucking pests'],
  },
  {
    molecule: 'Fenazaquin',
    formulations: ['Fenazaquin 10 EC'],
    dosagePer100L: 'As per product label',
    timing: ['Pre-bloom', 'Petal fall'],
    targets: ['Mites', 'Red spider mite'],
    waitingPeriodDays: 7,
    mixingRules: ['Compatible with most fungicides'],
    notes: ['Fenazaquin is an acaricide for mite control in apple orchards'],
  },
  {
    molecule: 'Hexythiazox',
    formulations: ['Hexythiazox'],
    dosagePer100L: 'As per product label',
    timing: ['Pre-bloom', 'Petal fall'],
    targets: ['Mites', 'Red spider mite', 'Eggs and immature stages'],
    waitingPeriodDays: 7,
    mixingRules: ['Compatible with most fungicides'],
    notes: ['Hexythiazox is an acaricide effective against mite eggs and immature stages'],
  },
  {
    molecule: 'Summer Spray Oil',
    formulations: ['Summer Spray Oil'],
    dosagePer100L: 'As per product label',
    timing: ['Dormant season', 'Pre-bloom'],
    targets: ['San Jose scale', 'Woolly apple aphid', 'Mite eggs'],
    waitingPeriodDays: 0,
    mixingRules: [
      'Do NOT mix with Captan or sulphur',
      'Do NOT apply within 14 days of sulphur application',
    ],
    notes: ['Summer spray oil is a dormant oil for scale and mite egg control'],
  },
];

/**
 * SKUAST-Kashmir general spray guidelines for Kashmir horticulture.
 */
export const SKUAST_GUIDELINES = {
  title: 'SKUAST-Kashmir Official Spray Guidelines',
  timings: [
    'Pink bud stage — first protective spray against apple scab',
    'Petal fall — second protective spray',
    'Pre-rain sprays — before expected rainfall to prevent infection',
    'Pre-harvest sprays — observe strict waiting period before harvest',
  ],
  waitingPeriods: [
    'Strict 14-day waiting period (PHI) before harvest for most fungicides',
    '7-day waiting period for acaricides (Fenazaquin, Hexythiazox)',
    '0-day waiting period for Summer Spray Oil',
  ],
  mixingRules: [
    'Never mix stickers or spreaders with Dodine',
    'Maintain 3–4 days gap between insecticide and fungicide sprays',
    'Do NOT mix Summer Spray Oil with Captan or sulphur',
    'Do NOT apply Summer Spray Oil within 14 days of sulphur application',
  ],
  notes: [
    'Always follow product label instructions',
    'Use calibrated spray equipment for uniform coverage',
    'Spray during calm weather, early morning or late afternoon',
    'Rotate fungicides with different modes of action to prevent resistance',
  ],
};

/**
 * Look up SKUAST-K recommendation by active molecule name (case-insensitive,
 * fuzzy substring match).
 */
export function skuastLookup(moleculeOrName: string): SkuastRecommendation | null {
  const q = moleculeOrName.toLowerCase();
  return (
    SKUAST_RECOMMENDATIONS.find((r) =>
      r.molecule.toLowerCase().includes(q) ||
      r.formulations.some((f) => f.toLowerCase().includes(q)),
    ) ?? null
  );
}

/**
 * Look up SKUAST-K recommendations for multiple molecules (deduplicated).
 */
export function skuastLookupAll(molecules: string[]): SkuastRecommendation[] {
  const seen = new Set<string>();
  const results: SkuastRecommendation[] = [];
  for (const m of molecules) {
    const r = skuastLookup(m);
    if (r && !seen.has(r.molecule.toLowerCase())) {
      seen.add(r.molecule.toLowerCase());
      results.push(r);
    }
  }
  return results;
}
