#!/usr/bin/env python3
"""
Copies a newer CIB&RC list from the folder the fetch job saved the publisher's files into (official-data/cibrc-ppqs)
into official-data/cibrc, where extract-cibrc-lists.py reads them. Nothing is edited: a file is copied byte for byte,
and only when it is a real PDF with a newer date in its name than the one in use.

    python3 scripts/update-cibrc-lists.py [--from DIR] [--to DIR]

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
