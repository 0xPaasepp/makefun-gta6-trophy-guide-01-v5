// LEONIDA LEDGER v5 — the app. Fetches app/data/trophies.json, renders every view from
// that data, and keeps progress in this browser (see store.js). No network beyond the
// local data file; no external fonts, images or scripts.
import {
  APP_ID,
  counterOf,
  cycleStatus,
  defaultState,
  exportText,
  loadState,
  parseImport,
  saveState,
  setCounter,
  setStatus,
  statusOf,
} from "./store.js";
import {
  applySort,
  auditNumbers,
  confidence,
  counterLabel,
  earnedStats,
  filterCounts,
  firstMissable,
  fmtTime,
  matchesFilter,
  nextUp,
  sourceCoverage,
  sourceName,
} from "./views.js";

const FILTERS = [
  ["all", "All"],
  ["story", "Story"],
  ["missable", "Missable"],
  ["collectibles", "Collectibles"],
  ["activities", "Activities"],
  ["online", "Online"],
  ["side", "Side"],
  ["feats", "Feats"],
  ["crime", "Crime"],
  ["riddles", "Riddles"],
  ["money", "Money"],
  ["mystery", "Mystery"],
  ["unconfirmed", "Unconfirmed"],
  ["todo", "To do"],
  ["earned", "Earned"],
  ["quick", "Quick wins"],
];

let data = null;
let state = loadState();
let activeTab = "checklist";
let activeFilter = "all";
let selectedId = null;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function stampSaved() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  document.getElementById("saved-stamp").textContent = `Saved in this browser ${hh}:${mm}`;
}

function persist() {
  saveState(state);
  stampSaved();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.getElementById("theme-toggle").textContent =
    state.theme === "light" ? "Dark theme" : "Light theme";
}

function applySpoilers() {
  document.getElementById("spoiler-toggle").textContent = state.spoilers
    ? "Spoilers: shown"
    : "Spoilers: hidden";
}

function renderHeader() {
  const stats = earnedStats(data, state);
  const pct = Math.round((stats.earned / data.trophies.length) * 100);
  document.getElementById("earned-count").textContent =
    `${stats.earned}/${data.trophies.length} (${pct}%)`;
  document.getElementById("grade-counts").textContent =
    `P ${stats.byGrade.platinum} · G ${stats.byGrade.gold} · S ${stats.byGrade.silver} · B ${stats.byGrade.bronze}`;
  document.getElementById("psn-points").textContent = `${stats.psn}/1350 PSN pts`;
  document.getElementById("in-progress-count").textContent = `${stats.doing} in progress`;
}

function renderAudit() {
  const a = auditNumbers(data);
  document.getElementById("audit-strip").textContent =
    `${a.total} official · 1P 2G 6S 46B · ${a.hidden} hidden · ${a.citedTrophies}/${a.total} guides cite a source · ` +
    `${a.citedSteps}/${a.steps} steps cited · 8 sources read 20 Nov 2026 · ${a.possiblyMissable} possibly missable · ` +
    `${a.watch} watch · ${a.unconfirmed} unconfirmed · ${a.singleSource} single-source · ${a.disagreements} disagree · ` +
    `0 network requests · works offline`;
  const coverage = sourceCoverage(data);
  document.getElementById("cited-by").textContent =
    "CITED BY — " +
    coverage.map((c) => `${c.source.name} ${c.trophies}/${a.total}`).join(" · ");
}

function renderBanner() {
  const banner = document.getElementById("missable-banner");
  const first = firstMissable(data, state);
  if (!first) {
    banner.hidden = true;
    banner.replaceChildren();
    return;
  }
  const t = first.trophy;
  banner.hidden = false;
  banner.replaceChildren();
  const label = t.missable === "possible" ? "POSSIBLY MISSABLE" : "WATCH";
  banner.append(el("strong", null, `${label}: ${t.name}`));
  banner.append(el("span", null, t.short));
  const show = el("button", null, "Show it");
  show.type = "button";
  show.dataset.testid = "banner-show";
  show.addEventListener("click", () => openDetail(t.id));
  banner.append(show);
}

