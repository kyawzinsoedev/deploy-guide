"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Circle,
  Info,
  ListChecks,
  Terminal,
} from "lucide-react";
import type { Step } from "@/lib/types";
import { CodeBlock } from "./CodeBlock";
export function GuideStep({
  step,
  index,
  complete,
  onToggle,
  onNext,
  onBack,
  total,
  reference = false,
  automation = false,
}: {
  step: Step;
  index: number;
  complete: boolean;
  onToggle: () => void;
  onNext: () => void;
  onBack: () => void;
  total: number;
  reference?: boolean;
  automation?: boolean;
}) {
  const [tab, setTab] = useState("commands");
  const tabs = ["commands", "explanation", "expected results"];
  return (
    <article className="guide-step" id={step.id}>
      <div className="step-eyebrow">
        <span>
          {automation
            ? `OPTIONAL CI/CD · STEP ${index + 1} OF ${total}`
            : reference
              ? "REFERENCE · NOT A REQUIRED STEP"
              : `STEP ${String(index + 1).padStart(2, "0")} OF ${total}`}
        </span>
        {!reference && (
          <button
            className={`complete-button ${complete ? "completed" : ""}`}
            onClick={onToggle}
            aria-pressed={complete}
          >
            {complete ? <Check size={15} /> : <Circle size={15} />}{" "}
            {complete ? "Marked complete" : "Mark complete"}
          </button>
        )}
      </div>
      <h2>{step.title}</h2>
      <p className="step-goal">{step.goal}</p>
      <div className="why-card">
        <span className="small-label">
          <span className="insight-icon">?</span> WHY THIS MATTERS
        </span>
        <p>{step.why}</p>
      </div>
      {!step.parts && tab !== "commands" && (
        <div className="before-run">
          <Info size={16} />
          <div>
            <strong>Before you run it</strong>
            <p>{step.before}</p>
          </div>
        </div>
      )}
      <div className="step-tabs" role="tablist" aria-label="Step details">
        {tabs.map((t, i) => (
          <button
            role="tab"
            id={`${step.id}-tab-${i}`}
            aria-controls={`${step.id}-panel-${i}`}
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            key={t}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 2
                      : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                setTab(tabs[next]);
                document.getElementById(`${step.id}-tab-${next}`)?.focus();
              }
            }}
          >
            {i === 0 ? (
              <Terminal size={15} />
            ) : i === 1 ? (
              <Info size={15} />
            ) : (
              <ListChecks size={15} />
            )}
            <span>{t}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="tabpanel"
          id={`${step.id}-panel-${tabs.indexOf(tab)}`}
          aria-labelledby={`${step.id}-tab-${tabs.indexOf(tab)}`}
          className="step-panel"
          tabIndex={0}
        >
          {tab === "commands" && (
            <>
              {(step.parts ?? [step]).map((part, i) => (
                <details
                  className="task-disclosure"
                  key={part.id}
                  open={i === 0}
                >
                  <summary>
                    <span className="task-number">{i + 1}</span>
                    <span>{part.title}</span>
                    <span className="task-hint">Open task</span>
                  </summary>
                  <div className="task-content">
                    <div className="before-run">
                      <Info size={16} />
                      <div>
                        <strong>Before you run it</strong>
                        <p>{part.before}</p>
                      </div>
                    </div>
                    {part.blocks.map((b, j) =>
                      b.optional ? (
                        <details className="optional-task" key={j}>
                          <summary>
                            {b.title}
                            <span>Optional</span>
                          </summary>
                          <p>{b.optional}</p>
                          <CodeBlock block={b} />
                        </details>
                      ) : (
                        <CodeBlock key={j} block={b} />
                      ),
                    )}
                    {part.note && (
                      <div className="note">
                        <Info size={16} />
                        <p>{part.note}</p>
                      </div>
                    )}
                    <details className="task-check">
                      <summary>Check this task before continuing</summary>
                      <p>{part.expected}</p>
                      <CodeBlock block={part.verification} />
                    </details>
                  </div>
                </details>
              ))}
              <details className="breakdown">
                <summary>
                  Understand these commands{" "}
                  <span>{step.breakdown.length} explanations</span>
                </summary>
                <dl>
                  {step.breakdown.map((b, i) => (
                    <div key={i}>
                      <dt>{b.term}</dt>
                      <dd>{b.explanation}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
          {tab === "explanation" && (
            <div className="prose-panel">
              <h3>How it works</h3>
              {(step.parts ?? [step]).map((part) => (
                <section key={part.id}>
                  <h4>{part.title}</h4>
                  <p>{part.how}</p>
                </section>
              ))}
              <h3>Command breakdown</h3>
              <dl>
                {step.breakdown.map((b, i) => (
                  <div key={i}>
                    <dt>{b.term}</dt>
                    <dd>{b.explanation}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {tab === "expected results" && (
            <div className="prose-panel">
              {(step.parts ?? [step]).map((part) => (
                <section key={part.id}>
                  <h3>{part.title}</h3>
                  <p>{part.expected}</p>
                  <div className="verification-label">
                    <Check size={16} />
                    Verify it yourself
                  </div>
                  <CodeBlock block={part.verification} />
                </section>
              ))}
              <p className="small-muted">
                These are expected observations. DeployGuide has not checked
                your server.
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {step.note && tab !== "commands" && (
        <div className="note">
          <Info size={16} />
          <p>{step.note}</p>
        </div>
      )}
      <details className="problems-details">
        <summary>
          Something not working? <span>Common problems</span>
        </summary>
        <div>
          {step.problems.map((p) => (
            <section key={p.symptom}>
              <h4>{p.symptom}</h4>
              <p>
                <strong>Likely cause:</strong> {p.cause}
              </p>
              <p>
                <strong>Investigate & fix:</strong> {p.fix}
              </p>
            </section>
          ))}
        </div>
      </details>
      <div className="step-next">
        <div>
          <small>WHAT COMES NEXT</small>
          <p>{step.next}</p>
        </div>
        <div className="step-navigation">
          <button className="text-button" onClick={onBack}>
            Back
          </button>
          <button
            className="primary-button"
            onClick={() => {
              if (!reference && !complete) onToggle();
              onNext();
            }}
          >
            {reference
              ? "Back to guide"
              : index === total - 1
                ? "Finish checklist"
                : complete
                  ? "Continue"
                  : "Mark complete & continue"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
