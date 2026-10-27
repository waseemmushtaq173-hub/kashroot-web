/**
 * Region focus: which Indian state someone is in, and the crops that state
 * is known for — so Price Comparison, the Buyer shop and the voice assistant
 * show those crops first (Kashmir: apple, walnut, saffron, cherry; Kerala:
 * cardamom, pepper, rubber, coconut …).
 *
 * The state comes from, in order: the phone's location (only after the
 * person allows it, or when they already have), named by the map
 * (/api/place) or, when the map does not answer, the nearest district town
 * below; the state they chose; or the district in their My details.
 * India only. Only well-known crops are listed — a state without a clear
 * list keeps the usual order. Remembered on this phone only.
 *
 * CROPS is also the voice assistant's crop list (lib/navIntent.ts): spoken
 * names in English, Hindi, Urdu and Kashmiri. Pure data and helpers are safe
 * on the server; useRegion runs in the browser.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { hasWord, norm } from '@/lib/textMatch';

type Text = { en: string; hi: string; ur: string };

export interface Crop {
  /** English name, as sellers write it and as it is searched. */
  name: string;
  /** The shop's crop filter and the List produce "Crop" (lib/db/market PRODUCE). */
  category: 'Apple' | 'Walnut' | 'Almond' | 'Cherry' | 'Pear' | 'Saffron' | 'Rice' | 'Vegetables' | 'Other';
  /** Agmarknet's commodity name, for the mandi rates page. */
  mandi: string;
  label: Text;
  /** Spoken or typed names. Longer names first where one contains another. */
  keys: string[];
}

/** Crops whose shop filter is their own (not "Vegetables" or "Other"). */
export const ownFilter = (c: Crop) => c.category !== 'Vegetables' && c.category !== 'Other';

