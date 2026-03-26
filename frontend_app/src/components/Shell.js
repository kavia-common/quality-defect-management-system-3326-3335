import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { apiHealthCheck } from "../api/client";

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `navLink ${isActive ? "navLinkActive" : ""}`}
      end={to === "/"}
    >
      <span className="navIcon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

// PUBLIC_INTERFACE
export default function Shell() {
  /** App chrome: topbar, sidebar navigation, and outlet for routes. */
  const location = useLocation();
  const [health, setHealth] = useState({ ok: null, apiBase: "" });

  useEffect(() => {
    let mounted = true;
    apiHealthCheck().then((h) => mounted && setHealth(h));
    return () => {
      mounted = false;
    };
  }, []);

  const section = useMemo(() => {
    if (location.pathname.startsWith("/defects")) return "Defects";
    if (location.pathname.startsWith("/actions")) return "Actions";
    if (location.pathname.startsWith("/analysis")) return "Analysis";
    if (location.pathname.startsWith("/export")) return "Export";
    return "Dashboard";
  }, [location.pathname]);

  return (
    <div className="App shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark" title="Quality Defect Management">
            Q
          </div>
          <div className="brandTitle">
            <strong>Quality Defect Management</strong>
            <span>Ocean Professional</span>
          </div>
        </div>

        <div className="topbarRight">
          <span className="badge" title="Current section">
            {section}
          </span>
          <span
            className="badge"
            title={`API base: ${health.apiBase || ""}${health.ok === false ? ` • error: ${health.error || ""}` : ""}`}
            style={{ borderColor: health.ok ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)" }}
          >
            API: {health.ok ? "Connected" : "Disconnected"}
          </span>
        </div>
      </header>

      <div className="contentGrid">
        <aside className="sidebar" aria-label="Primary navigation">
          <div className="navSectionTitle">Navigate</div>
          <NavItem to="/" icon="D" label="Dashboard" />
          <NavItem to="/defects" icon="Df" label="Defects" />
          <NavItem to="/actions" icon="Ac" label="Actions" />
          <NavItem to="/analysis" icon="5W" label="Root Cause Analysis" />
          <NavItem to="/export" icon="⤓" label="Export (CSV)" />

          <div className="navSectionTitle">Notes</div>
          <div className="card" style={{ padding: 12 }}>
            <div className="note">
              This UI is backend-driven (no mock data). Ensure <code>REACT_APP_API_BASE</code> points to the Django API,
              e.g. <code>https://…:3001/api</code>.
            </div>
          </div>
        </aside>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