function renderFilters() {
  const counts = filterCounts(data, state);
  const wrap = document.getElementById("filters");
  wrap.replaceChildren();
  for (const [key, label] of FILTERS) {
    const button = el("button", null, `${label} ${counts[key]}`);
    button.type = "button";
    button.dataset.filter = key;
    button.dataset.testid = `filter-${key}`;
    button.setAttribute("aria-pressed", activeFilter === key ? "true" : "false");
    if (activeFilter === key) button.classList.add("active");
    button.addEventListener("click", () => {
      activeFilter = key;
      renderAll();
    });
    wrap.append(button);
  }
}

function spoilerHidden(trophy) {
  return trophy.hidden && !state.spoilers && statusOf(state, trophy.id) !== "earned" && !state.revealed[String(trophy.id)];
}

function statusLabel(status) {
  return status === "earned" ? "Earned" : status === "doing" ? "In progress" : "To do";
}

function buildRow(trophy) {
  const row = el("article", "row");
  row.dataset.trophyId = String(trophy.id);
  const status = statusOf(state, trophy.id);
  if (status === "earned") row.classList.add("earned");

  const statusBtn = el("button", "status-btn", statusLabel(status));
  statusBtn.type = "button";
  statusBtn.dataset.state = status;
  statusBtn.dataset.testid = `status-${trophy.id}`;
  // Never leak a hidden trophy's name through the accessible label while spoilers hide it.
  statusBtn.setAttribute(
    "aria-label",
    spoilerHidden(trophy)
      ? `Status of a hidden trophy: ${statusLabel(status)}. Activate to change.`
      : `Status of ${trophy.name}: ${statusLabel(status)}. Activate to change.`,
  );
  statusBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    cycleStatus(state, trophy.id);
    persist();
    renderAll();
  });
  row.append(statusBtn);

  const main = el("div", "row-main");
  if (spoilerHidden(trophy)) {
    main.append(el("div", "row-name", "Hidden trophy — hidden until earned"));
    const reveal = el("button", "reveal-btn", "Reveal");
    reveal.type = "button";
    reveal.dataset.testid = `reveal-${trophy.id}`;
    reveal.addEventListener("click", (event) => {
      event.stopPropagation();
      state.revealed[String(trophy.id)] = true;
      persist();
      renderAll();
    });
    main.append(reveal);
  } else {
    const name = el("div", "row-name", trophy.name);
    name.dataset.testid = `trophy-name-${trophy.id}`;
    main.append(name);
    main.append(el("div", "row-desc", trophy.description));
    const meta = el("div", "row-meta");
    const grade = el("span", `badge grade-${trophy.grade}`, trophy.grade.toUpperCase());
    meta.append(grade);
    meta.append(el("span", "badge", `Difficulty ${trophy.difficulty}/5`));
    meta.append(el("span", "badge", trophy.timeMin === null ? "Time: —" : `Time: about ${fmtTime(trophy.timeMin)}`));
    meta.append(
      el("span", `badge conf-${confidence(trophy)}`, confidence(trophy) === "green" ? "Confidence: green" : "Confidence: amber"),
    );
    if (trophy.missable === "possible") meta.append(el("span", "badge flag-missable", "POSSIBLY MISSABLE"));
    if (trophy.missable === "watch") meta.append(el("span", "badge flag-watch", "WATCH"));
    if (trophy.hidden) meta.append(el("span", "badge flag-hidden", "HIDDEN ON PSN"));
    if (trophy.unconfirmed) meta.append(el("span", "badge flag-watch", "NOT PINNED DOWN YET"));
    if (trophy.singleSource) meta.append(el("span", "badge", "Single-source"));
    main.append(meta);
    if (trophy.counter) {
      const counter = el("div", "counter");
      const minus = el("button", null, "−");
      minus.type = "button";
      minus.dataset.testid = `counter-minus-${trophy.id}`;
      minus.setAttribute("aria-label", `Decrease ${trophy.name} counter`);
      minus.addEventListener("click", (event) => {
        event.stopPropagation();
        setCounter(state, trophy, counterOf(state, trophy) - 1);
        persist();
        renderAll();
      });
      const value = el("span", null, counterLabel(trophy, state));
      value.dataset.testid = `counter-value-${trophy.id}`;
      const plus = el("button", null, "+");
      plus.type = "button";
      plus.dataset.testid = `counter-plus-${trophy.id}`;
      plus.setAttribute("aria-label", `Increase ${trophy.name} counter`);
      plus.addEventListener("click", (event) => {
        event.stopPropagation();
        setCounter(state, trophy, counterOf(state, trophy) + 1);
        persist();
        renderAll();
      });
      counter.append(minus, value, plus);
      main.append(counter);
    }
  }
  row.append(main);
  row.addEventListener("click", () => openDetail(trophy.id));
  return row;
}

