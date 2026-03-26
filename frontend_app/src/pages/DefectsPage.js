import React, { useEffect, useMemo, useState } from "react";
import {
  computeActionProgressForDefect,
  createDefect,
  listActions,
  listDefects,
  transitionDefect,
  updateDefect,
} from "../api/client";
import { OverduePill, StatusPill, formatDate } from "../components/ui";

const SEVERITIES = ["Minor", "Major", "Critical"];
const DEFECT_TYPES = ["Dimensional", "Cosmetic", "Functional", "Labeling", "Packaging", "Other"];

// UI workflow labels (kept simple), but backend enforcement uses status codes.
const UI_STATUSES = ["Open", "In Analysis", "Actions In Progress", "Closed"];

const UI_TO_CODE = {
  Open: "NEW",
  "In Analysis": "IN_ANALYSIS",
  "Actions In Progress": "ACTIONS_IN_PROGRESS",
  Closed: "CLOSED",
};

// PUBLIC_INTERFACE
export default function DefectsPage() {
  /** Defect workflow: create, view, and update status/owner/due date with acceptance-criteria enforcement. */
  const [defects, setDefects] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filters, setFilters] = useState({ q: "", status: "All" });

  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "Major",
    owner: "Quality",
    due_date: "",

    // Acceptance-required defect logging fields
    part_number: "",
    defect_type: "Cosmetic",
    quantity_affected: "",
    production_line: "",
    shift: "",
  });

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [d, a] = await Promise.all([listDefects(), listActions()]);
      setDefects(d);
      setActions(a);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return defects
      .filter((d) => (filters.status === "All" ? true : d.status === filters.status))
      .filter((d) => {
        if (!q) return true;
        return (
          (d.title || "").toLowerCase().includes(q) ||
          (d.description || "").toLowerCase().includes(q) ||
          (d.part_number || "").toLowerCase().includes(q) ||
          String(d.id).includes(q)
        );
      });
  }, [defects, filters]);

  const hasRootCause = (defect) => {
    const rc = defect?.five_why?.root_cause || defect?.root_cause || "";
    return !!String(rc).trim();
  };

  const getActionProgress = (defectId) => computeActionProgressForDefect(defectId, actions);

  const canClose = (defect) => {
    const { done, total } = getActionProgress(defect.id);
    return total > 0 && done === total;
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation to avoid API 400s
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (form.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date)) {
      setError("Due date must be in YYYY-MM-DD format.");
      return;
    }
    if (form.quantity_affected && Number.isNaN(Number(form.quantity_affected))) {
      setError("Quantity affected must be a number.");
      return;
    }
    if (form.quantity_affected && Number(form.quantity_affected) < 0) {
      setError("Quantity affected must be >= 0.");
      return;
    }

    try {
      await createDefect({
        title: form.title,
        description: form.description,
        severity: form.severity,
        owner: form.owner,
        due_date: form.due_date,

        // Additional fields (persisted when backend is available; still shown in UI in fallback mode)
        part_number: form.part_number,
        defect_type: form.defect_type,
        quantity_affected: form.quantity_affected ? Number(form.quantity_affected) : null,
        production_line: form.production_line,
        shift: form.shift,
      });

      setForm({
        title: "",
        description: "",
        severity: "Major",
        owner: "Quality",
        due_date: "",
        part_number: "",
        defect_type: "Cosmetic",
        quantity_affected: "",
        production_line: "",
        shift: "",
      });
      setSuccess("Defect created successfully.");
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  };



  const onSetWorkflow = async (defect, uiStatus) => {
    setError("");
    setSuccess("");

    // Frontend gating for immediate UX (backend is source of truth).
    if (uiStatus === "In Analysis" && !hasRootCause(defect)) {
      setError('Root Cause Analysis is required before moving to "In Analysis". Save root cause first.');
      return;
    }
    if (uiStatus === "Actions In Progress") {
      const { total } = getActionProgress(defect.id);
      if (total <= 0) {
        setError('At least one corrective action is required before moving to "Actions In Progress".');
        return;
      }
    }
    if (uiStatus === "Closed" && !canClose(defect)) {
      const { done, total } = getActionProgress(defect.id);
      setError(`Cannot close defect until at least one action exists and all are completed. (${done}/${total} done)`);
      return;
    }

    const code = UI_TO_CODE[uiStatus] || "NEW";
    try {
      await transitionDefect(defect.id, code, { actor: "ui", message: `Set status to ${code}` });
      setSuccess(`Defect moved to ${uiStatus}.`);
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Defects</h1>
          <p>
            Capture defects, log production details, perform Root Cause Analysis, assign actions, track overdue, and close
            with strict workflow enforcement.
          </p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {success ? (
        <div className="card" style={{ borderColor: "rgba(16,185,129,0.28)", background: "rgba(16,185,129,0.06)" }}>
          {success}
        </div>
      ) : null}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>New defect</strong>
          <div className="spacer" />
          <span className="note">Validation prevents common API 400 errors (required fields, date format).</span>
        </div>

        <form onSubmit={onCreate}>
          <div className="grid2">
            <div>
              <label className="label" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Scratch on painted panel"
              />
            </div>

            <div className="grid2" style={{ gap: 10 }}>
              <div>
                <label className="label" htmlFor="severity">
                  Severity
                </label>
                <select
                  id="severity"
                  className="select"
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="due">
                  Due date (YYYY-MM-DD)
                </label>
                <input
                  id="due"
                  type="date"
                  className="input"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 10 }}>
            <div>
              <label className="label" htmlFor="owner">
                Owner
              </label>
              <input
                id="owner"
                className="input"
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder="Quality / Production / Supplier"
              />
            </div>
            <div>
              <label className="label" htmlFor="desc">
                Description
              </label>
              <input
                id="desc"
                className="input"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description (symptoms, location, batch...)"
              />
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 10 }}>
            <div>
              <label className="label" htmlFor="part_number">
                Part number
              </label>
              <input
                id="part_number"
                className="input"
                value={form.part_number}
                onChange={(e) => setForm((f) => ({ ...f, part_number: e.target.value }))}
                placeholder="e.g., PN-12345"
              />
            </div>
            <div>
              <label className="label" htmlFor="defect_type">
                Defect type
              </label>
              <select
                id="defect_type"
                className="select"
                value={form.defect_type}
                onChange={(e) => setForm((f) => ({ ...f, defect_type: e.target.value }))}
              >
                {DEFECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="qty">
                Quantity affected
              </label>
              <input
                id="qty"
                className="input"
                inputMode="numeric"
                value={form.quantity_affected}
                onChange={(e) => setForm((f) => ({ ...f, quantity_affected: e.target.value }))}
                placeholder="e.g., 12"
              />
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 10 }}>
            <div>
              <label className="label" htmlFor="line">
                Production line
              </label>
              <input
                id="line"
                className="input"
                value={form.production_line}
                onChange={(e) => setForm((f) => ({ ...f, production_line: e.target.value }))}
                placeholder="e.g., Line 2"
              />
            </div>
            <div>
              <label className="label" htmlFor="shift">
                Shift
              </label>
              <input
                id="shift"
                className="input"
                value={form.shift}
                onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}
                placeholder="e.g., A / B / Night"
              />
            </div>
            <div className="row" style={{ alignItems: "end" }}>
              <button className="btn btnPrimary" type="submit">
                Create defect
              </button>
            </div>
          </div>

          <div className="note" style={{ marginTop: 10 }}>
            Workflow: <strong>Open</strong> → <strong>In Analysis</strong> (Root Cause Analysis required) →{" "}
            <strong>Actions In Progress</strong> (≥1 action) → <strong>Closed</strong> (all actions completed).
          </div>
        </form>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>Defect list</strong>
          <div className="spacer" />
          <input
            className="input"
            style={{ maxWidth: 260 }}
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search ID/title/part/description…"
            aria-label="Search defects"
          />
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {UI_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button className="btn" onClick={refresh} type="button">
            Refresh
          </button>
        </div>

        {loading ? <div className="note">Loading…</div> : null}

        <div className="tableWrap" role="region" aria-label="Defects table">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Overdue</th>
                <th>Root cause</th>
                <th>Actions</th>
                <th>Part / Line</th>
                <th style={{ width: 260 }}>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="note">
                    No defects match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const { done, total } = getActionProgress(d.id);
                  const rootOk = hasRootCause(d);
                  const canCloseNow = canClose(d);

                  return (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{d.title}</div>
                        <div className="note">{d.description}</div>
                      </td>
                      <td>
                        <span
                          className={
                            d.severity === "Critical" ? "pill pillRed" : d.severity === "Major" ? "pill pillAmber" : "pill"
                          }
                        >
                          {d.severity || "—"}
                        </span>
                      </td>
                      <td>
                        <StatusPill value={d.status} />
                      </td>
                      <td>{d.assigned_to || d.owner || "—"}</td>
                      <td>{formatDate(d.due_date)}</td>
                      <td>
                        <OverduePill dueDate={d.due_date} status={d.status} />
                      </td>
                      <td>
                        <span className={rootOk ? "pill pillGreen" : "pill pillRed"}>{rootOk ? "Complete" : "Missing"}</span>
                      </td>
                      <td>
                        <span className={total > 0 && done === total ? "pill pillGreen" : "pill pillAmber"}>
                          {done}/{total} completed
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{d.part_number || "—"}</div>
                        <div className="note">
                          {d.production_line || "—"} {d.shift ? `• ${d.shift}` : ""}
                        </div>
                      </td>
                      <td>
                        <div className="row">
                          <select
                            className="select"
                            value={d.status || "Open"}
                            onChange={(e) => onSetWorkflow(d, e.target.value)}
                            aria-label={`Set status for defect ${d.id}`}
                          >
                            {UI_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>

                          <button
                            className="btn"
                            type="button"
                            onClick={() => onSetWorkflow(d, "Closed")}
                            disabled={!canCloseNow}
                            title={
                              canCloseNow
                                ? "Close defect"
                                : "Cannot close until at least one corrective action exists and all are completed"
                            }
                          >
                            Close
                          </button>
                        </div>

                        {!rootOk ? (
                          <div className="note" style={{ marginTop: 6 }}>
                            Blocked: add Root Cause Analysis in <strong>Analysis</strong>.
                          </div>
                        ) : null}
                        {rootOk && total === 0 ? (
                          <div className="note" style={{ marginTop: 6 }}>
                            Next: add corrective actions in <strong>Actions</strong>.
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="note" style={{ marginTop: 10 }}>
          Enforcement summary: Root Cause Analysis required before moving to <strong>In Analysis</strong>; at least one action is
          required before <strong>Actions In Progress</strong>; closure requires all actions completed.
        </div>
      </div>
    </div>
  );
}
