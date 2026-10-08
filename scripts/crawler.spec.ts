
import { test, expect } from "@playwright/test";
import fs from "fs";

// To run: npx playwright test scripts/crawler.spec.ts

const ROLES = [
  { name: "farmer", loginUrl: "/login", creds: { user: "farmer@kashroot.test", pass: "demo123" } },
  { name: "buyer", loginUrl: "/login", creds: { user: "buyer@kashroot.test", pass: "demo123" } },
  { name: "expert", loginUrl: "/login", creds: { user: "expert@kashroot.test", pass: "demo123" } }
];

test.describe("Kashroot Multi-Role Click-Through Audit", () => {
  let brokenFeatures: any[] = [];

  test.afterAll(() => {
    let md = "# Dynamic Audit - Broken Features\n\n| Severity | Role | URL | Issue | Details |\n|---|---|---|---|---|\n";
    brokenFeatures.forEach(bf => {
       md += `| ${bf.severity} | ${bf.role} | ${bf.url} | ${bf.issue} | ${bf.details} |\n`;
    });
    fs.appendFileSync("docs/BROKEN_FEATURES.md", "\n" + md);
  });

  for (const role of ROLES) {
    test(`Audit role: ${role.name}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", exception => {
        errors.push(exception.message);
        brokenFeatures.push({ severity: "CRITICAL", role: role.name, url: page.url(), issue: "Console Error / Hydration", details: exception.message });
      });
      page.on("response", response => {
        if (response.status() >= 400 && response.request().resourceType() === "fetch") {
           brokenFeatures.push({ severity: "HIGH", role: role.name, url: page.url(), issue: `API ${response.status()}`, details: response.url() });
        }
      });

      // Attempt login
      try {
        await page.goto("http://localhost:3000" + role.loginUrl);
        // Note: adjust selectors based on actual login form
        await page.fill("input[type=email]", role.creds.user).catch(() => {});
        await page.fill("input[type=password]", role.creds.pass).catch(() => {});
        await page.click("button[type=submit], button:has-text(\"Login\")").catch(() => {});
        await page.waitForTimeout(1000);
      } catch (e: any) {
         brokenFeatures.push({ severity: "HIGH", role: role.name, url: role.loginUrl, issue: "Login Flow Failed", details: e.message });
      }

      // Sweep dashboard routes logic here...
      // (This crawler visits the home page and logs buttons for now)
      await page.goto("http://localhost:3000/");
      const buttons = page.locator("button");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
         const btn = buttons.nth(i);
         const isVisible = await btn.isVisible();
         if (!isVisible) continue;
         
         const html = await btn.evaluate(node => node.outerHTML);
         if (!html.includes("onClick") && !html.includes("type=\"submit\"")) {
             brokenFeatures.push({ severity: "MEDIUM", role: role.name, url: page.url(), issue: "Dead Button (No Handler)", details: (await btn.textContent())?.trim() || "Icon Button" });
         }
      }
    });
  }
});