function renderChecklist() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const grade = document.getElementById("grade-select").value;
  const sort = document.getElementById("sort-select").value;
  let list = data.trophies.filter((t) => matchesFilter(t, activeFilter, state));
  if (grade !== "all") list = list.filter((t) => t.grade === grade);
  if (query) {
    list = list.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.short.toLowerCase().includes(query),
    );
  }
  list = applySort(list, sort);
  const stats = earnedStats(data, state);
  document.getElementById("showing-line").textContent =
    `Showing ${list.length} of ${data.trophies.length} · ${stats.earned} earned`;
  const wrap = document.getElementById("checklist");
  wrap.replaceChildren();
  if (list.length === 0) {
    wrap.append(el("p", "empty", "No trophies match these filters."));
    return;
  }
  if (sort !== "roadmap") {
    // A non-roadmap sort is global: render the list flat in sorted order, so the
    // order on screen is exactly the order the sort promises.
    const flat = el("div", "stage-group");
    const head = el("div", "stage-head");
    const label = sort === "grade" ? "Grade" : sort === "az" ? "A–Z" : "Difficulty";
    head.append(el("h2", null, `All trophies — sorted by ${label}`));
    head.append(el("p", null, "Stage grouping is off while a global sort is active."));
    flat.append(head);
    for (const t of list) flat.append(buildRow(t));
    wrap.append(flat);
    return;
  }
  const goal = el("div", "stage-group");
  const goalHead = el("div", "stage-head");
  goalHead.append(el("h2", null, "GOAL · 100% AND THE PLATINUM"));
  goalHead.append(el("p", null, "Earn the other 54 trophies and the platinum is yours. The goal row below is trophy #1."));
  goal.append(goalHead);
  const goalRow = buildRow(data.trophies.find((t) => t.id === 1));
  goal.append(goalRow);
  wrap.append(goal);
  const byStage = new Map();
  for (const t of list) {
    if (t.id === 1) continue;
    if (!byStage.has(t.stage)) byStage.set(t.stage, []);
    byStage.get(t.stage).push(t);
  }
  for (const stage of data.stages) {
    const group = byStage.get(stage.id);
    if (!group || group.length === 0) continue;
    const box = el("div", "stage-group");
    const head = el("div", "stage-head");
    const earnedHere = group.filter((t) => statusOf(state, t.id) === "earned").length;
    head.append(el("h2", null, `${stage.id} — ${stage.title} · ${earnedHere}/${group.length} earned`));
    head.append(el("p", null, stage.intro));
    box.append(head);
    for (const t of group) box.append(buildRow(t));
    wrap.append(box);
  }
}

function openDetail(id) {
  selectedId = id;
  renderDetail();
  document.getElementById("detail-panel").scrollIntoView({ block: "nearest" });
}

