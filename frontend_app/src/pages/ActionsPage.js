import React, { useEffect, useMemo, useState } from "react";
import { createAction, listActions, listDefects, updateAction } from "../api/client";
import { OverduePill, StatusPill, formatDate } from "../components/ui";

const ACTION_STATUSES = ["Open", "In Progress", "Blocked", "Done", "Cancelled"];

// PUBLIC_INTERFACE
export default function ActionsPage() {
  /** Track corrective actions, ownership, due dates, completion, and overdue escalation. */
  const [actions, setActions] = useState([]);
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filters, setFilters] = useState({ q: "", status: "All" });

  const [form, setForm] = useState({
    defect_id: "",
    title: "",
    owner: "",
    due_date: "",
    status: "Open",
  });

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [a, d] = await Promise.all([listActions(), listDefects()]);
      setActions(a);
      setDefects(d);
      if (!form.defect_id && d.length) setForm((f) => ({ ...f, defect_id: String(d[0].id) }));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return actions
      .filter((a) => (filters.status === "All" ? true : (a.status || "").toLowerCase() === filters.status.toLowerCase()))
      .filter((a) => {
        if (!q) return true;
        return (
          (a.title || "").toLowerCase().includes(q) ||
          (a.owner || "").toLowerCase().includes(q) ||
          String(a.id).includes(q) ||
          String(a.defect_id || "").includes(q)
        );
      });
  }, [actions, filters]);

  const onCreate = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.title.trim()) {
      setError("Action title is required.");
      return;
    }
    if (!form.defect_id) {
      setError("Select a related defect.");
      return;
    }
    if (form.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date)) {
      setError("Due date must be in YYYY-MM-DD format.");
      return;
    }

    try {
      await createAction({
        ...form,
        defect_id: Number(form.defect_id),
      });
      setForm((f) => ({ ...f, title: "", owner: "", due_date: "", status: "Open" }));
      setSuccess("Corrective action created successfully.");
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const onQuickUpdate = async (id, patch) => {
    setError("");
    setSuccess("");
    try {
      await updateAction(id, patch);
      setSuccess("Action updated.");
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Actions</h1>
          <p>Assign and track corrective actions tied to defects, including overdue days and completion.</p>
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
          <strong>New corrective action</strong>
          <div className="spacer" />
          <span className="note">At least one completed action is required before closing a defect.</span>
        </div>

        <form onSubmit={onCreate}>
          <div className="grid3">
            <div>
              <label className="label" htmlFor="defect">
                Defect
              </label>
              <select
                id="defect"
                className="select"
                value={form.defect_id}
                onChange={(e) => setForm((f) => ({ ...f, defect_id: e.target.value }))}
              >
                {defects.length === 0 ? <option value="">No defects available</option> : null}
                {defects.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    #{d.id} — {d.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="title">
                Action title
              </label>
              <input
                id="title"
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Add label verification step"
              />
            </div>

            <div>
              <label className="label" htmlFor="owner">
                Owner
              </label>
              <input
                id="owner"
                className="input"
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder="Ops / Engineering / Supplier"
              />
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 10 }}>
            <div>
              <label className="label" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                className="select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {ACTION_STATUSES.map((s) => (
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
            <div className="row" style={{ alignItems: "end" }}>
              <button className="btn btnPrimary" type="submit">
                Create action
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>Actions list</strong>
          <div className="spacer" />
          <input
            className="input"
            style={{ maxWidth: 260 }}
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search ID/title/owner/defect…"
            aria-label="Search actions"
          />
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            aria-label="Filter actions by status"
          >
            <option value="All">All statuses</option>
            {ACTION_STATUSES.map((s) => (
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

        <div className="tableWrap" role="region" aria-label="Actions table">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Defect</th>
                <th>Title</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Due</th>
                <th>Overdue</th>
                <th style={{ width: 260 }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="note">
                    No actions match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} style={{ background: a.overdue ? "rgba(239,68,68,0.04)" : undefined }}>
                    <td>{a.id}</td>
                    <td className="note">#{a.defect_id ?? "—"}</td>
                    <td style={{ fontWeight: 700 }}>{a.title}</td>
                    <td>{a.owner || "—"}</td>
                    <td>
                      <StatusPill value={a.status} />
                    </td>
                    <td>{formatDate(a.due_date)}</td>
                    <td>
                      <OverduePill dueDate={a.due_date} status={a.status} />
                    </td>
                    <td>
                      <div className="row">
                        <select
                          className="select"
                          value={a.status || "Open"}
                          onChange={(e) => onQuickUpdate(a.id, { status: e.target.value })}
                          aria-label={`Set status for action ${a.id}`}
                        >
                          {ACTION_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button className="btn" type="button" onClick={() => onQuickUpdate(a.id, { status: "Done" })}>
                          Mark completed
                        </button>
                      </div>
                      <div className="note" style={{ marginTop: 6 }}>
                        When all actions for a defect are completed, the backend auto-advances the defect toward verification.
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
