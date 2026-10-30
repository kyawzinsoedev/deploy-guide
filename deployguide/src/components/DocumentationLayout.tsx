"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const preferenceKey = "deployguide:navigation:collapsed:v1";

export function DocumentationLayout({
  children,
  sidebar,
  search,
  mobileOpen,
  onCloseMobile,
}: {
  children: ReactNode;
  sidebar: ReactNode;
  search: ReactNode;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);
  const contentId = useId();

  useEffect(() => {
    const query = window.matchMedia("(max-width: 780px)");
    const updateViewport = () => setMobile(query.matches);
    updateViewport();
    query.addEventListener("change", updateViewport);
    try {
      setCollapsed(localStorage.getItem(preferenceKey) === "true");
    } catch {
      // Navigation still works when local preferences cannot be read.
    }
    setReady(true);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(preferenceKey, String(next));
    } catch {
      // Keep this visit usable even when browser storage is unavailable.
    }
  }

  const hidden = mobile && !mobileOpen;

  return (
    <div
      className="app-layout"
      data-sidebar-collapsed={collapsed}
      data-navigation-ready={ready}
    >
      <aside
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Documentation navigation"
        inert={hidden}
      >
        <div className="sidebar-header">
          {search}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse to icons"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <div
          id={contentId}
          className="sidebar-content"
          inert={hidden}
          aria-hidden={hidden}
        >
          {sidebar}
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={onCloseMobile}
        />
      )}
      {children}
    </div>
  );
}
