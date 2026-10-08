
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "../src/app");

const routes = [];

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (file === "page.tsx") {
            routes.push(fullPath);
        }
    }
}

walkDir(rootDir);

let featureStatusMD = "# Kashroot Feature Registry\n\n| Portal / Route | Feature | Expected Behavior | API / DB | Status |\n|---|---|---|---|---|\n";
let brokenFeaturesMD = "# Broken Features Report\n\n| Severity | Route | Issue | File:Line | Cause |\n|---|---|---|---|---|\n";

let brokenCount = 1;

for (const route of routes) {
    const content = fs.readFileSync(route, "utf8");
    const routeName = route.split(/[\\/]src[\\/]app/)[1].replace(/\\\\/g, "/").replace("/page.tsx", "") || "/";
    
    // Look for features
    const hasForms = content.includes("<form");
    const hasButtons = content.includes("<button") || content.includes("<Button");
    const hasFetch = content.includes("fetch(") || content.includes("axios");
    const hasPrisma = content.includes("prisma.");
    
    // Determine status
    let status = "PARTIAL";
    let apiDb = [];
    if (hasFetch) apiDb.push("API");
    if (hasPrisma) apiDb.push("Prisma");
    if (apiDb.length === 0) apiDb.push("None (Static/Mock)");
    
    // Find broken things (dead buttons)
    const deadButtonMatch = content.match(/<button[^>]*onClick=\{[^}]*\}[^>]*>/gi) || [];
    const rawButtons = content.match(/<button[^>]*>/gi) || [];
    
    let routeHasDeadButtons = false;
    for (const btn of rawButtons) {
        if (!btn.includes("onClick") && !btn.includes("type=\"submit\"")) {
            brokenFeaturesMD += `| HIGH | \`${routeName}\` | Raw button with no handler | \`${route.replace(/.*src/, "src")}\` | Missing interactivity |\n`;
            routeHasDeadButtons = true;
        }
    }
    
    if (routeHasDeadButtons) {
        status = "BROKEN";
    } else if (apiDb.includes("None (Static/Mock)")) {
        status = "PARTIAL (Mock Data)";
    }
    
    let featureName = routeName.split("/").pop() || "Landing Page";
    featureStatusMD += `| ${routeName} | ${featureName} View | Renders UI, handles actions | ${apiDb.join(", ")} | ${status} |\n`;
}

fs.writeFileSync(path.join(__dirname, "../docs/FEATURE_STATUS.md"), featureStatusMD);
fs.writeFileSync(path.join(__dirname, "../docs/BROKEN_FEATURES.md"), brokenFeaturesMD);
console.log("Static audit complete. Check docs folder.");

