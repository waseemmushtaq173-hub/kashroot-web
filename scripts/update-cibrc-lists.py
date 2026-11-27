#!/usr/bin/env python3
"""
Puts newly downloaded CIB&RC lists in place. Point it at the folder you saved the PDFs from
https://ppqs.gov.in/divisions/cib-rc/registered-products into; it copies into official-data/cibrc (where
extract-cibrc-lists.py reads them) every file that is a real PDF with a newer date in its name than the one in use. Nothing
is edited: a file is copied byte for byte. Then run  python3 scripts/extract-cibrc-lists.py.

    python3 scripts/update-cibrc-lists.py --from ~/Downloads [--to official-data/cibrc]

(ppqs.gov.in answers GitHub's servers with HTTP 403, so this cannot run on its own there.)
Prints "NEW <file>" for each file copied and "Nothing newer" otherwise. Always exits 0.
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cibrc_files import newer_in, newest  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def arg(flag, default):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main():
    src = arg('--from', os.path.join(ROOT, 'official-data', 'cibrc-ppqs'))
    dst = arg('--to', os.path.join(ROOT, 'official-data', 'cibrc'))
    if not os.path.isdir(src):
        print('Nothing newer (no fetched files).')
        return 0
    copied = 0
    for name in newer_in(src, newest(dst)):
        path = os.path.join(src, name)
        with open(path, 'rb') as fh:
            head = fh.read(5)
        if head != b'%PDF-' or os.path.getsize(path) < 10_000:
            print(f'SKIP {name}: not a PDF of a sensible size')
            continue
        shutil.copyfile(path, os.path.join(dst, name))
        print(f'NEW {name}')
        copied += 1
    if not copied:
        print('Nothing newer.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
