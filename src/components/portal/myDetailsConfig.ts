/**
 * What each portal asks in its "My details" window. Kept short and in plain
 * words; nothing here is required except where a portal can't work without
 * it. Options are complete literal strings so the form can render chips.
 */
import type { PortalId } from '@/lib/auth/roles';

export type DetailField =
  | { key: string; label: string; type: 'text' | 'tel' | 'number'; placeholder?: string; hint?: string; required?: boolean }
  | { key: string; label: string; type: 'textarea'; placeholder?: string; hint?: string; required?: boolean }
  | { key: string; label: string; type: 'choice' | 'multi'; options: string[]; hint?: string; required?: boolean }
  | { key: string; label: string; type: 'yesno'; hint?: string };

export interface DetailsForm {
  title: string;
  intro: string;
  fields: DetailField[];
}

const STATES = ['Jammu and Kashmir', 'Ladakh', 'Himachal Pradesh', 'Punjab', 'Delhi', 'Other'];
const PLACE: DetailField[] = [
  { key: 'village', label: 'Village / town', type: 'text', placeholder: 'e.g. Chitragam Kalan', required: true },
  { key: 'district', label: 'District', type: 'text', placeholder: 'e.g. Shopian', required: true },
  { key: 'state', label: 'State', type: 'choice', options: STATES },
];

export const MY_DETAILS: Partial<Record<PortalId, DetailsForm>> = {
  farmer: {
    title: 'My farm',
    intro: 'Tell us about your land and crops so we can show the right mandi rates, weather and advice.',
    fields: [
      ...PLACE,
      { key: 'land', label: 'Land area (kanal)', type: 'number', placeholder: 'e.g. 12' },
      { key: 'crops', label: 'What do you grow?', type: 'multi', options: ['Apple', 'Walnut', 'Almond', 'Cherry', 'Pear', 'Saffron', 'Rice', 'Vegetables'], required: true },
      { key: 'irrigation', label: 'Water for the orchard', type: 'choice', options: ['Canal', 'Tube well', 'Rain only', 'Sprinkler / drip'] },
      { key: 'language', label: 'Language you prefer', type: 'choice', options: ['Kashmiri', 'Urdu', 'Hindi', 'English'] },
    ],
  },
  buyer: {
    title: 'My buying details',
    intro: 'So growers and sellers know who they are dealing with and what you need.',
    fields: [
      { key: 'business', label: 'Business name', type: 'text', placeholder: 'e.g. Mir Fruit Traders', required: true },
      { key: 'kind', label: 'You are a', type: 'choice', options: ['Wholesaler', 'Retailer', 'Exporter', 'Processor', 'Commission agent'], required: true },
      { key: 'gstin', label: 'GSTIN (optional)', type: 'text', placeholder: '15 characters', hint: 'Needed for GST invoices on escrow deals.' },
      { key: 'city', label: 'City / mandi', type: 'text', placeholder: 'e.g. Delhi (Azadpur)', required: true },
      { key: 'products', label: 'What do you buy?', type: 'multi', options: ['Apple', 'Walnut', 'Almond', 'Cherry', 'Pear', 'Saffron', 'Vegetables'] },
      { key: 'volume', label: 'Usual monthly volume (tonnes)', type: 'number', placeholder: 'e.g. 20' },
    ],
  },
  seller: {
    title: 'My shop',
    intro: 'Your shop details appear on your catalogue and price comparison listings.',
    fields: [
      { key: 'shop', label: 'Shop / brand name', type: 'text', required: true },
      { key: 'gstin', label: 'GSTIN', type: 'text', placeholder: '15 characters' },
      { key: 'licence', label: 'Fertiliser / pesticide licence no. (if you sell them)', type: 'text' },
      ...PLACE,
      { key: 'categories', label: 'What do you sell?', type: 'multi', options: ['Fertilisers', 'Pesticides', 'Seeds & saplings', 'Packaging', 'Tools', 'Irrigation'], required: true },
    ],
  },
  logistics: {
    title: 'My vehicles',
    intro: 'Add your vehicles so growers and buyers can book you, and tracking knows your trucks.',
    fields: [
      { key: 'company', label: 'Company / owner name', type: 'text', required: true },
      { key: 'vehicles', label: 'Vehicle numbers', type: 'textarea', placeholder: 'One per line, e.g. JK03A1234', required: true },
      { key: 'types', label: 'Vehicle types', type: 'multi', options: ['Truck', 'Reefer (cold)', 'Pickup', 'Tempo'] },
      { key: 'capacity', label: 'Largest load (tonnes)', type: 'number' },
      { key: 'routes', label: 'Routes you run', type: 'text', placeholder: 'e.g. Shopian – Delhi, Sopore – Mumbai' },
    ],
  },
  kissan: {
    title: 'My needs',
    intro: 'Tell us what equipment and supplies you are looking for.',
    fields: [...PLACE, { key: 'needs', label: 'Looking for', type: 'multi', options: ['Sprayers', 'Pruning tools', 'Hail nets', 'Crates', 'Tractor parts', 'Saplings'] }],
  },
  rental: {
    title: 'My rental details',
    intro: 'Whether you offer storage or machines, or need them — and where.',
    fields: [
      { key: 'role', label: 'I want to', type: 'choice', options: ['Rent out', 'Hire'], required: true },
      { key: 'what', label: 'What', type: 'multi', options: ['Cold storage', 'CA store', 'Tractor', 'Sprayer', 'Grading machine', 'Truck'], required: true },
      ...PLACE,
      { key: 'capacity', label: 'Capacity (tonnes, for storage)', type: 'number' },
    ],
  },
  tracking: {
    title: 'My tracking',
    intro: 'Vehicles you follow often, so you can check them in one tap.',
    fields: [{ key: 'watch', label: 'Vehicle numbers to watch', type: 'textarea', placeholder: 'One per line, e.g. JK03A1234' }],
  },
  dealer: {
    title: 'My dealership',
    intro: 'Licence details let farmers trust the batches you register.',
    fields: [
      { key: 'firm', label: 'Firm name', type: 'text', required: true },
      { key: 'licence', label: 'Dealer licence number', type: 'text', required: true },
      { key: 'gstin', label: 'GSTIN', type: 'text' },
      ...PLACE,
      { key: 'brands', label: 'Brands / manufacturers you stock', type: 'textarea', placeholder: 'e.g. IFFCO, Coromandel, NFL' },
    ],
  },
  expert: {
    title: 'My profile',
    intro: 'Farmers see this when you answer questions or join a video call.',
    fields: [
      { key: 'qualification', label: 'Qualification', type: 'text', placeholder: 'e.g. M.Sc. Horticulture' },
      { key: 'department', label: 'Department / institution', type: 'text', placeholder: 'e.g. SKUAST-Kashmir, Horticulture Dept.' },
      { key: 'speciality', label: 'Speciality', type: 'multi', options: ['Apple', 'Walnut & almond', 'Saffron', 'Plant protection', 'Soil & nutrition', 'Post-harvest'] },
      { key: 'languages', label: 'Languages', type: 'multi', options: ['Kashmiri', 'Urdu', 'Hindi', 'English'] },
      { key: 'video', label: 'Available for video calls with farmers', type: 'yesno' },
    ],
  },
};

export const detailsKey = (portal: PortalId) => `profile_${portal}`;
