"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  Globe2,
  HardDrive,
  Monitor,
  Network,
  Server,
} from "lucide-react";
import type { DeploymentMode } from "@/lib/types";
const details = {
  browser:
    "A visitor enters your domain. Their browser asks DNS for the server’s IP address, then sends an HTTP request.",
  dns: "DNS maps the domain to an IP address. It gives directions; the actual web request goes directly to your server.",
  nginx:
    "Nginx receives public traffic on ports 80 and 443. It handles HTTPS and chooses how to serve each request.",
  output:
    "Nginx reads prebuilt HTML, CSS and JavaScript from disk. No application process needs to stay running.",
  node: "Nginx forwards the request to a Node application on 127.0.0.1. systemd keeps that private application process running.",
  php: "Nginx sends PHP work through a local socket to PHP-FPM. The document root is Laravel’s public directory.",
};
export function Architecture({
  mode = "static",
  compact = false,
  windows = false,
}: {
  mode?: DeploymentMode;
  compact?: boolean;
  windows?: boolean;
}) {
  const [active, setActive] = useState<keyof typeof details>("nginx");
  const descriptions = windows
    ? {
        ...details,
        nginx:
          "IIS receives public traffic on ports 80 and 443, handles HTTPS, and selects a site using its host binding.",
        output:
          "IIS serves the public HTML, CSS and JavaScript files directly.",
        node: "IIS ARR proxies to the Node service on loopback. Windows Service Control Manager keeps the process running.",
        php: "IIS FastCGI runs the selected php-cgi.exe. Laravel’s public directory is the document root.",
      }
    : details;
  const end = mode === "node" ? "node" : mode === "php" ? "php" : "output";
  return (
    <div className={`architecture ${compact ? "compact" : ""}`}>
      <div className="diagram-head">
        <span>
          <span className="live-dot" /> THE REQUEST JOURNEY
        </span>
        <span className="diagram-label">Interactive</span>
      </div>
      <div className="diagram-flow">
        <button
          className={`diagram-node browser-node ${active === "browser" ? "selected" : ""}`}
          onClick={() => setActive("browser")}
        >
          <Monitor size={24} />
          <span>
            Your browser<small>A request begins</small>
          </span>
          <span className="node-number">01</span>
        </button>
        <div className="diagram-connector">
          <span className="flow-particle" />
          <ArrowDown size={16} />
          <button
            onClick={() => setActive("dns")}
            className={active === "dns" ? "selected" : ""}
          >
            <Globe2 size={12} /> DNS finds your server
          </button>
        </div>
        <div className="server-boundary">
          <span className="server-label">
            <Server size={11} /> YOUR {windows ? "WINDOWS" : "UBUNTU"} SERVER
          </span>
          <button
            className={`diagram-node nginx-node ${active === "nginx" ? "selected" : ""}`}
            onClick={() => setActive("nginx")}
          >
            <span className="nginx-symbol">{windows ? "I" : "N"}</span>
            <span>
              {windows ? "IIS" : "Nginx"}
              <small>Your front door to the web</small>
            </span>
            <span className="port-label">80 / 443</span>
          </button>
          <div className="inner-connector">
            <ArrowDown size={15} />
            <small>
              {mode === "static"
                ? "serves files directly"
                : mode === "node"
                  ? "forwards to a private port"
                  : windows
                    ? "runs PHP through FastCGI"
                    : "passes PHP to a local socket"}
            </small>
          </div>
          <button
            className={`diagram-node output-node ${active === end ? "selected" : ""}`}
            onClick={() => setActive(end)}
          >
            {mode === "static" ? (
              <HardDrive size={21} />
            ) : (
              <Network size={21} />
            )}
            <span>
              {mode === "static"
                ? "Your website"
                : mode === "node"
                  ? "Node.js application"
                  : windows
                    ? "Laravel + FastCGI"
                    : "Laravel + PHP-FPM"}
              <small>
                {mode === "static"
                  ? "HTML · CSS · JavaScript"
                  : mode === "node"
                    ? windows
                      ? "127.0.0.1 · Windows service"
                      : "127.0.0.1 · managed by systemd"
                    : "public/index.php · PHP workers"}
              </small>
            </span>
            <span className="node-number">03</span>
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="diagram-insight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <span className="insight-icon">i</span>
          <p>{descriptions[active]}</p>
        </motion.div>
      </AnimatePresence>
      {!compact && (
        <div className="diagram-footer">
          <span>Click a component to understand it</span>
          <ArrowRight size={13} />
        </div>
      )}
    </div>
  );
}
