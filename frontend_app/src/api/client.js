/**
 * Lightweight REST client for the Quality Defect Management frontend.
 * Uses REACT_APP_* environment variables for configuration and supports a
 * safe fallback mode (mock data) when the backend does not yet expose endpoints.
 */

const DEFAULT_TIMEOUT_MS = 20000;

function getEnv(name, fallback = "") {
  const v = process.env[name];
  return (v ?? fallback).toString();
}

function resolveApiBase() {
  // Prefer explicit API base; otherwise fall back to backend URL + "/api"
  const apiBase = getEnv("REACT_APP_API_BASE").trim();
  if (apiBase) return apiBase.replace(/\/+$/, "");

  const backendUrl = getEnv("REACT_APP_BACKEND_URL").trim();
  if (backendUrl) return `${backendUrl.replace(/\/+$/, "")}/api`;

  // Same-origin fallback (useful if proxied)
  return "/api";
}

const API_BASE = resolveApiBase();

/**
 * Try candidate endpoints in order until one responds with 2xx.
 * Useful because backend routes may differ slightly across templates.
 */
async function tryFirstOk(paths, init) {
  let lastErr = null;
  for (const p of paths) {
    try {
      const res = await fetch(`${API_BASE}${p}`, init);
      if (res.ok) return { res, path: p };
      lastErr = new Error(`HTTP ${res.status} for ${p}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No endpoint responded");
}

async function parseJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestJson(method, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await parseJson(res);
    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || res.statusText || "Request failed";
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Domain helpers (best-effort wiring).
 * NOTE: The downloaded OpenAPI spec currently exposes only /api/health/.
 * These helpers attempt common REST patterns and fall back to in-memory mocks
 * so the UI remains functional in the meantime.
 */

const mockStore = {
  defects: [
    {
      id: 1,
      title: "Scratch on painted panel",
      severity: "Major",
      status: "Open",
      owner: "Quality",
      due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      description: "Visible scratch found during final inspection.",
    },
    {
      id: 2,
      title: "Incorrect label applied",
      severity: "Minor",
      status: "In Analysis",
      owner: "Packaging",
      due_date: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
      created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      description: "Wrong SKU label applied to carton batch.",
    },
  ],
  actions: [
    {
      id: 1,
      defect_id: 2,
      title: "Add label verification step",
      owner: "Ops",
      status: "Open",
      due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ],
  analyses: [
    {
      id: 1,
      defect_id: 2,
      whys: [
        "Label printed with wrong template",
        "Template selection not controlled",
        "Work instruction unclear",
        "Training incomplete",
        "No audit for labeling process",
      ],
      root_cause: "Labeling work instruction and controls insufficient",
      containment: "Quarantine affected cartons and re-label",
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ],
};

function nextId(items) {
  return items.reduce((m, it) => Math.max(m, Number(it.id) || 0), 0) + 1;
}

function isOverdue(dueDateStr, status) {
  if (!dueDateStr) return false;
  if (["Closed", "Done", "Verified"].includes(status)) return false;
  const today = new Date();
  const due = new Date(`${dueDateStr}T00:00:00`);
  return due.getTime() < new Date(today.toDateString()).getTime();
}

// PUBLIC_INTERFACE
export async function apiHealthCheck() {
  /** Returns backend health info if available. */
  try {
    const data = await requestJson("GET", "/health/", null);
    return { ok: true, data, apiBase: API_BASE };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), apiBase: API_BASE };
  }
}

// PUBLIC_INTERFACE
export async function listDefects() {
  /** List defects (backend if available, otherwise mock). */
  // Try common endpoints
  const candidates = ["/defects/", "/defect/", "/quality/defects/"];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const data = await parseJson(res);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
  } catch {
    // ignore, fallback below
  }
  return mockStore.defects.map((d) => ({ ...d, overdue: isOverdue(d.due_date, d.status) }));
}

// PUBLIC_INTERFACE
export async function createDefect(payload) {
  /** Create a defect (backend if available, otherwise mock). */
  const candidates = ["/defects/", "/defect/", "/quality/defects/"];
  try {
    const { res } = await tryFirstOk(candidates, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseJson(res);
    return data ?? payload;
  } catch {
    const now = new Date().toISOString();
    const item = {
      id: nextId(mockStore.defects),
      created_at: now,
      status: "Open",
      ...payload,
    };
    mockStore.defects.unshift(item);
    return item;
  }
}

// PUBLIC_INTERFACE
export async function updateDefect(defectId, patch) {
  /** Update a defect (backend if available, otherwise mock). */
  const candidates = [`/defects/${defectId}/`, `/defect/${defectId}/`, `/quality/defects/${defectId}/`];
  try {
    const { res } = await tryFirstOk(candidates, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await parseJson(res);
    return data ?? patch;
  } catch {
    const idx = mockStore.defects.findIndex((d) => String(d.id) === String(defectId));
    if (idx >= 0) {
      mockStore.defects[idx] = { ...mockStore.defects[idx], ...patch };
      return mockStore.defects[idx];
    }
    throw new Error("Defect not found");
  }
}

// PUBLIC_INTERFACE
export async function listActions() {
  /** List corrective actions (backend if available, otherwise mock). */
  const candidates = ["/actions/", "/corrective-actions/", "/quality/actions/"];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const data = await parseJson(res);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
  } catch {
    // ignore
  }
  return mockStore.actions.map((a) => ({ ...a, overdue: isOverdue(a.due_date, a.status) }));
}

// PUBLIC_INTERFACE
export async function createAction(payload) {
  /** Create corrective action (backend if available, otherwise mock). */
  const candidates = ["/actions/", "/corrective-actions/", "/quality/actions/"];
  try {
    const { res } = await tryFirstOk(candidates, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await parseJson(res)) ?? payload;
  } catch {
    const now = new Date().toISOString();
    const item = {
      id: nextId(mockStore.actions),
      created_at: now,
      status: "Open",
      ...payload,
    };
    mockStore.actions.unshift(item);
    return item;
  }
}

// PUBLIC_INTERFACE
export async function updateAction(actionId, patch) {
  /** Update corrective action (backend if available, otherwise mock). */
  const candidates = [
    `/actions/${actionId}/`,
    `/corrective-actions/${actionId}/`,
    `/quality/actions/${actionId}/`,
  ];
  try {
    const { res } = await tryFirstOk(candidates, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return (await parseJson(res)) ?? patch;
  } catch {
    const idx = mockStore.actions.findIndex((a) => String(a.id) === String(actionId));
    if (idx >= 0) {
      mockStore.actions[idx] = { ...mockStore.actions[idx], ...patch };
      return mockStore.actions[idx];
    }
    throw new Error("Action not found");
  }
}

// PUBLIC_INTERFACE
export async function getAnalysisByDefect(defectId) {
  /** Get 5-Why analysis by defect (backend if available, otherwise mock). */
  const candidates = [
    `/analyses/?defect_id=${encodeURIComponent(defectId)}`,
    `/analysis/?defect_id=${encodeURIComponent(defectId)}`,
    `/defects/${defectId}/analysis/`,
  ];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const data = await parseJson(res);
    if (Array.isArray(data)) return data[0] ?? null;
    if (data && Array.isArray(data.results)) return data.results[0] ?? null;
    return data ?? null;
  } catch {
    return mockStore.analyses.find((a) => String(a.defect_id) === String(defectId)) ?? null;
  }
}

// PUBLIC_INTERFACE
export async function upsertAnalysis(defectId, payload) {
  /** Create or update 5-Why analysis (backend if available, otherwise mock). */
  const candidates = [
    "/analyses/",
    "/analysis/",
    `/defects/${defectId}/analysis/`,
  ];

  // Prefer POST to collection; backend may decide upsert.
  try {
    const { res } = await tryFirstOk(candidates, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defect_id: defectId, ...payload }),
    });
    return (await parseJson(res)) ?? payload;
  } catch {
    const existingIdx = mockStore.analyses.findIndex((a) => String(a.defect_id) === String(defectId));
    const now = new Date().toISOString();
    const item = {
      id: existingIdx >= 0 ? mockStore.analyses[existingIdx].id : nextId(mockStore.analyses),
      defect_id: defectId,
      created_at: existingIdx >= 0 ? mockStore.analyses[existingIdx].created_at : now,
      ...payload,
    };
    if (existingIdx >= 0) mockStore.analyses[existingIdx] = item;
    else mockStore.analyses.unshift(item);
    return item;
  }
}

// PUBLIC_INTERFACE
export async function getDashboard() {
  /** Returns computed dashboard metrics (backend if available, otherwise computed from defects/actions). */
  const candidates = ["/dashboard/", "/metrics/", "/quality/dashboard/"];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const data = await parseJson(res);
    if (data) return data;
  } catch {
    // ignore
  }

  const defects = await listDefects();
  const actions = await listActions();

  const openDefects = defects.filter((d) => !["Closed", "Verified"].includes(d.status)).length;
  const overdueDefects = defects.filter((d) => isOverdue(d.due_date, d.status)).length;

  const openActions = actions.filter((a) => !["Closed", "Done", "Verified"].includes(a.status)).length;
  const overdueActions = actions.filter((a) => isOverdue(a.due_date, a.status)).length;

  const byStatus = defects.reduce((acc, d) => {
    const k = d.status || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return {
    openDefects,
    overdueDefects,
    openActions,
    overdueActions,
    defectsByStatus: byStatus,
  };
}

// PUBLIC_INTERFACE
export async function exportCsv() {
  /** Export CSV from backend if available; otherwise generate CSV on client. Returns { filename, blob }. */
  const candidates = ["/export/csv/", "/export/", "/defects/export/", "/quality/export/"];
  try {
    const { res, path } = await tryFirstOk(candidates, { method: "GET" });
    const blob = await res.blob();
    const filename = path.includes("actions") ? "actions.csv" : "defects_export.csv";
    return { filename, blob };
  } catch {
    const defects = await listDefects();
    const header = ["id", "title", "severity", "status", "owner", "due_date", "created_at", "description"];
    const escape = (v) => {
      const s = (v ?? "").toString();
      const needs = /[",\n]/.test(s);
      const inner = s.replace(/"/g, '""');
      return needs ? `"${inner}"` : inner;
    };
    const rows = defects.map((d) => header.map((h) => escape(d[h])).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    return { filename: "defects_export.csv", blob: new Blob([csv], { type: "text/csv;charset=utf-8" }) };
  }
}
