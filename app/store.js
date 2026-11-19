// LEONIDA LEDGER v5 — saved progress lives in this browser only (localStorage).
// State shape: { status: {trophyId: "todo"|"doing"|"earned"}, counters: {trophyId: number},
// theme: "light"|"dark", spoilers: boolean, revealed: {trophyId: true} }.
// Export files carry an app tag so a foreign app's export can never be imported by mistake.
export const APP_ID = "leonida-ledger-v5";
export const STORAGE_KEY = "leonida-ledger-v5-state";
export const EXPORT_VERSION = 1;

export function defaultState() {
  return { status: {}, counters: {}, theme: "light", spoilers: true, revealed: {} };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultState();
    const state = defaultState();
    if (parsed.status && typeof parsed.status === "object") {
      // Keep only well-formed statuses; a stale or corrupt value falls back to "todo".
      for (const [key, value] of Object.entries(parsed.status)) {
        if (value === "doing" || value === "earned") state.status[key] = value;
      }
    }
    if (parsed.counters && typeof parsed.counters === "object") {
      for (const [key, value] of Object.entries(parsed.counters)) {
        const number = Number(value);
        if (Number.isFinite(number) && number >= 0) state.counters[key] = Math.round(number);
      }
    }
    if (parsed.theme === "light" || parsed.theme === "dark") state.theme = parsed.theme;
    if (typeof parsed.spoilers === "boolean") state.spoilers = parsed.spoilers;
    if (parsed.revealed && typeof parsed.revealed === "object") state.revealed = parsed.revealed;
    return state;
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function statusOf(state, id) {
  const value = state.status[String(id)];
  return value === "doing" || value === "earned" ? value : "todo";
}

export function cycleStatus(state, id) {
  const key = String(id);
  const current = statusOf(state, id);
  state.status[key] = current === "todo" ? "doing" : current === "doing" ? "earned" : "todo";
  saveState(state);
  return state.status[key];
}

export function setStatus(state, id, value) {
  const key = String(id);
  if (value === "todo") delete state.status[key];
  else state.status[key] = value;
  saveState(state);
}

export function counterOf(state, trophy) {
  if (!trophy.counter) return 0;
  const value = Number(state.counters[String(trophy.id)]);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, trophy.counter.target);
}

export function setCounter(state, trophy, value) {
  if (!trophy.counter) return 0;
  const clamped = Math.max(0, Math.min(Math.round(value), trophy.counter.target));
  state.counters[String(trophy.id)] = clamped;
  saveState(state);
  return clamped;
}

export function exportText(state) {
  return JSON.stringify(
    { app: APP_ID, version: EXPORT_VERSION, status: state.status, counters: state.counters },
    null,
    2,
  );
}

// Validate an imported file. Rejects anything that is not our own export:
// wrong app tag, wrong version, or a status/counter map that does not fit the data.
export function parseImport(text, data) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "That file is not a progress export." };
  if (parsed.app !== APP_ID) {
    return { ok: false, error: "That export is from another app, not LEONIDA LEDGER v5." };
  }
  if (parsed.version !== EXPORT_VERSION) {
    return { ok: false, error: "That export version is not supported." };
  }
  const ids = new Set(data.trophies.map((t) => String(t.id)));
  const status = {};
  if (parsed.status && typeof parsed.status === "object") {
    for (const [key, value] of Object.entries(parsed.status)) {
      if (!ids.has(key)) return { ok: false, error: `Unknown trophy id in export: ${key}.` };
      if (value !== "doing" && value !== "earned") {
        return { ok: false, error: `Bad status for trophy ${key}.` };
      }
      status[key] = value;
    }
  }
  const counters = {};
  if (parsed.counters && typeof parsed.counters === "object") {
    for (const [key, value] of Object.entries(parsed.counters)) {
      const trophy = data.trophies.find((t) => String(t.id) === key);
      if (!trophy || !trophy.counter) return { ok: false, error: `Unknown counter in export: ${key}.` };
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > trophy.counter.target) {
        return { ok: false, error: `Bad counter for trophy ${key}.` };
      }
      counters[key] = Math.round(number);
    }
  }
  return { ok: true, state: { status, counters } };
}
