"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Info, LockKeyhole } from "lucide-react";
import { stacks } from "@/content/stacks";
import { validateConfig, type ValidationErrors } from "@/lib/validation";
import type { GuideConfig } from "@/lib/types";
import { Modal } from "./Modal";
import { StackIcon } from "./icons";
import { launchStepCount } from "@/content/launch-flow";
import {
  serverOptions,
  phpVersions,
  isWindows,
  osLabel,
  defaultDirectory,
  runtimeLabel,
  phpVersionNote,
} from "@/content/platforms";
type TextField =
  | "appName"
  | "domain"
  | "serverIp"
  | "username"
  | "directory"
  | "repository"
  | "port";
export function Wizard({
  initial,
  onClose,
  onGenerate,
}: {
  initial: GuideConfig;
  onClose: () => void;
  onGenerate: (config: GuideConfig) => void;
}) {
  const [config, setConfig] = useState({ ...initial });
  const [stage, setStage] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const errors = validateConfig(config);
  const stack = stacks.find((s) => s.id === config.stack)!;
  const set = <K extends keyof GuideConfig>(key: K, value: GuideConfig[K]) =>
    setConfig((c) => ({
      ...c,
      [key]: value,
      ...(key === "appName" && c.directory === defaultDirectory(c.os, c.appName)
        ? { directory: defaultDirectory(c.os, String(value)) }
        : {}),
    }));
  const fields: (keyof GuideConfig)[][] = [
    ["stack", "os", "runtime", "packageManager"],
    [
      "appName",
      "domain",
      "serverIp",
      "username",
      "directory",
      "repository",
      "port",
    ],
    [],
  ];
  function next() {
    setAttempted(true);
    if (fields[stage].some((k) => errors[k])) return;
    setStage(stage + 1);
    setAttempted(false);
  }
  function field(key: TextField, label: string, help?: string) {
    return (
      <label className={`field ${attempted && errors[key] ? "invalid" : ""}`}>
        <span>{label}</span>
        <input
          value={String(config[key])}
          onChange={(e) => set(key, e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!(attempted && errors[key])}
          aria-describedby={`help-${key}`}
        />
        <small id={`help-${key}`}>
          {attempted && errors[key] ? errors[key] : help}
        </small>
      </label>
    );
  }
  return (
    <Modal title="Make it your deployment." onClose={onClose} wide>
      <p className="modal-intro">
        A few details. A guide that fits your application.
      </p>
      <div className="wizard-progress">
        {["Your stack", "Your server", "Ready to build"].map((s, i) => (
          <div className={i <= stage ? "active" : ""} key={s}>
            <span>{i < stage ? <Check size={12} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.15 }}
          className="wizard-body"
        >
          {stage === 0 && (
            <>
              <div className="wizard-stacks">
                {stacks.map((s) => (
                  <button
                    key={s.id}
                    className={config.stack === s.id ? "selected" : ""}
                    aria-pressed={config.stack === s.id}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        stack: s.id,
                        runtime:
                          s.id === "laravel" && c.stack === "laravel"
                            ? c.runtime
                            : s.runtime,
                      }))
                    }
                  >
                    <StackIcon id={s.id} />
                    <span>
                      {s.name}
                      <small>
                        {isWindows(config.os) && s.mode === "php"
                          ? "IIS FastCGI"
                          : s.badge}
                      </small>
                    </span>
                    {config.stack === s.id && <Check size={16} />}
                  </button>
                ))}
              </div>
              <div className="explanation-callout">
                <Info size={17} />
                <p>
                  {isWindows(config.os)
                    ? stack.mode === "php"
                      ? "IIS serves public assets and runs PHP through FastCGI. Only Laravel’s public directory is exposed."
                      : stack.mode === "node"
                        ? "IIS proxies to a private Node Windows service. No Linux systemd commands are used."
                        : "IIS serves the public files directly. Static builds are created on your computer."
                    : stack.description}
                </p>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Server operating system</span>
                  <select
                    value={config.os}
                    onChange={(e) => {
                      const os = e.target.value as GuideConfig["os"];
                      setConfig((c) => ({
                        ...c,
                        os,
                        directory:
                          isWindows(os) !== isWindows(c.os)
                            ? defaultDirectory(os, c.appName)
                            : c.directory,
                      }));
                    }}
                  >
                    {serverOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <small>
                    Windows uses native IIS. Choose the OS installed on your
                    server.
                  </small>
                </label>
                {stack.id === "laravel" ? (
                  <label className="field">
                    <span>PHP version</span>
                    <select
                      value={config.runtime}
                      onChange={(e) =>
                        set("runtime", e.target.value as GuideConfig["runtime"])
                      }
                    >
                      {phpVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {isWindows(config.os) && v.id === "8.3"
                            ? "PHP 8.3"
                            : v.label}
                        </option>
                      ))}
                    </select>
                    <small>
                      Choose the version supported by your Composer lockfile.
                    </small>
                  </label>
                ) : (
                  <div className="version-summary">
                    <strong>Application runtime</strong>
                    <span>{runtimeLabel(config)}</span>
                  </div>
                )}
                {config.stack !== "html" && (
                  <label className="field">
                    <span>
                      JavaScript package manager
                      {config.stack === "laravel" ? " (optional assets)" : ""}
                    </span>
                    <select
                      value={config.packageManager}
                      onChange={(e) =>
                        set(
                          "packageManager",
                          e.target.value as GuideConfig["packageManager"],
                        )
                      }
                    >
                      <option value="npm">npm · package-lock.json</option>
                      <option value="pnpm">pnpm 10 · pnpm-lock.yaml</option>
                    </select>
                  </label>
                )}
              </div>
              {stack.id === "laravel" && (
                <p className="runtime-note">{phpVersionNote(config)}</p>
              )}
              {isWindows(config.os) && (
                <p className="runtime-note">
                  Windows Server x64 with Desktop Experience. Documentation
                  reviewed; commands have not been executed on a live Windows
                  Server by DeployGuide.
                </p>
              )}
              <details className="choice-help">
                <summary>I’m not sure which path to choose</summary>
                <p>
                  Use the framework your project already uses. For Next.js,
                  choose static export only if every page can be generated at
                  build time; Server Actions, ISR, request-time cookies and
                  rendering need the Node server path. Choose the package
                  manager matching your committed lockfile. Laravel always uses
                  Composer for PHP packages.
                </p>
              </details>
            </>
          )}
          {stage === 1 && (
            <>
              <div className="form-grid">
                {field(
                  "appName",
                  "Application name",
                  "Used for service names and log files.",
                )}
                {field(
                  "domain",
                  "Domain",
                  "No https:// or path; use the base hostname.",
                )}
                {field(
                  "serverIp",
                  "Server IPv4 address",
                  "203.0.113.10 is a documentation example; replace it.",
                )}
              </div>
              <details
                className="advanced-settings"
                open={
                  attempted &&
                  ["username", "directory", "port", "repository"].some(
                    (k) => errors[k as keyof GuideConfig],
                  )
                    ? true
                    : undefined
                }
              >
                <summary>
                  Advanced settings{" "}
                  <span>Defaults work for a fresh server</span>
                </summary>
                <div className="form-grid">
                  {field(
                    "username",
                    "Deployment username",
                    isWindows(config.os)
                      ? "A dedicated local deployment account; its password is entered on the server only."
                      : "A new non-root account dedicated to deployments.",
                  )}
                  {field(
                    "directory",
                    "Project directory",
                    isWindows(config.os)
                      ? "Dedicated child of C:\\Sites; no spaces."
                      : "Dedicated child of /var/www; no spaces.",
                  )}
                  {stack.mode === "node" &&
                    field(
                      "port",
                      "Private application port",
                      `1024–65535. ${isWindows(config.os) ? "IIS" : "Nginx"} connects on loopback only.`,
                    )}
                  <div className="full-width">
                    {field(
                      "repository",
                      "Git repository URL (optional)",
                      stack.mode === "static"
                        ? "Optional local clone. Only public output is uploaded to the server."
                        : "HTTPS URL without credentials. Leave blank for file upload.",
                    )}
                  </div>
                </div>
              </details>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.www}
                  onChange={(e) => set("www", e.target.checked)}
                />
                Also include www.{config.domain || "example.com"}
              </label>
              <details className="choice-help">
                <summary>I’m not sure what these values mean</summary>
                <p>
                  Your host provides the server IP. Your registrar manages the
                  domain’s DNS records. The username is a dedicated server
                  account this guide creates, not your provider login. The
                  directory is where your project lives. Node’s port is
                  internal: 3000 is a common choice, but it must be unused.
                </p>
              </details>
              <p className="privacy-note">
                <LockKeyhole size={14} />
                Everything stays in your browser. Never enter passwords, keys or
                tokens.
              </p>
            </>
          )}
          {stage === 2 && (
            <>
              <div className="review-banner">
                <span className={`stack-icon ${stack.id}`}>
                  <StackIcon id={stack.id} />
                </span>
                <div>
                  <h3>{stack.name}</h3>
                  <p>
                    {isWindows(config.os) && stack.id === "laravel"
                      ? "IIS FastCGI"
                      : stack.badge}{" "}
                    · {osLabel(config.os)}
                  </p>
                </div>
                <Check size={22} />
              </div>
              <dl className="review-grid">
                <div>
                  <dt>Domain</dt>
                  <dd>
                    {config.domain}
                    {config.www ? " + www" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Server</dt>
                  <dd>{config.serverIp}</dd>
                </div>
                <div>
                  <dt>Project directory</dt>
                  <dd>{config.directory}</dd>
                </div>
                <div>
                  <dt>Deployment user</dt>
                  <dd>{config.username}</dd>
                </div>
                <div>
                  <dt>Runtime</dt>
                  <dd>{runtimeLabel(config)}</dd>
                </div>
                <div>
                  <dt>Process model</dt>
                  <dd>
                    {isWindows(config.os)
                      ? stack.mode === "node"
                        ? "IIS + Windows service"
                        : stack.mode === "php"
                          ? "IIS + PHP FastCGI"
                          : "IIS serves files"
                      : stack.mode === "node"
                        ? "systemd + Nginx"
                        : stack.mode === "php"
                          ? "PHP-FPM + Nginx"
                          : "Nginx serves files"}
                  </dd>
                </div>
              </dl>
              <div className="explanation-callout">
                <Info size={17} />
                <p>
                  You’ll get {launchStepCount(config.stack)} focused launch
                  steps, personalized commands, and downloadable configuration.
                  You run the commands yourself. The guide cannot inspect your
                  server.
                </p>
              </div>
              {config.domain === "example.com" ||
              config.serverIp === "203.0.113.10" ? (
                <p className="example-notice">
                  You’re using example values. This is fine for exploring; edit
                  them before using the guide on a real server.
                </p>
              ) : null}
              {Object.keys(errors).length > 0 && (
                <p role="alert" className="error-text">
                  {Object.values(errors as ValidationErrors).join(" ")}
                </p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="wizard-footer">
        <button
          className="text-button"
          onClick={() => (stage ? setStage(stage - 1) : onClose())}
        >
          <ArrowLeft size={15} />
          {stage ? "Back" : "Cancel"}
        </button>
        <span>Step {stage + 1} of 3</span>
        {stage < 2 ? (
          <button className="primary-button" onClick={next}>
            Continue
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={Object.keys(errors).length > 0}
            onClick={() => onGenerate(config)}
          >
            Build my guide
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </Modal>
  );
}