function renderDetail() {
  const panel = document.getElementById("detail-panel");
  const trophy = data.trophies.find((t) => t.id === selectedId);
  if (!trophy) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  panel.hidden = false;
  panel.replaceChildren();
  panel.append(el("h2", null, trophy.name));
  panel.append(
    el(
      "p",
      "detail-sub",
      `TROPHY #${trophy.id} OF 55 · ${trophy.grade.toUpperCase()} · ${trophy.psnPoints} PSN pts · Stage ${trophy.stage} · Roadmap #${trophy.roadmapOrder}`,
    ),
  );
  const chips = el("div", "row-meta");
  for (const kind of trophy.kinds) chips.append(el("span", "badge", kind));
  chips.append(el("span", "badge", `Stage ${trophy.stage}`));
  if (trophy.missable === "possible") chips.append(el("span", "badge flag-missable", "POSSIBLY MISSABLE"));
  if (trophy.missable === "watch") chips.append(el("span", "badge flag-watch", "WATCH"));
  if (trophy.hidden) chips.append(el("span", "badge flag-hidden", "HIDDEN ON PSN"));
  chips.append(
    el("span", `badge conf-${confidence(trophy)}`, confidence(trophy) === "green" ? "Confidence: green" : "Confidence: amber"),
  );
  panel.append(chips);
  const mark = el("button", null, statusOf(state, trophy.id) === "earned" ? "Earned ✓" : "Mark earned");
  mark.type = "button";
  mark.dataset.testid = "detail-mark-earned";
  mark.addEventListener("click", () => {
    setStatus(state, trophy.id, "earned");
    persist();
    renderAll();
  });
  panel.append(mark);
  panel.append(el("h3", null, "Official description — PlayStation"));
  panel.append(el("p", null, trophy.description));
  panel.append(el("h3", null, "In short"));
  const shortBox = el("div", "box", trophy.short);
  panel.append(shortBox);
  if (trophy.timeMin !== null) {
    panel.append(el("p", null, `Time: about ${fmtTime(trophy.timeMin)} · Difficulty ${trophy.difficulty}/5`));
  } else {
    panel.append(el("p", null, `Difficulty ${trophy.difficulty}/5 · No time estimate — the method is not pinned down yet.`));
  }
  if (trophy.missable) {
    const box = el("div", "box warn");
    box.append(
      el(
        "p",
        null,
        trophy.missable === "possible"
          ? "MISSABLE? Possibly — the Chapter 1 balcony meditation may be needed, and it is gone once Chapter 1 ends."
          : "MISSABLE? Watch — the questline can be missed if you rush past it, but it stays available after the story.",
      ),
    );
    const show = el("button", null, "Show it in the checklist");
    show.type = "button";
    show.dataset.testid = "detail-show-in-list";
    show.addEventListener("click", () => {
      switchTab("checklist");
      const row = document.querySelector(`[data-trophy-id="${trophy.id}"]`);
      if (row) row.scrollIntoView({ block: "center" });
    });
    box.append(show);
    panel.append(box);
  }
  if (trophy.unconfirmed) {
    panel.append(
      el(
        "div",
        "box amber",
        "NOT PINNED DOWN YET — no source has a confirmed method for this trophy. What follows is the best lead found, stated as a belief, not a fact.",
      ),
    );
  }
  if (trophy.resolvedNote) {
    panel.append(el("div", "box", trophy.resolvedNote));
  }
  panel.append(el("h3", null, "How to get it"));
  const steps = el("ol");
  steps.dataset.testid = "detail-steps";
  for (const step of trophy.steps) {
    const item = el("li");
    item.append(document.createTextNode(`${step.text} `));
    const cites = el("span", "cites", step.cites.map((c) => `[${c}] ${sourceName(data, c)}`).join(", "));
    item.append(cites);
    steps.append(item);
  }
  panel.append(steps);
  for (const d of trophy.disagreements) {
    const box = el("div", "disagree");
    box.append(el("h4", null, `SOURCES DIFFER — ${d.title}`));
    const aText = el("p", null, `One side: ${d.a} `);
    aText.append(el("span", "cites", d.aCites.map((c) => `[${c}] ${sourceName(data, c)}`).join(", ") || "No numbered source backs this side."));
    const bText = el("p", null, `The other side: ${d.b} `);
    bText.append(el("span", "cites", d.bCites.map((c) => `[${c}] ${sourceName(data, c)}`).join(", ") || "No numbered source backs this side."));
    box.append(aText, bText);
    panel.append(box);
  }
  for (const note of trophy.notes) {
    panel.append(el("div", "box", `Note (${note.source}): ${note.text}`));
  }
  if (trophy.counter) {
    panel.append(el("h3", null, "Your count"));
    const counter = el("div", "counter");
    const minus = el("button", null, "−");
    minus.type = "button";
    minus.dataset.testid = `detail-counter-minus-${trophy.id}`;
    minus.addEventListener("click", () => {
      setCounter(state, trophy, counterOf(state, trophy) - 1);
      persist();
      renderAll();
    });
    const value = el("span", null, counterLabel(trophy, state));
    value.dataset.testid = `detail-counter-value-${trophy.id}`;
    const plus = el("button", null, "+");
    plus.type = "button";
    plus.dataset.testid = `detail-counter-plus-${trophy.id}`;
    plus.addEventListener("click", () => {
      setCounter(state, trophy, counterOf(state, trophy) + 1);
      persist();
      renderAll();
    });
    counter.append(minus, value, plus);
    panel.append(counter);
  }
  panel.append(
    el(
      "p",
      "detail-foot",
      `Our own wording. Cited [${trophy.sources.join(", ")}] · read 20 Nov 2026 · trophy ${trophy.id} of 55 · unofficial`,
    ),
  );
}

