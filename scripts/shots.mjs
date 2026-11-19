// LEONIDA LEDGER v5 — takes the 4 screenshots listed in shots.json with Playwright.
// Serves app/ on a local port, opens each view in light theme at 1280x720, and saves
// each shot as a JPEG. Every shot must be at most 256 KiB (262144 bytes); the script
// throws if any shot is over the cap, so a too-big shot fails loudly instead of
// silently shipping. Run: node scripts/shots.mjs
import { spawn } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const MAX_BYTES = 262144;
const PORT = 8322;
const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const shots = JSON.parse(readFileSync(join(repo, "shots.json"), "utf8"));

const server = spawn(process.execPath, ["serve.ts", "--port", String(PORT)], {
  cwd: repo,
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("serve.ts did not come up");
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const shot of shots) {
    await page.goto(`http://127.0.0.1:${PORT}${shot.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    if (shot.tab) {
      await page.locator(`[data-testid="tab-${shot.tab}"]`).click();
      await page.waitForTimeout(400);
    }
    if (shot.detail) {
      await page.locator(`[data-testid="trophy-name-${shot.detail}"]`).click();
      await page.waitForTimeout(400);
      // Put the top of the detail panel at the top of the viewport, so the
      // trophy name and the IN SHORT box are in the frame, not scrolled past.
      await page.evaluate(() => {
        const panel = document.getElementById("detail-panel");
        const top = panel.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - 8));
      });
      await page.waitForTimeout(200);
    }
    if (shot.scroll) {
      await page.evaluate((y) => window.scrollTo(0, y), shot.scroll);
      await page.waitForTimeout(200);
    }
    const path = join(repo, "screenshots", shot.file);
    await page.screenshot({ path, type: "jpeg", quality: 80 });
    const size = statSync(path).size;
    console.log(`${shot.file}: ${size} bytes`);
    if (size > MAX_BYTES) {
      throw new Error(`${shot.file} is ${size} bytes, over the 256 KiB cap`);
    }
  }
  if (errors.length > 0) throw new Error(`console errors while shooting: ${errors.join(" | ")}`);
  await browser.close();
  console.log("4 screenshots taken, all within the 256 KiB cap.");
} finally {
  server.kill();
}