// Order matters where one name contains another: plum ("aloo bukhara") before
// potato ("aloo"), large cardamom before cardamom, black pepper before chilli.
export const CROPS: Crop[] = [
  { name: 'Apple', category: 'Apple', mandi: 'Apple', label: { en: 'Apple', hi: 'सेब', ur: 'سیب' }, keys: ['apple', 'seb', 'seeb', 'sev', 'saeb', 'tsoont', 'choonth', 'सेब', 'सेव', 'سیب', 'ژونٹھ', 'ژوٗنٹھ'] },
  { name: 'Walnut', category: 'Walnut', mandi: 'Walnut', label: { en: 'Walnut', hi: 'अखरोट', ur: 'اخروٹ' }, keys: ['walnut', 'akhrot', 'akhroat', 'doon', 'अखरोट', 'اخروٹ'] },
  { name: 'Almond', category: 'Almond', mandi: 'Almond(Badam)', label: { en: 'Almond', hi: 'बादाम', ur: 'بادام' }, keys: ['almond', 'badam', 'baadam', 'wadam', 'बादाम', 'بادام', 'وادام'] },
  { name: 'Saffron', category: 'Saffron', mandi: 'Saffron', label: { en: 'Saffron', hi: 'केसर', ur: 'زعفران' }, keys: ['saffron', 'kesar', 'keshar', 'zafran', 'zafraan', 'kong', 'केसर', 'ज़ाफ़रान', 'जाफरान', 'زعفران', 'کیسر', 'کونگ'] },
  { name: 'Cherry', category: 'Cherry', mandi: 'Cherry', label: { en: 'Cherry', hi: 'चेरी', ur: 'چیری' }, keys: ['cherry', 'cherries', 'gilas', 'चेरी', 'چیری', 'گلاس'] },
  { name: 'Pear', category: 'Pear', mandi: 'Pear(Marasebu)', label: { en: 'Pear', hi: 'नाशपाती', ur: 'ناشپاتی' }, keys: ['pear', 'nashpati', 'नाशपाती', 'ناشپاتی'] },
  { name: 'Apricot', category: 'Other', mandi: 'Apricot(Jardalu/Khumani)', label: { en: 'Apricot', hi: 'खुबानी', ur: 'خوبانی' }, keys: ['apricot', 'khubani', 'khumani', 'खुबानी', 'خوبانی'] },
  { name: 'Plum', category: 'Other', mandi: 'Plum', label: { en: 'Plum', hi: 'आलूबुखारा', ur: 'آلو بخارا' }, keys: ['plum', 'aloo bukhara', 'alubukhara', 'आलूबुखारा', 'आलू बुखारा', 'آلو بخارا', 'آلوچہ'] },
  { name: 'Rice', category: 'Rice', mandi: 'Rice', label: { en: 'Rice', hi: 'चावल', ur: 'چاول' }, keys: ['rice', 'paddy', 'chawal', 'dhan', 'tomul', 'चावल', 'धान', 'چاول', 'دھان', 'تومل'] },
  { name: 'Potato', category: 'Vegetables', mandi: 'Potato', label: { en: 'Potato', hi: 'आलू', ur: 'آلو' }, keys: ['potato', 'aloo', 'आलू', 'آلو'] },
  { name: 'Onion', category: 'Vegetables', mandi: 'Onion', label: { en: 'Onion', hi: 'प्याज', ur: 'پیاز' }, keys: ['onion', 'pyaz', 'pyaaz', 'प्याज', 'پیاز'] },
  { name: 'Tomato', category: 'Vegetables', mandi: 'Tomato', label: { en: 'Tomato', hi: 'टमाटर', ur: 'ٹماٹر' }, keys: ['tomato', 'tamatar', 'टमाटर', 'ٹماٹر', 'رومی وانگن'] },
  { name: 'Garlic', category: 'Vegetables', mandi: 'Garlic', label: { en: 'Garlic', hi: 'लहसुन', ur: 'لہسن' }, keys: ['garlic', 'lahsun', 'लहसुन', 'لہسن'] },
  { name: 'Ginger', category: 'Vegetables', mandi: 'Ginger(Green)', label: { en: 'Ginger', hi: 'अदरक', ur: 'ادرک' }, keys: ['ginger', 'adrak', 'अदरक', 'ادرک'] },
  { name: 'Maize', category: 'Other', mandi: 'Maize', label: { en: 'Maize', hi: 'मक्का', ur: 'مکئی' }, keys: ['maize', 'corn', 'makka', 'makki', 'मक्का', 'مکئی'] },
  { name: 'Wheat', category: 'Other', mandi: 'Wheat', label: { en: 'Wheat', hi: 'गेहूँ', ur: 'گندم' }, keys: ['wheat', 'gehu', 'gehun', 'गेहूं', 'गेहूँ', 'گندم'] },
  { name: 'Large cardamom', category: 'Other', mandi: 'Large Cardamom', label: { en: 'Large cardamom', hi: 'बड़ी इलायची', ur: 'بڑی الائچی' }, keys: ['large cardamom', 'badi elaichi', 'बड़ी इलायची', 'بڑی الائچی'] },
  { name: 'Cardamom', category: 'Other', mandi: 'Cardamoms', label: { en: 'Cardamom', hi: 'इलायची', ur: 'الائچی' }, keys: ['cardamom', 'elaichi', 'ilaichi', 'इलायची', 'الائچی', 'الایچی'] },
  { name: 'Black pepper', category: 'Other', mandi: 'Black pepper', label: { en: 'Black pepper', hi: 'काली मिर्च', ur: 'کالی مرچ' }, keys: ['black pepper', 'pepper', 'kali mirch', 'काली मिर्च', 'کالی مرچ'] },
  { name: 'Chilli', category: 'Vegetables', mandi: 'Dry Chillies', label: { en: 'Chilli', hi: 'मिर्च', ur: 'مرچ' }, keys: ['chilli', 'chili', 'mirch', 'मिर्च', 'مرچ'] },
  { name: 'Rubber', category: 'Other', mandi: 'Rubber', label: { en: 'Rubber', hi: 'रबर', ur: 'ربڑ' }, keys: ['rubber', 'रबर', 'ربڑ'] },
  { name: 'Coconut', category: 'Other', mandi: 'Coconut', label: { en: 'Coconut', hi: 'नारियल', ur: 'ناریل' }, keys: ['coconut', 'nariyal', 'नारियल', 'ناریل'] },
  { name: 'Kinnow', category: 'Other', mandi: 'Kinnow', label: { en: 'Kinnow', hi: 'किन्नू', ur: 'کنو' }, keys: ['kinnow', 'kinoo', 'किन्नू', 'کنو'] },
  { name: 'Mustard', category: 'Other', mandi: 'Mustard', label: { en: 'Mustard', hi: 'सरसों', ur: 'سرسوں' }, keys: ['mustard', 'sarson', 'सरसों', 'سرسوں'] },
  { name: 'Bajra', category: 'Other', mandi: 'Bajra(Pearl Millet/Cumbu)', label: { en: 'Bajra', hi: 'बाजरा', ur: 'باجرہ' }, keys: ['bajra', 'pearl millet', 'बाजरा', 'باجرہ'] },
  { name: 'Sugarcane', category: 'Other', mandi: 'Sugarcane', label: { en: 'Sugarcane', hi: 'गन्ना', ur: 'گنا' }, keys: ['sugarcane', 'ganna', 'गन्ना'] },
  { name: 'Mango', category: 'Other', mandi: 'Mango', label: { en: 'Mango', hi: 'आम', ur: 'آم' }, keys: ['mango', 'aam', 'आम', 'آم'] },
  { name: 'Litchi', category: 'Other', mandi: 'Litchi', label: { en: 'Litchi', hi: 'लीची', ur: 'لیچی' }, keys: ['litchi', 'lychee', 'लीची', 'لیچی'] },
  { name: 'Banana', category: 'Other', mandi: 'Banana', label: { en: 'Banana', hi: 'केला', ur: 'کیلا' }, keys: ['banana', 'kela', 'केला', 'केले', 'کیلا', 'کیلے'] },
  { name: 'Grapes', category: 'Other', mandi: 'Grapes', label: { en: 'Grapes', hi: 'अंगूर', ur: 'انگور' }, keys: ['grape', 'grapes', 'angoor', 'अंगूर', 'انگور'] },
  { name: 'Cotton', category: 'Other', mandi: 'Cotton', label: { en: 'Cotton', hi: 'कपास', ur: 'کپاس' }, keys: ['cotton', 'kapas', 'कपास', 'کپاس'] },
  { name: 'Groundnut', category: 'Other', mandi: 'Groundnut', label: { en: 'Groundnut', hi: 'मूंगफली', ur: 'مونگ پھلی' }, keys: ['groundnut', 'peanut', 'moongphali', 'मूंगफली', 'مونگ پھلی'] },
  { name: 'Cumin', category: 'Other', mandi: 'Cummin Seed(Jeera)', label: { en: 'Cumin', hi: 'जीरा', ur: 'زیرہ' }, keys: ['cumin', 'jeera', 'zeera', 'जीरा', 'زیرہ'] },
  { name: 'Soybean', category: 'Other', mandi: 'Soyabean', label: { en: 'Soybean', hi: 'सोयाबीन', ur: 'سویابین' }, keys: ['soybean', 'soyabean', 'soya', 'सोयाबीन', 'سویابین'] },
  { name: 'Gram (chana)', category: 'Other', mandi: 'Bengal Gram(Gram)(Whole)', label: { en: 'Gram (chana)', hi: 'चना', ur: 'چنا' }, keys: ['chana', 'chickpea', 'चना', 'چنا'] },
  { name: 'Turmeric', category: 'Other', mandi: 'Turmeric', label: { en: 'Turmeric', hi: 'हल्दी', ur: 'ہلدی' }, keys: ['turmeric', 'haldi', 'हल्दी', 'ہلدی'] },
  { name: 'Jute', category: 'Other', mandi: 'Jute', label: { en: 'Jute', hi: 'जूट', ur: 'پٹ سن' }, keys: ['jute', 'जूट', 'पटसन', 'پٹ سن'] },
  { name: 'Tea', category: 'Other', mandi: 'Tea', label: { en: 'Tea', hi: 'चाय', ur: 'چائے' }, keys: ['tea leaf', 'tea leaves', 'चाय पत्ती', 'چائے کی پتی'] },
  { name: 'Coffee', category: 'Other', mandi: 'Coffee', label: { en: 'Coffee', hi: 'कॉफ़ी', ur: 'کافی' }, keys: ['coffee', 'कॉफ़ी', 'कॉफी'] },
  { name: 'Ragi', category: 'Other', mandi: 'Ragi (Finger Millet)', label: { en: 'Ragi', hi: 'रागी', ur: 'راگی' }, keys: ['ragi', 'finger millet', 'रागी', 'راگی'] },
  { name: 'Arecanut', category: 'Other', mandi: 'Arecanut(Betelnut/Supari)', label: { en: 'Arecanut', hi: 'सुपारी', ur: 'سپاری' }, keys: ['arecanut', 'areca', 'supari', 'सुपारी', 'سپاری'] },
  { name: 'Cashew', category: 'Other', mandi: 'Cashewnuts', label: { en: 'Cashew', hi: 'काजू', ur: 'کاجو' }, keys: ['cashew', 'kaju', 'काजू', 'کاجو'] },
];

