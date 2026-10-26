/**
 * Reads an official list of registered products for the admin's import
 * (KashRoot TrueScan): the CIB&RC list of registered pesticides, a
 * Fertiliser (Control) Order list or similar, saved from Excel or the
 * Government website as CSV. No side effects.
 *
 * Government files rarely look alike, so:
 *   • the heading row is found among the first lines (title lines above it
 *     are skipped), and columns are matched by meaning — "Registration No",
 *     "CIR No", "Reg. Number"; "Product", "Chemical", "Name of the pesticide";
 *     "Registrant", "Company", "Applicant", "Name of the firm";
 *   • comma, semicolon, tab or | separated, "quoted, cells" and line breaks
 *     inside quotes are read; Excel's older encoding (Windows-1252) too;
 *   • a row without a product name but with a full CIB&RC number
 *     ("CIR-12345/2019-Mancozeb (WP)") takes the product from the number.
 * Everything is kept as the list writes it; nothing is added.
 */

export type OfficialKind = 'pesticide' | 'fertiliser' | 'seed' | 'other';

export const KIND_LABEL: Record<OfficialKind, string> = {
  pesticide: 'Registered pesticides (CIB&RC)',
  fertiliser: 'Fertilisers (FCO)',
  seed: 'Seeds',
  other: 'Other products',
};

/** The same inside a sentence: "Checked against: registered pesticides (CIB&RC), …". */
export const KIND_WORDS: Record<OfficialKind, string> = {
  pesticide: 'registered pesticides (CIB&RC)',
  fertiliser: 'fertilisers (FCO)',
  seed: 'seeds',
  other: 'other products',
};

export interface OfficialRow {
  name: string;
  registration_no: string | null;
  registrant: string | null;
  /** The list's other columns (formulation, validity…), by heading. */
  details: Record<string, string>;
}

type Field = 'name' | 'registration' | 'registrant' | 'brand' | 'formulation' | 'grade' | 'valid_until' | 'registered_on' | 'category' | 'skip';

export interface ParsedOfficialList {
  rows: OfficialRow[];
  /** Data rows in the file (under the heading row). */
  read: number;
  /** Rows left out because they had no product name. */
  skipped: number;
  /** Which heading was used for what, to show the admin. */
  columns: Partial<Record<'name' | 'registration' | 'registrant', string>>;
  /** Why nothing could be read, in plain words. */
  problem?: string;
}

/** At most this many rows in one file (the browser sends them in batches). */
export const MAX_ROWS = 100_000;
const MAX_DETAILS = 12;

/** Known extra columns, stored under these keys (the search also reads brand and formulation). */
const DETAIL_KEY: Partial<Record<Field, string>> = {
  brand: 'brand',
  formulation: 'formulation',
  grade: 'grade',
  valid_until: 'valid_until',
  registered_on: 'registered_on',
  category: 'category',
};

/** What a column holds, from its heading. */
function fieldOf(heading: string): Field | null {
  const h = heading.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!h) return null;
  if (/^(s|sl|sr|serial)( no| number)?$|^no$|^sno$|^srno$|^slno$/.test(h)) return 'skip';
  if (/\bdate\b.*\b(registration|regn|reg|registered|issue)\b|\b(registration|regn|reg)\b.*\bdate\b|\bregistered on\b|\bissued? on\b/.test(h)) return 'registered_on';
  if (/\bvalid|\bexpir|\bupto\b/.test(h)) return 'valid_until';
  if (/\bcir\b|\b(registration|regn|reg|regd)\b.*\b(no|number|num)\b|^registration$|\bcertificate (no|number)\b/.test(h)) return 'registration';
  if (/\bregistrant|\bcompany\b|\bapplicant|\bfirm\b|\bmanufacturer|\bholder\b|\blicensee\b|\bmarketed by\b|\bimporter\b/.test(h)) return 'registrant';
  if (/\bbrand\b|\btrade ?name\b/.test(h)) return 'brand';
  // "Name of the product (formulation)" is the product; "Formulation" or "Fertiliser grade" alone is not.
  const named = /\bname\b|\bproduct/.test(h);
  if (!named && /\bformulation\b/.test(h)) return 'formulation';
  if (!named && /\bgrade\b|\bnutrient|\bcomposition\b|\bspecification\b/.test(h)) return 'grade';
  if (!/\bname\b/.test(h) && /\bcategory\b|\bclass\b|\bgroup\b|\btype\b|\bsection\b|\bschedule\b/.test(h)) return 'category';
  if (named || /\bchemical\b|\bpesticide|\binsecticide|\bfungicide|\bherbicide|\bfertili[sz]er|\btechnical\b|\bgeneric\b|\bvariety\b|\bseed\b/.test(h)) return 'name';
  return null;
}

/** "CIR-12345/2019-Mancozeb (WP) (…)" → "Mancozeb (WP)". */
export function productFromCir(reg: string): string | null {
  const m = /^\s*CIR[\s.\-:]*[\d,]+\s*\/\s*(?:19|20)\d{2}\s*[-–]\s*(.+?)\s*$/i.exec(reg);
  if (!m) return null;
  const name = m[1]
    .replace(/\s*-\s*\d+\s*$/, '')
    .replace(/(\s*\((?:\d+|…|\.{2,}|-)\))+\s*$/, '')
    .trim();
  return name.length >= 2 ? name : null;
}

