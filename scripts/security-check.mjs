// KashRoot endpoint security checks, against any running copy of the site.
//   node scripts/security-check.mjs http://localhost:3000
//   node scripts/security-check.mjs https://kashroot-web.vercel.app
// Every request here is harmless: no code is sent, nothing is booked, saved or charged
// (bad tokens, malformed bodies, a disguised photo that is refused before any AI call).
// Exit code 1 when anything fails.
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
let failed = 0;
const check = (ok, what, got = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && got ? `  — got ${got}` : ''}`);
  if (!ok) failed++;
};
const call = async (path, init = {}) => {
  const res = await fetch(base + path, { redirect: 'manual', ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
};
const post = (path, body, headers) => call(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });

// a) Protected routes without a sign-in token: 401.
for (const [method, path, body] of [
  ['GET', '/api/vehicle?number=JK01AB1234'],
  ['POST', '/api/kyc/pan', { pan: 'ABCDE1234F' }],
  ['POST', '/api/kyc/aadhaar/otp', { aadhaar: '123412341234' }],
  ['POST', '/api/kyc/aadhaar/verify', { ref: 'x', otp: '123456' }],
  ['POST', '/api/kyc/digilocker/start', {}],
  ['GET', '/api/kyc/digilocker/status?id=x'],
]) {
  const r = method === 'GET' ? await call(path) : await post(path, body);
  // 503 is also safe: the provider is not set up on this copy, nothing ran.
  check(r.status === 401 || r.status === 503, `${method} ${path} without signing in is refused (401)`, r.status);
}
// … and a made-up token is refused just the same.
{
  const r = await call('/api/vehicle?number=JK01AB1234', { headers: { authorization: 'Bearer not-a-real-token' } });
  check(r.status === 401 || r.status === 503, 'a made-up sign-in token is refused', r.status);
}

// b) Routes that were removed stay gone; the TURN relay login only for signed-in people.
check((await call('/api/notifications?userId=someone')).status === 404, '/api/notifications (no sign-in check) stays removed');
{
  const r = await call('/api/turn');
  check(r.status === 200 && !/credential|username/.test(r.text), '/api/turn gives no relay login without a sign-in', r.text.slice(0, 80));
}
{
  const r = await call('/api/ai/check');
  check(!/"key"|sk-ant|wrkspc_/.test(r.text), '/api/ai/check shows no part of the Anthropic key or workspace', r.text.slice(0, 80));
}

// c) Malformed and oversized input: 400 (or 413 from the platform for a huge body), never 500.
for (const [path, body, what] of [
  ['/api/ai', '{not json', 'broken JSON'],
  ['/api/ai', { query: '' }, 'an empty question'],
  ['/api/otp/send', { channel: 'fax', to: 'x' }, 'an unknown OTP channel'],
  ['/api/otp/send', { channel: 'sms', to: '123' }, 'a phone number that is not one'],
  ['/api/label', { photo: 'not a photo' }, 'a photo that is not a data URL'],
  // A script (text "<script>alert(1)</script>…") labelled image/png: refused by its bytes, before any AI call.
  ['/api/label', { photo: `data:image/png;base64,${Buffer.from('<script>alert(1)</script>'.repeat(8)).toString('base64')}` }, 'a script disguised as a PNG'],
  ['/api/label', { photo: `data:image/jpeg;base64,${Buffer.from('MZ\x90\x00 this is a program '.repeat(8)).toString('base64')}` }, 'a program disguised as a JPEG'],
]) {
  const r = await post(path, body);
  // 403: refused before it was read, for want of the "I am human" pass (Turnstile on).
  check([400, 403, 413, 429, 503].includes(r.status), `${path}: ${what} is refused (400 / 403)`, `${r.status} ${r.text.slice(0, 80)}`);
  check(!/at .*\(|node_modules|stack|ECONN|SQLSTATE|relation "|syntax error at/i.test(r.text), `${path}: ${what} — no internals in the answer`, r.text.slice(0, 120));
}

// The Farmer portal's photo check costs money: nobody signed out may call it at all.
{
  const r = await post('/api/diagnose', { photo: 'not a photo' });
  check(r.status === 401, '/api/diagnose: refused without signing in (401)', `${r.status} ${r.text.slice(0, 80)}`);
}

// d) Bursts: one-time-code guessing is cut off (429). A made-up code, so nothing is sent or checked.
{
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) {
    const r = await post('/api/otp/verify', { token: 'abuse-test-token.x.y', code: '000000' });
    if (r.status === 429) limited = true;
    if (r.status === 503) { limited = 'off'; break; }
  }
  check(limited !== false, limited === 'off' ? 'OTP codes are not switched on here (nothing to guess)' : 'guessing one-time codes is stopped with 429 within 8 tries');
}

// e) Security headers on pages.
{
  const r = await call('/');
  const h = (n) => r.headers.get(n) ?? '';
  check(/max-age=\d{7,}/.test(h('strict-transport-security')), 'Strict-Transport-Security (HSTS)', h('strict-transport-security'));
  check(/default-src 'self'/.test(h('content-security-policy')) && /frame-ancestors 'none'/.test(h('content-security-policy')) && /object-src 'none'/.test(h('content-security-policy')), 'Content-Security-Policy (self only, no framing, no plugins)');
  check(h('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
  check(h('x-frame-options') === 'DENY', 'X-Frame-Options: DENY');
  check(h('referrer-policy') === 'strict-origin-when-cross-origin', 'Referrer-Policy');
  check(!/auth_token=/.test(h('set-cookie')), 'no sign-in token in a cookie');

  // f) No secret in the JavaScript every browser downloads.
  const scripts = [...new Set([...r.text.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
  let leaked = [];
  for (const s of scripts) {
    const js = await (await fetch(base + s)).text();
    for (const [what, re] of [
      ['an Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
      ['a Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
      ['a service-role key', /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\./],
      ['a Resend or Twilio key', /\bre_[A-Za-z0-9]{24,}|\bAC[a-f0-9]{32}\b/],
    ]) if (re.test(js)) leaked.push(`${what} in ${s}`);
  }
  check(scripts.length > 0 && leaked.length === 0, `no secrets in the ${scripts.length} scripts the home page loads`, leaked.join('; '));
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
