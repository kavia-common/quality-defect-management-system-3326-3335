import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import DashboardPage from "./pages/DashboardPage";
import DefectsPage from "./pages/DefectsPage";
import ActionsPage from "./pages/ActionsPage";
import AnalysisPage from "./pages/AnalysisPage";
import ExportPage from "./pages/ExportPage";
import "./App.css";

// PUBLIC_INTERFACE
function App() {
  /** Application routes and layout. */
  return (
    <Routes>
      <Route path="/" element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="defects" element={<DefectsPage />} />
        <Route path="actions" element={<ActionsPage />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