const CROP_BY_NAME = new Map(CROPS.map((c) => [c.name, c]));
export const cropNamed = (name: string | null | undefined): Crop | undefined => (name ? CROP_BY_NAME.get(name) ?? CROPS.find((c) => norm(c.name) === norm(name) || norm(c.mandi) === norm(name)) : undefined);

/** Endings a short Hindi / Urdu / Kashmiri name takes ("सेबों", "سیبوں", "سیبن"). */
const ENDINGS = /^(ों|ें|े|ो|ी|ां|ा|وں|یں|ے|ی|ن|ا|ہ)?$/;

/**
 * Is one of these names in the (normalised) text? English and romanised names
 * are whole words; a short Hindi or Urdu name is a whole word too, with its
 * grammatical ending ("आम" is not found in "आमदनी", nor "آم" in "آمد");
 * longer ones are found inside words.
 */
export function hasName(normalised: string, keys: string[]): boolean {
  const latin = keys.filter((k) => /^[a-z0-9 ]+$/.test(norm(k)));
  if (hasWord(normalised, latin)) return true;
  const tokens = normalised.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  return keys.some((k) => {
    const key = norm(k).trim();
    if (!key || latin.includes(k)) return false;
    if ([...key].length >= 4) return normalised.includes(key);
    return tokens.some((t) => t.startsWith(key) && ENDINGS.test(t.slice(key.length)));
  });
}