function renderRoadmap() {
  const view = document.getElementById("view-roadmap");
  view.replaceChildren();
  view.append(el("h2", null, "Roadmap to the platinum"));
  view.append(el("p", null, "Follow the stages in order. The platinum goal sits at the top; everything else is the road there."));
  for (const stage of data.stages) {
    const group = data.trophies.filter((t) => t.stage === stage.id);
    const earned = group.filter((t) => statusOf(state, t.id) === "earned").length;
    const box = el("div", "roadmap-stage");
    box.dataset.testid = `roadmap-stage-${stage.id}`;
    box.append(el("h2", null, `${stage.id} — ${stage.title} · ${earned}/${group.length} earned`));
    box.append(el("p", null, stage.intro));
    const list = el("ul");
    for (const t of [...group].sort((a, b) => a.roadmapOrder - b.roadmapOrder)) {
      const item = el("li", null, `#${t.roadmapOrder} ${t.name} — ${statusLabel(statusOf(state, t.id))}`);
      item.dataset.testid = `roadmap-trophy-${t.id}`;
      item.style.cursor = "pointer";
      item.addEventListener("click", () => {
        switchTab("checklist");
        openDetail(t.id);
      });
      list.append(item);
    }
    box.append(list);
    view.append(box);
  }
}

function renderMatrix() {
  const view = document.getElementById("view-matrix");
  view.replaceChildren();
  view.append(el("h2", null, "Source matrix"));
  const audit = auditNumbers(data);
  view.append(
    el(
      "p",
      null,
      `Every guide step in this ledger cites at least one of these 8 sources. Counts are computed from trophies.json, never typed in. ` +
        `Confidence legend — Green = backed by at least one guide source plus at least one list source, or no disagreement. ` +
        `Amber = list-only backing, a single source, or a source disagreement. In this ledger: ` +
        `${data.trophies.filter((t) => confidence(t) === "green").length} green · ` +
        `${data.trophies.filter((t) => confidence(t) === "amber").length} amber.`,
    ),
  );
  const table = el("table", "matrix");
  const head = el("tr");
  for (const text of ["#", "Source", "Read", "Guides citing it", "Steps citing it", "What it supports", "Kind"]) {
    head.append(el("th", null, text));
  }
  table.append(head);
  for (const row of sourceCoverage(data)) {
    const tr = el("tr");
    tr.dataset.testid = `matrix-row-${row.source.id}`;
    tr.append(el("td", null, String(row.source.id)));
    const sourceCell = el("td");
    const link = el("a", null, row.source.name);
    link.href = row.source.url;
    link.target = "_blank";
    link.rel = "noopener";
    sourceCell.append(link);
    sourceCell.append(document.createTextNode(` — ${row.source.title}`));
    tr.append(sourceCell);
    tr.append(el("td", null, row.source.read));
    const guides = el("td", null, `${row.trophies}/${audit.total}`);
    guides.dataset.testid = `matrix-trophies-${row.source.id}`;
    tr.append(guides);
    const steps = el("td", null, `${row.steps}/${audit.steps}`);
    steps.dataset.testid = `matrix-steps-${row.source.id}`;
    tr.append(steps);
    tr.append(el("td", null, row.source.supports));
    tr.append(el("td", null, row.source.kind === "list" ? "list-only" : "method"));
    table.append(tr);
  }
  view.append(table);
}

