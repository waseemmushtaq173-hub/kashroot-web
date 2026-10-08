
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardsDir = path.join(__dirname, "../src/app/(dashboards)");

function walkDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath, fileList);
        } else if (file.endsWith(".tsx")) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

const files = walkDir(dashboardsDir);
let changedCount = 0;

for (const file of files) {
    let content = fs.readFileSync(file, "utf8");
    let changed = false;

    // Very naive replacement for <button to <Button
    if (content.includes("<button") && !content.includes("import { Button }")) {
        // Add import after the last import statement or at the top
        const importMatch = content.match(/import .* from .*\n/g);
        const lastImport = importMatch ? importMatch[importMatch.length - 1] : null;
        
        const buttonImport = `import { Button } from "@/components/ui/Button";\n`;
        if (lastImport) {
            content = content.replace(lastImport, lastImport + buttonImport);
        } else {
            content = buttonImport + content;
        }

        // Replace opening tag
        content = content.replace(/<button/g, "<Button");
        // Replace closing tag
        content = content.replace(/<\/button>/g, "</Button>");
        
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
        changedCount++;
    }
}

console.log(`Replaced buttons in ${changedCount} files.`);