/** The first crop named in a (normalised, space-padded) text. */
export const cropIn = (normalised: string): Crop | undefined => CROPS.find((c) => hasName(normalised, c.keys));

// ── states ──

export interface StateInfo {
  name: string;
  /** What the map or a person may call it. */
  aliases: string[];
  /** The crops it is known for, best known first ([] keeps the usual order). */
  crops: string[];
}

export const STATES: StateInfo[] = [
  { name: 'Jammu and Kashmir', aliases: ['jammu & kashmir', 'j&k', 'kashmir'], crops: ['Apple', 'Walnut', 'Saffron', 'Cherry'] },
  { name: 'Ladakh', aliases: [], crops: ['Apricot'] },
  { name: 'Himachal Pradesh', aliases: ['himachal'], crops: ['Apple', 'Cherry'] },
  { name: 'Uttarakhand', aliases: ['uttaranchal', 'uttrakhand'], crops: ['Rice', 'Litchi', 'Apple'] },
  { name: 'Punjab', aliases: [], crops: ['Wheat', 'Rice', 'Kinnow'] },
  { name: 'Haryana', aliases: [], crops: ['Wheat', 'Rice', 'Mustard'] },
  { name: 'Delhi', aliases: ['nct of delhi', 'national capital territory of delhi', 'new delhi'], crops: [] },
  { name: 'Chandigarh', aliases: [], crops: [] },
  { name: 'Uttar Pradesh', aliases: [], crops: ['Sugarcane', 'Wheat', 'Potato', 'Mango'] },
  { name: 'Rajasthan', aliases: [], crops: ['Mustard', 'Bajra', 'Wheat'] },
  { name: 'Gujarat', aliases: [], crops: ['Cotton', 'Groundnut', 'Cumin'] },
  { name: 'Maharashtra', aliases: [], crops: ['Cotton', 'Sugarcane', 'Onion', 'Grapes'] },
  { name: 'Madhya Pradesh', aliases: [], crops: ['Soybean', 'Wheat', 'Gram (chana)'] },
  { name: 'Chhattisgarh', aliases: ['chattisgarh'], crops: ['Rice'] },
  { name: 'Bihar', aliases: [], crops: ['Rice', 'Wheat', 'Maize', 'Litchi'] },
  { name: 'Jharkhand', aliases: [], crops: ['Rice'] },
  { name: 'West Bengal', aliases: ['bengal'], crops: ['Rice', 'Jute', 'Potato', 'Tea'] },
  { name: 'Odisha', aliases: ['orissa'], crops: ['Rice'] },
  { name: 'Andhra Pradesh', aliases: [], crops: ['Rice', 'Chilli'] },
  { name: 'Telangana', aliases: [], crops: ['Rice', 'Cotton'] },
  { name: 'Karnataka', aliases: [], crops: ['Coffee', 'Ragi', 'Arecanut'] },
  { name: 'Kerala', aliases: [], crops: ['Cardamom', 'Black pepper', 'Rubber', 'Coconut'] },
  { name: 'Tamil Nadu', aliases: [], crops: ['Rice', 'Banana', 'Coconut', 'Turmeric'] },
  { name: 'Goa', aliases: [], crops: ['Cashew', 'Coconut'] },
  { name: 'Puducherry', aliases: ['pondicherry'], crops: ['Rice'] },
  { name: 'Assam', aliases: [], crops: ['Tea', 'Rice'] },
  { name: 'Sikkim', aliases: [], crops: ['Large cardamom', 'Ginger'] },
  { name: 'Arunachal Pradesh', aliases: [], crops: [] },
  { name: 'Nagaland', aliases: [], crops: [] },
  { name: 'Manipur', aliases: [], crops: [] },
  { name: 'Mizoram', aliases: [], crops: [] },
  { name: 'Tripura', aliases: [], crops: [] },
  { name: 'Meghalaya', aliases: [], crops: [] },
  { name: 'Andaman and Nicobar Islands', aliases: ['andaman'], crops: [] },
  { name: 'Lakshadweep', aliases: [], crops: [] },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', aliases: ['daman', 'dadra'], crops: [] },
];