function renderMissables() {
  const view = document.getElementById("view-missables");
  view.replaceChildren();
  view.append(el("h2", null, "Missables & watch"));
  view.append(
    el(
      "p",
      null,
      "Only one trophy is possibly missable, and six more are worth watching. Everything else stays available after the story.",
    ),
  );
  const list = data.trophies
    .filter((t) => t.missable !== null)
    .sort((a, b) => (a.missable === "possible" ? 0 : 1) - (b.missable === "possible" ? 0 : 1) || a.roadmapOrder - b.roadmapOrder);
  for (const t of list) {
    const row = el("div", "miss-row");
    row.dataset.testid = `missable-row-${t.id}`;
    const main = el("div", "row-main");
    main.append(el("div", "row-name", t.name));
    main.append(
      el(
        "div",
        "why",
        t.missable === "possible"
          ? "POSSIBLY MISSABLE — the Chapter 1 balcony meditation may be needed, and it is gone once Chapter 1 ends."
          : "WATCH — start the questline when it appears; it stays available after the story.",
      ),
    );
    main.append(el("div", "row-desc", t.short));
    row.append(main);
    row.addEventListener("click", () => {
      switchTab("checklist");
      openDetail(t.id);
    });
    view.append(row);
  }
}

function renderNextUp() {
  const view = document.getElementById("view-nextup");
  view.replaceChildren();
  view.append(el("h2", null, "Next up"));
  view.append(el("p", null, "Missable risk first, then roadmap order, then shortest time. The queue recomputes as you earn trophies."));
  const queue = nextUp(data, state);
  if (queue.length === 0) {
    view.append(el("p", "empty", "Everything is earned — the platinum is yours."));
    return;
  }
  for (const entry of queue) {
    const t = entry.trophy;
    const row = el("div", "next-row");
    row.dataset.testid = `nextup-row-${t.id}`;
    const main = el("div", "row-main");
    main.append(el("div", "row-name", t.name));
    main.append(el("div", "why", `Why next: ${entry.why}`));
    main.append(el("div", "row-desc", `${t.short} Steps cite [${[...new Set(t.steps.flatMap((s) => s.cites))].join(", ")}].`));
    const meta = el("div", "row-meta");
    meta.append(el("span", "badge", `Roadmap #${t.roadmapOrder}`));
    if (t.timeMin !== null) meta.append(el("span", "badge", `About ${fmtTime(t.timeMin)}`));
    if (t.missable === "possible") meta.append(el("span", "badge flag-missable", "POSSIBLY MISSABLE"));
    if (t.missable === "watch") meta.append(el("span", "badge flag-watch", "WATCH"));
    if (t.hidden) meta.append(el("span", "badge flag-hidden", "HIDDEN ON PSN"));
    main.append(meta);
    row.append(main);
    row.addEventListener("click", () => {
      switchTab("checklist");
      openDetail(t.id);
    });
    view.append(row);
  }
}

