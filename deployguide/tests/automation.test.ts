import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { format } from "prettier";
import { defaultConfig, stacks } from "../src/content/stacks";
import {
  defaultDirectory,
  isWindows,
  phpVersions,
  serverOptions,
} from "../src/content/platforms";
import { generateGuide, guidePages } from "../src/lib/generator";
import {
  actions,
  generateWorkflow,
  generateLinuxDeploy,
  generateWindowsDeploy,
} from "../src/lib/cicd";
import { toMarkdown } from "../src/lib/downloads";
import type { GuideConfig } from "../src/lib/types";

const configurations: GuideConfig[] = serverOptions.flatMap((os) =>
  stacks.flatMap((stack) =>
    (["npm", "pnpm"] as const).flatMap((packageManager) =>
      (stack.id === "laravel"
        ? phpVersions.map((p) => p.id)
        : [stack.runtime]
      ).map((runtime) => ({
        ...defaultConfig,
        os: os.id,
        stack: stack.id,
        runtime,
        packageManager,
        directory: defaultDirectory(os.id, "my-app"),
      })),
    ),
  ),
);

for (const c of configurations)
  test(`CI/CD ${c.os} ${c.stack} ${c.runtime} ${c.packageManager}`, async () => {
    const guide = generateGuide(c),
      automation = guide.automation!;
    assert.equal(automation.steps.length, 6);
    assert.equal(
      guide.steps.length,
      c.stack === "html"
        ? 5
        : ["vite", "next-static"].includes(c.stack)
          ? 6
          : 7,
    );
    assert.equal(
      new Set(guidePages(guide).map((s) => s.id)).size,
      guidePages(guide).length,
    );
    const workflow = generateWorkflow(c);
    // Prettier's YAML parser rejects malformed YAML without installing a runtime dependency.
    await format(workflow, { parser: "yaml" });
    assert.match(workflow, /needs: check/);
    assert.match(workflow, /environment: production/);
    assert.match(workflow, /github.event.repository.private == true/);
    assert.match(
      workflow,
      /github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/,
    );
    assert.match(workflow, /cancel-in-progress: false/);
    assert.match(workflow, /persist-credentials: false/);
    assert.ok(!workflow.includes("pull_request_target"));
    assert.equal((workflow.match(/self-hosted/g) ?? []).length, 1);
    assert.ok(
      workflow.includes(
        isWindows(c.os) ? `runs-on: ${c.os}` : "runs-on: ubuntu-24.04",
      ),
    );
    for (const s of automation.steps) {
      for (const field of [
        "goal",
        "why",
        "how",
        "before",
        "expected",
        "next",
      ] as const)
        assert.ok(s[field].length > 30, `${s.id}.${field}`);
      assert.ok(
        s.blocks.length &&
          s.breakdown.length &&
          s.problems.length &&
          s.verification.code,
      );
    }
    const md = toMarkdown(guide);
    assert.ok(md.includes("Optional CI/CD:") && md.includes("deployguide.yml"));
    assert.ok(!/undefined|\$\{c\.|TODO|YOUR_DOMAIN|<your/.test(md));
    const script = automation.files[1].content;
    assert.ok(
      script.includes("releases") &&
        script.includes("previous") &&
        script.includes("ready"),
    );
    assert.ok(!/artisan migrate|artisan key:generate|chmod 777/.test(script));
    if (c.stack === "laravel") {
      assert.ok(workflow.includes(`php-version: '${c.runtime}'`));
      assert.ok(
        script.includes(
          isWindows(c.os) ? `PHP\\${c.runtime}\\php.exe` : `php${c.runtime}`,
        ),
      );
      assert.ok(script.includes("shared") && script.includes("storage"));
    }
  });

test("actions use complete reviewed commit pins and generators reject invalid inputs", () => {
  for (const action of Object.values(actions))
    assert.match(action, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
  for (const generate of [
    generateWorkflow,
    generateLinuxDeploy,
    generateWindowsDeploy,
  ])
    assert.throws(() => generate({ ...defaultConfig, appName: "a;id" }));
  assert.throws(() => generateWindowsDeploy(defaultConfig));
  assert.throws(() =>
    generateLinuxDeploy({
      ...defaultConfig,
      os: "windows-2025",
      directory: "C:\\Sites\\my-app",
    }),
  );
});

test("all automation Bash snippets parse without executing server changes", () => {
  const bash =
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const blocks: string[] = [];
  for (const c of configurations.filter((c) => !isWindows(c.os))) {
    const guide = generateGuide(c);
    for (const step of guide.automation!.steps)
      for (const b of [...step.blocks, step.verification])
        if (b.language === "bash") blocks.push(b.code);
  }
  const result = spawnSync(bash, ["-n"], {
    input: blocks.map((b) => `(\n${b}\n)`).join("\n"),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("all automation PowerShell snippets parse without executing server changes", (context) => {
  if (process.platform !== "win32") {
    context.skip("Requires the native PowerShell parser");
    return;
  }
  const blocks: { name: string; code: string }[] = [];
  for (const c of configurations.filter((c) => isWindows(c.os)))
    for (const step of generateGuide(c).automation!.steps)
      for (const b of [...step.blocks, step.verification])
        if (b.language === "powershell")
          blocks.push({ name: `${c.stack}/${b.title}`, code: b.code });
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$data = [Console]::In.ReadToEnd() | ConvertFrom-Json; $failures = @(); foreach ($b in $data) { $tokens=$null; $errors=$null; [Management.Automation.Language.Parser]::ParseInput($b.code,[ref]$tokens,[ref]$errors) | Out-Null; foreach($e in $errors) { $failures += ($b.name + ': ' + $e.Message) } }; if ($failures.Count) { $failures; exit 1 }`,
    ],
    { input: JSON.stringify(blocks), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
