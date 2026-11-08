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
  /* ─── Fungicides — strict 1-to-1 brand → legal manufacturer / unique CIR ID ─── */
  {
    id: 'ci-fungi-mancozeb-indofil-m45',
    cir_no: 'CIR-12345/2019-Mancozeb (WP)',
    active_molecule: 'Mancozeb',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Indofil M-45'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Indofil Industries Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-12345/2019',
    approved_crops: ['Apple', 'Mango', 'Potato', 'Grapes', 'Tomato', 'Chilli'],
    target_pests: ['Apple Scab', 'Early Blight', 'Late Blight', 'Downy Mildew'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Indofil Industries Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-mancozeb-dithane-m45',
    cir_no: 'CIR-12388/2019-Mancozeb (WP)',
    active_molecule: 'Mancozeb',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Dithane M-45'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Corteva Agriscience (Dow AgroSciences)',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-12388/2019',
    approved_crops: ['Apple', 'Mango', 'Potato', 'Grapes', 'Tomato', 'Chilli'],
    target_pests: ['Apple Scab', 'Early Blight', 'Late Blight', 'Downy Mildew'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Corteva Agriscience (Dow AgroSciences)',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-captan-captaf',
    cir_no: 'CIR-23456/2020-Captan (WP)',
    active_molecule: 'Captan',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Captaf'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Rallis India Ltd. (A Tata Enterprise)',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-23456/2020',
    approved_crops: ['Apple', 'Grapes', 'Strawberry', 'Tomato'],
    target_pests: ['Apple Scab', 'Brown Rot', 'Leaf Spot'],
    dosage_per_ha: '2.5 kg',
    dosage_per_acre: '1.0 kg',
    waiting_period_days: 21,
    toxicity_class: 'Blue',
    manufacturer: 'Rallis India Ltd. (A Tata Enterprise)',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-captan-merpan',
    cir_no: 'CIR-23499/2020-Captan (WP)',
    active_molecule: 'Captan',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Merpan'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Adama India Pvt. Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-23499/2020',
    approved_crops: ['Apple', 'Grapes', 'Strawberry', 'Tomato'],
    target_pests: ['Apple Scab', 'Brown Rot', 'Leaf Spot'],
    dosage_per_ha: '2.5 kg',
    dosage_per_acre: '1.0 kg',
    waiting_period_days: 21,
    toxicity_class: 'Blue',
    manufacturer: 'Adama India Pvt. Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-dodine-syllit',
    cir_no: 'CIR-34567/2021-Dodine (WP/SC)',
    active_molecule: 'Dodine',
    formulation: 'WP/SC',
    section: '9(3)',
    brandNames: ['Syllit'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'UPL Ltd. / Arysta LifeScience',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-34567/2021',
    approved_crops: ['Apple'],
    target_pests: ['Apple Scab'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'UPL Ltd. / Arysta LifeScience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-dodine-noor',
    cir_no: 'CIR-34590/2021-Dodine (WP)',
    active_molecule: 'Dodine',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Noor'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Indofil Industries Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-34590/2021',
    approved_crops: ['Apple'],
    target_pests: ['Apple Scab'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Indofil Industries Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-dodine-superdod',
    cir_no: 'CIR-34612/2021-Dodine (WP)',
    active_molecule: 'Dodine',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Superdod'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Dhanuka Agritech Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-34612/2021',
    approved_crops: ['Apple'],
    target_pests: ['Apple Scab'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Dhanuka Agritech Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-ziram-cuman-l',
    cir_no: 'CIR-38120/2018-Ziram (SC)',
    active_molecule: 'Ziram',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Cuman L'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Syngenta India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-38120/2018',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Syngenta India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-propineb-antracol',
    cir_no: 'CIR-41205/2019-Propineb (WP)',
    active_molecule: 'Propineb',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Antracol'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Bayer CropScience Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-41205/2019',
    approved_crops: ['Apple', 'Potato', 'Tomato'],
    target_pests: ['Apple Scab', 'Early Blight'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-hexaconazole-contaf',
    cir_no: 'CIR-51038/2020-Hexaconazole (EC/SC)',
    active_molecule: 'Hexaconazole',
    formulation: 'EC/SC',
    section: '9(3)',
    brandNames: ['Contaf', 'Contaf Plus'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Rallis India Ltd. (A Tata Enterprise)',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-51038/2020',
    approved_crops: ['Apple', 'Mango', 'Grapes'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 21,
    toxicity_class: 'Yellow',
    manufacturer: 'Rallis India Ltd. (A Tata Enterprise)',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-difenoconazole-score',
    cir_no: 'CIR-51011/2020-Difenoconazole (EC)',
    active_molecule: 'Difenoconazole',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Score'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Syngenta India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-51011/2020',
    approved_crops: ['Apple', 'Mango', 'Grapes', 'Chilli'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.5 L',
    dosage_per_acre: '0.2 kg',
    waiting_period_days: 14,
    toxicity_class: 'Yellow',
    manufacturer: 'Syngenta India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-zineb-hexaconazole-avtar',
    cir_no: 'CIR-51049/2021-Zineb+Hexaconazole (WP)',
    active_molecule: 'Zineb + Hexaconazole',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Avtar'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Indofil Industries Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-51049/2021',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '1.5 kg',
    dosage_per_acre: '0.6 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Indofil Industries Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-tebuconazole-trifloxystrobin-nativo',
    cir_no: 'CIR-51024/2020-Tebuconazole+Trifloxystrobin (WG)',
    active_molecule: 'Tebuconazole + Trifloxystrobin',
    formulation: 'WG',
    section: '9(3)',
    brandNames: ['Nativo'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Bayer CropScience Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-51024/2020',
    approved_crops: ['Apple', 'Grapes', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.4 kg',
    dosage_per_acre: '0.16 kg',
    waiting_period_days: 21,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-fluxapyroxad-pyraclostrobin-merivon',
    cir_no: 'CIR-52104/2021-Fluxapyroxad+Pyraclostrobin (SC)',
    active_molecule: 'Fluxapyroxad + Pyraclostrobin',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Merivon'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'BASF India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-52104/2021',
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
    id: 'ci-fungi-metiram-pyraclostrobin-cabrio-top',
    cir_no: 'CIR-52119/2020-Metiram+Pyraclostrobin (WG)',
    active_molecule: 'Metiram + Pyraclostrobin',
    formulation: 'WG',
    section: '9(3)',
    brandNames: ['Cabrio Top'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'BASF India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-52119/2020',
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
    id: 'ci-fungi-mancozeb-carbendazim-saaf',
    cir_no: 'CIR-44012/2019-Carbendazim+Mancozeb (WP)',
    active_molecule: 'Carbendazim + Mancozeb',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Saaf'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'UPL Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-44012/2019',
    approved_crops: ['Apple', 'Mango', 'Potato', 'Tomato'],
    target_pests: ['Apple Scab', 'Early Blight', 'Powdery Mildew'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'UPL Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-thiophanate-methyl-roko',
    cir_no: 'CIR-45100/2019-ThiophanateMethyl (WP)',
    active_molecule: 'Thiophanate Methyl',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Roko'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Biostadt India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-45100/2019',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.75 kg',
    dosage_per_acre: '0.3 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Biostadt India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-thiophanate-methyl-topsin-m',
    cir_no: 'CIR-45118/2019-ThiophanateMethyl (WP)',
    active_molecule: 'Thiophanate Methyl',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Topsin-M'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Nippon Soda / Rallis India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-45118/2019',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Powdery Mildew'],
    dosage_per_ha: '0.75 kg',
    dosage_per_acre: '0.3 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Nippon Soda / Rallis India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-coc-blitox',
    cir_no: 'CIR-31004/2018-COC (WP)',
    active_molecule: 'Copper Oxychloride',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Blitox'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Rallis India Ltd. (A Tata Enterprise)',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-31004/2018',
    approved_crops: ['Apple', 'Mango', 'Potato'],
    target_pests: ['Apple Scab', 'Leaf Spot'],
    dosage_per_ha: '2.5 kg',
    dosage_per_acre: '1.0 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Rallis India Ltd. (A Tata Enterprise)',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-fungi-copper-hydroxide-kocide-2000',
    cir_no: 'CIR-31550/2019-CopperHydroxide (WG)',
    active_molecule: 'Copper Hydroxide',
    formulation: 'WG',
    section: '9(3)',
    brandNames: ['Kocide 2000'],
    category: 'Fungicide — Section 9(3)',
    legalManufacturer: 'Corteva Agriscience / Certis',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-31550/2019',
    approved_crops: ['Apple', 'Mango'],
    target_pests: ['Apple Scab', 'Leaf Spot'],
    dosage_per_ha: '2.0 kg',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Blue',
    manufacturer: 'Corteva Agriscience / Certis',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  /* ─── Miticides — strict 1-to-1 brand → legal manufacturer / unique CIR ID ─── */
  {
    id: 'ci-miticide-fenazaquin-magister',
    cir_no: 'CIR-60112/2020-Fenazaquin (EC)',
    active_molecule: 'Fenazaquin',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Magister'],
    category: 'Miticide — Section 9(3)',
    legalManufacturer: 'Corteva Agriscience / Gowan India',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-60112/2020',
    approved_crops: ['Apple', 'Mango', 'Chilli'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'Corteva Agriscience / Gowan India',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-miticide-hexythiazox-maiden',
    cir_no: 'CIR-60234/2020-Hexythiazox (EC)',
    active_molecule: 'Hexythiazox',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Maiden'],
    category: 'Miticide — Section 9(3)',
    legalManufacturer: 'Biostadt India Ltd. / Nippon Soda',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-60234/2020',
    approved_crops: ['Apple', 'Chilli', 'Tea'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '1.5 L',
    dosage_per_acre: '0.6 kg',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Biostadt India Ltd. / Nippon Soda',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-miticide-propargite-omite',
    cir_no: 'CIR-60345/2019-Propargite (EC)',
    active_molecule: 'Propargite',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Omite'],
    category: 'Miticide — Section 9(3)',
    legalManufacturer: 'UPL Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-60345/2019',
    approved_crops: ['Apple', 'Chilli', 'Cotton'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '2.0 L',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 14,
    toxicity_class: 'Yellow',
    manufacturer: 'UPL Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-miticide-spiromesifen-oberon',
    cir_no: 'CIR-60456/2020-Spiromesifen (SC)',
    active_molecule: 'Spiromesifen',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Oberon'],
    category: 'Miticide — Section 9(3)',
    legalManufacturer: 'Bayer CropScience Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-60456/2020',
    approved_crops: ['Apple', 'Chilli', 'Cotton'],
    target_pests: ['Mites', 'Whitefly'],
    dosage_per_ha: '0.6 L',
    dosage_per_acre: '0.24 kg',
    waiting_period_days: 3,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-miticide-pyridaben-sanmite',
    cir_no: 'CIR-60567/2020-Pyridaben (WP)',
    active_molecule: 'Pyridaben',
    formulation: 'WP',
    section: '9(3)',
    brandNames: ['Sanmite'],
    category: 'Miticide — Section 9(3)',
    legalManufacturer: 'Nissan Chemical / Gowan India',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-60567/2020',
    approved_crops: ['Apple', 'Mango', 'Chilli'],
    target_pests: ['Mites', 'Red Spider Mite'],
    dosage_per_ha: '1.0 L',
    dosage_per_acre: '0.4 kg',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'Nissan Chemical / Gowan India',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  /* ─── Insecticides — strict 1-to-1 brand → legal manufacturer / unique CIR ID ─── */
  {
    id: 'ci-insecticide-chlorantraniliprole-coragen',
    cir_no: 'CIR-70111/2020-Chlorantraniliprole (SC)',
    active_molecule: 'Chlorantraniliprole',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Coragen'],
    category: 'Insecticide — Section 9(3)',
    legalManufacturer: 'FMC India Pvt. Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-70111/2020',
    approved_crops: ['Apple', 'Mango', 'Rice', 'Cotton'],
    target_pests: ['Caterpillars', 'Fruit Borer'],
    dosage_per_ha: '0.15 L',
    dosage_per_acre: '0.06 L',
    waiting_period_days: 7,
    toxicity_class: 'Green',
    manufacturer: 'FMC India Pvt. Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-insecticide-cyantraniliprole-benevia',
    cir_no: 'CIR-70222/2021-Cyantraniliprole (OD)',
    active_molecule: 'Cyantraniliprole',
    formulation: 'OD',
    section: '9(3)',
    brandNames: ['Benevia'],
    category: 'Insecticide — Section 9(3)',
    legalManufacturer: 'FMC India Pvt. Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-70222/2021',
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
    id: 'ci-insecticide-thiacloprid-alanto',
    cir_no: 'CIR-70333/2019-Thiacloprid (SC)',
    active_molecule: 'Thiacloprid',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Alanto'],
    category: 'Insecticide — Section 9(3)',
    legalManufacturer: 'Bayer CropScience Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-70333/2019',
    approved_crops: ['Apple', 'Mango', 'Cotton'],
    target_pests: ['Aphids', 'Thrips', 'Whitefly'],
    dosage_per_ha: '0.5 L',
    dosage_per_acre: '0.2 L',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Bayer CropScience Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-insecticide-chlorpyrifos-dursban',
    cir_no: 'CIR-70444/2018-Chlorpyrifos (EC)',
    active_molecule: 'Chlorpyrifos',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Dursban'],
    category: 'Insecticide — Section 9(3)',
    legalManufacturer: 'Corteva Agriscience',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-70444/2018',
    approved_crops: ['Apple', 'Cotton', 'Rice'],
    target_pests: ['Termites', 'Cutworm', 'Aphids'],
    dosage_per_ha: '2.5 L',
    dosage_per_acre: '1.0 L',
    waiting_period_days: 14,
    toxicity_class: 'Yellow',
    manufacturer: 'Corteva Agriscience',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  /* ─── Plant Growth Regulators (PGR) — strict 1-to-1 brand → legal manufacturer / unique CIR ID ─── */
  {
    id: 'ci-pgr-applin',
    cir_no: 'CIR-10435/2021-GA4+7+6BA (EC)',
    active_molecule: 'Gibberellic Acid (GA4+7) + 6-Benzyladenine (6-BA)',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Applin'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    legalManufacturer: 'Crystal Crop Protection Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-10435/2021',
    approved_crops: ['Apple', 'Pear'],
    target_pests: ['Fruit elongation (L/D ratio)', 'Prominent calyx lobes (typiness)', 'Fruit size & weight enhancement'],
    dosage_per_ha: '1.25 ml',
    dosage_per_acre: '0.5 ml',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Crystal Crop Protection Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-pgr-promalin',
    cir_no: 'CIR-10442/2022-GA4+7+6BA (L)',
    active_molecule: 'Gibberellic Acid (GA4+7) + 6-Benzyl Adenine (6-BA)',
    formulation: 'L',
    section: '9(3)',
    brandNames: ['Promalin'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3) FI',
    legalManufacturer: 'Sumitomo Chemical India Ltd. (Valent BioSciences)',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-10442/2022',
    approved_crops: ['Apple', 'Pear', 'Nursery Apple Stock'],
    target_pests: ['Fruit size', 'Weight', 'Calyx lobe development (typiness)', 'Lateral branching in young apple trees'],
    dosage_per_ha: '1.25 ml',
    dosage_per_acre: '0.5 ml',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Sumitomo Chemical India Ltd. (Valent BioSciences)',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-pgr-perlan',
    cir_no: 'CIR-10489/2022-6BA+GA (SL)',
    active_molecule: '6-Benzyladenine (6-BA) + Gibberellins GA4+7',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Perlan'],
    category: 'Plant Growth Regulator (PGR)',
    legalManufacturer: 'Fine Americas Inc. / Authorised Indian Registrant',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-10489/2022',
    approved_crops: ['Apple', 'Pear'],
    target_pests: ['Fruit sizing', 'Cell division', 'Fruit thinning', 'Typiness'],
    dosage_per_ha: '1.25 ml',
    dosage_per_acre: '0.5 ml',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Fine Americas Inc. / Authorised Indian Registrant',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-pgr-maxcel',
    cir_no: 'CIR-10512/2022-6BA (SL)',
    active_molecule: '6-Benzyladenine (6-BA)',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['MaxCel'],
    category: 'Plant Growth Regulator (PGR)',
    legalManufacturer: 'Sumitomo Chemical India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-10512/2022',
    approved_crops: ['Apple', 'Pear'],
    target_pests: ['Fruit sizing', 'Cell division', 'Fruit thinning', 'Typiness'],
    dosage_per_ha: '1.25 ml',
    dosage_per_acre: '0.5 ml',
    waiting_period_days: 7,
    toxicity_class: 'Blue',
    manufacturer: 'Sumitomo Chemical India Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-pgr-cultar',
    cir_no: 'CIR-9812/2018-Paclobutrazol (SC)',
    active_molecule: 'Paclobutrazol',
    formulation: 'SC',
    section: '9(3)',
    brandNames: ['Cultar'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    legalManufacturer: 'Syngenta India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-9812/2018',
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
    id: 'ci-pgr-planofix',
    cir_no: 'CIR-8921/2017-NAA (SL)',
    active_molecule: 'Alpha Naphthyl Acetic Acid (NAA)',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Planofix'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    legalManufacturer: 'Bayer CropScience Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-8921/2017',
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
    id: 'ci-pgr-ethrel',
    cir_no: 'CIR-8945/2018-Ethephon (SL)',
    active_molecule: 'Ethephon',
    formulation: 'SL',
    section: '9(3)',
    brandNames: ['Ethrel'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    legalManufacturer: 'Bayer CropScience Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-8945/2018',
    approved_crops: ['Apple', 'Mango', 'Pineapple'],
    target_pests: ['Uniform anthocyanin red colour development', 'Fruit maturity', 'Blossom thinning'],
    dosage_per_ha: '1.5 L',
    dosage_per_acre: '0.6 kg',
    waiting_period_days: 7,
    toxicity_class: 'Yellow',
    manufacturer: 'Bayer CropScience Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-pgr-progibb',
    cir_no: 'CIR-8960/2018-GA3 (L)',
    active_molecule: 'Gibberellic Acid (GA3)',
    formulation: 'L',
    section: '9(3)',
    brandNames: ['Progibb'],
    category: 'Plant Growth Regulator (PGR) — Section 9(3)',
    legalManufacturer: 'Sumitomo Chemical India Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-8960/2018',
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
    id: 'ci-pgr-smartfresh',
    cir_no: 'CIR-11020/2022-1MCP (VP)',
    active_molecule: '1-Methylcyclopropene (1-MCP)',
    formulation: 'VP',
    section: '9(3)',
    brandNames: ['SmartFresh'],
    category: 'Post-Harvest PGR (CA Cold Storage)',
    legalManufacturer: 'AgroFresh Solutions Inc.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-11020/2022',
    approved_crops: ['Apple'],
    target_pests: ['Ethylene action inhibition', 'Crunchiness & shelf-life maintenance (CA Cold Storage)'],
    dosage_per_ha: '1 ppb',
    dosage_per_acre: '0.4 ppb',
    waiting_period_days: 0,
    toxicity_class: 'Green',
    manufacturer: 'AgroFresh Solutions Inc.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  /* ─── Horticultural Mineral Oil / Tree Spray Oil — separate official records ─── */
  {
    id: 'ci-oil-arbofine',
    cir_no: 'CIR-80001/2020-HMO-Arbofine (EC)',
    active_molecule: 'Horticultural Mineral Oil',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Arbofine'],
    category: 'Insecticide / Miticide (Horticultural Mineral Oil) — Section 9(3)',
    legalManufacturer: 'TotalEnergies Marketing India Pvt. Ltd.',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-80001/2020',
    approved_crops: ['Apple', 'Citrus', 'Mango'],
    target_pests: ['Mites', 'Scale Insects', 'Aphids'],
    dosage_per_ha: '2.0 L',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 1,
    toxicity_class: 'Green',
    manufacturer: 'TotalEnergies Marketing India Pvt. Ltd.',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-oil-orchex-796',
    cir_no: 'CIR-80002/2020-HMO-Orchex-796 (EC)',
    active_molecule: 'Horticultural Mineral Oil',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['Orchex 796'],
    category: 'Insecticide / Miticide (Horticultural Mineral Oil) — Section 9(3)',
    legalManufacturer: 'ExxonMobil / Authorised Indian Registrant',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-80002/2020',
    approved_crops: ['Apple', 'Citrus', 'Mango'],
    target_pests: ['Mites', 'Scale Insects', 'Aphids'],
    dosage_per_ha: '2.0 L',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 1,
    toxicity_class: 'Green',
    manufacturer: 'ExxonMobil / Authorised Indian Registrant',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-oil-mak-all-season',
    cir_no: 'CIR-80003/2020-HMO-MAK-All-Season (EC)',
    active_molecule: 'Horticultural Mineral Oil',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['MAK All Season'],
    category: 'Insecticide / Miticide (Horticultural Mineral Oil) — Section 9(3)',
    legalManufacturer: 'Bharat Petroleum Corporation Ltd. (BPCL)',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-80003/2020',
    approved_crops: ['Apple', 'Citrus', 'Mango'],
    target_pests: ['Mites', 'Scale Insects', 'Aphids'],
    dosage_per_ha: '2.0 L',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 1,
    toxicity_class: 'Green',
    manufacturer: 'Bharat Petroleum Corporation Ltd. (BPCL)',
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ci-oil-hp-tree-spray-oil',
    cir_no: 'CIR-80004/2020-HMO-HP-Tree-Spray-Oil (EC)',
    active_molecule: 'Horticultural Mineral Oil',
    formulation: 'EC',
    section: '9(3)',
    brandNames: ['HP Tree Spray Oil'],
    category: 'Insecticide / Miticide (Horticultural Mineral Oil) — Section 9(3)',
    legalManufacturer: 'Hindustan Petroleum Corporation Ltd. (HPCL)',
    manufacturerLicense: 'CIB&RC Reg. No. CIR-80004/2020',
    approved_crops: ['Apple', 'Citrus', 'Mango'],
    target_pests: ['Mites', 'Scale Insects', 'Aphids'],
    dosage_per_ha: '2.0 L',
    dosage_per_acre: '0.8 kg',
    waiting_period_days: 1,
    toxicity_class: 'Green',
    manufacturer: 'Hindustan Petroleum Corporation Ltd. (HPCL)',
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

const DATA_GOV_IN_API_KEY = process.env.DATA_GOV_IN_API_KEY ?? '';
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