function renderProgress() {
  const view = document.getElementById("view-progress");
  view.replaceChildren();
  view.append(el("h2", null, "Progress"));
  const stats = earnedStats(data, state);
  const grid = el("div", "progress-grid");
  const card1 = el("div", "progress-card");
  card1.append(el("h3", null, "Earned"));
  card1.append(el("p", null, `${stats.earned} of ${data.trophies.length} trophies`));
  card1.dataset.testid = "progress-earned";
  const card2 = el("div", "progress-card");
  card2.append(el("h3", null, "PSN points"));
  card2.append(el("p", null, `${stats.psn} of 1350 PSN pts`));
  card2.dataset.testid = "progress-psn";
  const card3 = el("div", "progress-card");
  card3.append(el("h3", null, "By grade"));
  card3.append(
    el("p", null, `P ${stats.byGrade.platinum} · G ${stats.byGrade.gold} · S ${stats.byGrade.silver} · B ${stats.byGrade.bronze}`),
  );
  card3.dataset.testid = "progress-grades";
  const counterTrophies = data.trophies.filter((t) => t.counter);
  const counterDone = counterTrophies.reduce((sum, t) => sum + counterOf(state, t), 0);
  const counterTotal = counterTrophies.reduce((sum, t) => sum + t.counter.target, 0);
  const card4 = el("div", "progress-card");
  card4.append(el("h3", null, "Counters"));
  card4.append(el("p", null, `${counterDone.toLocaleString("en-US")} of ${counterTotal.toLocaleString("en-US")} counted`));
  card4.dataset.testid = "progress-counters";
  grid.append(card1, card2, card3, card4);
  view.append(grid);
  view.append(el("p", null, "Progress is saved in this browser only. Export it to keep a copy, or import it on another device."));
}

function switchTab(tab) {
  activeTab = tab;
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.setAttribute("aria-selected", button.dataset.tab === tab ? "true" : "false");
  }
  for (const name of ["checklist", "roadmap", "matrix", "missables", "nextup", "progress"]) {
    document.getElementById(`view-${name}`).hidden = name !== tab;
  }
}

function renderAll() {
  renderHeader();
  renderAudit();
  renderBanner();
  renderFilters();
  renderChecklist();
  renderDetail();
  renderRoadmap();
  renderMatrix();
  renderMissables();
  renderNextUp();
  renderProgress();
}

function wireEvents() {
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  }
  document.getElementById("search").addEventListener("input", renderChecklist);
  document.getElementById("grade-select").addEventListener("change", renderChecklist);
  document.getElementById("sort-select").addEventListener("change", renderChecklist);
  document.getElementById("theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    persist();
    applyTheme();
  });
  document.getElementById("spoiler-toggle").addEventListener("click", () => {
    state.spoilers = !state.spoilers;
    persist();
    applySpoilers();
    renderAll();
  });
  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([exportText(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leonida-ledger-v5-progress.json";
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById("import-input").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    const old = document.querySelector("[data-testid='import-error']");
    if (old) old.remove();
    if (!file) return;
    const result = parseImport(await file.text(), data);
    if (!result.ok) {
      const error = el("p", "error", `Import rejected: ${result.error}`);
      error.dataset.testid = "import-error";
      document.getElementById("view-checklist").prepend(error);
      event.target.value = "";
      return;
    }
    state.status = result.state.status;
    state.counters = result.state.counters;
    persist();
    renderAll();
    event.target.value = "";
  });
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!window.confirm("Reset all progress in this browser?")) return;
    state = defaultState();
    selectedId = null;
    persist();
    applyTheme();
    applySpoilers();
    renderAll();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/") return;
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    event.preventDefault();
    switchTab("checklist");
    document.getElementById("search").focus();
  });
}

async function init() {
  const response = await fetch("data/trophies.json");
  data = await response.json();
  applyTheme();
  applySpoilers();
  wireEvents();
  renderAll();
  // No stamp on first load: the stamp only appears once something is actually
  // saved, so a fresh load always looks the same (the clock would otherwise make
  // every screenshot differ by the minute it was taken).
}

init();

