import React, { useEffect, useMemo, useState } from "react";
import { getAnalysisByDefect, listDefects, transitionDefect, upsertAnalysis } from "../api/client";
import { StatusPill } from "../components/ui";

function emptyWhys() {
  return ["", "", "", "", ""];
}

// PUBLIC_INTERFACE
export default function AnalysisPage() {
  /** Capture 5-Why analysis for a defect and automatically drive workflow. */
  const [defects, setDefects] = useState([]);
  const [selectedDefectId, setSelectedDefectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const [analysis, setAnalysis] = useState({
    whys: emptyWhys(),
    root_cause: "",
    containment: "",
  });

  const selectedDefect = useMemo(
    () => defects.find((d) => String(d.id) === String(selectedDefectId)) || null,
    [defects, selectedDefectId]
  );

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await listDefects();
      setDefects(d);
      const initial = selectedDefectId || (d[0] ? String(d[0].id) : "");
      setSelectedDefectId(initial);
      if (initial) {
        const existing = await getAnalysisByDefect(initial);
        if (existing) {
          setAnalysis({
            whys: Array.isArray(existing.whys) ? [...existing.whys, "", "", "", "", ""].slice(0, 5) : emptyWhys(),
            root_cause: existing.root_cause || "",
            containment: existing.containment || "",
          });
        } else {
          setAnalysis({ whys: emptyWhys(), root_cause: "", containment: "" });
        }
      }
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

  const loadForDefect = async (id) => {
    setSelectedDefectId(id);
    setSavedMsg("");
    setError("");
    if (!id) return;

    try {
      const existing = await getAnalysisByDefect(id);
      if (existing) {
        setAnalysis({
          whys: Array.isArray(existing.whys) ? [...existing.whys, "", "", "", "", ""].slice(0, 5) : emptyWhys(),
          root_cause: existing.root_cause || "",
          containment: existing.containment || "",
        });
      } else {
        setAnalysis({ whys: emptyWhys(), root_cause: "", containment: "" });
      }
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    setSavedMsg("");

    try {
      if (!selectedDefectId) throw new Error("Select a defect first.");

      // Acceptance criteria: root cause must be filled for workflow progression.
      if (!analysis.root_cause.trim()) {
        throw new Error("Root cause statement is required. Please fill it before saving.");
      }

      const payload = {
        whys: analysis.whys.map((w) => w.trim()),
        root_cause: analysis.root_cause.trim(),
        containment: analysis.containment.trim(),
        created_by: "ui",
      };

      await upsertAnalysis(selectedDefectId, payload);

      // Acceptance criteria: automatically move defect to "In Analysis" after saving 5-Why.
      // Backend already does this when defect is NEW/TRIAGED; we also attempt it for robustness.
      if (selectedDefect && /(open|new|triaged)/i.test(selectedDefect.status || "")) {
        await transitionDefect(selectedDefect.id, "IN_ANALYSIS", { actor: "ui", message: "Auto move to IN_ANALYSIS" });
      }

      setSavedMsg("Root cause analysis saved successfully. Defect moved to In Analysis (if applicable).");
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const onAdvanceToActions = async () => {
    setError("");
    setSavedMsg("");
    try {
      if (!selectedDefectId) throw new Error("Select a defect first.");
      if (!analysis.root_cause.trim()) {
        throw new Error('Root cause is required before moving to "Actions In Progress".');
      }
      await transitionDefect(selectedDefectId, "ACTIONS_IN_PROGRESS", { actor: "ui", message: "Move to actions stage" });
      setSavedMsg("Defect moved to Actions In Progress.");
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Root Cause Analysis (5-Why)</h1>
          <p>Perform Root Cause Analysis (required before progressing into actions/closure).</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {savedMsg ? (
        <div className="card" style={{ borderColor: "rgba(16,185,129,0.28)", background: "rgba(16,185,129,0.06)" }}>
          {savedMsg}
        </div>
      ) : null}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>Select defect</strong>
          <div className="spacer" />
          {selectedDefect ? (
            <span className="pill">
              <span className="note">Status:</span> <StatusPill value={selectedDefect.status} />
            </span>
          ) : null}
        </div>

        {loading ? <div className="note">Loading…</div> : null}

        <div className="grid2">
          <div>
            <label className="label" htmlFor="defect">
              Defect
            </label>
            <select id="defect" className="select" value={selectedDefectId} onChange={(e) => loadForDefect(e.target.value)}>
              {defects.length === 0 ? <option value="">No defects available</option> : null}
              {defects.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  #{d.id} — {d.title}
                </option>
              ))}
            </select>
            <div className="note" style={{ marginTop: 8 }}>
              After saving analysis, the defect is automatically moved to <strong>In Analysis</strong>.
            </div>
          </div>

          <div>
            <label className="label">Defect description</label>
            <div className="card" style={{ padding: 12, boxShadow: "none", background: "rgba(249,250,251,0.8)" }}>
              <div style={{ fontWeight: 700 }}>{selectedDefect?.title || "—"}</div>
              <div className="note">{selectedDefect?.description || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>5 Whys</strong>
          <div className="spacer" />
          <span className="note">Keep each why concise; ensure each answer leads logically to the next.</span>
        </div>

        <div className="grid2">
          {analysis.whys.map((v, idx) => (
            <div key={idx}>
              <label className="label" htmlFor={`why-${idx}`}>
                Why {idx + 1}
              </label>
              <input
                id={`why-${idx}`}
                className="input"
                value={v}
                onChange={(e) =>
                  setAnalysis((a) => {
                    const whys = [...a.whys];
                    whys[idx] = e.target.value;
                    return { ...a, whys };
                  })
                }
                placeholder={idx === 0 ? "Why did the defect occur?" : "Why did that happen?"}
              />
            </div>
          ))}
        </div>

        <div className="grid2" style={{ marginTop: 10 }}>
          <div>
            <label className="label" htmlFor="containment">
              Containment (immediate)
            </label>
            <textarea
              id="containment"
              className="textarea"
              rows={4}
              value={analysis.containment}
              onChange={(e) => setAnalysis((a) => ({ ...a, containment: e.target.value }))}
              placeholder="Immediate containment actions (quarantine, rework, sorting, stop-ship...)"
            />
          </div>
          <div>
            <label className="label" htmlFor="root">
              Root cause statement (required)
            </label>
            <textarea
              id="root"
              className="textarea"
              rows={4}
              value={analysis.root_cause}
              onChange={(e) => setAnalysis((a) => ({ ...a, root_cause: e.target.value }))}
              placeholder="Clear root cause statement (system/process cause, not symptom)."
            />
            <div className="note" style={{ marginTop: 8 }}>
              Root cause must be filled before the defect can move into actions/closure.
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btnPrimary" type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save root cause"}
          </button>
          <button className="btn" type="button" onClick={onAdvanceToActions} disabled={!selectedDefectId}>
            Move defect to Actions In Progress
          </button>
          <div className="spacer" />
          <span className="note">
            Next: create actions in <strong>Actions</strong>, complete them, then close the defect in <strong>Defects</strong>.
          </span>
        </div>
      </div>
    </div>
  );
}
