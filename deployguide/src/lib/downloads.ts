import type { CodeBlock, Guide, Step } from "./types";
import { runtimeLabel, osLabel } from "@/content/platforms";

function blockMarkdown(block: CodeBlock): string {
  return `#### ${block.title}\n\n${block.optional ? `**Optional:** ${block.optional}\n\n` : ""}Run in: ${block.location}. ${block.changes ? "Changes files or server state." : "Read-only / educational."}\n\n\`\`\`${block.language}\n${block.code}\n\`\`\`\n`;
}

function taskMarkdown(step: Step): string {
  return `**Goal:** ${step.goal}\n\n**Why this is needed:** ${step.why}\n\n**How it works:** ${step.how}\n\n**Before you run it:** ${step.before}\n\n${step.note ? `**Note:** ${step.note}\n\n` : ""}${step.blocks.map(blockMarkdown).join("\n")}\n**Command breakdown**\n\n${step.breakdown.map((b) => `- **${b.term}**: ${b.explanation}`).join("\n")}\n\n**Expected result:** ${step.expected}\n\n**Verification**\n\n${blockMarkdown(step.verification)}\n**Common problems**\n\n${step.problems.map((p) => `- **${p.symptom}** — ${p.cause} ${p.fix}`).join("\n")}\n`;
}

export function toMarkdown(guide: Guide): string {
  const runtime = runtimeLabel(guide.config);
  return (
    `# DeployGuide · ${guide.stack.name} (${guide.stack.badge})\n\nDomain: ${guide.config.domain}\n\n${osLabel(guide.config.os)} · ${runtime}\n\nDocumentation reviewed: ${guide.reviewedOn}. Not executed on a live server by DeployGuide.\n\n${guide.steps.length} launch steps. All commands are run by you. A completed checkbox is personal progress, not server verification.\n\n` +
    [
      ...guide.steps,
      ...(guide.references ?? []),
      ...(guide.automation?.steps ?? []),
    ]
      .map(
        (step, i) =>
          `## ${i < guide.steps.length ? `${i + 1}.` : step.id.startsWith("ci-") ? "Optional CI/CD:" : "Reference:"} ${step.title}\n\n` +
          (step.parts
            ? `**Goal:** ${step.goal}\n\n**Why this is needed:** ${step.why}\n\n` +
              step.parts
                .map(
                  (part, j) =>
                    `### Task ${j + 1}: ${part.title}\n\n${taskMarkdown(part)}`,
                )
                .join("\n")
            : taskMarkdown(step)) +
          `\n**Next step:** ${step.next}\n`,
      )
      .join("\n") +
    `\n## Official sources\n\n${guide.sources.map((s) => `- [${s.label}](${s.url})`).join("\n")}\n`
  );
}

export function downloadText(
  filename: string,
  content: string,
  type = "text/plain",
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
