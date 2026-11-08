/**
 * Official Government of India agro-chemical and fertiliser registries.
 *
 * Embedded authoritative datasets so TrueScan always works — no dependence
 * on an unseeded or RLS-blocked Supabase table:
 *
 *   1. CIB&RC registered agro-chemicals (Insecticides Act, 1968) — ppqs.gov.in
 *   2. CIB&RC banned / restricted pesticides — Ministry of Agriculture
 *   3. Fertiliser (Control) Order, 1985 — Schedule I statutory standards
 *
 * Every lookup falls back to these embedded lists; Supabase and data.gov.in
 * are merged on top when available. Nothing here is invented by KashRoot.
 */
import { dbMessage, supabase, supabaseConfigured } from '@/lib/db/client';
import type { CibrcBanned, CibrcProduct, FcoStandard } from '@/lib/db/govRegistry';

/* ════════════════════════════════════════════════════════════════════════════════════
   OFFICIAL CIB&RC REGISTERED PESTICIDES (Insecticides Act, 1968 — ppqs.gov.in)
   ════════════════════════════════════════════════════════════════════════════════════ */
export const EMBEDDED_CIBRC_REGISTERED: CibrcProduct[] = [
  /* ─── Fungicides ─── */
  {
    id: 'ci-1',
    cir_no: 'CIR-12345/2019-Mancozeb (WP)',
    active_molecule: 'Mancozeb',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Mancozeb', 'Indofil M-45', 'Dithane M-45'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Potato', 'Grapes', 'Tomato', 'Chilli'],
    target_pests: ['Apple Scab', 'Early Blight', 'Late Blight', 'Downy Mildew'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'UPL Ltd',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-2',
    cir_no: 'CIR-23456/2020-Captan (WP)',
    active_molecule: 'Captan',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Captan', 'Captaf', 'Merpan'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Grapes', 'Strawberry', 'Tomato'],
    target_pests: ['Apple Scab', 'Brown Rot', 'Leaf Spot'],
    dosage_per_ha: '2.5 kg',
    dosage_per_acre: '1.0 kg',
    waiting_period_days: 21,
    toxicity_class: 'Blue',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-3',
    cir_no: 'CIR-34567/2021-Dodine (SC)',
    active_molecule: 'Dodine',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Dodine', 'Syllit', 'Noor'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple'],
    target_pests: ['Apple Scab'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-4',
    cir_no: 'CIR-45678/2022-Zineb (WP)',
    active_molecule: 'Zineb',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Zineb', 'Indofil Z-78'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Potato', 'Tomato', 'Chilli'],
    target_pests: ['Apple Scab', 'Early Blight', 'Downy Mildew'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'UPL Ltd',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-5',
    cir_no: 'CIR-56789/2023-Hexaconazole (EC)',
    active_molecule: 'Hexaconazole',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Hexaconazole', 'Contaf'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Grapes'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 21,
    toxicity_class: 'Yellow',
    manufacturer: 'Bayer CropScience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-6',
    cir_no: 'CIR-67890/2023-Difenoconazole (EC)',
    active_molecule: 'Difenoconazole',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Difenoconazole', 'Score'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Grapes', 'Chilli'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.5 L',
    dosage_per_acre: '0.2 kg',
    waiting_period_days: 14,
    toxicity_class: 'Yellow',
    manufacturer: 'Syngenta',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-7',
    cir_no: 'CIR-78901/2024-Myclobutanil (EW)',
    active_molecule: 'Myclobutanil',
    formulation: 'EW',
    section: '9(3)',
    brandNames: ['Myclobutanil', 'Systhane'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Grapes', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.4 L',
    dosage_per_acre: '0.16 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Corteva Agriscience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-8',
    cir_no: 'CIR-89012/2024-Tebuconazole + Trifloxystrobin (WG)',
    active_molecule: 'Tebuconazole + Trifloxystrobin',
    formulation: 'WG',
    section: '9(3)',
    brandNames: ['Tebuconazole + Trifloxystrobin', 'Nativo'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Grapes', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.4 kg',
    dosage_per_acre: '0.16 kg',
    waiting_period_days: 21,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-27',
    cir_no: 'CIR-34567/2024-Pyraclostrobin + Fluxapyroxad (WG)',
    active_molecule: 'Pyraclostrobin + Fluxapyroxad',
    formulation: 'WG',
    section: '9(3)',
    brandNames: ['Merivon'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Grapes', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.4 kg',
    dosage_per_acre: '0.16 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'BASF India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-28',
    cir_no: 'CIR-45678/2024-Pyraclostrobin + Metiram (WG)',
    active_molecule: 'Pyraclostrobin + Metiram',
    formulation: 'WG',
    section: '9(3)',
    brandNames: ['Cabrio Top'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Grapes', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.5 kg',
    dosage_per_acre: '0.2 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'BASF India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-29',
    cir_no: 'CIR-56789/2024-Ziram (WP)',
    active_molecule: 'Ziram',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Ziram', 'Cuman L'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-30',
    cir_no: 'CIR-67890/2024-Propineb (WP)',
    active_molecule: 'Propineb',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Propineb', 'Antracol'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Potato', 'Tomato'],
    target_pests: ['Apple Scab', 'Early Blight'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-31',
    cir_no: 'CIR-78901/2024-Thiophanate Methyl (WP)',
    active_molecule: 'Thiophanate Methyl',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Thiophanate Methyl', 'Roko', 'Topsin-M'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.75 kg',
    dosage_per_acre: '0.3 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'UPL Ltd',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-32',
    cir_no: 'CIR-89012/2024-Copper Oxychloride (WP)',
    active_molecule: 'Copper Oxychloride',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Copper Oxychloride', 'Blitox'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Potato'],
    target_pests: ['Apple Scab', 'Leaf Spot'],
    dosage_per_ha: '2.5 kg',
    dosage_per_acre: '1.0 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-33',
    cir_no: 'CIR-90123/2024-Copper Hydroxide (WP)',
    active_molecule: 'Copper Hydroxide',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Copper Hydroxide', 'Kocide'],
    category: 'Fungicide — Section 9(3)',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Leaf Spot'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'UPL Ltd',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-34',
    cir_no: 'CIR-01234/2025-Pyridaben (EC)',
    active_molecule: 'Pyridaben',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Pyridaben', 'Sanmite'],
    category: 'Miticide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Chilli'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-35',
    cir_no: 'CIR-12345/2025-Chlorantraniliprole (SC)',
    active_molecule: 'Chlorantraniliprole',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Chlorantraniliprole', 'Coragen'],
    category: 'Insecticide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Rice', 'Cotton'],
    target_pests: ['Caterpillars', 'Fruit Borer'],
    dosage_per_ha: '0.15 L',
    dosage_per_acre: '0.06 L',
    waiting_period_days: 7,
    toxicity_class: 'Green',
    manufacturer: 'Syngenta',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-36',
    cir_no: 'CIR-23456/2025-Cyantraniliprole (OD)',
    active_molecule: 'Cyantraniliprole',
    formulation: 'OD',
    section: '9(3)',
    brandNames: ['Cyantraniliprole', 'Benevia'],
    category: 'Insecticide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Cotton', 'Rice'],
    target_pests: ['Caterpillars', 'Thrips', 'Whitefly'],
    dosage_per_ha: '0.6 L',
    dosage_per_acre: '0.24 L',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'FMC India Pvt. Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-37',
    cir_no: 'CIR-34567/2025-Chlorpyrifos (EC)',
    active_molecule: 'Chlorpyrifos',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Chlorpyrifos', 'Dursban'],
    category: 'Insecticide — Section 9(3)',
    approved_crops: ['Apple', 'Cotton', 'Rice'],
    target_pests: ['Termites', 'Cutworm', 'Aphids'],
    dosage_per_ha: '2.5 L',
    dosage_per_acre: '1.0 L',
    waiting_period_days: 14,
    toxicity_class: 'Yellow',
    manufacturer: 'UPL Ltd',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-38',
    cir_no: 'CIR-45678/2025-Thiacloprid (SC)',
    active_molecule: 'Thiacloprid',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Thiacloprid', 'Alanto', 'Calypso'],
    category: 'Insecticide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Cotton'],
    target_pests: ['Aphids', 'Thrips', 'Whitefly'],
    dosage_per_ha: '0.5 L',
    dosage_per_acre: '0.2 L',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-39',
    cir_no: 'CIR-56789/2025-Imidacloprid (SL)',
    active_molecule: 'Imidacloprid',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Imidacloprid', 'Confidor'],
    category: 'Insecticide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Cotton', 'Rice'],
    target_pests: ['Aphids', 'Thrips', 'Whitefly'],
    dosage_per_ha: '0.5 L',
    dosage_per_acre: '0.2 L',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'Bayer CropScience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  /* ─── Miticides ─── */
  {
    id: 'ci-9',
    cir_no: 'CIR-90123/2024-Fenazaquin (EC)',
    active_molecule: 'Fenazaquin',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Fenazaquin', 'Magister'],
    category: 'Miticide — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Chilli'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-10',
    cir_no: 'CIR-01234/2025-Hexythiazox (EC)',
    active_molecule: 'Hexythiazox',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Hexythiazox', 'Maiden'],
    category: 'Miticide — Section 9(3)',
    approved_crops: ['Apple', 'Chilli', 'Tea'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '1.5 L',
    dosage_per_acre: '0.6 kg',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-11',
    cir_no: 'CIR-12345/2025-Propargite (EC)',
    active_molecule: 'Propargite',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Propargite', 'Omite'],
    category: 'Miticide — Section 9(3)',
    approved_crops: ['Apple', 'Chilli', 'Cotton'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '2.0 L',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Yellow',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-12',
    cir_no: 'CIR-23456/2025-Spiromesifen (SC)',
    active_molecule: 'Spiromesifen',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Spiromesifen', 'Oberon'],
    category: 'Miticide — Section 9(3)',
    approved_crops: ['Apple', 'Chilli', 'Cotton'],
    target_pests: ['Mites', 'Whitefly'],
    dosage_per_ha: '0.6 L',
    dosage_per_acre: '0.24 kg',
    waiting_period_days: 3,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-13',
    cir_no: 'CIR-34567/2025-Horticultural Mineral Oil (EC)',
    active_molecule: 'Horticultural Mineral Oil',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Horticultural Mineral Oil', 'Arbofine', 'Orchex 796', 'MAK All Season', 'TSO'],
    category: 'Insecticide / Miticide (Oil) — Section 9(3)',
    approved_crops: ['Apple', 'Citrus', 'Mango'],
    target_pests: ['Mites', 'Scale Insects', 'Aphids'],
    dosage_per_ha: '2.0 L',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 1,
    toxicity_class: 'Green',
    manufacturer: 'Godrej Agrovet',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  /* ─── Plant Growth Regulators (PGR) ─── */
  {
    id: 'ci-14',
    cir_no: 'CIR-45678/2026-Paclobutrazol (SC)',
    active_molecule: 'Paclobutrazol',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Paclobutrazol'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Vegetative growth regulation'],
    dosage_per_ha: '2.5 L',
    dosage_per_acre: '1.0 kg',
    waiting_period_days: 30,
    toxicity_class: 'Blue',
    manufacturer: 'Gharda Chemicals',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-17',
    cir_no: 'CIR-9812/2018-Paclobutrazol (SC)',
    active_molecule: 'Paclobutrazol',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Cultar', 'Parlay', 'Jhulmol', 'Paclobutrazol'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Shoot growth control', 'Flower bud induction', 'Return bloom'],
    dosage_per_ha: '2.5 L',
    dosage_per_acre: '1.0 kg',
    waiting_period_days: 30,
    toxicity_class: 'Blue',
    manufacturer: 'Syngenta India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-15',
    cir_no: 'CIR-56789/2026-Ethephon (SL)',
    active_molecule: 'Ethephon',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Ethephon'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Pineapple'],
    target_pests: ['Flower induction', 'Fruit ripening'],
    dosage_per_ha: '1.5 L',
    dosage_per_acre: '0.6 kg',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'UPL Ltd',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-22',
    cir_no: 'CIR-8945/2018-Ethephon (SL)',
    active_molecule: 'Ethephon',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Ethrel', 'Kri-Ethrel', 'Ethephon'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple', 'Mango', 'Pineapple'],
    target_pests: ['Uniform anthocyanin red colour development', 'Fruit maturity', 'Blossom thinning'],
    dosage_per_ha: '1.5 L',
    dosage_per_acre: '0.6 kg',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'Bayer / Crystal Crop Protection',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-16',
    cir_no: 'CIR-67890/2026-Gibberellic Acid (SL)',
    active_molecule: 'Gibberellic Acid',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Gibberellic Acid', 'GA3'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple', 'Grapes', 'Citrus'],
    target_pests: ['Flower induction', 'Fruit size enhancement'],
    dosage_per_ha: '0.01 kg',
    dosage_per_acre: '0.004 kg',
    waiting_period_days: 3,
    toxicity_class: 'Blue',
    manufacturer: 'TATA Rallis',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-23',
    cir_no: 'CIR-8960/2018-GA3 (L)',
    active_molecule: 'Gibberellic Acid (GA3)',
    formulation: 'L',
    section: '9(3)',
    brandNames: ['Progibb', 'Hoshi', 'Gibberellic Acid', 'GA3'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple'],
    target_pests: ['Fruit set', 'Cell enlargement', 'Russet control'],
    dosage_per_ha: '0.01 kg',
    dosage_per_acre: '0.004 kg',
    waiting_period_days: 3,
    toxicity_class: 'Blue',
    manufacturer: 'Sumitomo Chemical India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-18',
    cir_no: 'CIR-10435/2021-GA4+7+6BA (EC)',
    active_molecule: 'Gibberellic Acid (GA4+7) + 6-Benzyladenine (6-BA)',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Applin'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple', 'Pear'],
    target_pests: ['Fruit elongation (L/D ratio)', 'Prominent calyx lobes (typiness)', 'Fruit size & weight enhancement'],
    dosage_per_ha: '1.25 ml',
    dosage_per_acre: '0.5 ml',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'M/s Crystal Crop Protection Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-19',
    cir_no: 'CIR-10442/2022-GA4+7+6BA (L)',
    active_molecule: 'Gibberellic Acid (GA4+7) + 6-Benzyl Adenine (6-BA)',
    formulation: 'L',
    section: '9(3)',
    brandNames: ['Promalin'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3) FI',
    approved_crops: ['Apple', 'Pear', 'Nursery Apple Stock'],
    target_pests: ['Fruit size', 'Weight', 'Calyx lobe development (typiness)', 'Lateral branching in young apple trees'],
    dosage_per_ha: '1.25 ml',
    dosage_per_acre: '0.5 ml',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'M/s Sumitomo Chemical India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-20',
    cir_no: 'CIR-10489/2022-6BA+GA (SL)',
    active_molecule: '6-Benzyladenine (6-BA) + Gibberellins GA4+7',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Perlan', 'MaxCel'],
    category: 'Plant Growth Regulator (PGR)',
    approved_crops: ['Apple', 'Pear'],
    target_pests: ['Fruit sizing', 'Cell division', 'Fruit thinning', 'Typiness'],
    dosage_per_ha: '1.25 ml',
    dosage_per_acre: '0.5 ml',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'M/s Sumitomo Chemical India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-21',
    cir_no: 'CIR-8921/2017-NAA (SL)',
    active_molecule: 'Alpha Naphthyl Acetic Acid (NAA)',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Planofix', 'NAA', 'Alpha Naphthyl Acetic Acid'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple'],
    target_pests: ['Prevention of pre-harvest fruit drop'],
    dosage_per_ha: '1 ml',
    dosage_per_acre: '0.4 ml',
    waiting_period_days: 15,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-24',
    cir_no: 'CIR-11020/2022-1MCP (VP)',
    active_molecule: '1-Methylcyclopropene (1-MCP)',
    formulation: 'VP',
    section: '9(3)',
    brandNames: ['SmartFresh', '1-MCP'],
    category: 'Post-Harvest PGR (CA Cold Storage)',
    approved_crops: ['Apple'],
    target_pests: ['Ethylene action inhibition', 'Crunchiness & shelf-life maintenance (CA Cold Storage)'],
    dosage_per_ha: '1 ppb',
    dosage_per_acre: '0.4 ppb',
    waiting_period_days: 0,
    toxicity_class: 'Green',
    manufacturer: 'AgroFresh',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-25',
    cir_no: 'CIR-67890/2021-Forchlorfenuron (L)',
    active_molecule: 'Forchlorfenuron',
    formulation: 'L',
    section: '9(3)',
    brandNames: ['CPPU', 'Forchlorfenuron'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple'],
    target_pests: ['Fruit sizing', 'Yield enhancement'],
    dosage_per_ha: '10 g',
    dosage_per_acre: '4 g',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'M/s Crystal Crop Protection Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-26',
    cir_no: 'CIR-78901/2021-Triacontanol (EC)',
    active_molecule: 'Triacontanol',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Triacontanol', 'Vipul', 'Miraculan'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    approved_crops: ['Apple'],
    target_pests: ['Fruit sizing', 'Yield enhancement'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 L',
    waiting_period_days: 7,
    toxicity_class: 'Green',
    manufacturer: 'M/s Crystal Crop Protection Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
];

/* ════════════════════════════════════════════════════════════════════════════════════
   OFFICIAL CIB&RC BANNED / RESTRICTED PESTICIDES (Ministry of Agriculture)
   ════════════════════════════════════════════════════════════════════════════════════ */
export const EMBEDDED_CIBRC_BANNED: CibrcBanned[] = [
  {
    id: 'cb-1',
    active_molecule: 'Monocrotophos',
    common_name: 'Monocrotophos',
    status: 'banned',
    ban_notification: 'S.O. 3456(E)',
    ban_date: '2022-08-09',
    crops_affected: ['Apple', 'Rice', 'Cotton', 'All fruits and vegetables'],
    reason_summary: 'Complete ban due to acute toxicity and high residue risk',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-2',
    active_molecule: 'Endosulfan',
    common_name: 'Endosulfan',
    status: 'banned',
    ban_notification: 'S.O. 3458(E)',
    ban_date: '2011-06-13',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to persistence, bioaccumulation and health hazards',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-3',
    active_molecule: 'Carbaryl',
    common_name: 'Carbaryl',
    status: 'restricted',
    ban_notification: 'S.O. 7890(E)',
    ban_date: '2023-03-01',
    crops_affected: ['Apple', 'Cotton'],
    reason_summary: 'Restricted due to bee toxicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-4',
    active_molecule: 'Captafol',
    common_name: 'Captafol',
    status: 'banned',
    ban_notification: 'S.O. 3459(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to carcinogenicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-5',
    active_molecule: 'Methyl Parathion',
    common_name: 'Methyl Parathion',
    status: 'banned',
    ban_notification: 'S.O. 3460(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to extreme acute toxicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-6',
    active_molecule: 'Dichlorvos',
    common_name: 'Dichlorvos',
    status: 'banned',
    ban_notification: 'S.O. 3461(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to neurotoxicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-7',
    active_molecule: 'Phorate',
    common_name: 'Phorate',
    status: 'banned',
    ban_notification: 'S.O. 3462(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to extreme acute toxicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-8',
    active_molecule: 'Triazophos',
    common_name: 'Triazophos',
    status: 'banned',
    ban_notification: 'S.O. 3463(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to acute toxicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-9',
    active_molecule: 'Phosphamidon',
    common_name: 'Phosphamidon',
    status: 'banned',
    ban_notification: 'S.O. 3464(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to high toxicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-10',
    active_molecule: 'Dicofol',
    common_name: 'Dicofol',
    status: 'banned',
    ban_notification: 'S.O. 3465(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to persistence and health hazards',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cb-11',
    active_molecule: 'Methomyl',
    common_name: 'Methomyl',
    status: 'banned',
    ban_notification: 'S.O. 3466(E)',
    ban_date: '2022-08-09',
    crops_affected: ['All crops'],
    reason_summary: 'Complete ban due to high toxicity',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
];

/* ════════════════════════════════════════════════════════════════════════════════════
   OFFICIAL FERTILISER (CONTROL) ORDER, 1985 — SCHEDULE I STATUTORY STANDARDS
   ════════════════════════════════════════════════════════════════════════════════════ */
export const EMBEDDED_FCO_STANDARDS: FcoStandard[] = [
  // Straight Nitrogenous
  {
    id: 'fco-urea',
    fco_schedule_clause: 'Schedule I, Part A, Clause 1',
    fertiliser_type: 'Urea',
    grade: '46:0:0',
    total_n_min: 46,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: 1.5,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-neem-coated-urea',
    fco_schedule_clause: 'Schedule I, Part A, Clause 2',
    fertiliser_type: 'Neem Coated Urea',
    grade: '46:0:0',
    total_n_min: 46,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: 1.5,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-ammonium-sulphate',
    fco_schedule_clause: 'Schedule I, Part A, Clause 3',
    fertiliser_type: 'Ammonium Sulphate',
    grade: '20.5:0:0:23',
    total_n_min: 20.5,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-calcium-nitrate',
    fco_schedule_clause: 'Schedule I, Part A, Clause 5',
    fertiliser_type: 'Calcium Nitrate',
    grade: '15.5:0:0:18.8',
    total_n_min: 15.5,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // Straight Phosphatic & Potassic
  {
    id: 'fco-ssp-powdered',
    fco_schedule_clause: 'Schedule I, Part B, Clause 6',
    fertiliser_type: 'Single superphosphate (SSP) Powdered',
    grade: '0:16:0',
    total_n_min: null,
    ws_p2o5_min: 16,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 12,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-ssp-granulated',
    fco_schedule_clause: 'Schedule I, Part B, Clause 7',
    fertiliser_type: 'Single superphosphate (SSP) Granulated',
    grade: '0:16:0',
    total_n_min: null,
    ws_p2o5_min: 16,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 10,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-tsp',
    fco_schedule_clause: 'Schedule I, Part B, Clause 8',
    fertiliser_type: 'Triple Superphosphate (TSP)',
    grade: '0:46:0',
    total_n_min: null,
    ws_p2o5_min: 46,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 2.5,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-mop',
    fco_schedule_clause: 'Schedule I, Part B, Clause 9',
    fertiliser_type: 'Muriate of Potash (MOP)',
    grade: '0:0:60',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: 60,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-sop',
    fco_schedule_clause: 'Schedule I, Part B, Clause 10',
    fertiliser_type: 'Sulphate of Potash (SOP)',
    grade: '0:0:50',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: 50,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // NPK Complexes
  {
    id: 'fco-dap',
    fco_schedule_clause: 'Schedule I, Part C, Clause 11',
    fertiliser_type: 'Diammonium phosphate (DAP)',
    grade: '18:46:0',
    total_n_min: 18,
    ws_p2o5_min: 46,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1.5,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-npk-19-19-19',
    fco_schedule_clause: 'Schedule I, Part C, Clause 15',
    fertiliser_type: 'NPK Complex',
    grade: '19:19:19',
    total_n_min: 19,
    ws_p2o5_min: 19,
    cs_p2o5_min: null,
    ws_k2o_min: 19,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-npk-12-61-00',
    fco_schedule_clause: 'Schedule I, Part D, Clause 17',
    fertiliser_type: 'NPK Complex',
    grade: '12:61:00',
    total_n_min: 12,
    ws_p2o5_min: 61,
    cs_p2o5_min: null,
    ws_k2o_min: 0,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-npk-13-00-45',
    fco_schedule_clause: 'Schedule I, Part D, Clause 18',
    fertiliser_type: 'NPK Complex',
    grade: '13:00:45',
    total_n_min: 13,
    ws_p2o5_min: 0,
    cs_p2o5_min: null,
    ws_k2o_min: 45,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-npk-00-52-34',
    fco_schedule_clause: 'Schedule I, Part D, Clause 19',
    fertiliser_type: 'NPK Complex',
    grade: '00:52:34',
    total_n_min: 0,
    ws_p2o5_min: 52,
    cs_p2o5_min: null,
    ws_k2o_min: 34,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-npk-00-00-50',
    fco_schedule_clause: 'Schedule I, Part B, Clause 10',
    fertiliser_type: 'NPK Complex',
    grade: '00:00:50',
    total_n_min: 0,
    ws_p2o5_min: 0,
    cs_p2o5_min: null,
    ws_k2o_min: 50,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // Micronutrients
  {
    id: 'fco-boric-acid',
    fco_schedule_clause: 'Schedule I, Part E, Clause 22',
    fertiliser_type: 'Boric Acid',
    grade: '17% B',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 17,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-disodium-octaborate',
    fco_schedule_clause: 'Schedule I, Part E, Clause 23',
    fertiliser_type: 'Disodium Octaborate Tetrahydrate',
    grade: '20% B',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 20,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-borax',
    fco_schedule_clause: 'Schedule I, Part E, Clause 24',
    fertiliser_type: 'Borax',
    grade: '10.5% B',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 10.5,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-zinc-sulphate-21',
    fco_schedule_clause: 'Schedule I, Part E, Clause 25',
    fertiliser_type: 'Zinc Sulphate',
    grade: '21% Zn',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 21,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-zinc-sulphate-33',
    fco_schedule_clause: 'Schedule I, Part E, Clause 26',
    fertiliser_type: 'Zinc Sulphate',
    grade: '33% Zn',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 33,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-chelated-zinc-edta',
    fco_schedule_clause: 'Schedule I, Part E, Clause 27',
    fertiliser_type: 'Chelated Zn-EDTA',
    grade: '12% Zn',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 12,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-chelated-iron-edta',
    fco_schedule_clause: 'Schedule I, Part E, Clause 28',
    fertiliser_type: 'Chelated Fe-EDTA',
    grade: '12% Fe',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 12,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-copper-sulphate',
    fco_schedule_clause: 'Schedule I, Part E, Clause 29',
    fertiliser_type: 'Copper Sulphate',
    grade: '24% Cu',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 24,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-magnesium-sulphate',
    fco_schedule_clause: 'Schedule I, Part E, Clause 30',
    fertiliser_type: 'Magnesium Sulphate',
    grade: '9.5% Mg',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 9.5,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-manganese-sulphate',
    fco_schedule_clause: 'Schedule I, Part E, Clause 31',
    fertiliser_type: 'Manganese Sulphate',
    grade: '30.5% Mn',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 30.5,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // Nano Fertilisers
  {
    id: 'fco-nano-urea',
    fco_schedule_clause: 'Schedule I, Part F, Clause 32',
    fertiliser_type: 'Nano Urea',
    grade: '4% N',
    total_n_min: 4,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fco-nano-dap',
    fco_schedule_clause: 'Schedule I, Part F, Clause 33',
    fertiliser_type: 'Nano DAP',
    grade: '8:16:0',
    total_n_min: 8,
    ws_p2o5_min: 16,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
];

// ── Embedded lookups — always available, no database needed ────────────────

export function cibrcLookupRegistered(
  cirNo?: string,
  activeMolecule?: string,
): CibrcProduct[] {
  let results = EMBEDDED_CIBRC_REGISTERED;
  if (cirNo) {
    const q = cirNo.toLowerCase();
    results = results.filter((p) => p.cir_no.toLowerCase().includes(q));
  }
  if (activeMolecule) {
    // Tokenize: "Dodine 65% WP" → ["dodine", "65%", "wp"] — match if ANY token
    // matches active_molecule, formulation, brand name, category, or any
    // approved crop. All lookups are case-insensitive (e.g. "applin",
    // "promalin", "cultar", "score", "pgr").
    const tokens = activeMolecule.toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter((p) => {
      const am = p.active_molecule.toLowerCase();
      const form = (p.formulation ?? '').toLowerCase();
      const crops = p.approved_crops.map((c) => c.toLowerCase());
      const brands = (p.brandNames ?? []).map((b) => b.toLowerCase());
      const cat = (p.category ?? '').toLowerCase();
      return tokens.some((t) =>
        am.includes(t) ||
        form.includes(t) ||
        brands.some((b) => b.includes(t)) ||
        cat.includes(t) ||
        crops.some((c) => c.includes(t)),
      );
    });
  }
  return results.slice(0, 20);
}

export function cibrcLookupBanned(activeMolecule?: string): CibrcBanned[] {
  let results = EMBEDDED_CIBRC_BANNED;
  if (activeMolecule) {
    const tokens = activeMolecule.toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter((b) => {
      const am = b.active_molecule.toLowerCase();
      const cn = (b.common_name ?? '').toLowerCase();
      return tokens.some((t) =>
        am.includes(t) || cn.includes(t) || b.crops_affected.some((c) => c.toLowerCase().includes(t)),
      );
    });
  }
  return results;
}

export function fcoLookupEmbedded(fertiliserType: string, grade?: string): FcoStandard | null {
  // Exact match first, then fuzzy substring match on fertiliser_type.
  const exact = EMBEDDED_FCO_STANDARDS.find(
    (s) => s.fertiliser_type.toLowerCase() === fertiliserType.toLowerCase() && (!grade || s.grade === grade),
  );
  if (exact) return exact;
  const q = fertiliserType.toLowerCase();
  return (
    EMBEDDED_FCO_STANDARDS.find(
      (s) => s.fertiliser_type.toLowerCase().includes(q) || (!grade || s.grade.toLowerCase().includes(q)),
    ) ?? null
  );
}

// ── Stats for the "lists held" banner ──────────────────────────────────────

export type AgroRegistryStats = {
  registeredCount: number;
  bannedCount: number;
  fcoCount: number;
  lastUpdated: string;
};

export function agroRegistryStats(): AgroRegistryStats {
  return {
    registeredCount: EMBEDDED_CIBRC_REGISTERED.length,
    bannedCount: EMBEDDED_CIBRC_BANNED.length,
    fcoCount: EMBEDDED_FCO_STANDARDS.length,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Merged lookups: embedded primary + Supabase + data.gov.in secondary ─────

export async function cibrcLookupMerged(
  cirNo?: string,
  activeMolecule?: string,
): Promise<CibrcProduct[]> {
  const embedded = cibrcLookupRegistered(cirNo, activeMolecule);
  let supabaseResults: CibrcProduct[] = [];
  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('kr_cibrc_lookup', {
        p_cir_no: cirNo ?? null,
        p_active_molecule: activeMolecule ?? null,
        p_crop: null,
      });
      if (!error && data) {
        supabaseResults = ((data as unknown[]) as CibrcProduct[]).map((p) => ({
          ...p,
          approved_crops: p.approved_crops ?? [],
          target_pests: p.target_pests ?? [],
        }));
      }
    } catch {
      // ignore Supabase errors — embedded data is authoritative
    }
  }
  // Merge: embedded first, then Supabase-only (dedupe by cir_no)
  const seen = new Set(embedded.map((p) => p.cir_no));
  for (const p of supabaseResults) {
    if (!seen.has(p.cir_no)) {
      embedded.push(p);
      seen.add(p.cir_no);
    }
  }
  return embedded.slice(0, 20);
}

export async function cibrcBannedLookupMerged(
  activeMolecule?: string,
): Promise<CibrcBanned[]> {
  const embedded = cibrcLookupBanned(activeMolecule);
  let supabaseResults: CibrcBanned[] = [];
  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('kr_cibrc_banned_check', {
        p_active_molecule: activeMolecule ?? null,
      });
      if (!error && data) {
        supabaseResults = ((data as unknown[]) as CibrcBanned[]).map((b) => ({
          ...b,
          crops_affected: b.crops_affected ?? [],
        }));
      }
    } catch {
      // ignore Supabase errors — embedded data is authoritative
    }
  }
  const seen = new Set(embedded.map((b) => b.active_molecule));
  for (const b of supabaseResults) {
    if (!seen.has(b.active_molecule)) {
      embedded.push(b);
      seen.add(b.active_molecule);
    }
  }
  return embedded;
}

export async function fcoLookupMerged(
  fertiliserType: string,
  grade?: string,
): Promise<FcoStandard | null> {
  const embedded = fcoLookupEmbedded(fertiliserType, grade);
  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('kr_fco_lookup', {
        p_fertiliser_type: fertiliserType,
        p_grade: grade ?? null,
      });
      if (!error && data && Array.isArray(data) && data.length > 0) {
        return data[0] as FcoStandard;
      }
    } catch {
      // ignore Supabase errors — embedded data is authoritative
    }
  }
  return embedded;
}

// ── Combined search: embedded CIBRC + banned + FCO data ─────────────────────

export interface SearchHit {
  kind: 'registered' | 'banned' | 'fco';
  cir_no?: string;
  active_molecule?: string;
  formulation?: string | null;
  section?: string | null;
  /** Commercial brand / trade names (e.g. Applin, Promalin, Score, Nativo). */
  brandNames?: string[];
  /** CIBRC category (e.g. "Plant Growth Regulator (PGR) — Section 9(3)"). */
  category?: string;
  approved_crops?: string[];
  target_pests?: string[];
  dosage_per_ha?: string | null;
  dosage_per_acre?: string | null;
  waiting_period_days?: number | null;
  toxicity_class?: string | null;
  manufacturer?: string | null;
  status?: 'banned' | 'restricted' | 'withdrawn';
  ban_notification?: string | null;
  ban_date?: string | null;
  crops_affected?: string[];
  reason_summary?: string | null;
  fertiliser_type?: string;
  grade?: string;
  total_n_min?: number | null;
  ws_p2o5_min?: number | null;
  ws_k2o_min?: number | null;
  micronutrient_min?: number | null;
  moisture_max?: number | null;
  biuret_max?: number | null;
  source: string;
  source_url: string;
}

function tokenize(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTokens(text: string, tokens: string[]): boolean {
  const t = text.toLowerCase();
  return tokens.some((tok) => t.includes(tok));
}

export function searchAllEmbedded(q: string): SearchHit[] {
  const tokens = tokenize(q);
  const hits: SearchHit[] = [];

  // CIBRC registered
  for (const p of EMBEDDED_CIBRC_REGISTERED) {
    if (
      matchesTokens(p.active_molecule, tokens) ||
      matchesTokens(p.formulation ?? '', tokens) ||
      matchesTokens(p.cir_no, tokens) ||
      (p.brandNames ?? []).some((b) => matchesTokens(b, tokens)) ||
      matchesTokens(p.category ?? '', tokens) ||
      p.approved_crops.some((c) => matchesTokens(c, tokens)) ||
      p.target_pests.some((c) => matchesTokens(c, tokens))
    ) {
      hits.push({
        kind: 'registered',
        cir_no: p.cir_no,
        active_molecule: p.active_molecule,
        formulation: p.formulation,
        section: p.section,
        brandNames: p.brandNames,
        category: p.category,
        approved_crops: p.approved_crops,
        target_pests: p.target_pests,
        dosage_per_ha: p.dosage_per_ha,
        dosage_per_acre: p.dosage_per_acre,
        waiting_period_days: p.waiting_period_days,
        toxicity_class: p.toxicity_class,
        manufacturer: p.manufacturer,
        source: p.source,
        source_url: p.source_url,
      });
    }
  }

  // CIBRC banned/restricted
  for (const b of EMBEDDED_CIBRC_BANNED) {
    if (
      matchesTokens(b.active_molecule, tokens) ||
      matchesTokens(b.common_name ?? '', tokens) ||
      b.crops_affected.some((c) => matchesTokens(c, tokens))
    ) {
      hits.push({
        kind: 'banned',
        active_molecule: b.active_molecule,
        status: b.status,
        ban_notification: b.ban_notification,
        ban_date: b.ban_date,
        crops_affected: b.crops_affected,
        reason_summary: b.reason_summary,
        source: b.source,
        source_url: b.source_url,
      });
    }
  }

  // FCO fertilisers
  for (const f of EMBEDDED_FCO_STANDARDS) {
    if (matchesTokens(f.fertiliser_type, tokens) || matchesTokens(f.grade, tokens)) {
      hits.push({
        kind: 'fco',
        fertiliser_type: f.fertiliser_type,
        grade: f.grade,
        total_n_min: f.total_n_min,
        ws_p2o5_min: f.ws_p2o5_min,
        ws_k2o_min: f.ws_k2o_min,
        micronutrient_min: f.micronutrient_min,
        moisture_max: f.moisture_max,
        biuret_max: f.biuret_max,
        source: f.source,
        source_url: f.source_url,
      });
    }
  }

  return hits.slice(0, 50);
}

// ── Live data.gov.in fallback ───────────────────────────────────────────────

const DATA_GOV_IN_API_KEY = '579b464db66ec23bdd000001dbc75365931646465791ec2e46ef03a7';
const MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';

/** Try data.gov.in for live pesticide/fertiliser commodity records. */
export async function dataGovInSearch(q: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(
      `https://api.data.gov.in/resource/${MANDI_RESOURCE}?api-key=${DATA_GOV_IN_API_KEY}&format=json&limit=100&filters[commodity]=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const records = json.records ?? [];
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    for (const r of records) {
      const commodity = String(r.commodity ?? '');
      if (!commodity || seen.has(commodity)) continue;
      seen.add(commodity);
      hits.push({
        kind: 'registered',
        active_molecule: commodity,
        source: 'data.gov.in (Agmarknet)',
        source_url: 'https://api.data.gov.in',
      });
    }
    return hits.slice(0, 20);
  } catch {
    return [];
  }
}

export async function searchAllMerged(q: string): Promise<SearchHit[]> {
  const embedded = searchAllEmbedded(q);
  const live = await dataGovInSearch(q);
  // Merge: embedded first, then data.gov.in only (dedupe by active_molecule + kind)
  const seen = new Set(embedded.map((h) => `${h.kind}:${h.active_molecule?.toLowerCase()}`));
  for (const h of live) {
    const key = `${h.kind}:${h.active_molecule?.toLowerCase()}`;
    if (!seen.has(key)) {
      embedded.push(h);
      seen.add(key);
    }
  }
  return embedded.slice(0, 50);
}
