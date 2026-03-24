/**
 * Helper script for the OAgent UI Agent to capture visual diffs.
 * Usage: node scripts/diff-component.js <url> <selector_or_xpath> <output_name>
 * 
 * Example:
 * node scripts/diff-component.js "http://localhost:5173" "button[data-ai-name='SubmitButton']" submit-button
 */

const { execSync } = require('child_process');
const fs = require('fs');

const url = process.argv[2];
const selector = process.argv[3];
const outputName = process.argv[4];

if (!url || !selector || !outputName) {
  console.error("Usage: node scripts/diff-component.js <url> <selector_or_xpath> <outputName>");
  process.exit(1);
}

// Generate the playwright script on the fly
const scriptContent = `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log("Navigating to " + "${url}");
  await page.goto("${url}", { waitUntil: 'networkidle' });
  
  console.log("Waiting for selector: " + \`${selector}\`);
  const element = await page.waitForSelector(\`${selector}\`, { timeout: 5000 }).catch(e => {
    console.error("Element not found. Capturing full page instead.");
    return null;
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = \`${outputName}-\${timestamp}.png\`;

  if (element) {
    await element.screenshot({ path: filename });
    console.log("Saved component screenshot to: " + filename);
  } else {
    await page.screenshot({ path: filename });
    console.log("Saved full page screenshot to: " + filename);
  }
  
  await browser.close();
})();
`;

fs.writeFileSync('temp-playwright-runner.js', scriptContent);

try {
  console.log("Running Playwright to capture screenshot...");
  // Use npx to avoid needing to install playwright in the main repo initially
  execSync('npx -y playwright install chromium && node temp-playwright-runner.js', { stdio: 'inherit' });
} catch (e) {
  console.error("Failed to capture screenshot:", e.message);
} finally {
  fs.unlinkSync('temp-playwright-runner.js');
}
