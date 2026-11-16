/**
 * Where the official fertiliser and pesticide documents are published, for the admin who
 * imports them (Admin → Official lists). Every address is the publisher's own; nothing here
 * is a product. What each one holds was found in November 2026 — check the date on the file.
 *
 * None of these publishes a regularly refreshed machine-readable list: the registers are PDFs
 * and Gazette notices, so a list is brought up to date by loading each new document when it is
 * published (the daily check only follows a CSV link).
 */
export interface OfficialSource {
  name: string;
  url: string;
  /** What it publishes, in plain words — including how old it was when found. */
  holds: string;
}

export const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    name: 'CIB&RC — registered pesticides',
    url: 'https://ppqs.gov.in/divisions/cib-rc/registered-products',
    holds: 'The Insecticides Act registers (section 9(3) and 9(4)) as PDF lists "as on 31.03.2024". Products approved since appear only in the Registration Committee meeting minutes.',
  },
  {
    name: 'Gazette of India',
    url: 'https://egazette.gov.in',
    holds: 'The notifications that change the rules: pesticide bans and restrictions, and each amendment to the Fertiliser (Control) Order, 1985 (Schedule I standards, Schedule VI biostimulants).',
  },
  {
    name: 'Soil Health Card portal',
    url: 'https://soilhealth.dac.gov.in',
    holds: 'Government fertiliser recommendations by crop and by the age of a horticultural crop, from a soil test.',
  },
  {
    name: 'J&K Department of Horticulture',
    url: 'https://horticulture.jk.gov.in/FAQs.html',
    holds: 'The Director Horticulture, Kashmir notifies the yearly spray schedule; the FAQs give fertiliser doses per tree by age.',
  },
  {
    name: 'SKUAST-Kashmir',
    url: 'https://www.skuastkashmir.ac.in',
    holds: 'The Directorate of Research prepares the yearly apple spray schedule; the Directorate of Extension issues advisories. No schedule file was found on the public pages.',
  },
  {
    name: 'data.gov.in',
    url: 'https://www.data.gov.in',
    holds: 'Statistics only (fertiliser production, imports and availability; pesticide consumption). No product-level register of pesticides or fertilisers was found there.',
  },
];