const stateInfo = (name: string | null | undefined) => STATES.find((s) => s.name === name);

/** "Jammu and Kashmir" → "Jammu & Kashmir" for the screen. */
export const stateLabel = (name: string) => name.replace(/ and Kashmir$/, ' & Kashmir');

/** The crops of a state, best known first (none for an unknown state). */
export function cropsFor(state: string | null | undefined): Crop[] {
  return (stateInfo(state)?.crops ?? []).map((n) => CROP_BY_NAME.get(n)).filter((c): c is Crop => Boolean(c));
}

/** A state named in a map's place name ("Chitragam, Shopian, Jammu and Kashmir") or typed. */
export function stateFromName(text: string | null | undefined): string | null {
  const parts = (text ?? '').split(',').map((p) => norm(p).trim()).filter(Boolean).reverse();
  for (const p of parts) {
    const hit = STATES.find((s) => norm(s.name) === p || s.aliases.includes(p));
    if (hit) return hit.name;
  }
  return null;
}

/**
 * District towns across India, for when the map service does not answer: the
 * nearest one (within 250 km) gives the state. Rough near borders, which only
 * changes which crops are shown first.
 */
const TOWNS: [string, number, number, string][] = [
  ['Srinagar', 34.08, 74.8, 'Jammu and Kashmir'], ['Baramulla', 34.2, 74.36, 'Jammu and Kashmir'], ['Anantnag', 33.73, 75.15, 'Jammu and Kashmir'], ['Shopian', 33.72, 74.83, 'Jammu and Kashmir'],
  ['Kupwara', 34.53, 74.25, 'Jammu and Kashmir'], ['Jammu', 32.73, 74.86, 'Jammu and Kashmir'], ['Kathua', 32.37, 75.52, 'Jammu and Kashmir'], ['Rajouri', 33.38, 74.31, 'Jammu and Kashmir'],
  ['Doda', 33.15, 75.55, 'Jammu and Kashmir'], ['Kishtwar', 33.31, 75.77, 'Jammu and Kashmir'], ['Leh', 34.15, 77.58, 'Ladakh'], ['Kargil', 34.56, 76.13, 'Ladakh'],
  ['Shimla', 31.1, 77.17, 'Himachal Pradesh'], ['Kullu', 31.96, 77.11, 'Himachal Pradesh'], ['Dharamshala', 32.22, 76.32, 'Himachal Pradesh'], ['Mandi', 31.71, 76.93, 'Himachal Pradesh'],
  ['Chamba', 32.55, 76.13, 'Himachal Pradesh'], ['Reckong Peo', 31.54, 78.27, 'Himachal Pradesh'], ['Dehradun', 30.32, 78.03, 'Uttarakhand'], ['Nainital', 29.38, 79.46, 'Uttarakhand'],
  ['Chandigarh', 30.73, 76.78, 'Chandigarh'], ['Ludhiana', 30.9, 75.85, 'Punjab'], ['Amritsar', 31.63, 74.87, 'Punjab'], ['Jalandhar', 31.33, 75.58, 'Punjab'], ['Bathinda', 30.21, 74.95, 'Punjab'],
  ['Delhi', 28.61, 77.21, 'Delhi'], ['Karnal', 29.69, 76.99, 'Haryana'], ['Hisar', 29.15, 75.72, 'Haryana'], ['Gurugram', 28.46, 77.03, 'Haryana'],
  ['Lucknow', 26.85, 80.95, 'Uttar Pradesh'], ['Kanpur', 26.45, 80.33, 'Uttar Pradesh'], ['Varanasi', 25.32, 82.97, 'Uttar Pradesh'], ['Agra', 27.18, 78.01, 'Uttar Pradesh'],
  ['Meerut', 28.98, 77.71, 'Uttar Pradesh'], ['Gorakhpur', 26.76, 83.37, 'Uttar Pradesh'], ['Prayagraj', 25.44, 81.85, 'Uttar Pradesh'], ['Bareilly', 28.37, 79.43, 'Uttar Pradesh'],
  ['Jaipur', 26.91, 75.79, 'Rajasthan'], ['Jodhpur', 26.24, 73.02, 'Rajasthan'], ['Bikaner', 28.02, 73.31, 'Rajasthan'], ['Udaipur', 24.58, 73.71, 'Rajasthan'], ['Kota', 25.18, 75.83, 'Rajasthan'],
  ['Ahmedabad', 23.02, 72.57, 'Gujarat'], ['Rajkot', 22.3, 70.8, 'Gujarat'], ['Surat', 21.17, 72.83, 'Gujarat'], ['Bhuj', 23.24, 69.67, 'Gujarat'],
  ['Mumbai', 19.08, 72.88, 'Maharashtra'], ['Pune', 18.52, 73.86, 'Maharashtra'], ['Nagpur', 21.15, 79.09, 'Maharashtra'], ['Nashik', 20.0, 73.79, 'Maharashtra'],
  ['Aurangabad', 19.88, 75.34, 'Maharashtra'], ['Solapur', 17.66, 75.91, 'Maharashtra'], ['Kolhapur', 16.7, 74.24, 'Maharashtra'], ['Amravati', 20.93, 77.75, 'Maharashtra'],
  ['Bhopal', 23.26, 77.41, 'Madhya Pradesh'], ['Indore', 22.72, 75.86, 'Madhya Pradesh'], ['Jabalpur', 23.18, 79.99, 'Madhya Pradesh'], ['Gwalior', 26.22, 78.18, 'Madhya Pradesh'], ['Rewa', 24.53, 81.3, 'Madhya Pradesh'],
  ['Raipur', 21.25, 81.63, 'Chhattisgarh'], ['Bilaspur', 22.08, 82.15, 'Chhattisgarh'], ['Jagdalpur', 19.07, 82.03, 'Chhattisgarh'],
  ['Patna', 25.59, 85.14, 'Bihar'], ['Gaya', 24.79, 85.0, 'Bihar'], ['Muzaffarpur', 26.12, 85.39, 'Bihar'], ['Bhagalpur', 25.24, 86.98, 'Bihar'], ['Purnia', 25.78, 87.47, 'Bihar'],
  ['Ranchi', 23.34, 85.31, 'Jharkhand'], ['Dhanbad', 23.8, 86.43, 'Jharkhand'], ['Jamshedpur', 22.8, 86.2, 'Jharkhand'],
  ['Kolkata', 22.57, 88.36, 'West Bengal'], ['Siliguri', 26.73, 88.4, 'West Bengal'], ['Bardhaman', 23.23, 87.86, 'West Bengal'], ['Malda', 25.0, 88.14, 'West Bengal'],
  ['Bhubaneswar', 20.3, 85.82, 'Odisha'], ['Sambalpur', 21.47, 83.97, 'Odisha'], ['Berhampur', 19.31, 84.79, 'Odisha'], ['Koraput', 18.81, 82.71, 'Odisha'],
  ['Vijayawada', 16.51, 80.65, 'Andhra Pradesh'], ['Visakhapatnam', 17.69, 83.22, 'Andhra Pradesh'], ['Guntur', 16.31, 80.44, 'Andhra Pradesh'], ['Kurnool', 15.83, 78.04, 'Andhra Pradesh'],
  ['Tirupati', 13.63, 79.42, 'Andhra Pradesh'], ['Anantapur', 14.68, 77.6, 'Andhra Pradesh'], ['Hyderabad', 17.39, 78.49, 'Telangana'], ['Warangal', 17.97, 79.59, 'Telangana'], ['Nizamabad', 18.67, 78.09, 'Telangana'],
  ['Bengaluru', 12.97, 77.59, 'Karnataka'], ['Mysuru', 12.3, 76.64, 'Karnataka'], ['Hubballi', 15.36, 75.12, 'Karnataka'], ['Belagavi', 15.85, 74.5, 'Karnataka'],
  ['Mangaluru', 12.91, 74.86, 'Karnataka'], ['Kalaburagi', 17.33, 76.83, 'Karnataka'], ['Shivamogga', 13.93, 75.57, 'Karnataka'], ['Madikeri', 12.42, 75.74, 'Karnataka'],
  ['Thiruvananthapuram', 8.52, 76.94, 'Kerala'], ['Kochi', 9.93, 76.27, 'Kerala'], ['Kozhikode', 11.26, 75.78, 'Kerala'], ['Thrissur', 10.53, 76.21, 'Kerala'],
  ['Kottayam', 9.59, 76.52, 'Kerala'], ['Idukki', 9.85, 76.97, 'Kerala'], ['Kannur', 11.87, 75.37, 'Kerala'], ['Palakkad', 10.79, 76.65, 'Kerala'],
  ['Chennai', 13.08, 80.27, 'Tamil Nadu'], ['Coimbatore', 11.02, 76.96, 'Tamil Nadu'], ['Madurai', 9.93, 78.12, 'Tamil Nadu'], ['Tiruchirappalli', 10.79, 78.7, 'Tamil Nadu'],
  ['Salem', 11.66, 78.15, 'Tamil Nadu'], ['Tirunelveli', 8.71, 77.76, 'Tamil Nadu'], ['Thanjavur', 10.79, 79.14, 'Tamil Nadu'], ['Vellore', 12.92, 79.13, 'Tamil Nadu'],
  ['Panaji', 15.49, 73.83, 'Goa'], ['Puducherry', 11.94, 79.81, 'Puducherry'], ['Guwahati', 26.14, 91.74, 'Assam'], ['Dibrugarh', 27.47, 94.91, 'Assam'], ['Silchar', 24.83, 92.78, 'Assam'],
  ['Jorhat', 26.75, 94.2, 'Assam'], ['Tezpur', 26.63, 92.8, 'Assam'], ['Shillong', 25.58, 91.89, 'Meghalaya'], ['Agartala', 23.83, 91.28, 'Tripura'], ['Imphal', 24.82, 93.94, 'Manipur'],
  ['Aizawl', 23.73, 92.72, 'Mizoram'], ['Kohima', 25.67, 94.11, 'Nagaland'], ['Itanagar', 27.08, 93.61, 'Arunachal Pradesh'], ['Gangtok', 27.33, 88.61, 'Sikkim'], ['Port Blair', 11.62, 92.73, 'Andaman and Nicobar Islands'],
];

