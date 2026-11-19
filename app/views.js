// LEONIDA LEDGER v5 — pure helpers over trophies.json. Every number the app shows is
// computed here from the data, never hardcoded, so the audit strip, the matrix and the
// filters cannot drift away from the file.
import { counterOf, statusOf } from "./store.js";

export const PSN_BY_GRADE = { platinum: 300, gold: 90, silver: 30, bronze: 15 };
export const GRADE_ORDER = { platinum: 0, gold: 1, silver: 2, bronze: 3 };

export function fmtTime(min) {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min} min`;
  const hours = min / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}

export function fmtMoney(n) {
  return n.toLocaleString("en-US");
}

export function confidence(trophy) {
  if (trophy.sources.length < 2 || trophy.disagreements.length > 0 || trophy.unconfirmed) {
    return "amber";
  }
  return "green";
}

export function gradeCounts(trophies) {
  const out = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of trophies) out[t.grade] += 1;
  return out;
}

export function auditNumbers(data) {
  const trophies = data.trophies;
  const grades = gradeCounts(trophies);
  const steps = trophies.reduce((sum, t) => sum + t.steps.length, 0);
  const citedSteps = trophies.reduce(
    (sum, t) => sum + t.steps.filter((s) => s.cites && s.cites.length > 0).length,
    0,
  );
  return {
    total: trophies.length,
    grades,
    hidden: trophies.filter((t) => t.hidden).length,
    citedTrophies: trophies.filter((t) => t.sources.length > 0).length,
    steps,
    citedSteps,
    psnTotal: trophies.reduce((sum, t) => sum + t.psnPoints, 0),
    possiblyMissable: trophies.filter((t) => t.missable === "possible").length,
    watch: trophies.filter((t) => t.missable === "watch").length,
    unconfirmed: trophies.filter((t) => t.unconfirmed).length,
    singleSource: trophies.filter((t) => t.singleSource).length,
    disagreements: trophies.reduce((sum, t) => sum + t.disagreements.length, 0),
  };
}

export function sourceCoverage(data) {
  return data.sources.map((source) => {
    const trophies = data.trophies.filter((t) => t.sources.includes(source.id)).length;
    const steps = data.trophies.reduce(
      (sum, t) => sum + t.steps.filter((s) => s.cites.includes(source.id)).length,
      0,
    );
    return { source, trophies, steps };
  });
}

export function earnedStats(data, state) {
  let earned = 0;
  let doing = 0;
  let psn = 0;
  const byGrade = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of data.trophies) {
    const status = statusOf(state, t.id);
    if (status === "earned") {
      earned += 1;
      psn += t.psnPoints;
      byGrade[t.grade] += 1;
    } else if (status === "doing") {
      doing += 1;
    }
  }
  return { earned, doing, psn, byGrade };
}

export function kindCount(data, kind) {
  if (kind === "online") return 0;
  return data.trophies.filter((t) => t.kinds.includes(kind)).length;
}

export function filterCounts(data, state) {
  const earned = data.trophies.filter((t) => statusOf(state, t.id) === "earned").length;
  const todo = data.trophies.filter((t) => statusOf(state, t.id) !== "earned").length;
  const quick = data.trophies.filter(
    (t) => statusOf(state, t.id) !== "earned" && t.timeMin !== null && t.timeMin <= 15 && t.difficulty <= 2,
  ).length;
  return {
    all: data.trophies.length,
    story: kindCount(data, "story"),
    missable: data.trophies.filter((t) => t.missable !== null).length,
    collectibles: kindCount(data, "collectibles"),
    activities: kindCount(data, "activities"),
    online: 0,
    side: kindCount(data, "side"),
    feats: kindCount(data, "feats"),
    crime: kindCount(data, "crime"),
    riddles: kindCount(data, "riddles"),
    money: kindCount(data, "money"),
    mystery: kindCount(data, "mystery"),
    unconfirmed: data.trophies.filter((t) => t.unconfirmed).length,
    todo,
    earned,
    quick,
  };
}

export function matchesFilter(trophy, filter, state) {
  switch (filter) {
    case "all":
      return true;
    case "todo":
      return statusOf(state, trophy.id) !== "earned";
    case "earned":
      return statusOf(state, trophy.id) === "earned";
    case "quick":
      return (
        statusOf(state, trophy.id) !== "earned" &&
        trophy.timeMin !== null &&
        trophy.timeMin <= 15 &&
        trophy.difficulty <= 2
      );
    case "missable":
      return trophy.missable !== null;
    case "unconfirmed":
      return trophy.unconfirmed;
    default:
      return trophy.kinds.includes(filter);
  }
}

export function applySort(trophies, sort) {
  const list = [...trophies];
  if (sort === "grade") {
    list.sort(
      (a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || a.roadmapOrder - b.roadmapOrder,
    );
  } else if (sort === "az") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "difficulty") {
    list.sort((a, b) => a.difficulty - b.difficulty || a.roadmapOrder - b.roadmapOrder);
  } else {
    list.sort((a, b) => a.roadmapOrder - b.roadmapOrder);
  }
  return list;
}

// NEXT UP: missable risk first, then roadmap order, then shortest time. The reason
// tells the player why this trophy is next, in plain words.
export function nextUp(data, state) {
  const open = data.trophies.filter((t) => statusOf(state, t.id) !== "earned");
  const risk = (t) => (t.missable === "possible" ? 0 : t.missable === "watch" ? 1 : 2);
  open.sort(
    (a, b) =>
      risk(a) - risk(b) ||
      a.roadmapOrder - b.roadmapOrder ||
      (a.timeMin ?? 999999) - (b.timeMin ?? 999999),
  );
  return open.map((t) => ({ trophy: t, why: nextWhy(t) }));
}

export function nextWhy(t) {
  if (t.missable === "possible") return "Closes after Chapter 1 — do it first";
  if (t.missable === "watch") return "Questline — start it when it appears, it stays open after the story";
  // Unconfirmed before quick-win: a 15-minute guess is not a quick win.
  if (t.unconfirmed) return "Not pinned down yet — check back, do not grind on a guess";
  if (t.timeMin !== null && t.timeMin <= 15) return `Quick win — about ${fmtTime(t.timeMin)}`;
  return "Next in the roadmap";
}

export function firstMissable(data, state) {
  const queue = nextUp(data, state);
  return queue.find((entry) => entry.trophy.missable !== null) ?? null;
}

export function counterLabel(trophy, state) {
  if (!trophy.counter) return "";
  const value = counterOf(state, trophy);
  const unit = trophy.counter.unit ? ` ${trophy.counter.unit}` : "";
  return `${value}/${fmtMoney(trophy.counter.target)}${unit} ${trophy.counter.label}`;
}

export function sourceName(data, id) {
  const source = data.sources.find((s) => s.id === id);
  return source ? source.name : `Source ${id}`;
}
