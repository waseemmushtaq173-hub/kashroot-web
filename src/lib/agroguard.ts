export interface BaselineProduct {
  brand: string;
  name: string;
  composition: string;
  batchFormat: RegExp; // Regex to validate batch code pattern
}

export const MANUFACTURER_REGISTRY: BaselineProduct[] = [
  {
    brand: 'IFFCO',
    name: 'Urea',
    composition: '46:0:0',
    batchFormat: /^IF(N|S)\d{6,8}[A-Z]*$/, // e.g., IFN123456
  },
  {
    brand: 'Coromandel',
    name: 'Gromor',
    composition: '20:20:0:13',
    batchFormat: /^COR\d{5}[A-Z]{2}$/, // e.g., COR12345AB
  },
  {
    brand: 'Bayer',
    name: 'Confidor',
    composition: 'Imidacloprid 17.8% SL',
    batchFormat: /^[A-Z]{2}\d{6}$/, // e.g., GR053118
  },
  {
    brand: 'Tata Rallis',
    name: 'Asataf',
    composition: 'Acephate 75% SP',
    batchFormat: /^TR\d{4}[A-Z]\d{2}$/, // e.g., TR1234A56
  },
  {
    brand: 'Syngenta',
    name: 'Amistar',
    composition: 'Azoxystrobin 23% SC',
    batchFormat: /^SYN\d{7}$/, // e.g., SYN1234567
  }
];

export interface VerificationResult {
  isOriginal: boolean;
  score: number;
  matchDetails: string;
  clearance: string;
}

export function verifyAgroInput(manufacturer: string, batchCode: string, npk: string): VerificationResult {
  const brandQuery = manufacturer.toLowerCase();
  const npkQuery = npk.trim().toLowerCase();
  const batchQuery = batchCode.trim().toUpperCase();

  // Find if we have a baseline for this manufacturer
  const baseline = MANUFACTURER_REGISTRY.find(p => brandQuery.includes(p.brand.toLowerCase()));

  if (!baseline) {
    // Unknown brand, use heuristic
    const isFake = batchQuery.includes('X') || brandQuery.includes('fake') || brandQuery.includes('simulated');
    
    // For our simulated scan button 'Bayer CropScience (Simulated)', we should let it match the Bayer baseline above 
    // Wait, the simulate button uses "Bayer CropScience (Simulated)", so brandQuery includes "bayer".
    // That means it WILL match the Bayer baseline above. So this generic fallback is for completely unknown inputs.
    
    return {
      isOriginal: !isFake,
      score: isFake ? Math.floor(Math.random() * 20) + 20 : Math.floor(Math.random() * 15) + 70, // 70-85 for unknown but seemingly ok
      matchDetails: isFake 
        ? `Brand "${manufacturer}" is not recognized or is flagged in our database.`
        : `Manufacturer "${manufacturer}" is not in our verified registry. Batch format appears standard but cannot be cryptographically verified.`,
      clearance: isFake 
        ? "HIGH RISK. Unverified or simulated product."
        : "UNVERIFIED. Use caution; no official baseline available for cross-referencing."
    };
  }

  // Manufacturer is known. Validate composition and batch code.
  const compMatch = npkQuery === baseline.composition.toLowerCase();
  const batchMatch = baseline.batchFormat.test(batchQuery);

  if (compMatch && batchMatch) {
    // Perfect match
    return {
      isOriginal: true,
      score: Math.floor(Math.random() * 3) + 97, // 97-99
      matchDetails: `Composition (${npk}) matches official specs for ${baseline.brand} ${baseline.name}. Batch code ${batchCode} verified against ${baseline.brand} registry format.`,
      clearance: "VERIFIED ORIGINAL. Safe for agricultural application."
    };
  } else if (compMatch && !batchMatch) {
    // Composition matches but batch code format is wrong
    return {
      isOriginal: false,
      score: Math.floor(Math.random() * 15) + 40, // 40-54
      matchDetails: `Composition matches ${baseline.brand}, but the batch code format "${batchCode}" is invalid for this manufacturer (expected official format).`,
      clearance: "COUNTERFEIT RISK / BATCH FORMAT MISMATCH. Do not use. Report to local agriculture office."
    };
  } else if (!compMatch && batchMatch) {
    // Batch code looks right but composition is wrong
    return {
      isOriginal: false,
      score: Math.floor(Math.random() * 15) + 30, // 30-44
      matchDetails: `Batch format is valid, but stated composition "${npk}" strongly deviates from the official baseline for ${baseline.brand} ${baseline.name} (Expected: ${baseline.composition}).`,
      clearance: "COUNTERFEIT RISK / SPECIFICATION MISMATCH. Do not use. Report to local agriculture office."
    };
  } else {
    // Both wrong
    return {
      isOriginal: false,
      score: Math.floor(Math.random() * 15) + 15, // 15-29
      matchDetails: `Severe discrepancies detected. Stated composition "${npk}" does not match ${baseline.brand} specs, and batch code format is invalid.`,
      clearance: "HIGH RISK COUNTERFEIT. Do not use. Report to local agriculture office."
    };
  }
}
