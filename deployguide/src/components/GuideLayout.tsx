"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const preferenceKey = "deployguide:architecture:collapsed:v1";

export function GuideLayout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [ready, setReady] = useState(false);
  const panelId = useId();

  useEffect(() => {
    let initial = window.matchMedia("(max-width: 1024px)").matches;
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (saved === "true" || saved === "false") initial = saved === "true";
    } catch {
      // The panel remains usable when browser storage is unavailable.
    }
    setCollapsed(initial);
    setReady(true);
  }, []);

  function togglePanel() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(preferenceKey, String(next));
    } catch {
      // Keep the preference for this mounted workspace without requiring storage.
    }
  }

  return (
    <div
      className="guide-layout"
      data-architecture-collapsed={collapsed}
      data-ready={ready}
    >
      <div className="guide-column">{children}</div>
      <aside className="guide-aside" aria-label="Your architecture">
        <div className="architecture-panel-header">
          <span className="nav-heading">YOUR ARCHITECTURE</span>
          <button
            type="button"
            className="architecture-toggle"
            onClick={togglePanel}
            aria-expanded={!collapsed}
            aria-controls={panelId}
            aria-label={
              collapsed
                ? "Expand architecture panel"
                : "Collapse architecture panel"
            }
            title={collapsed ? "Show architecture" : "Hide architecture"}
          >
            {collapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
        <span className="architecture-rail-label" aria-hidden="true">
          Architecture
        </span>
        <div
          id={panelId}
          className="architecture-panel-body"
          inert={collapsed}
          aria-hidden={collapsed}
        >
          <div className="architecture-panel-clip">
            <div className="architecture-panel-content">{sidebar}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
