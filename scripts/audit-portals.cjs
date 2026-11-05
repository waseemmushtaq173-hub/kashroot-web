// LOCAL ONLY — the portal audit (Task 10): sign in as each TEST user (scripts/seed-demo.mjs, .env.test),
// open every tab of the portal (both modes of Cold Storage), click every button except Sign out, send each
// form that opens in a dialog once as it is, and note crashes, page and console errors, server errors (5xx),
// refused data requests, error toasts and "Something went wrong" screens. Prints labels and messages only —
// never field values or passwords. Refuses any address but this computer.
//   node scripts/audit-portals.cjs http://localhost:3600 <outDir> farmer:FARMER,buyer:BUYER,rental:COLDOWNER [390]
const { chromium } = require(process.cwd() + '/node_modules/playwright');
const { createHmac } = require('crypto');
const fs = require('fs');
const [base, out, list, widthArg] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) throw new Error('local only');
const width = Number(widthArg ?? 1280);
const env = Object.fromEntries(fs.readFileSync('.env.test', 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const HOME = { farmer: '/farmer/dashboard', buyer: '/buyer/dashboard', kissan: '/kissan-tools/dashboard', rental: '/rental/dashboard', dealer: '/dealer/dashboard', trader: '/trader/dashboard', expert: '/expert', tracking: '/tracking/dashboard', admin: '/admin/dashboard' };
const TABS = '[role="tab"][id*="-side-"]:visible, [role="tab"][id*="-pill-"]:visible';
const SKIP = /^(sign out|log out|sign out of|lock admin portal now|lock admin|delete my account|delete account|I store my apples|I run a cold store)/i;
// Portals with two modes, each with its own tabs: audited one after the other.
const MODES = { rental: ['I store my apples', 'I run a cold store'] };
const BAD_TEXT = /Something went wrong|Application error|Unhandled Runtime Error|This page couldn’t load|could not load this page/i;
fs.mkdirSync(out, { recursive: true });
function totp(b32) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of b32) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const scrub = (t) => String(t).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\s+/g, ' ').slice(0, 220);
async function signIn(page, portal, user) {
  await page.goto(`${base}/login/${portal}?next=${encodeURIComponent(HOME[portal])}`);
  await page.getByLabel('Email address').fill(`test-${user.toLowerCase()}@example.test`, { timeout: 60000 });
  await page.getByLabel('Password', { exact: true }).fill(env[`TEST_${user}_PASSWORD`]);
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: /^Sign in to/ }).click();
  if (portal === 'admin') {
    const two = page.locator('[data-two-step="verify"]').first();
    await two.waitFor({ timeout: 60000 });
    await two.locator('input').first().click();
    await page.keyboard.type(totp(env.TEST_ADMIN_TOTP_SECRET));
    await two.getByRole('button', { name: /Continue/ }).click().catch(() => undefined);
    await page.getByLabel('Admin code').fill(env.TEST_ADMIN_ACCESS_CODE, { timeout: 60000 });
    const again = page.getByLabel('Type it again');
    if (await again.isVisible()) await again.fill(env.TEST_ADMIN_ACCESS_CODE);
    await page.getByRole('button', { name: /Save code and open|Open Admin portal/ }).click();
  }
  await page.waitForURL((u) => u.pathname.startsWith(HOME[portal].replace(/\/dashboard$/, '')), { timeout: 90000 });
  await page.waitForTimeout(3000);
}
(async () => {
  const b = await chromium.launch();
  const report = [];
  for (const item of list.split(',')) {
    const [portal, user] = item.split(':');
    const ctx = await b.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const problems = [];
    let where = 'sign-in';
    page.on('pageerror', (e) => problems.push({ where, kind: 'page error', msg: scrub(e.message) }));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text()) && problems.push({ where, kind: 'console error', msg: scrub(m.text()) }));
    page.on('response', (r) => {
      const u = r.url();
      if (r.status() >= 500) problems.push({ where, kind: `server ${r.status()}`, msg: scrub(u.replace(base, '').split('?')[0]) });
      else if (r.status() >= 400 && /\/rest\/v1\/|\/rpc\/|\/api\//.test(u) && r.status() !== 401) problems.push({ where, kind: `refused ${r.status()}`, msg: scrub(u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]) });
    });
    const stats = { tabs: 0, clicked: 0, skipped: 0 };
    try {
      await signIn(page, portal, user);
      const home = page.url();
      for (const mode of MODES[portal] ?? [null]) {
      const setMode = async () => {
        if (!mode) return;
        // Already in this mode: its switch cannot be pressed again — nothing to do.
        await page.getByText(mode, { exact: true }).filter({ visible: true }).first().click({ timeout: 4000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
      };
      await setMode();
      const found = [...new Set((await page.locator(TABS).allInnerTexts()).map((t) => t.split(/\r?\n/)[0].trim()).filter(Boolean))];
      // A portal of one page (no tabs): the page itself.
      const tabNames = found.length ? found : ['(the page)'];
      for (const tab of tabNames) {
        where = `${mode ? `${mode} › ` : ''}${tab}`;
        stats.tabs++;
        const openTab = async () => {
          if (!page.url().startsWith(home.split('?')[0])) {
            await page.goto(home);
            await page.waitForTimeout(1500);
            await setMode();
          }
          if (found.length) {
            const ok = await page.locator(TABS).filter({ hasText: tab }).first().click({ timeout: 8000 }).then(() => true, () => false);
            if (!ok) {
              // Start again from the portal's home (something on the page may cover the menu): a real block fails twice.
              await page.goto(home);
              await page.waitForTimeout(1500);
              await setMode();
              await page.locator(TABS).filter({ hasText: tab }).first().click({ timeout: 8000 });
            }
          }
          await page.waitForTimeout(2000);
        };
        await openTab();
        const tabUrl = page.url();
        if (BAD_TEXT.test(await page.locator('body').innerText())) problems.push({ where, kind: 'error screen', msg: 'on opening the tab' });
        await page.screenshot({ path: `${out}/${portal}-${tab.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${width}.png`, fullPage: true });
        const seen = new Set();
        for (let i = 0; i < 80; i++) {
          const buttons = page.locator('main button:visible, main [role="button"]:visible, main input[type="submit"]:visible');
          const n = await buttons.count();
          // The next button not tried yet (the page may change after each click).
          let target = null;
          let label = '';
          for (let j = 0; j < n; j++) {
            const el = buttons.nth(j);
            const l = scrub(((await el.getAttribute('aria-label').catch(() => null)) || (await el.innerText().catch(() => '')) || '').trim()).slice(0, 60);
            const key = `${l}#${j}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!l || SKIP.test(l) || (await el.isDisabled().catch(() => true))) { stats.skipped++; continue; }
            target = el;
            label = l;
            break;
          }
          if (!target) break;
          where = `${mode ? `${mode} › ` : ''}${tab} › ${label}`;
          const before = problems.length;
          await target.click({ timeout: 4000 }).catch((e) => problems.push({ where, kind: 'could not click', msg: scrub(e.message.split('\n')[0]) }));
          stats.clicked++;
          await page.waitForTimeout(900);
          const body = await page.locator('body').innerText().catch(() => '');
          if (BAD_TEXT.test(body)) problems.push({ where, kind: 'error screen', msg: scrub(body.match(BAD_TEXT)[0]) });
          const toasts = await page.locator('[data-sonner-toast][data-type="error"]').allInnerTexts().catch(() => []);
          for (const t of toasts) problems.push({ where, kind: 'error toast', msg: scrub(t) });
          if (problems.length > before) await page.screenshot({ path: `${out}/${portal}-problem-${problems.length}.png` }).catch(() => {});
          // A form opened in a dialog: send it once as it is (empty), to see it explain rather than fail; then close it.
          const DIALOG = 'dialog[open], [role="dialog"]:visible, [role="alertdialog"]:visible';
          const dlg = page.locator(DIALOG).last();
          if (await dlg.count()) {
            const submit = dlg.getByRole('button', { name: /^(save|send|submit|create|add|book|continue|confirm|post|list|request|pay|next)/i }).first();
            if ((await submit.count()) && !(await submit.isDisabled().catch(() => true))) {
              const w = where;
              where = `${w} › [form] ${scrub((await submit.innerText().catch(() => '')) || '').slice(0, 30)}`;
              const pre = problems.length;
              await submit.click({ timeout: 4000 }).catch(() => {});
              stats.clicked++;
              await page.waitForTimeout(1200);
              for (const t of await page.locator('[data-sonner-toast][data-type="error"]').allInnerTexts().catch(() => [])) problems.push({ where, kind: 'form toast', msg: scrub(t) });
              if (problems.length > pre) await page.screenshot({ path: `${out}/${portal}-problem-${problems.length}.png` }).catch(() => {});
              where = w;
            }
          }
          for (let k = 0; k < 3 && (await page.locator(DIALOG).count()); k++) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
            if (await page.locator(DIALOG).count()) {
              const close = page.locator(DIALOG).last().getByRole('button', { name: /close|cancel|not now|back|no/i }).first();
              if (await close.count()) await close.click({ timeout: 2000 }).catch(() => {});
            }
          }
          if (page.url() !== tabUrl) {
            await page.goto(tabUrl).catch(() => {});
            await page.waitForTimeout(1500);
            await openTab().catch(() => {});
          }
        }
      }
      }
    } catch (e) {
      problems.push({ where, kind: 'audit stopped', msg: scrub(`${e.message.split('\n')[0]} @line ${((e.stack || '').match(/audit\.cjs:(\d+)/) || [])[1]}`) });
      await page.screenshot({ path: `${out}/${portal}-stopped.png` }).catch(() => {});
    }
    // One line per distinct problem.
    const uniq = [...new Map(problems.map((p) => [`${p.kind}|${p.msg}|${p.where.split(' › ')[0]}`, p])).values()];
    report.push({ portal, user, width, ...stats, problems: uniq });
    console.log(`== ${portal} (${user}, ${width}px): ${stats.tabs} tabs, ${stats.clicked} buttons clicked, ${stats.skipped} skipped, ${uniq.length} problems`);
    for (const p of uniq) console.log(`   [${p.kind}] ${p.where} :: ${p.msg}`);
    await ctx.close();
  }
  fs.writeFileSync(`${out}/audit-${list.replace(/[^a-z,]/gi, '').replace(/,/g, '-')}-${width}.json`, JSON.stringify(report, null, 1));
  await b.close();
})();
