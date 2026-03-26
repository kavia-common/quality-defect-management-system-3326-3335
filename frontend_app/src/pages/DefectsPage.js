import React, { useEffect, useMemo, useState } from "react";
import { createDefect, listDefects, updateDefect } from "../api/client";
import { OverduePill, StatusPill, formatDate } from "../components/ui";

const SEVERITIES = ["Minor", "Major", "Critical"];
const STATUSES = ["Open", "In Analysis", "Action Assigned", "Closed"];

// PUBLIC_INTERFACE
export default function DefectsPage() {
  /** Defect workflow: create, view, and update status/owner/due date. */
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState({ q: "", status: "All" });

  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "Major",
    owner: "Quality",
    due_date: "",
  });

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listDefects();
      setDefects(data);
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
          String(d.id).includes(q)
        );
      });
  }, [defects, filters]);

  const onCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      await createDefect(form);
      setForm({ title: "", description: "", severity: "Major", owner: "Quality", due_date: "" });
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const onQuickUpdate = async (id, patch) => {
    setError("");
    try {
      await updateDefect(id, patch);
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
          <p>Capture defects, track ownership, due dates, and workflow status.</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>New defect</strong>
          <div className="spacer" />
          <span className="note">All fields are stored via REST when available.</span>
        </div>

        <form onSubmit={onCreate}>
          <div className="grid2">
            <div>
              <label className="label" htmlFor="title">Title</label>
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
                <label className="label" htmlFor="severity">Severity</label>
                <select
                  id="severity"
                  className="select"
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="due">Due date</label>
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
              <label className="label" htmlFor="owner">Owner</label>
              <input
                id="owner"
                className="input"
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder="Quality / Production / Supplier"
              />
            </div>
            <div>
              <label className="label" htmlFor="desc">Description</label>
              <input
                id="desc"
                className="input"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description (symptoms, location, batch...)"
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btnPrimary" type="submit">Create defect</button>
            <span className="note">
              Tip: After creation, move to <strong>In Analysis</strong> to begin 5-Why.
            </span>
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
            placeholder="Search ID/title/description…"
            aria-label="Search defects"
          />
          <select
            className="select"
            style={{ maxWidth: 200 }}
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button className="btn" onClick={refresh} type="button">Refresh</button>
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
                <th style={{ width: 220 }}>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="note">No defects match your filters.</td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{d.title}</div>
                      <div className="note">{d.description}</div>
                    </td>
                    <td>
                      <span className={d.severity === "Critical" ? "pill pillRed" : d.severity === "Major" ? "pill pillAmber" : "pill"}>
                        {d.severity || "—"}
                      </span>
                    </td>
                    <td><StatusPill value={d.status} /></td>
                    <td>{d.owner || "—"}</td>
                    <td>{formatDate(d.due_date)}</td>
                    <td><OverduePill dueDate={d.due_date} status={d.status} /></td>
                    <td>
                      <div className="row">
                        <select
                          className="select"
                          value={d.status || "Open"}
                          onChange={(e) => onQuickUpdate(d.id, { status: e.target.value })}
                          aria-label={`Set status for defect ${d.id}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => onQuickUpdate(d.id, { status: "Closed" })}
                          title="Close defect"
                        >
                          Close
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="note" style={{ marginTop: 10 }}>
          Recommended flow: <strong>Open</strong> → <strong>In Analysis</strong> (capture 5-Why) →
          <strong> Action Assigned</strong> (create corrective actions) → <strong>Closed</strong>.
        </div>
      </div>
    </div>
  );
}
