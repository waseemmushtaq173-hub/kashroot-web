#!/usr/bin/env python3
"""
Reads the official CIB&RC lists (Central Insecticides Board & Registration Committee, ppqs.gov.in) from the PDFs in
official-data/cibrc/ and writes src/data/cibrc-official.json, which TrueScan searches.

Every row comes from a line of a PDF: nothing is typed, guessed or completed. Each list keeps the date the Government
printed on it ("Updated on 31.03.2026") and the fingerprint of the PDF it came from. When CIB&RC publishes newer PDFs,
put them in official-data/cibrc/, change the file names in FILES below, and run

    python3 scripts/extract-cibrc-lists.py        # needs poppler's pdftotext and pdfplumber

It checks itself and stops, saying where, if the numbers printed in a PDF do not come out in order or any list is
shorter than expected: a wrong list is worse than none.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'official-data', 'cibrc')
OUT = os.path.join(ROOT, 'src', 'data', 'cibrc-official.json')
SOURCE = 'Central Insecticides Board & Registration Committee (CIB&RC), Directorate of Plant Protection, Quarantine & Storage, Ministry of Agriculture and Farmers Welfare'
PAGE = 'https://ppqs.gov.in/divisions/cib-rc/registered-products'

FILES = {
    'pesticides': 'list_of_pesticides_as_on_31.03.2026.pdf',
    'formulations': 'list_pf_pesticide_formulations_registered_as_on_31.03.2026.pdf',
    'banned': 'list_of_pesticides_which_are_banned_refused_registration_and_restricted_in_use_31.10.26.pdf',
    'household': '7._formulation_approved_for_public_health_household_and_rodenticideUpdated_31.07.2026.pdf',
    'locust': 'approved_pesticides_for_desert_locust_control.pdf',
}


def fail(msg):
    print('STOP:', msg, file=sys.stderr)
    sys.exit(1)


def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


def pdf_path(key):
    p = os.path.join(SRC, FILES[key])
    if not os.path.exists(p):
        fail(f'missing {p}')
    return p


def pages_of(key):
    """The text of each page, columns kept (pdftotext -layout)."""
    raw = subprocess.run(['pdftotext', '-layout', pdf_path(key), '-'], capture_output=True, check=True).stdout.decode('utf-8', 'replace')
    return [p for p in raw.split('\f') if p.strip()]


def sha(key):
    return hashlib.sha256(open(pdf_path(key), 'rb').read()).hexdigest()


ENTRY = re.compile(r'^\s*(\d{1,4})\s*[.]?\s+(\S.*?)\s*$')
BARE = re.compile(r'^\s*(\d{1,4})\s*\.?\s*$')


def numbered(pages, skip=lambda line: False, section=None):
    """
    Numbered entries of a list. A line that continues the entry above (a long name wraps) is joined to it. A serial
    must be the next one, or a few ahead (the Government skips some); anything else is a continuation ("9000 IU/mg").
    A number alone on a line is the serial of the line above it (the PDF centres it in a tall row), except the page
    number, which is the last line of a page.
    Returns [{'n', 'name', 'group'}] where group is whatever `section(line)` last returned.
    """
    rows = []
    group = None
    for page in pages:
        lines = [l for l in page.split('\n')]
        last_text = max((i for i, l in enumerate(lines) if l.strip()), default=-1)
        for i, raw in enumerate(lines):
            if not raw.strip():
                continue
            if section:
                g = section(raw)
                if g is not None:
                    group = g or group
                    continue
            if skip(raw):
                continue
            prev = rows[-1]['n'] if rows else 0
            bare = BARE.match(raw)
            if bare:
                n = int(bare.group(1))
                if i == last_text:  # the page number
                    continue
                if prev < n <= prev + 3 and rows and rows[-1].get('_cont'):
                    # the serial of the last wrapped line above, which belongs to this new entry, not to the previous one
                    last = rows[-1]['_cont'].pop()
                    rows[-1]['name'] = clean(' '.join([rows[-1]['_first']] + rows[-1]['_cont']))
                    rows.append({'n': n, 'name': clean(last), 'group': group, '_first': clean(last), '_cont': []})
                continue
            m = ENTRY.match(raw)
            if m and prev < int(m.group(1)) <= prev + 3 and not re.match(r'^\s*\d+\.\d', raw):
                rows.append({'n': int(m.group(1)), 'name': clean(m.group(2)), 'group': group, '_first': clean(m.group(2)), '_cont': []})
            elif rows:
                rows[-1]['_cont'].append(clean(raw))
                rows[-1]['name'] = clean(' '.join([rows[-1]['_first']] + rows[-1]['_cont']))
    for r in rows:
        r.pop('_first', None)
        r.pop('_cont', None)
    return rows


def in_order(rows, label, allow_gaps=True):
    serials = [r['n'] for r in rows]
    if not serials or serials[0] != 1:
        fail(f'{label}: does not start at 1')
    back = [(a, b) for a, b in zip(serials, serials[1:]) if b <= a]
    if back:
        fail(f'{label}: serial numbers are not increasing at {back[:5]}')
    skipped = sorted(set(range(1, serials[-1] + 1)) - set(serials))
    if skipped and not allow_gaps:
        fail(f'{label}: numbers {skipped[:10]} are missing')
    return skipped


def date_in(pages, pattern):
    m = re.search(pattern, '\n'.join(pages), re.I)
    return m.group(1).strip().rstrip('.') if m else None


# ───────────────────────── 1. registered pesticides (active ingredients) ─────────────────────────
def pesticides():
    pages = pages_of('pesticides')
    rows = numbered(pages, skip=lambda l: re.search(r'Insecticides/Pesticides Registered|for use in the Country|As on|^\s*Sl\.|Name of the Pesticide|^\s*No\.\s*$', l) is not None)
    # The Government's own numbering skips some numbers (276 is followed by 278): they are reported, never filled in.
    skipped = in_order(rows, 'registered pesticides')
    return {
        'title': 'Insecticides / pesticides registered under section 9(3) of the Insecticides Act, 1968, for use in the country',
        'kind': 'active_ingredients',
        'file': FILES['pesticides'], 'sha256': sha('pesticides'), 'as_on': date_in(pages, r'As on\s+([0-9.]+)'),
        'numbers_not_printed': skipped,
        'rows': [{'n': r['n'], 'name': r['name']} for r in rows],
    }


# ───────────────────────── 2. registered formulations ─────────────────────────
FORM_SECTION = re.compile(r'^\s*([A-G])\.\s+([A-Z][A-Z +\-/&]+?)\s*$')


def formulations():
    pages = pages_of('formulations')
    state = {'part': 'solo'}
    names = {'INSECTICIDES': 'Insecticides', 'HERBICIDES': 'Herbicides', 'PLANT GROWTH REGULATORS': 'Plant growth regulators', 'PLANT GROTH REGULATORS': 'Plant growth regulators',
             'FUNGICIDES': 'Fungicides', 'NEMATICIDES': 'Nematicides', 'BIO-INSECTICIDES': 'Bio-insecticides', 'BIO-FUNGICIDES': 'Bio-fungicides',
             'INSECTICIDE + FUNGICIDE': 'Insecticide + fungicide', 'PLANT GROWTH REGULATOR + FUNGICIDE': 'Plant growth regulator + fungicide'}

    def section(line):
        if 'FORMULATIONS OF COMBINATION OF PESTICIDES' in line:
            state['part'] = 'combination'
            return ''  # a marker: keep the group, skip the line
        m = FORM_SECTION.match(line)
        if m and not ENTRY.match(line):
            return names.get(clean(m.group(2)), clean(m.group(2)).title())
        return None

    rows = numbered(pages, skip=lambda l: re.search(r'PESTICIDE FORMULATIONS REGISTERED|UNDER THE INSECTICIDES ACT|Updated on|^\s*FORMULATIONS OF PESTICIDES|S\. No|Formulation registered', l) is not None, section=section)
    # The part (solo / combination) follows the serial numbers: the combination list continues the count.
    start_comb = next(i for i, r in enumerate(rows) if r['group'] == 'Insecticides' and i > 0 and rows[i - 1]['group'] in ('Plant growth regulators', 'Bio-fungicides', 'Bio-insecticides', 'Nematicides', 'Fungicides'))
    for i, r in enumerate(rows):
        r['part'] = 'combination' if i >= start_comb else 'solo'
    skipped = in_order(rows, 'registered formulations')
    return {
        'title': 'Pesticide formulations registered for use in the country under the Insecticides Act, 1968',
        'kind': 'formulations',
        'file': FILES['formulations'], 'sha256': sha('formulations'), 'as_on': date_in(pages, r'Updated on\s+([0-9.]+)'),
        'numbers_not_printed': skipped,
        'rows': [{'n': r['n'], 'name': r['name'], 'category': r['group'], 'part': r['part']} for r in rows],
    }


# ───────────────────────── 3. banned, refused, restricted ─────────────────────────
def split_ref(s):
    """'Alachlor ( S.O. 3951 (E), dated 08.08.2018)' -> ('Alachlor', 'S.O. 3951 (E), dated 08.08.2018')."""
    s = s.rstrip('* ').strip()
    m = re.match(r'^(.*?)\s*\((.*)\)$', s)
    if m and re.search(r'S\.?\s?O|Supreme|G\.S\.R|order|dated', m.group(2), re.I):
        return clean(m.group(1)), clean(m.group(2))
    return s, None


def restricted_rows():
    """Section III. Its table has the details of a restriction above and below the serial, so words are placed by position."""
    import pdfplumber

    serials, names, details = [], [], []
    started = False
    pdf = pdfplumber.open(pdf_path('banned'))
    for pi, page in enumerate(pdf.pages):
        words = page.extract_words()
        off = pi * 10000
        if not started:
            hit = [w for w in words if w['text'] == 'III.']
            if not hit:
                continue
            started, y0 = True, hit[0]['top'] + 30
        else:
            y0 = 0
        for w in words:
            if w['top'] < y0:
                continue
            x, t = w['x0'], w['text']
            if x < 105 and re.fullmatch(r'\d{1,2}\.', t):
                serials.append({'n': int(t[:-1]), 'y': off + w['top']})
            elif 105 <= x < 205:
                names.append({'y': off + w['top'], 'x': x, 't': t})
            elif x >= 205:
                details.append({'y': off + w['top'], 'x': x, 't': t})
    if len(serials) < 10:
        fail('restricted list: the table was not found')
    names = [w for w in names if w['t'] not in ('Name', 'of', 'Pesticides')]
    head = min(w['y'] for w in details if w['t'] == 'Details')
    details = [w for w in details if abs(w['y'] - head) >= 3]
    lines = []
    for w in sorted(details, key=lambda w: (round(w['y']), w['x'])):
        if lines and abs(lines[-1]['y'] - w['y']) <= 2.0:
            lines[-1]['ws'].append(w)
        else:
            lines.append({'y': w['y'], 'ws': [w]})
    for l in lines:
        l['text'] = ' '.join(w['t'] for w in sorted(l['ws'], key=lambda w: w['x']))
    ys = [l['y'] for l in lines]
    N, L = len(serials), len(lines)
    INF = 1e18

    def cost(i, j, s):  # lines i..j-1 are the details of serial s, which sits inside its own block
        y, lo, hi = serials[s]['y'], ys[i], ys[j - 1]
        return max(0, lo - y, y - hi) * 10 + abs((lo + hi) / 2 - y)

    best = [[INF] * (L + 1) for _ in range(N + 1)]
    prev = [[0] * (L + 1) for _ in range(N + 1)]
    best[0][0] = 0
    for s in range(1, N + 1):
        for j in range(s, L + 1):
            for i in range(s - 1, j):
                c = best[s - 1][i] + cost(i, j, s - 1)
                if c < best[s][j]:
                    best[s][j], prev[s][j] = c, i
    cuts, j = [], L
    for s in range(N, 0, -1):
        i = prev[s][j]
        cuts.append((i, j))
        j = i
    cuts.reverse()
    out = []
    for s, (i, j) in enumerate(cuts):
        nm = [w for w in names if abs(w['y'] - serials[s]['y']) <= 16]
        name = clean(' '.join(w['t'] for w in sorted(nm, key=lambda w: (round(w['y']), w['x']))))
        out.append({'n': serials[s]['n'], 'name': name, 'details': clean(' '.join(l['text'] for l in lines[i:j]))})
    return out


def banned():
    pages = pages_of('banned')
    text = '\n'.join(pages)
    lines = text.split('\n')

    def find(pattern):
        return next(i for i, l in enumerate(lines) if re.search(pattern, l))

    i_a = find(r'Pesticides Banned for manufacture')
    i_b = find(r'Pesticide\s*/\s*Pesticide formulations banned for use')
    i_c = find(r'Pesticides Withdrawn')
    i_ref = find(r'II\.\s+PESTICIDES REFUSED REGISTRATION')
    i_res = find(r'III\.\s+PESTICIDES RESTRICTED')

    def entries(a, b):
        rows = []
        for i in range(a, b):
            raw = lines[i]
            if not raw.strip() or re.match(r'^\s*[A-C]\.\s*$', raw):
                continue
            m = re.match(r'^\s*(?:[A-C]\.\s+)?(\d{1,2})\s*[.]?\s+(\S.*?)\s*$', raw)
            if m and (not rows or rows[-1][0] < int(m.group(1)) <= rows[-1][0] + 2):
                rows.append([int(m.group(1)), clean(m.group(2))])
            elif rows and not re.match(r'^\s*(\*|Pesticides? |Government|data as|Jun|II\.|I\.|S\. No|Name of)', raw):
                rows[-1][1] = clean(rows[-1][1] + ' ' + raw)
        return rows

    def shape(rows, status):
        res = []
        for n, s in rows:
            name, ref = split_ref(s)
            res.append({'n': n, 'name': name, 'status': status, 'notification': ref})
        return res

    a = shape(entries(i_a, i_b), 'banned')
    b = shape(entries(i_b, i_c), 'banned_for_use_manufacture_for_export')
    c = shape(entries(i_c, i_ref), 'withdrawn')
    refused = []
    for i in range(i_ref, i_res):
        m = re.match(r'^\s*(\d{1,2})\.\s+(\S.*?)\s*$', lines[i])
        if m:
            refused.append({'n': int(m.group(1)), 'name': clean(m.group(2)), 'status': 'refused_registration', 'notification': None})
    for lst, label, want in ((a, 'banned for manufacture, import and use', 50), (b, 'banned for use, made for export', 5), (c, 'withdrawn', 8), (refused, 'refused registration', 18)):
        in_order(lst, label, allow_gaps=False)
        if len(lst) != want:
            fail(f'{label}: found {len(lst)}, the PDF prints {want}')
    for it in a:
        if it['name'].startswith('Sodium Cyanide'):
            it['note'] = 'Banned for insecticidal purpose only; regulation continues in the existing way for non-insecticidal uses.'
    restricted = restricted_rows()
    in_order(restricted, 'restricted', allow_gaps=False)
    if len(restricted) != 16:
        fail(f'restricted: found {len(restricted)}, the PDF prints 16')
    for r in restricted:
        if not r['name'] or not r['details']:
            fail(f'restricted entry {r["n"]} has no name or no details')
    return {
        'title': 'Pesticides which are banned, refused registration and restricted in use',
        'kind': 'status',
        'file': FILES['banned'], 'sha256': sha('banned'), 'as_on': date_in(pages, r'Updated on\s+([0-9.]+)'),
        'banned': a, 'banned_for_export_only': b, 'withdrawn': c, 'refused': refused,
        'restricted': [{'n': r['n'], 'name': r['name'], 'status': 'restricted', 'details': r['details']} for r in restricted],
    }


# ───────────────────────── 4. public health, household, rodent control ─────────────────────────
def household():
    pages = pages_of('household')

    def section(line):
        s = clean(line)
        if re.match(r'^A\.\s+PUBLIC HEALTH', s):
            return 'Public health'
        if re.match(r'^B\.\s+HOUSE ?HOLD', s):
            return 'Household'
        if re.match(r'^APPROVED FORMULATION OF COMBINATION PESTICIDES', s):
            return 'Household (combination)'
        if re.match(r'^C\.\s+RODENTICIDES', s):
            return 'Rodenticides'
        if re.match(r'^APPROVED FORMULATION OF SOLO', s):
            return ''
        return None

    rows = numbered(pages, skip=lambda l: re.search(r'INSECTICIDES REGISTERED UNDER|HOUSEHOLD/ PUBLIC HEALTH|As on|Sr No|Formulation registered', l) is not None, section=section)
    in_order(rows, 'public health / household / rodenticides', allow_gaps=False)
    return {
        'title': 'Insecticides registered under the Insecticides Act for use in household, public health and rodent control',
        'kind': 'formulations',
        'file': FILES['household'], 'sha256': sha('household'), 'as_on': date_in(pages, r'As on\s+([0-9.]+)'),
        'rows': [{'n': r['n'], 'name': r['name'], 'category': r['group']} for r in rows],
    }


# ───────────────────────── 5. desert locust ─────────────────────────
def locust():
    pages = pages_of('locust')
    rows, group = [], None
    for raw in '\n'.join(pages).split('\n'):
        s = clean(raw)
        if re.match(r'^A\.\s+Pesticides approved', s):
            group = 'Scheduled desert area only'
        elif re.match(r'^B\.\s+Pesticides approved', s):
            group = 'Crops, acacia and other trees'
        m = re.match(r'^\s*(\d{1,2})\s+(\S.*?)\s{2,}([0-9][0-9.\-]*\*?)\s{2,}([0-9][0-9.\-]*)\s*$', raw)
        if m and group:
            rows.append({'n': int(m.group(1)), 'name': clean(m.group(2)), 'group': group, 'ai_g_per_ha': m.group(3), 'formulation_per_ha': m.group(4)})
    if len(rows) != 15:
        fail(f'desert locust list: found {len(rows)} rows, the PDF prints 15')
    return {
        'title': 'Pesticides approved for control of Desert Locust',
        'kind': 'locust',
        'file': FILES['locust'], 'sha256': sha('locust'), 'as_on': None,
        'note': '* Only for hoppers control. Dose: active ingredient grams per hectare, and formulation (g or ml) per hectare.',
        'rows': rows,
    }


def main():
    data = {
        'source': SOURCE,
        'page': PAGE,
        'extracted_by': 'scripts/extract-cibrc-lists.py',
        'pesticides': pesticides(),
        'formulations': formulations(),
        'banned': banned(),
        'household': household(),
        'locust': locust(),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    b = data['banned']
    # A small file of counts and dates, so a screen can say what it holds without loading every list.
    b = data['banned']
    meta = {
        'source': SOURCE, 'page': PAGE,
        'lists': {
            'pesticides': {'title': data['pesticides']['title'], 'count': len(data['pesticides']['rows']), 'as_on': data['pesticides']['as_on'], 'file': FILES['pesticides']},
            'formulations': {'title': data['formulations']['title'], 'count': len(data['formulations']['rows']), 'as_on': data['formulations']['as_on'], 'file': FILES['formulations']},
            'banned': {'title': b['title'], 'as_on': b['as_on'], 'file': FILES['banned'], 'banned': len(b['banned']), 'banned_for_export_only': len(b['banned_for_export_only']),
                       'withdrawn': len(b['withdrawn']), 'refused': len(b['refused']), 'restricted': len(b['restricted'])},
            'household': {'title': data['household']['title'], 'count': len(data['household']['rows']), 'as_on': data['household']['as_on'], 'file': FILES['household']},
            'locust': {'title': data['locust']['title'], 'count': len(data['locust']['rows']), 'as_on': None, 'file': FILES['locust']},
        },
    }
    with open(os.path.join(os.path.dirname(OUT), 'cibrc-official-meta.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print('registered active ingredients :', len(data['pesticides']['rows']), '(as on', data['pesticides']['as_on'] + ')', '| numbers the PDF does not print:', data['pesticides']['numbers_not_printed'])
    print('registered formulations       :', len(data['formulations']['rows']), '(as on', data['formulations']['as_on'] + ')', '| numbers the PDF does not print:', data['formulations']['numbers_not_printed'])
    print('banned / export-only / withdrawn / refused / restricted:', len(b['banned']), len(b['banned_for_export_only']), len(b['withdrawn']), len(b['refused']), len(b['restricted']), '(as on', b['as_on'] + ')')
    print('public health / household / rodent:', len(data['household']['rows']), '(as on', data['household']['as_on'] + ')')
    print('desert locust:', len(data['locust']['rows']))
    print('wrote', os.path.relpath(OUT, ROOT), os.path.getsize(OUT), 'bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
