const { chromium } = require('@playwright/test');
const [base, out, tag] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const w of [1280, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(`${base}/tracking/dashboard`, { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/portal-${tag}-${w}.png` });
    await p.close();
  }
  await b.close();
})();