/** Splits CSV text into rows of cells ("quoted, values", "" inside quotes, line breaks inside quotes). */
function csvRows(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') quoted = true;
    else if (ch === sep) {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/** How many times `sep` splits these lines outside "quotes". */
function sepCount(lines: string[], sep: string): number {
  let n = 0;
  for (const line of lines) {
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) n++;
    }
  }
  return n;
}

const clean = (v: string | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/**
 * The text of a chosen file: UTF-8, or Excel's older Windows-1252 when the
 * file is not valid UTF-8. An Excel workbook itself (.xlsx / .xls) is not a
 * list KashRoot can read — the admin is told how to save it as CSV.
 */
export function decodeListFile(buf: ArrayBuffer): { text: string } | { problem: string } {
  const head = new Uint8Array(buf.slice(0, 8));
  const xlsx = head[0] === 0x50 && head[1] === 0x4b;
  const xls = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  if (xlsx || xls) return { problem: 'This is an Excel workbook, not a CSV file. In Excel choose File → Save As → “CSV (Comma delimited)”, then choose that file here.' };
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return { problem: 'This is a PDF. KashRoot reads CSV files: open the list in Excel (or copy its table), save it as CSV, then choose that file here.' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf) };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf) };
  }
}

/** Reads a list saved as CSV. Always returns; `problem` says why nothing was read. */
export function parseOfficialList(text: string): ParsedOfficialList {
  const empty = (problem: string, read = 0): ParsedOfficialList => ({ rows: [], read, skipped: 0, columns: {}, problem });
  const body = text.replace(/^﻿/, '').trim();
  if (!body) return empty('The file is empty.');
  if (/^<(!doctype\s+html|html)\b/i.test(body)) return empty('This is a web page, not a list. Save the list itself as CSV and try again.');
  if (/^[[{]/.test(body)) return empty('This looks like JSON. Save the list as CSV (from Excel: File → Save As → CSV) and try again.');
  const first = body.split(/\r?\n/, 30);
  const sep = [',', ';', '\t', '|'].sort((a, b) => sepCount(first, b) - sepCount(first, a))[0];
  const all = csvRows(body, sep);

  // The heading row: the first line (of the first 30) naming two of product,
  // registration number and company — else the first naming the product in
  // the most columns. A title line above it ("List of registered products")
  // is one cell, so it is never taken.
  const top = all.slice(0, 30);
  const oneColumn = top.every((r) => r.filter((c) => c !== '').length <= 1);
  let at = -1;
  let best = 0;
  for (let i = 0; i < top.length; i++) {
    if (!oneColumn && top[i].filter((c) => c !== '').length < 2) continue;
    const fields = top[i].map(fieldOf);
    const keys = (['name', 'registration', 'registrant'] as const).filter((f) => fields.includes(f)).length;
    if (keys >= 2) {
      at = i;
      break;
    }
    const known = fields.filter((f) => f && f !== 'skip').length;
    if (fields.includes('name') && known > best) {
      best = known;
      at = i;
    }
  }
  if (at < 0) {
    return empty('No heading row with the product names was found. The file needs a row of column names, e.g. “Product, Registration No, Registrant”.', all.length);
  }
  const headings = all[at];
  const fields = headings.map(fieldOf);
  const col = (f: Field) => fields.indexOf(f);
  const nameCol = col('name');
  const regCol = col('registration');
  const whoCol = col('registrant');
  const brandCol = col('brand');
  const lines = all.slice(at + 1);
  if (lines.length > MAX_ROWS) return empty(`The file has ${lines.length.toLocaleString('en-IN')} rows; KashRoot reads up to ${MAX_ROWS.toLocaleString('en-IN')} at a time. Split it into smaller files.`, lines.length);

  const rows: OfficialRow[] = [];
  let skipped = 0;
  const heading = headings.map(clean).join('|').toLowerCase();
  for (const cells of lines) {
    // Long lists repeat the heading row on every printed page.
    if (cells.map(clean).join('|').toLowerCase() === heading) continue;
    const reg = regCol >= 0 ? clean(cells[regCol]).slice(0, 200) : '';
    let name = nameCol >= 0 ? clean(cells[nameCol]) : '';
    if (name.length < 2 && brandCol >= 0) name = clean(cells[brandCol]);
    if (name.length < 2 && reg) name = productFromCir(reg) ?? '';
    if (name.length < 2) {
      skipped++;
      continue;
    }
    const details: Record<string, string> = {};
    headings.forEach((h, i) => {
      if (i === nameCol || i === regCol || i === whoCol || fields[i] === 'skip' || Object.keys(details).length >= MAX_DETAILS) return;
      const v = clean(cells[i]);
      if (!v) return;
      const f = fields[i];
      const key = (f && DETAIL_KEY[f]) || clean(h).slice(0, 40);
      if (key && details[key] === undefined) details[key] = v.slice(0, 200);
    });
    rows.push({ name: name.slice(0, 300), registration_no: reg || null, registrant: whoCol >= 0 ? clean(cells[whoCol]).slice(0, 200) || null : null, details });
  }
  const columns: ParsedOfficialList['columns'] = { name: nameCol >= 0 ? clean(headings[nameCol]) : regCol >= 0 ? `${clean(headings[regCol])} (the product part)` : undefined };
  if (regCol >= 0) columns.registration = clean(headings[regCol]);
  if (whoCol >= 0) columns.registrant = clean(headings[whoCol]);
  if (!rows.length) return { ...empty(lines.length ? 'No row has a product name, so nothing can be imported.' : 'The file has a heading row but no products under it.', lines.length), columns };
  return { rows, read: lines.length, skipped, columns };
}