/** The state of the nearest district town, or null outside India (or far from any town). */
export function nearestState(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 6 || lat > 37.6 || lng < 68 || lng > 97.5) return null;
  let best: { km: number; state: string } | null = null;
  for (const [, tLat, tLng, state] of TOWNS) {
    const x = (lng - tLng) * Math.cos(((lat + tLat) / 2) * (Math.PI / 180));
    const km = Math.hypot(x, lat - tLat) * 111;
    if (!best || km < best.km) best = { km, state };
  }
  return best && best.km <= 250 ? best.state : null;
}

/** District names that say the state on their own (and every town above). */
const DISTRICTS: Record<string, string[]> = {
  'Jammu and Kashmir': ['srinagar', 'budgam', 'ganderbal', 'anantnag', 'kulgam', 'pulwama', 'shopian', 'baramulla', 'sopore', 'kupwara', 'handwara', 'bandipora', 'tral', 'pampore', 'jammu', 'kathua', 'samba', 'udhampur', 'reasi', 'rajouri', 'poonch', 'doda', 'ramban', 'kishtwar'],
  Ladakh: ['leh', 'kargil'],
  'Himachal Pradesh': ['shimla', 'kullu', 'kinnaur', 'mandi', 'kangra', 'chamba', 'solan', 'sirmaur', 'una', 'lahaul and spiti', 'lahaul'],
  Kerala: ['thiruvananthapuram', 'trivandrum', 'kollam', 'pathanamthitta', 'alappuzha', 'kottayam', 'idukki', 'ernakulam', 'kochi', 'cochin', 'thrissur', 'palakkad', 'malappuram', 'kozhikode', 'calicut', 'wayanad', 'kannur', 'kasaragod'],
};

