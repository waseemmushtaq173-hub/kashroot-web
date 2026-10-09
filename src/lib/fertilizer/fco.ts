/**
 * Headline nutrient specifications from the Fertiliser (Control) Order, 1985
 * (Schedule I), for the fertilisers growers buy most. Values are percent by
 * weight: `min` nutrients must be at least this; `max` limits must not be
 * exceeded. Only the main, well-established parameters are listed — a state
 * Fertiliser Quality Control Laboratory report is the legal test, and the FCO
 * also allows small investigational tolerances not modelled here.
 */
export interface FcoParameter {
  key: string;
  label: string;
  min?: number;
  max?: number;
}

export interface FcoProduct {
  id: string;
  name: string;
  grade: string;
  parameters: FcoParameter[];
}

export const FCO_PRODUCTS: FcoProduct[] = [
  {
    id: 'urea',
    name: 'Urea',
    grade: '46:0:0',
    parameters: [
      { key: 'n', label: 'Total nitrogen (N)', min: 46.0 },
      { key: 'biuret', label: 'Biuret', max: 1.5 },
      { key: 'moisture', label: 'Moisture', max: 1.0 },
    ],
  },
  {
    id: 'dap',
    name: 'Diammonium phosphate (DAP)',
    grade: '18:46:0',
    parameters: [
      { key: 'n', label: 'Total nitrogen (N)', min: 18.0 },
      { key: 'p', label: 'Total phosphate (P₂O₅)', min: 46.0 },
      { key: 'moisture', label: 'Moisture', max: 1.5 },
    ],
  },
  {
    id: 'mop',
    name: 'Muriate of potash (MOP)',
    grade: '0:0:60',
    parameters: [
      { key: 'k', label: 'Water-soluble potash (K₂O)', min: 60.0 },
      { key: 'moisture', label: 'Moisture', max: 0.5 },
    ],
  },
  {
    id: 'ssp',
    name: 'Single superphosphate (SSP)',
    grade: '0:16:0',
    parameters: [
      { key: 'p', label: 'Water-soluble phosphate (P₂O₅)', min: 16.0 },
      { key: 'moisture', label: 'Moisture', max: 12.0 },
    ],
  },
  {
    id: 'as',
    name: 'Ammonium sulphate',
    grade: '20.5:0:0:23',
    parameters: [
      { key: 'n', label: 'Ammoniacal nitrogen (N)', min: 20.5 },
      { key: 's', label: 'Sulphur (S)', min: 23.0 },
      { key: 'moisture', label: 'Moisture', max: 1.0 },
    ],
  },
  {
    id: 'npk102626',
    name: 'NPK complex',
    grade: '10:26:26',
    parameters: [
      { key: 'n', label: 'Total nitrogen (N)', min: 10.0 },
      { key: 'p', label: 'Total phosphate (P₂O₅)', min: 26.0 },
      { key: 'k', label: 'Water-soluble potash (K₂O)', min: 26.0 },
    ],
  },
  {
    id: 'npk123216',
    name: 'NPK complex',
    grade: '12:32:16',
    parameters: [
      { key: 'n', label: 'Total nitrogen (N)', min: 12.0 },
      { key: 'p', label: 'Total phosphate (P₂O₅)', min: 32.0 },
      { key: 'k', label: 'Water-soluble potash (K₂O)', min: 16.0 },
    ],
  },
  {
    id: 'aps',
    name: 'Ammonium phosphate sulphate',
    grade: '20:20:0:13',
    parameters: [
      { key: 'n', label: 'Total nitrogen (N)', min: 20.0 },
      { key: 'p', label: 'Total phosphate (P₂O₅)', min: 20.0 },
      { key: 's', label: 'Sulphur (S)', min: 13.0 },
    ],
  },
  {
    id: 'cn',
    name: 'Calcium nitrate',
    grade: '15.5% N, 18.8% Ca',
    parameters: [
      { key: 'n', label: 'Total nitrogen (N)', min: 15.5 },
      { key: 'ca', label: 'Calcium (Ca)', min: 18.8 },
    ],
  },
  {
    id: 'znh',
    name: 'Zinc sulphate heptahydrate',
    grade: '21% Zn',
    parameters: [
      { key: 'zn', label: 'Zinc (Zn)', min: 21.0 },
      { key: 's', label: 'Sulphur (S)', min: 10.0 },
    ],
  },
  {
    id: 'znm',
    name: 'Zinc sulphate monohydrate',
    grade: '33% Zn',
    parameters: [
      { key: 'zn', label: 'Zinc (Zn)', min: 33.0 },
      { key: 's', label: 'Sulphur (S)', min: 15.0 },
    ],
  },
  {
    id: 'borax',
    name: 'Borax',
    grade: '10.5% B',
    parameters: [{ key: 'b', label: 'Boron (B)', min: 10.5 }],
  },
];

export type ParameterVerdict = 'pass' | 'fail' | 'missing';

export function checkAgainstFco(product: FcoProduct, measured: Record<string, number | undefined>) {
  const rows = product.parameters.map((p) => {
    const value = measured[p.key];
    let verdict: ParameterVerdict = 'missing';
    if (typeof value === 'number' && Number.isFinite(value)) {
      verdict = (p.min === undefined || value >= p.min) && (p.max === undefined || value <= p.max) ? 'pass' : 'fail';
    }
    return { ...p, value, verdict };
  });
  const tested = rows.filter((r) => r.verdict !== 'missing');
  return {
    rows,
    complete: tested.length === rows.length,
    pass: tested.length > 0 && tested.every((r) => r.verdict === 'pass'),
  };
}
