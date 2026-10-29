"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  ExternalLink,
  FileCode2,
  Layers,
  ListChecks,
  Menu,
  Palette,
  Printer,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { defaultConfig, stacks } from "@/content/stacks";
import { glossary } from "@/content/glossary";
import { troubleshooting } from "@/content/troubleshooting";
import { generateGuide, guidePages } from "@/lib/generator";
import { configKey, validateConfig } from "@/lib/validation";
import { themes, type ThemeId } from "@/lib/themes";
import { downloadText, toMarkdown } from "@/lib/downloads";
import type { GuideConfig, StackId } from "@/lib/types";
import { Architecture } from "./Architecture";
import { StackIcon } from "./icons";
import { Wizard } from "./Wizard";
import { Modal } from "./Modal";
import { GuideStep } from "./GuideStep";
import {
  isWindows,
  osLabel,
  runtimeLabel,
  serverOptions,
  defaultDirectory,
} from "@/content/platforms";
import { PrintGuide } from "./PrintGuide";

type View = "home" | "guide" | "troubleshoot" | "glossary";
function readProgress(c: GuideConfig): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(configKey(c)) || "[]",
    );
    return Array.isArray(value)
      ? value.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}
export default function DeployGuideApp() {
  const [view, setView] = useState<View>("home");
  const [config, setConfig] = useState<GuideConfig>(defaultConfig);
  const [wizard, setWizard] = useState<GuideConfig | null>(null);
  const [theme, setTheme] = useState<ThemeId>("paper");
  const [themeMenu, setThemeMenu] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [symptom, setSymptom] = useState("");
  const [reset, setReset] = useState(false);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const guide = useMemo(() => generateGuide(config), [config]);
  const pages = guidePages(guide);
  const automationStart = guide.steps.length + (guide.references?.length ?? 0);
  const isAutomation =
    activeStep >= automationStart && activeStep < pages.length;
  const sourceIndex = pages.length;
  const progress = guide.steps.filter((s) => completed.includes(s.id)).length;
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("deployguide:config:v1") || "null",
      ) as GuideConfig | null;
      if (stored && Object.keys(validateConfig(stored)).length === 0) {
        setConfig(stored);
        setCompleted(readProgress(stored));
        if (localStorage.getItem("deployguide:view:v2") === "guide") {
          const g = generateGuide(stored);
          const savedId = localStorage.getItem(configKey(stored) + ":current");
          const index = guidePages(g).findIndex((s) => s.id === savedId);
          setActiveStep(index >= 0 ? index : 0);
          setView("guide");
        }
      }
      const saved = localStorage.getItem("deployguide:theme");
      if (themes.some((t) => t.id === saved)) setTheme(saved as ThemeId);
    } catch {
      /* Corrupt local state never prevents reading the documentation. */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (hydrated) {
      try {
        localStorage.setItem("deployguide:theme", theme);
      } catch {
        setNotice(
          "Theme changed for this visit; local storage is unavailable.",
        );
      }
    }
  }, [theme, hydrated]);
  useEffect(() => {
    function shortcuts(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((x) => !x);
      }
      if (e.key === "Escape") {
        setThemeMenu(false);
        setMobileMenu(false);
      }
    }
    document.addEventListener("keydown", shortcuts);
    return () => document.removeEventListener("keydown", shortcuts);
  }, []);
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (!themeRef.current?.contains(e.target as Node)) setThemeMenu(false);
    }
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("deployguide:view:v2", view);
      if (view === "guide" && pages[activeStep])
        localStorage.setItem(
          configKey(config) + ":current",
          pages[activeStep].id,
        );
    } catch {
      /* This visit remains usable when browser storage is disabled. */
    }
  }, [hydrated, view, activeStep, config]);
  function navigate(next: View) {
    setView(next);
    setMobileMenu(false);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => mainRef.current?.focus());
  }
  function openGuide(c: GuideConfig, index = 0) {
    setConfig(c);
    setCompleted(readProgress(c));
    setActiveStep(index);
    setWizard(null);
    setSearchOpen(false);
    navigate("guide");
    try {
      localStorage.setItem("deployguide:config:v1", JSON.stringify(c));
    } catch {
      setNotice(
        "Guide generated. Browser storage is unavailable; downloads still work.",
      );
    }
  }
  function selectStep(index: number) {
    setActiveStep(index);
    setMobileMenu(false);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => mainRef.current?.focus());
  }
  function toggleStep(id: string) {
    const next = completed.includes(id)
      ? completed.filter((s) => s !== id)
      : [...completed, id];
    setCompleted(next);
    try {
      localStorage.setItem(configKey(config), JSON.stringify(next));
    } catch {
      setNotice(
        "Progress updated for this visit; browser storage is unavailable.",
      );
    }
  }
  function resetProgress() {
    setCompleted([]);
    try {
      localStorage.removeItem(configKey(config));
    } catch {
      /* The current-session state is still reset. */
    }
    setReset(false);
    setNotice("This guide’s checklist has been reset.");
  }
  function chooseStack(id: StackId) {
    setWizard({
      ...config,
      stack: id,
      runtime:
        id === "laravel" && config.stack === "laravel"
          ? config.runtime
          : stacks.find((s) => s.id === id)!.runtime,
    });
  }
  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return serverOptions
      .flatMap((os) => stacks.map((stack) => ({ os: os.id, stack })))
      .flatMap(({ stack, os }) => {
        const targetConfig = {
          ...config,
          os,
          directory:
            isWindows(os) === isWindows(config.os)
              ? config.directory
              : defaultDirectory(os, config.appName),
          stack: stack.id,
          runtime:
            stack.id === "laravel" && config.stack === "laravel"
              ? config.runtime
              : stack.runtime,
        };
        if (Object.keys(validateConfig(targetConfig)).length) return [];
        const g = generateGuide(targetConfig);
        return guidePages(g)
          .map((step, index) => ({
            stack,
            index,
            step,
            targetConfig,
            isReference: index >= g.steps.length,
          }))
          .filter(({ step }) =>
            [
              step.title,
              step.goal,
              step.why,
              step.how,
              step.before,
              ...step.blocks.map((b) => b.code),
              ...(step.parts ?? []).map(
                (p) => p.title + " " + p.before + " " + p.how,
              ),
              ...step.problems.map((p) => p.symptom + " " + p.fix),
            ]
              .join(" ")
              .toLowerCase()
              .includes(term),
          );
      })
      .slice(0, 24);
  }, [query, config]);
  const currentProblems = [
    ...new Map(
      [
        ...(isWindows(config.os)
          ? pages.flatMap((s) => s.problems)
          : troubleshooting),
        ...(guide.automation?.steps ?? []).flatMap((s) => s.problems),
      ].map((p) => [p.symptom, p]),
    ).values(),
  ];
  const filteredProblems = currentProblems.filter((p) =>
    (p.symptom + " " + p.cause + " " + p.fix + " " + p.tags.join(" "))
      .toLowerCase()
      .includes(symptom.toLowerCase()),
  );
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="DeployGuide home"
        >
          <span className="brand-mark">
            <Terminal size={20} />
          </span>
          <span>
            Deploy<span className="brand-light">Guide</span>
          </span>
        </button>
        <div className="header-divider" />
        <span className="brand-caption">
          A little understanding. A lot of possibility.
        </span>
        <nav className="topnav" aria-label="Main navigation">
          <button
            className={view === "home" || view === "guide" ? "active" : ""}
            onClick={() => navigate(view === "guide" ? "guide" : "home")}
          >
            Guides
          </button>
          <button
            className={view === "glossary" ? "active" : ""}
            onClick={() => navigate("glossary")}
          >
            The glossary
          </button>
          <button
            className={view === "troubleshoot" ? "active" : ""}
            onClick={() => navigate("troubleshoot")}
          >
            Troubleshooting
            <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="header-actions">
          <div className="theme-control" ref={themeRef}>
            <button
              className="icon-button"
              aria-label="Choose color theme"
              aria-expanded={themeMenu}
              onClick={() => setThemeMenu(!themeMenu)}
            >
              <Palette size={18} />
            </button>
            {themeMenu && (
              <div className="theme-menu">
                <span className="small-label">MAKE YOURSELF AT HOME</span>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id);
                      setThemeMenu(false);
                    }}
                    aria-pressed={theme === t.id}
                  >
                    <span
                      className="theme-swatch"
                      style={{ background: t.color }}
                    />
                    {t.name}
                    {theme === t.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="mobile-menu-button icon-button"
            aria-label="Toggle navigation"
            aria-expanded={mobileMenu}
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <div className="app-layout">
        <aside
          className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}
          aria-label="Documentation navigation"
        >
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={15} />
            <span>Search the docs</span>
            <kbd>⌘ K</kbd>
          </button>
          <span className="nav-heading">GETTING STARTED</span>
          <nav className="side-nav">
            <button
              className={view === "home" ? "selected" : ""}
              onClick={() => navigate("home")}
            >
              <BookOpen size={16} />
              Welcome to DeployGuide
            </button>
            <button
              onClick={() => {
                navigate("home");
                setTimeout(
                  () =>
                    document
                      .getElementById("how-it-works")
                      ?.scrollIntoView({ behavior: "smooth" }),
                  80,
                );
              }}
            >
              <Layers size={16} />
              How deployment works
            </button>
            <button onClick={() => openGuide(config, 0)}>
              <ListChecks size={16} />
              Before you begin
            </button>
          </nav>
          <div className="sidebar-rule" />
          <span className="nav-heading">YOUR DEPLOYMENT</span>
          <button className="sidebar-build" onClick={() => setWizard(config)}>
            <Settings2 size={16} />
            {view === "guide" ? "Edit your configuration" : "Build your guide"}
            <ChevronRight size={14} />
          </button>
          {view === "guide" ? (
            <>
              <div className="sidebar-progress">
                <div>
                  <span>Your checklist</span>
                  <strong>
                    {progress} / {guide.steps.length}
                  </strong>
                </div>
                <div className="progress-track">
                  <motion.div
                    animate={{
                      width: `${(progress / guide.steps.length) * 100}%`,
                    }}
                  />
                </div>
                <small>Marked complete, not server verified.</small>
              </div>
              <nav className="step-nav" aria-label="Guide steps">
                {guide.steps.map((s, i) => (
                  <button
                    key={s.id}
                    className={activeStep === i ? "selected" : ""}
                    onClick={() => selectStep(i)}
                    aria-current={activeStep === i ? "step" : undefined}
                  >
                    <span
                      className={
                        completed.includes(s.id) ? "step-dot done" : "step-dot"
                      }
                    >
                      {completed.includes(s.id) ? (
                        <Check size={10} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <span>{s.title}</span>
                  </button>
                ))}
                <span className="nav-heading reference-nav-heading">
                  WHEN YOU NEED IT
                </span>
                {(guide.references ?? []).map((reference, i) => (
                  <button
                    key={reference.id}
                    className={
                      activeStep === guide.steps.length + i ? "selected" : ""
                    }
                    onClick={() => selectStep(guide.steps.length + i)}
                  >
                    <BookOpen size={13} />
                    <span>{reference.title}</span>
                  </button>
                ))}
                <details className="automation-nav" open={isAutomation}>
                  <summary>
                    CI/CD automation <span>Optional · 6 steps</span>
                  </summary>
                  <small>
                    {guide.automation?.steps.filter((s) =>
                      completed.includes(s.id),
                    ).length ?? 0}{" "}
                    of 6 marked complete
                  </small>
                  {guide.automation?.steps.map((s, i) => (
                    <button
                      key={s.id}
                      className={
                        activeStep === automationStart + i ? "selected" : ""
                      }
                      aria-current={
                        activeStep === automationStart + i ? "step" : undefined
                      }
                      onClick={() => selectStep(automationStart + i)}
                    >
                      <span
                        className={
                          completed.includes(s.id)
                            ? "step-dot done"
                            : "step-dot"
                        }
                      >
                        {completed.includes(s.id) ? <Check size={10} /> : i + 1}
                      </span>
                      <span>{s.title}</span>
                    </button>
                  ))}
                </details>
                <button
                  className={activeStep === sourceIndex ? "selected" : ""}
                  onClick={() => selectStep(sourceIndex)}
                >
                  <BookOpen size={13} />
                  <span>Sources & review notes</span>
                </button>
              </nav>
            </>
          ) : (
            <>
              <nav className="stack-nav" aria-label="Deployment paths">
                {stacks.map((s) => (
                  <button key={s.id} onClick={() => chooseStack(s.id)}>
                    <StackIcon id={s.id} />
                    <span>
                      {s.name}
                      {s.id === "next-static" ? (
                        <small>Static</small>
                      ) : s.id === "next-node" ? (
                        <small>Node</small>
                      ) : null}
                    </span>
                  </button>
                ))}
              </nav>
              <div className="sidebar-rule" />
              <span className="nav-heading">A LITTLE HELP</span>
              <nav className="side-nav">
                <button
                  className={view === "glossary" ? "selected" : ""}
                  onClick={() => navigate("glossary")}
                >
                  <CircleHelp size={16} />
                  Words, explained
                </button>
                <button
                  className={view === "troubleshoot" ? "selected" : ""}
                  onClick={() => navigate("troubleshoot")}
                >
                  <Terminal size={16} />
                  Something not working?
                </button>
              </nav>
            </>
          )}
          <div className="sidebar-bottom">
            <div className="local-note">
              <span className="local-symbol">
                <ShieldCheck size={19} />
              </span>
              <strong>Your server. Your control.</strong>
              <p>
                We explain. You deploy.
                <br />
                No server access required.
              </p>
            </div>
            <div className="sidebar-version">
              <span>
                <span className="live-dot" /> Ubuntu + Windows Server
              </span>
              <span>v1.0</span>
            </div>
          </div>
        </aside>
        {mobileMenu && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobileMenu(false)}
          />
        )}
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className={`main-content view-${view}`}
        >
          {view === "home" && (
            <>
              <div className="breadcrumb">
                <span>Documentation</span>
                <ChevronRight size={12} />
                <span>Welcome</span>
                <span className="review-badge">
                  <span className="live-dot" /> Built for understanding
                </span>
              </div>
              <section className="hero">
                <motion.div
                  className="hero-copy"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <span className="eyebrow">
                    <span /> FROM YOUR FIRST DEPLOY TO YOUR NEXT
                  </span>
                  <h1>
                    From localhost
                    <br />
                    to <em>live.</em>
                    <span className="hero-cursor">_</span>
                  </h1>
                  <p className="hero-description">
                    Deploy your app. Understand every step.
                  </p>
                  <p className="hero-body">
                    Your personal field guide to Linux, Windows Server, and the
                    web. Clear instructions, made for your stack—with the{" "}
                    <em>why</em> behind every command.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="primary-button"
                      onClick={() => setWizard(config)}
                    >
                      Build my deployment guide
                      <ArrowRight size={16} />
                    </button>
                    <a className="text-link" href="#choose-stack">
                      Explore the guides
                      <ArrowDown size={14} />
                    </a>
                  </div>
                  <div className="hero-meta">
                    <span>
                      <Check size={13} />
                      No account needed
                    </span>
                    <span>
                      <Check size={13} />
                      Everything runs locally
                    </span>
                  </div>
                </motion.div>
                <motion.div
                  className="hero-diagram"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.08 }}
                >
                  <Architecture />
                </motion.div>
              </section>
              <div className="principles-strip">
                <span>
                  <BookOpen size={18} />
                  <span>
                    <strong>Understand the why</strong>
                    <small>Learn, don’t just copy.</small>
                  </span>
                </span>
                <span>
                  <Settings2 size={18} />
                  <span>
                    <strong>Made for your application</strong>
                    <small>Your stack. Your configuration.</small>
                  </span>
                </span>
                <span>
                  <ShieldCheck size={18} />
                  <span>
                    <strong>Good habits, built in</strong>
                    <small>Permissions, HTTPS, and recovery.</small>
                  </span>
                </span>
              </div>
              <section id="choose-stack" className="stack-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow neutral">
                      01 / CHOOSE YOUR STARTING POINT
                    </span>
                    <h2>What are you deploying?</h2>
                    <p>Same destination. A guide for every path.</p>
                  </div>
                  <span className="supported-label">
                    <span className="ubuntu-dot">◉</span> Ubuntu · Windows
                    Server <span>·</span> 6 paths
                  </span>
                </div>
                <div className="stack-grid">
                  {stacks.map((s, i) => (
                    <motion.button
                      key={s.id}
                      className={`stack-card stack-${s.id}`}
                      onClick={() => chooseStack(s.id)}
                      whileHover={{ y: -3 }}
                      transition={{ duration: 0.16 }}
                    >
                      <div className="stack-card-top">
                        <span className={`stack-icon ${s.id}`}>
                          <StackIcon id={s.id} />
                        </span>
                        <span className="mode-tag">{s.badge}</span>
                      </div>
                      <h3>{s.name}</h3>
                      <p>{s.subtitle}</p>
                      <div className="stack-card-bottom">
                        <span>
                          {s.mode === "static"
                            ? "Nginx → static files"
                            : s.mode === "node"
                              ? "Nginx → Node.js"
                              : "Nginx → PHP-FPM"}
                        </span>
                        <ArrowUpRight size={17} />
                      </div>
                    </motion.button>
                  ))}
                </div>
                <p className="stack-footnote">
                  <InfoDot />
                  Not sure about Next.js? Static export serves prebuilt pages. A
                  Node server unlocks request-time features.
                  <button onClick={() => chooseStack("next-static")}>
                    Help me choose
                    <ArrowRight size={12} />
                  </button>
                </p>
              </section>
              <section className="learning-section" id="how-it-works">
                <div>
                  <span className="eyebrow neutral">
                    02 / A MAP, NOT A MAGIC BUTTON
                  </span>
                  <h2>
                    The whole journey.
                    <br />
                    One understandable step at a time.
                  </h2>
                  <p>
                    From that first SSH connection to a renewal check months
                    later, you’ll know what you’re doing—and why it matters.
                  </p>
                  <button
                    className="text-link"
                    onClick={() => openGuide(config)}
                  >
                    Take a look inside a guide
                    <ArrowRight size={15} />
                  </button>
                </div>
                <div className="journey-list">
                  {[
                    {
                      n: "PREPARE",
                      title: "Find your footing",
                      text: "Understand the architecture. Connect. Prepare a safe workspace.",
                    },
                    {
                      n: "DEPLOY",
                      title: "Make your application ready",
                      text: "Install, configure, build, and keep the right processes running.",
                    },
                    {
                      n: "GO LIVE",
                      title: "Open the front door",
                      text: "Nginx, DNS, HTTPS, verification—and a plan for what comes next.",
                    },
                  ].map((item) => (
                    <div key={item.n}>
                      <span>{item.n}</span>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="glossary-strip">
                <span>
                  <BookOpen size={18} />
                  New words, plain English.
                </span>
                <div>
                  {glossary.slice(0, 6).map((g) => (
                    <details key={g.term} className="glossary-tooltip">
                      <summary>{g.term}</summary>
                      <p>{g.definition}</p>
                    </details>
                  ))}
                </div>
                <button
                  onClick={() => navigate("glossary")}
                  aria-label="Open the full glossary"
                >
                  <ArrowRight size={17} />
                </button>
              </section>
              <footer className="page-footer">
                <span>Built for the moment you’re ready to ship.</span>
                <span>Read the command. Understand it. Make it yours.</span>
              </footer>
            </>
          )}
          {view === "guide" && (
            <>
              <div className="breadcrumb">
                <button onClick={() => navigate("home")}>Guides</button>
                <ChevronRight size={12} />
                <span>{guide.stack.name}</span>
                <span className="review-badge">{guide.stack.badge}</span>
              </div>
              <div className="guide-heading">
                <div>
                  <span className="eyebrow neutral">
                    YOUR PERSONAL DEPLOYMENT GUIDE
                  </span>
                  <h1>
                    {config.appName}
                    <span className="guide-domain">{config.domain}</span>
                  </h1>
                  <p>
                    {guide.stack.name} · {guide.stack.badge} ·{" "}
                    {osLabel(config.os)}
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setWizard(config)}
                >
                  <Settings2 size={14} />
                  Edit configuration
                </button>
              </div>
              <div className="guide-toolbar">
                <span>
                  <span className="live-dot" />
                  Saved on this browser
                </span>
                <div>
                  <button
                    onClick={() => {
                      downloadText(
                        `${config.appName}-deployguide.md`,
                        toMarkdown(guide),
                        "text/markdown",
                      );
                      setNotice("Markdown download started.");
                    }}
                  >
                    <Download size={14} />
                    Markdown
                  </button>
                  <button
                    onClick={() => {
                      downloadText(
                        isWindows(config.os)
                          ? `${config.appName}.web.config`
                          : `${config.appName}.nginx.conf`,
                        guide.webConfig ?? guide.nginx,
                      );
                      setNotice(
                        `${isWindows(config.os) ? "IIS web.config" : "Initial HTTP Nginx configuration"} download started.`,
                      );
                    }}
                  >
                    <FileCode2 size={14} />
                    {isWindows(config.os) ? "IIS web.config" : "Nginx config"}
                  </button>
                  <button onClick={() => window.print()}>
                    <Printer size={14} />
                    Print
                  </button>
                  <button
                    onClick={() => setReset(true)}
                    aria-label="Reset checklist progress"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
              <div className="guide-layout">
                <div className="guide-column">
                  {isAutomation && (
                    <div className="automation-downloads">
                      <div>
                        <strong>GitHub Actions · CI/CD</strong>
                        <p>
                          Optional after launch. Reviewed {guide.reviewedOn}.
                          Download and review both files before enabling
                          releases.
                        </p>
                      </div>
                      <div>
                        {guide.automation?.files.map((file) => (
                          <button
                            className="secondary-button"
                            key={file.name}
                            onClick={() => {
                              downloadText(file.name, file.content);
                              setNotice(`${file.name} download started.`);
                            }}
                          >
                            <Download size={14} />
                            {file.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeStep < sourceIndex ? (
                    <GuideStep
                      key={`${configKey(config)}-${activeStep}`}
                      step={pages[activeStep]}
                      index={
                        isAutomation ? activeStep - automationStart : activeStep
                      }
                      complete={completed.includes(pages[activeStep].id)}
                      onToggle={() => toggleStep(pages[activeStep].id)}
                      total={
                        isAutomation
                          ? guide.automation!.steps.length
                          : guide.steps.length
                      }
                      reference={
                        activeStep >= guide.steps.length && !isAutomation
                      }
                      automation={isAutomation}
                      onBack={() =>
                        activeStep === 0
                          ? navigate("home")
                          : selectStep(activeStep - 1)
                      }
                      onNext={() =>
                        selectStep(
                          isAutomation
                            ? activeStep + 1 < sourceIndex
                              ? activeStep + 1
                              : sourceIndex
                            : activeStep >= guide.steps.length
                              ? 0
                              : activeStep === guide.steps.length - 1
                                ? guide.steps.length + 1
                                : activeStep + 1,
                        )
                      }
                    />
                  ) : (
                    <section className="sources-page">
                      <span className="eyebrow">BUILT ON PRIMARY SOURCES</span>
                      <h2>Trust, with a paper trail.</h2>
                      <p>
                        These instructions were reviewed against official
                        documentation on <strong>{guide.reviewedOn}</strong>.
                        They have not been executed on a live production server
                        by DeployGuide. Verify package changes and project
                        requirements before running them.
                      </p>
                      <div className="note">
                        <InfoDot />
                        <p>
                          Supported baselines: Ubuntu 24.04 LTS with Nginx;
                          Windows Server 2022/2025 with IIS; Node.js 24; Laravel
                          12 with PHP 8.2–8.5. Select the combination supported
                          by your application. Other operating systems and
                          runtime combinations are outside this guide.
                        </p>
                      </div>
                      <div className="sources-list">
                        {guide.sources.map((s) => (
                          <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {s.label}
                            <ExternalLink size={14} />
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
                <aside className="guide-aside">
                  <span className="nav-heading">YOUR ARCHITECTURE</span>
                  <Architecture
                    mode={guide.stack.mode}
                    windows={isWindows(config.os)}
                    compact
                  />
                  <div className="guide-facts">
                    <h3>The essentials</h3>
                    <dl>
                      <div>
                        <dt>Server OS</dt>
                        <dd>{osLabel(config.os)}</dd>
                      </div>
                      <div>
                        <dt>Runtime</dt>
                        <dd>{runtimeLabel(config)}</dd>
                      </div>
                      <div>
                        <dt>Public entry</dt>
                        <dd>
                          {isWindows(config.os) ? "IIS" : "Nginx"} · 80 / 443
                        </dd>
                      </div>
                      {guide.stack.mode === "node" && (
                        <div>
                          <dt>Private app port</dt>
                          <dd>127.0.0.1:{config.port}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <button
                    className="reviewed-link"
                    onClick={() => selectStep(sourceIndex)}
                  >
                    <ShieldCheck size={16} />
                    <span>
                      Documentation reviewed
                      <small>{guide.reviewedOn} · View sources</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                  <p className="aside-footnote">
                    A checked step records your progress. Only the checks you
                    run can tell you about your server.
                  </p>
                </aside>
              </div>
            </>
          )}
          {view === "troubleshoot" && (
            <>
              <div className="breadcrumb">
                <span>Documentation</span>
                <ChevronRight size={12} />
                <span>Troubleshooting</span>
              </div>
              <section className="reference-page">
                <span className="eyebrow neutral">FOLLOW THE EVIDENCE</span>
                <h1>Something not working?</h1>
                <p className="reference-intro">
                  Start with what you see. Check the logs, find the cause, then
                  make a focused change.
                </p>
                <label className="large-search">
                  <Search size={20} />
                  <input
                    value={symptom}
                    onChange={(e) => setSymptom(e.target.value)}
                    placeholder="Try “502”, “DNS”, or “permission denied”…"
                    aria-label="Search troubleshooting by symptom"
                  />
                  {symptom && (
                    <button
                      onClick={() => setSymptom("")}
                      aria-label="Clear troubleshooting search"
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
                <div className="symptom-tags">
                  {[
                    "DNS",
                    "502",
                    "certificate",
                    "permissions",
                    "build",
                    "port",
                  ].map((tag) => (
                    <button
                      className={symptom === tag ? "active" : ""}
                      key={tag}
                      onClick={() => setSymptom(symptom === tag ? "" : tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <p className="result-count" aria-live="polite">
                  {filteredProblems.length} troubleshooting topics
                </p>
                <div className="troubleshooting-list">
                  {filteredProblems.map((p, i) => (
                    <details key={p.symptom}>
                      <summary>
                        <span className="problem-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {p.symptom}
                        <ChevronDown size={17} />
                      </summary>
                      <div>
                        <span className="small-label">LIKELY CAUSE</span>
                        <p>{p.cause}</p>
                        <span className="small-label">INVESTIGATE & FIX</span>
                        <p>{p.fix}</p>
                        <button
                          className="text-link"
                          onClick={() =>
                            openGuide(config, guide.steps.length + 1)
                          }
                        >
                          Open maintenance instructions
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </details>
                  ))}
                </div>
                {!filteredProblems.length && (
                  <div className="empty-state">
                    <Search size={28} />
                    <h3>No matching symptom yet.</h3>
                    <p>
                      Try a status code or a shorter word, such as “crash” or
                      “SSL”.
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => setSymptom("")}
                    >
                      Show all topics
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {view === "glossary" && (
            <>
              <div className="breadcrumb">
                <span>Documentation</span>
                <ChevronRight size={12} />
                <span>The glossary</span>
              </div>
              <section className="reference-page">
                <span className="eyebrow neutral">
                  NO SECRET HANDSHAKE REQUIRED
                </span>
                <h1>Words, explained.</h1>
                <p className="reference-intro">
                  Every field has its vocabulary. Here’s the deployment version,
                  in everyday language.
                </p>
                <div className="glossary-grid">
                  {glossary.map((g, i) => (
                    <article key={g.term}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <h2>{g.term}</h2>
                      <p>{g.definition}</p>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
      <PrintGuide guide={guide} />
      <AnimatePresence>
        {wizard && (
          <Wizard
            initial={wizard}
            onClose={() => setWizard(null)}
            onGenerate={openGuide}
          />
        )}
      </AnimatePresence>
      {searchOpen && (
        <Modal
          title="Find your next answer."
          onClose={() => setSearchOpen(false)}
        >
          <label className="large-search">
            <Search size={19} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands, concepts, or problems…"
              aria-label="Search all deployment documentation"
            />
          </label>
          <div className="search-results">
            {!query.trim() ? (
              <>
                <span className="small-label">GOOD PLACES TO START</span>
                {["Nginx", "environment", "HTTPS", "permissions"].map((t) => (
                  <button key={t} onClick={() => setQuery(t)}>
                    <Search size={15} />
                    {t}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </>
            ) : searchResults.length ? (
              searchResults.map(
                ({ stack, step, index, targetConfig, isReference }) => (
                  <button
                    key={targetConfig.os + stack.id + step.id}
                    onClick={() => openGuide(targetConfig, index)}
                  >
                    <StackIcon id={stack.id} />
                    <span>
                      <strong>{step.title}</strong>
                      <small>
                        {stack.name} · {stack.badge} ·{" "}
                        {isReference ? "Reference" : `Step ${index + 1}`} ·{" "}
                        {osLabel(targetConfig.os)}
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ),
              )
            ) : (
              <div className="empty-state">
                <p>No results for “{query}”. Try a shorter term.</p>
              </div>
            )}
          </div>
          <p className="search-footnote">
            Searches all six stacks across Ubuntu and Windows Server. No
            external requests.
          </p>
        </Modal>
      )}
      {reset && (
        <Modal title="Reset this checklist?" onClose={() => setReset(false)}>
          <p className="modal-intro">
            This removes your {progress} completed steps for the current
            configuration. Your guide and other saved configurations stay
            available.
          </p>
          <div className="confirm-actions">
            <button
              className="secondary-button"
              onClick={() => setReset(false)}
            >
              Keep my progress
            </button>
            <button className="primary-button" onClick={resetProgress}>
              Reset checklist
            </button>
          </div>
        </Modal>
      )}
      <AnimatePresence>
        {notice && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <CheckCheck size={17} />
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
function InfoDot() {
  return (
    <span className="insight-icon" aria-hidden="true">
      i
    </span>
  );
}