/** The state of a district or town someone wrote ("Shopian" → Jammu and Kashmir), from the lists here only. */
export function stateFromDistrict(district: string | null | undefined): string | null {
  const d = norm(district ?? '').replace(/\s+district$/, '').trim();
  if (!d) return null;
  const named = stateFromName(district);
  if (named) return named;
  for (const [state, list] of Object.entries(DISTRICTS)) if (list.includes(d)) return state;
  return TOWNS.find(([town]) => norm(town) === d)?.[3] ?? null;
}

// ── remembered on this phone ──

export interface Region {
  state: string;
  /** How it was found: the phone's location, chosen by the person, or their district in My details. */
  from: 'location' | 'chosen' | 'district';
  /** The place the map named, when it did. */
  place?: string;
}

const KEY = 'kr_region';
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

function parseRegion(raw: string): Region | null {
  try {
    const r = JSON.parse(raw) as Partial<Region> | null;
    return r && typeof r.state === 'string' && stateInfo(r.state) && (r.from === 'location' || r.from === 'chosen' || r.from === 'district') ? { state: r.state, from: r.from, ...(r.place ? { place: String(r.place) } : {}) } : null;
  } catch {
    return null;
  }
}

/** Remembers (or forgets, with null) the region on this phone, and tells every open part of the page. */
export function saveRegion(region: Region | null): void {
  try {
    if (region) localStorage.setItem(KEY, JSON.stringify(region));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the region lasts until the page closes */
  }
  memory = region ? JSON.stringify(region) : '';
  listeners.forEach((l) => l());
}

