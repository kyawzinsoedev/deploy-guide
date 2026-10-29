import type { Guide, Step } from "@/lib/types";
import { osLabel, runtimeLabel } from "@/content/platforms";
function Task({ step }: { step: Step }) {
  return (
    <section>
      <h3>{step.title}</h3>
      <p>
        <strong>Goal:</strong> {step.goal}
      </p>
      <p>
        <strong>Why:</strong> {step.why}
      </p>
      <p>
        <strong>How:</strong> {step.how}
      </p>
      <p>
        <strong>Before:</strong> {step.before}
      </p>
      {step.note && (
        <p>
          <strong>Note:</strong> {step.note}
        </p>
      )}
      {step.blocks.map((b, i) => (
        <div key={i}>
          <h4>
            {b.title} · {b.location}
          </h4>
          {b.optional && (
            <p>
              <strong>Optional:</strong> {b.optional}
            </p>
          )}
          <p>{b.changes ? "Changes state" : "Read-only / educational"}</p>
          <pre>{b.code}</pre>
        </div>
      ))}
      <dl>
        {step.breakdown.map((b, i) => (
          <div key={i}>
            <dt>{b.term}</dt>
            <dd>{b.explanation}</dd>
          </div>
        ))}
      </dl>
      <p>
        <strong>Expected result:</strong> {step.expected}
      </p>
      <h4>Verification · {step.verification.location}</h4>
      <pre>{step.verification.code}</pre>
      {step.problems.map((p) => (
        <p key={p.symptom}>
          <strong>{p.symptom}:</strong> {p.cause} {p.fix}
        </p>
      ))}
    </section>
  );
}
export function PrintGuide({ guide }: { guide: Guide }) {
  return (
    <section className="print-guide">
      <h1>DeployGuide · {guide.stack.name}</h1>
      <p>
        {guide.config.domain} · {osLabel(guide.config.os)} ·{" "}
        {runtimeLabel(guide.config)} · Reviewed {guide.reviewedOn}
      </p>
      <p>
        {guide.steps.length} launch steps. Run checks yourself; checklist
        completion is not server verification.
      </p>
      {guide.steps.map((s, i) => (
        <article key={s.id}>
          <h2>
            {i + 1}. {s.title}
          </h2>
          <p>{s.goal}</p>
          {(s.parts ?? [s]).map((p) => (
            <Task key={p.id} step={p} />
          ))}
          <p>
            <strong>Next:</strong> {s.next}
          </p>
        </article>
      ))}
      {(guide.references ?? []).map((s) => (
        <article key={s.id}>
          <h2>Reference: {s.title}</h2>
          <Task step={s} />
        </article>
      ))}
      {(guide.automation?.steps ?? []).map((s, i) => (
        <article key={s.id}>
          <h2>
            Optional CI/CD {i + 1}: {s.title}
          </h2>
          <Task step={s} />
          <p>
            <strong>Next:</strong> {s.next}
          </p>
        </article>
      ))}
      <h2>Official sources</h2>
      {guide.sources.map((s) => (
        <p key={s.url}>
          {s.label}: {s.url}
        </p>
      ))}
    </section>
  );
}
