/**
 * The fertiliser standards lookup (Lab report vs FCO): a name gives its own standard, an unknown name gives nothing.
 * It used to answer any name that was not an exact match with the first row of the list (Urea), so a farmer typing DAP,
 * MOP or SSP was shown Urea's limits (nitrogen at least 46%).
 */
import { expect, test } from '@playwright/test';

import { fcoLookupEmbedded } from '@/lib/gov-agro-registry';

test('each name finds its own standard', () => {
  expect(fcoLookupEmbedded('Urea')?.fertiliser_type).toBe('Urea');
  expect(fcoLookupEmbedded('DAP')?.fertiliser_type).toBe('Diammonium phosphate (DAP)');
  expect(fcoLookupEmbedded('MOP')?.fertiliser_type).toBe('Muriate of Potash (MOP)');
  expect(fcoLookupEmbedded('sop')?.fertiliser_type).toBe('Sulphate of Potash (SOP)');
  expect(fcoLookupEmbedded('SSP')?.fertiliser_type).toMatch(/^Single superphosphate \(SSP\)/);
  expect(fcoLookupEmbedded('calcium nitrate')?.fertiliser_type).toBe('Calcium Nitrate');
  expect(fcoLookupEmbedded('Diammonium phosphate (DAP)', '18:46:0')?.grade).toBe('18:46:0');
});

test('a name that is not in the list gives nothing, never the first row', () => {
  expect(fcoLookupEmbedded('zzqqxx')).toBeNull();
  expect(fcoLookupEmbedded('IFFCO Urea')).toBeNull();
  expect(fcoLookupEmbedded('')).toBeNull();
  expect(fcoLookupEmbedded('   ')).toBeNull();
  // A grade that does not belong to the type is not forced onto it.
  expect(fcoLookupEmbedded('DAP', '46:0:0')).toBeNull();
});
