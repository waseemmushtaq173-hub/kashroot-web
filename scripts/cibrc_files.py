"""
Which CIB&RC document is the newest, for each of the five lists TrueScan reads, judged by the date in its file name.
Standard library only. Used by extract-cibrc-lists.py (which list to read) and update-cibrc-lists.py (which fetched
file is newer than the one in use).
"""
import os
import re

D = r'(\d{2})\.(\d{2})\.(\d{4}|\d{2})'
PATTERNS = {
    'pesticides': re.compile(r'^list_of_pesticides_as_on_' + D + r'\.pdf$', re.I),
    'formulations': re.compile(r'^list_pf_pesticide_formulations_registered_as_on_' + D + r'\.pdf$', re.I),
    'banned': re.compile(r'^list_of_pesticides_which_are_banned_refused_registration_and_restricted_in_use_' + D + r'\.pdf$', re.I),
    'household': re.compile(r'^7\._formulation_approved_for_public_health_household_and_rodenticide.*?' + D + r'\.pdf$', re.I),
    # The desert-locust list carries no date in its name or on its pages.
    'locust': re.compile(r'^approved_pesticides_for_desert_locust_control\.pdf$', re.I),
}


def kind_of(name):
    """(list key, (year, month, day)) for a file name, or None. A two-digit year is 20xx; no date is (0, 0, 0)."""
    for key, rx in PATTERNS.items():
        m = rx.match(name)
        if not m:
            continue
        if m.lastindex == 3:
            d, mo, y = (int(g) for g in m.groups())
            return key, (y + 2000 if y < 100 else y, mo, d)
        return key, (0, 0, 0)
    return None


def newest(folder):
    """{list key: file name} of the newest file for each list in a folder."""
    best = {}
    for name in sorted(os.listdir(folder)):
        k = kind_of(name)
        if not k:
            continue
        key, when = k
        if key not in best or (when, name) > best[key][0]:
            best[key] = ((when, name), name)
    return {key: v[1] for key, v in best.items()}


def newer_in(source, current):
    """File names in `source` that are newer than the file in use for their list (`current`: {key: name})."""
    out = []
    for name in sorted(os.listdir(source)):
        k = kind_of(name)
        if not k:
            continue
        key, when = k
        have = kind_of(current[key])[1] if key in current else None
        # An undated list (locust) is only taken when there is none yet.
        if have is None or (when != (0, 0, 0) and when > have):
            out.append(name)
    return out


def printed_date_matches(name, printed):
    """Does the 'as on' date printed inside the PDF agree with the date in its file name? (31.7.2026 = 31.07.2026)"""
    k = kind_of(name)
    if not k or k[1] == (0, 0, 0) or not printed:
        return True
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$', printed.strip())
    if not m:
        return False
    d, mo, y = (int(g) for g in m.groups())
    y = y + 2000 if y < 100 else y
    return (y, mo, d) == k[1]
