// LEONIDA LEDGER v5 — Playwright tests for every feature. Serves app/ with serve.ts
// on a local port and drives it in a real browser. Run: node tests/test.mjs
// Exit code is 0 only when every test passes.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const PORT = 8323;
const BASE = `http://127.0.0.1:${PORT}`;
const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const data = JSON.parse(readFileSync(join(repo, "app", "data", "trophies.json"), "utf8"));

const server = spawn(process.execPath, ["serve.ts", "--port", String(PORT)], {
  cwd: repo,
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("serve.ts did not come up");
}

const browser = await chromium.launch();
const results = [];
let failures = 0;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => failed.push(r.url()));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return { context, page, errors, failed };
}

async function closePage(handle) {
  await handle.context.close();
}

async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}: ${error.message}`);
  }
}

function rowNames(page) {
  return page.locator(".row .row-name").allInnerTexts();
}

function expectedFilterCount(filter) {
  switch (filter) {
    case "all":
      return 55;
    case "story":
      return data.trophies.filter((t) => t.kinds.includes("story")).length;
    case "missable":
      return data.trophies.filter((t) => t.missable !== null).length;
    case "collectibles":
      return data.trophies.filter((t) => t.kinds.includes("collectibles")).length;
    case "activities":
      return data.trophies.filter((t) => t.kinds.includes("activities")).length;
    case "online":
      return 0;
    case "side":
      return data.trophies.filter((t) => t.kinds.includes("side")).length;
    case "feats":
      return data.trophies.filter((t) => t.kinds.includes("feats")).length;
    case "crime":
      return data.trophies.filter((t) => t.kinds.includes("crime")).length;
    case "riddles":
      return data.trophies.filter((t) => t.kinds.includes("riddles")).length;
    case "money":
      return data.trophies.filter((t) => t.kinds.includes("money")).length;
    case "mystery":
      return data.trophies.filter((t) => t.kinds.includes("mystery")).length;
    case "unconfirmed":
      return data.trophies.filter((t) => t.unconfirmed).length;
    case "todo":
      return 55;
    case "earned":
      return 0;
    case "quick":
      return data.trophies.filter(
        (t) => t.timeMin !== null && t.timeMin <= 15 && t.difficulty <= 2,
      ).length;
    default:
      throw new Error(`unknown filter ${filter}`);
  }
}

async function run() {
  await waitForServer();

  await test("load: 0 console errors and 0 failed requests", async () => {
    const h = await newPage();
    check(h.errors.length === 0, `console errors: ${h.errors.join(" | ")}`);
    check(h.failed.length === 0, `failed requests: ${h.failed.join(", ")}`);
    check((await h.page.locator(".row").count()) === 55, "expected 55 rows");
    await closePage(h);
  });

  const filterKeys = [
    "all", "story", "missable", "collectibles", "activities", "online", "side",
    "feats", "crime", "riddles", "money", "mystery", "unconfirmed", "todo", "earned", "quick",
  ];
  for (const key of filterKeys) {
    await test(`filter chip ${key} shows the right count`, async () => {
      const h = await newPage();
      await h.page.locator(`[data-testid="filter-${key}"]`).click();
      await h.page.waitForTimeout(200);
      const showing = await h.page.locator('[data-testid="showing-line"]').innerText();
      const expected = expectedFilterCount(key);
      check(
        showing.startsWith(`Showing ${expected} of 55`),
        `expected Showing ${expected}, got "${showing}"`,
      );
      await closePage(h);
    });
  }

  await test("search narrows to the matching trophies", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="search"]').fill("meditat");
    await h.page.waitForTimeout(200);
    const showing = await h.page.locator('[data-testid="showing-line"]').innerText();
    check(showing.startsWith("Showing 1 of 55"), `expected 1 match, got "${showing}"`);
    await closePage(h);
  });

  await test("sort roadmap keeps roadmap order", async () => {
    const h = await newPage();
    const names = await rowNames(h.page);
    check(
      names.indexOf("Just Like Paradise") < names.indexOf("Paradise Lost"),
      "roadmap order wrong",
    );
    await closePage(h);
  });

  await test("sort grade puts gold before silver", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="sort-select"]').selectOption("grade");
    await h.page.waitForTimeout(200);
    const names = await rowNames(h.page);
    check(
      names.indexOf("You Gotta Know When to Get Off") < names.indexOf("Cunning Stunts"),
      "grade order wrong",
    );
    await closePage(h);
  });

  await test("sort A-Z puts A Classic Blitz Play first", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="sort-select"]').selectOption("az");
    await h.page.waitForTimeout(200);
    const names = await rowNames(h.page);
    check(
      names.indexOf("A Classic Blitz Play") < names.indexOf("A Long Road"),
      "A-Z order wrong",
    );
    await closePage(h);
  });

  await test("sort difficulty puts an easy trophy before a hard one", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="sort-select"]').selectOption("difficulty");
    await h.page.waitForTimeout(200);
    const names = await rowNames(h.page);
    check(
      names.indexOf("Just Like Paradise") < names.indexOf("A Long Road"),
      "difficulty order wrong",
    );
    await closePage(h);
  });

  await test("mark earned persists across reload", async () => {
    const h = await newPage();
    // The status button cycles to do -> in progress -> earned, so earning takes two clicks.
    await h.page.locator('[data-testid="status-2"]').click();
    await h.page.locator('[data-testid="status-2"]').click();
    await h.page.waitForTimeout(200);
    check((await h.page.locator('[data-testid="earned-count"]').innerText()) === "1/55 (2%)", "earned count wrong after marking");
    await h.page.reload({ waitUntil: "networkidle" });
    await h.page.waitForTimeout(400);
    check((await h.page.locator('[data-testid="status-2"]').innerText()) === "Earned", "earned state did not persist");
    await closePage(h);
  });

  await test("mark in-progress persists across reload", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="status-3"]').click();
    await h.page.waitForTimeout(200);
    check((await h.page.locator('[data-testid="status-3"]').innerText()) === "In progress", "in-progress state wrong");
    await h.page.reload({ waitUntil: "networkidle" });
    await h.page.waitForTimeout(400);
    check((await h.page.locator('[data-testid="status-3"]').innerText()) === "In progress", "in-progress state did not persist");
    await closePage(h);
  });

  await test("export, reset, import round-trips the progress", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="status-2"]').click();
    await h.page.locator('[data-testid="status-2"]').click();
    await h.page.waitForTimeout(200);
    const downloadPromise = h.page.waitForEvent("download");
    await h.page.locator('[data-testid="export"]').click();
    const download = await downloadPromise;
    const path = await download.path();
    await h.page.locator('[data-testid="reset"]').click();
    await h.page.waitForTimeout(300);
    check((await h.page.locator('[data-testid="earned-count"]').innerText()).startsWith("0/55"), "reset did not clear progress");
    await h.page.locator('[data-testid="import"]').setInputFiles(path);
    await h.page.waitForTimeout(300);
    check((await h.page.locator('[data-testid="status-2"]').innerText()) === "Earned", "import did not restore the earned trophy");
    await closePage(h);
  });

  await test("spoiler toggle hides hidden trophies", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="spoiler-toggle"]').click();
    await h.page.waitForTimeout(200);
    check(
      (await h.page.locator('[data-testid="trophy-name-2"]').count()) === 0,
      "hidden trophy name still visible with spoilers hidden",
    );
    check(
      (await h.page.locator(".row", { hasText: "Hidden trophy" }).count()) > 0,
      "hidden placeholder missing",
    );
    await h.page.locator('[data-testid="spoiler-toggle"]').click();
    await h.page.waitForTimeout(200);
    check((await h.page.locator('[data-testid="trophy-name-2"]').count()) === 1, "name did not come back");
    await closePage(h);
  });

  await test("spoiler Reveal shows one hidden trophy", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="spoiler-toggle"]').click();
    await h.page.waitForTimeout(200);
    await h.page.locator('[data-testid="reveal-2"]').click();
    await h.page.waitForTimeout(200);
    check((await h.page.locator('[data-testid="trophy-name-2"]').count()) === 1, "Reveal did not show the name");
    await closePage(h);
  });

  await test("NEXT UP recomputes after earning the first item", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="tab-nextup"]').click();
    await h.page.waitForTimeout(200);
    const firstBefore = await h.page.locator('[data-testid^="nextup-row-"]').first().getAttribute("data-testid");
    check(firstBefore === "nextup-row-28", `expected first next-up #28, got ${firstBefore}`);
    await h.page.locator('[data-testid="tab-checklist"]').click();
    await h.page.waitForTimeout(200);
    await h.page.locator('[data-testid="status-28"]').click();
    await h.page.locator('[data-testid="status-28"]').click();
    await h.page.waitForTimeout(200);
    await h.page.locator('[data-testid="tab-nextup"]').click();
    await h.page.waitForTimeout(200);
    const firstAfter = await h.page.locator('[data-testid^="nextup-row-"]').first().getAttribute("data-testid");
    check(firstAfter === "nextup-row-23", `expected first next-up #23 after earning #28, got ${firstAfter}`);
    await closePage(h);
  });

  await test("missable banner Show it opens the right detail", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="banner-show"]').click();
    await h.page.waitForTimeout(300);
    check(await h.page.locator('[data-testid="detail-panel"]').isVisible(), "detail panel not visible");
    check(
      (await h.page.locator('[data-testid="detail-panel"]').innerText()).includes("Positive Mental Attitude"),
      "banner opened the wrong detail",
    );
    await closePage(h);
  });

  await test("theme toggle switches to dark and persists", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="theme-toggle"]').click();
    await h.page.waitForTimeout(200);
    check((await h.page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "theme did not switch to dark");
    await h.page.reload({ waitUntil: "networkidle" });
    await h.page.waitForTimeout(400);
    check((await h.page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark theme did not persist");
    await closePage(h);
  });

  await test("source matrix counts match trophies.json", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="tab-matrix"]').click();
    await h.page.waitForTimeout(300);
    for (const source of data.sources) {
      const expectedTrophies = data.trophies.filter((t) => t.sources.includes(source.id)).length;
      const expectedSteps = data.trophies.reduce(
        (sum, t) => sum + t.steps.filter((s) => s.cites.includes(source.id)).length,
        0,
      );
      const totalSteps = data.trophies.reduce((sum, t) => sum + t.steps.length, 0);
      const trophiesCell = await h.page.locator(`[data-testid="matrix-trophies-${source.id}"]`).innerText();
      const stepsCell = await h.page.locator(`[data-testid="matrix-steps-${source.id}"]`).innerText();
      check(trophiesCell === `${expectedTrophies}/55`, `source ${source.id} trophies: ${trophiesCell}`);
      check(stepsCell === `${expectedSteps}/${totalSteps}`, `source ${source.id} steps: ${stepsCell}`);
    }
    await closePage(h);
  });

  await test("audit strip numbers match trophies.json", async () => {
    const h = await newPage();
    const audit = await h.page.locator('[data-testid="audit-strip"]').innerText();
    const steps = data.trophies.reduce((sum, t) => sum + t.steps.length, 0);
    const disagreements = data.trophies.reduce((sum, t) => sum + t.disagreements.length, 0);
    check(audit.includes("55 official"), "audit missing total");
    check(audit.includes("1P 2G 6S 46B"), "audit missing grades");
    check(audit.includes("28 hidden"), "audit missing hidden count");
    check(audit.includes(`${steps}/${steps} steps cited`), "audit missing step count");
    check(audit.includes("1 possibly missable"), "audit missing missable count");
    check(audit.includes("6 watch"), "audit missing watch count");
    check(audit.includes("2 unconfirmed"), "audit missing unconfirmed count");
    check(audit.includes("3 single-source"), "audit missing single-source count");
    check(audit.includes(`${disagreements} disagree`), "audit missing disagreement count");
    await closePage(h);
  });

  await test("every step citation resolves to a source of its trophy", async () => {
    let mismatches = 0;
    let uncited = 0;
    for (const t of data.trophies) {
      for (const step of t.steps) {
        if (!step.cites || step.cites.length === 0) uncited += 1;
        for (const cite of step.cites || []) {
          if (!t.sources.includes(cite)) mismatches += 1;
        }
      }
    }
    check(mismatches === 0, `${mismatches} citation mismatches`);
    check(uncited === 0, `${uncited} uncited steps`);
  });

  await test("counters step correctly", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="counter-plus-15"]').click();
    await h.page.waitForTimeout(200);
    check(
      (await h.page.locator('[data-testid="counter-value-15"]').innerText()) === "1/250 stunts completed",
      "counter did not step up",
    );
    await h.page.locator('[data-testid="counter-minus-15"]').click();
    await h.page.waitForTimeout(200);
    check(
      (await h.page.locator('[data-testid="counter-value-15"]').innerText()) === "0/250 stunts completed",
      "counter did not step down",
    );
    await closePage(h);
  });

  await test("detail opens for every trophy", async () => {
    const h = await newPage();
    for (const t of data.trophies) {
      await h.page.locator(`[data-testid="trophy-name-${t.id}"]`).click();
      await h.page.waitForTimeout(120);
      const heading = await h.page.locator('[data-testid="detail-panel"] h2').innerText();
      check(heading === t.name, `detail for #${t.id} shows "${heading}"`);
      check(
        (await h.page.locator('[data-testid="detail-panel"]').innerText()).includes("IN SHORT") ||
          (await h.page.locator('[data-testid="detail-panel"]').innerText()).includes("In short"),
        `detail for #${t.id} missing IN SHORT`,
      );
    }
    await closePage(h);
  });

  await test("#49 shows NOT PINNED DOWN YET and no time", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="trophy-name-49"]').click();
    await h.page.waitForTimeout(300);
    const text = await h.page.locator('[data-testid="detail-panel"]').innerText();
    check(text.includes("NOT PINNED DOWN YET"), "#49 missing the not-pinned-down box");
    check(!text.includes("Time: about"), "#49 shows a time estimate it must not have");
    await closePage(h);
  });

  await test("slash focuses the search box", async () => {
    const h = await newPage();
    await h.page.keyboard.press("/");
    await h.page.waitForTimeout(200);
    check(
      (await h.page.evaluate(() => document.activeElement?.dataset?.testid)) === "search",
      "slash did not focus search",
    );
    await closePage(h);
  });

  await test("import rejects foreign-app exports", async () => {
    const h = await newPage();
    const foreign = join(repo, "..", "foreign-export-v5.json");
    writeFileSync(
      foreign,
      JSON.stringify({ app: "some-other-app", version: 1, status: { 2: "earned" }, counters: {} }),
    );
    await h.page.locator('[data-testid="import"]').setInputFiles(foreign);
    await h.page.waitForTimeout(300);
    check((await h.page.locator('[data-testid="import-error"]').count()) === 1, "foreign import was not rejected");
    check(
      (await h.page.locator('[data-testid="import-error"]').innerText()).includes("another app"),
      "rejection message does not name the other app",
    );
    await closePage(h);
  });

  await test("serve.ts returns 405 for POST", async () => {
    const response = await fetch(`${BASE}/`, { method: "POST" });
    check(response.status === 405, `expected 405, got ${response.status}`);
  });

  await test("README description line is the verbatim competition summary", async () => {
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    const summary =
      "Build an offline web app that guides and tracks all 55 GTA 6 trophies: the official list with saved progress, filters and a spoiler setting, a roadmap to the platinum, and a guide to each that cites its sources; an AI judge compares the guides two at a time, places go by win rate, and the 50 best share $250.";
    check(readme.includes(summary), "README does not contain the verbatim summary");
  });

  await test("README Run block is exactly node serve.ts", async () => {
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    check(readme.includes("```sh\nnode serve.ts\n```"), "README Run block is not exactly node serve.ts");
  });

  await test("grade dropdown filters the list", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="grade-select"]').selectOption("bronze");
    await h.page.waitForTimeout(200);
    check(
      (await h.page.locator('[data-testid="showing-line"]').innerText()).startsWith("Showing 46 of 55"),
      "bronze filter wrong",
    );
    await h.page.locator('[data-testid="grade-select"]').selectOption("platinum");
    await h.page.waitForTimeout(200);
    check(
      (await h.page.locator('[data-testid="showing-line"]').innerText()).startsWith("Showing 1 of 55"),
      "platinum filter wrong",
    );
    await closePage(h);
  });

  await test("reset clears progress after confirm", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="status-3"]').click();
    await h.page.waitForTimeout(200);
    await h.page.locator('[data-testid="reset"]').click();
    await h.page.waitForTimeout(300);
    check((await h.page.locator('[data-testid="earned-count"]').innerText()).startsWith("0/55"), "reset did not clear");
    await closePage(h);
  });

  await test("detail Mark earned button earns the trophy", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="trophy-name-4"]').click();
    await h.page.waitForTimeout(300);
    await h.page.locator('[data-testid="detail-mark-earned"]').click();
    await h.page.waitForTimeout(200);
    check((await h.page.locator('[data-testid="status-4"]').innerText()) === "Earned", "Mark earned did not earn");
    await closePage(h);
  });

  await test("progress tab shows earned counts", async () => {
    const h = await newPage();
    await h.page.locator('[data-testid="status-2"]').click();
    await h.page.locator('[data-testid="status-2"]').click();
    await h.page.waitForTimeout(200);
    await h.page.locator('[data-testid="tab-progress"]').click();
    await h.page.waitForTimeout(200);
    check(
      (await h.page.locator('[data-testid="progress-earned"]').innerText()).includes("1 of 55"),
      "progress tab does not show the earned trophy",
    );
    check(
      (await h.page.locator('[data-testid="progress-psn"]').innerText()).includes("15 of 1350"),
      "progress tab PSN points wrong",
    );
    await closePage(h);
  });

  for (const line of results) console.log(line);
  console.log(`${results.length - failures}/${results.length} tests passed`);
  await browser.close();
  server.kill();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  server.kill();
  process.exit(1);
});

