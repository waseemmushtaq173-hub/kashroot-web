#!/usr/bin/env python3
"""
Copies the official fertiliser and pesticide documents from their publishers into
official-data/, unchanged, with a manifest saying where each came from and when.

Run by .github/workflows/fetch-official-documents.yml (GitHub's servers can reach the
Government sites that this project's own build machines cannot). Nothing is read into
KashRoot's lists by this script and no document is edited or summarised: a file is saved
byte for byte as the publisher served it. A list reaches TrueScan only through Admin ->
Official lists, from one of these files.

Rules it keeps:
  * only official addresses (.gov.in, .nic.in, .ac.in, .res.in), https only, and every
    redirect is checked again;
  * the pages named in INDEX_PAGES are read, plus the pages they link to under the same
    path prefix (one level); every PDF / Excel / CSV / Word file linked from them is saved;
  * at most MAX_FILES files, each at most MAX_BYTES; a page or file that cannot be read is
    written to the manifest as a failure, never skipped silently.
Standard library only.
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

OFFICIAL_SUFFIXES = ('.gov.in', '.nic.in', '.ac.in', '.res.in')
DOC_EXT = ('.pdf', '.xls', '.xlsx', '.csv', '.doc', '.docx')
MAX_FILES = 80
MAX_PAGES = 30
MAX_BYTES = 25 * 1024 * 1024
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'official-data')

# (folder, first page, only follow pages whose path starts with this prefix, also save the page itself)
INDEX_PAGES = [
    ('cibrc-ppqs', 'https://ppqs.gov.in/divisions/cib-rc/registered-products', '/divisions/cib-rc/', False),
    ('horticulture-jk', 'https://horticulture.jk.gov.in/FAQs.html', '/FAQs', True),
]

UA = 'Mozilla/5.0 (compatible; KashRootOfficialDocuments/1.0; +https://kashroot-web.vercel.app)'


def official(url):
    p = urllib.parse.urlparse(url)
    host = (p.hostname or '').lower()
    return p.scheme == 'https' and not p.username and (p.port in (None, 443)) and host.endswith(OFFICIAL_SUFFIXES)


class OfficialOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not official(newurl):
            raise urllib.error.URLError('redirected to a non-official address')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(OfficialOnly)


def get(url, limit=MAX_BYTES):
    """(status, content_type, bytes) or raises."""
    if not official(url):
        raise ValueError('not an official address')
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
            with OPENER.open(req, timeout=60) as r:
                data = r.read(limit + 1)
                if len(data) > limit:
                    raise ValueError('larger than %d MB' % (limit // 1024 // 1024))
                return r.status, r.headers.get('Content-Type', ''), data
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise last


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag in ('a', 'link'):
            for k, v in attrs:
                if k == 'href' and v:
                    self.hrefs.append(v.strip())


def links_of(base, html):
    p = Links()
    p.feed(html)
    out = []
    for h in p.hrefs:
        if h.startswith(('#', 'mailto:', 'javascript:', 'tel:')):
            continue
        u = urllib.parse.urldefrag(urllib.parse.urljoin(base, h))[0]
        out.append(u)
    return out


def is_doc(url):
    return urllib.parse.urlparse(url).path.lower().endswith(DOC_EXT)


def safe_name(url):
    name = urllib.parse.unquote(os.path.basename(urllib.parse.urlparse(url).path)) or 'index'
    name = re.sub(r'[^A-Za-z0-9._()+ -]+', '_', name).strip(' .') or 'file'
    return name[:150]


def main():
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    manifest = {'fetched_at': now, 'files': [], 'pages': [], 'failures': []}
    saved_urls = set()
    total = 0

    def save(folder, url, status, ctype, data, kind):
        nonlocal total
        d = os.path.join(OUT, folder)
        os.makedirs(d, exist_ok=True)
        name = safe_name(url)
        if kind == 'page' and not name.lower().endswith(('.html', '.htm')):
            name += '.html'
        path = os.path.join(d, name)
        n = 1
        while os.path.exists(path) and path in {os.path.join(OUT, f['file']) for f in manifest['files']}:
            stem, ext = os.path.splitext(name)
            path = os.path.join(d, '%s-%d%s' % (stem, n, ext))
            n += 1
        with open(path, 'wb') as fh:
            fh.write(data)
        total += 1
        manifest['files'].append({
            'publisher': folder, 'url': url, 'file': os.path.relpath(path, OUT).replace(os.sep, '/'), 'kind': kind,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'content_type': ctype, 'http_status': status,
        })

    for folder, first, prefix, keep_page in INDEX_PAGES:
        host = urllib.parse.urlparse(first).hostname
        queue, seen, docs = [first], set(), []
        while queue and len(seen) < MAX_PAGES:
            page = queue.pop(0)
            if page in seen:
                continue
            seen.add(page)
            try:
                status, ctype, data = get(page)
            except Exception as e:  # noqa: BLE001 - every failure is recorded
                manifest['pages'].append({'url': page, 'error': str(e)[:200]})
                manifest['failures'].append({'url': page, 'error': str(e)[:200]})
                continue
            html = data.decode('utf-8', 'replace')
            found = links_of(page, html)
            manifest['pages'].append({'url': page, 'status': status, 'links': len(found), 'documents': sum(1 for u in found if is_doc(u))})
            if keep_page and page == first:
                save(folder, page, status, ctype, data, 'page')
            for u in found:
                if is_doc(u):
                    docs.append(u)
                else:
                    p = urllib.parse.urlparse(u)
                    if (p.hostname or '').lower() == host and p.path.startswith(prefix) and u not in seen and u not in queue:
                        queue.append(u)
        for u in dict.fromkeys(docs):
            if u in saved_urls or total >= MAX_FILES:
                continue
            saved_urls.add(u)
            try:
                status, ctype, data = get(u)
                save(folder, u, status, ctype, data, 'document')
            except Exception as e:  # noqa: BLE001
                manifest['failures'].append({'url': u, 'error': str(e)[:200]})

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'MANIFEST.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print('saved %d file(s); %d failure(s); %d page(s) read' % (len(manifest['files']), len(manifest['failures']), len(manifest['pages'])))
    for f in manifest['files']:
        print('  %-14s %9d bytes  %s' % (f['publisher'], f['bytes'], f['file']))
    for f in manifest['failures'][:20]:
        print('  FAILED %s: %s' % (f['url'], f['error']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