/** The region as last saved, also when storage is blocked. */
let memory: string | null = null;
const snapshot = () => readRaw() || memory || '';

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** What to tell someone when finding their area failed. */
export const REGION_HELP = {
  blocked: 'Location is blocked for this site. Allow location in your browser, or choose your state from the list.',
  failed: 'Could not find where you are. Try again in the open, or choose your state from the list.',
  outside: 'KashRoot works in India for now. Choose your state from the list.',
  unsupported: 'This browser cannot share your location. Choose your state from the list.',
};

/** One location look-up at a time, however many parts of the page ask. */
let finding: Promise<Region> | null = null;

/** The phone's location → its state, through the map (/api/place), else the nearest district town. */
export function findRegion(): Promise<Region> {
  if (finding) return finding;
  finding = (async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error(REGION_HELP.unsupported);
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      // The phone's own timeout starts only once location is allowed: never wait for ever.
      const late = setTimeout(() => reject(new Error(REGION_HELP.failed)), 45_000);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(late);
          resolve(p);
        },
        (e) => {
          clearTimeout(late);
          reject(new Error(e.code === e.PERMISSION_DENIED ? REGION_HELP.blocked : REGION_HELP.failed));
        },
        { timeout: 12_000, maximumAge: 600_000 },
      );
    });
    const { latitude: lat, longitude: lng } = pos.coords;
    let place: string | null = null;
    try {
      const res = await fetch(`/api/place?lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}`);
      if (res.ok) place = ((await res.json()) as { name?: string | null }).name ?? null;
    } catch {
      /* the map did not answer: the nearest town below */
    }
    const state = stateFromName(place) ?? nearestState(lat, lng);
    if (!state) throw new Error(REGION_HELP.outside);
    return { state, from: 'location' as const, ...(place ? { place } : {}) };
  })().finally(() => {
    finding = null;
  });
  return finding;
}

/** A district from My details → its state: the lists here, else the place search. */
async function regionOfDistrict(district: string): Promise<Region | null> {
  let state = stateFromDistrict(district);
  if (!state) {
    try {
      const res = await fetch(`/api/weather?search=${encodeURIComponent(district.slice(0, 60))}`);
      const first = res.ok ? ((await res.json()) as { places?: { admin?: string }[] }).places?.[0] : undefined;
      state = stateFromName(first?.admin);
    } catch {
      state = null;
    }
  }
  return state ? { state, from: 'district', place: district } : null;
}

/**
 * The person's region and its crops. On a first visit it uses the phone's
 * location only if this site may already read it (no question pops up), else
 * the district from My details (`district`). `locate` asks for the location;
 * `choose` sets the state by hand.
 */
export function useRegion(opts: { district?: string | null } = {}) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  const region = useMemo(() => parseRegion(raw), [raw]);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const locate = useCallback(async (quiet = false) => {
    setLocating(true);
    setProblem(null);
    try {
      saveRegion(await findRegion());
    } catch (err) {
      if (!quiet) setProblem(err instanceof Error ? err.message : REGION_HELP.failed);
    } finally {
      setLocating(false);
    }
  }, []);

  const choose = useCallback((state: string) => {
    setProblem(null);
    saveRegion(state ? { state, from: 'chosen' } : null);
  }, []);

  const district = opts.district?.trim();
  const settled = region && region.from !== 'district';
  useEffect(() => {
    if (settled) return;
    let live = true;
    const perms = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    void (perms?.query({ name: 'geolocation' as PermissionName }) ?? Promise.reject(new Error('no permissions API')))
      .then((s) => s.state === 'granted')
      .catch(() => false)
      .then(async (allowed) => {
        if (!live) return;
        if (allowed) return locate(true);
        if (!district || region) return;
        const r = await regionOfDistrict(district);
        if (live && r) saveRegion(r);
      });
    return () => {
      live = false;
    };
  }, [settled, district, region, locate]);

  const crops = useMemo(() => cropsFor(region?.state), [region]);
  return { region, crops, locating, problem, locate, choose };
}

/** A list with the region's crops first, in the region's order (the rest keep theirs). */
export function regionFirst<T>(list: T[], crops: Crop[], nameOf: (item: T) => string): T[] {
  const rank = (item: T) => {
    const i = crops.findIndex((c) => norm(c.name) === norm(nameOf(item)));
    return i === -1 ? crops.length : i;
  };
  return list.map((item, i) => ({ item, i, r: rank(item) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.item);
}
