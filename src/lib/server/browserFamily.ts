/**
 * The browser family and system a request came from, in two words, for the
 * security-check counts in Admin → Security ("Chrome on Android"). Only the
 * family is kept — never the full user agent, a version or anything that
 * tells people apart. Brave looks exactly like Chrome from here, so the page
 * says so itself (`brave`). Server-only.
 */
import 'server-only';

export function browserFamily(request: Request, brave = false): string {
  const ua = request.headers.get('user-agent') ?? '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'other system';
  const browser = brave
    ? 'Brave'
    : /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|Snapchat/i.test(ua)
      ? 'In-app browser'
      : /SamsungBrowser/i.test(ua)
        ? 'Samsung Internet'
        : /Edg\//i.test(ua)
          ? 'Edge'
          : /OPR\/|Opera/i.test(ua)
            ? 'Opera'
            : /Firefox|FxiOS/i.test(ua)
              ? 'Firefox'
              : /CriOS|Chrome\//i.test(ua)
                ? 'Chrome'
                : /Safari\//i.test(ua)
                  ? 'Safari'
                  : 'Other browser';
  return `${browser} on ${os}`;
}

/** " · Chrome on Android · first try" — added to a security-check log line. */
export function checkContext(request: Request, body: { brave?: unknown; retries?: unknown } | null): string {
  const retries = Number(body?.retries ?? 0);
  return ` · ${browserFamily(request, body?.brave === true)} · ${Number.isFinite(retries) && retries > 0 ? 'after Retry' : 'first try'}`;
}
