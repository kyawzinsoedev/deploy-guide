import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
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
import { powershellQuote } from "../src/lib/validation";

test("Windows static release activates and restores previous files after an HTTP failure", (context) => {
  if (process.platform !== "win32") {
    context.skip("Requires Windows junctions and PowerShell");
    return;
  }
  const qaRoot = resolve(process.cwd(), "qa");
  mkdirSync(qaRoot, { recursive: true });
  const fixture = mkdtempSync(join(qaRoot, "release-simulation-"));
  // All filesystem mutations are isolated inside this explicitly checked fixture.
  assert.ok(resolve(fixture).startsWith(qaRoot + sep));
  try {
    const base = join(fixture, "app-releases"),
      seed = join(base, "releases", "bootstrap"),
      payload = join(fixture, "payload");
    for (const dir of [
      join(base, "control"),
      join(base, "shared"),
      join(seed, "public"),
      join(payload, "public"),
    ])
      mkdirSync(dir, { recursive: true });
    writeFileSync(join(base, "control", "ready"), "");
    writeFileSync(join(base, "shared", "web.config"), "<configuration />");
    writeFileSync(join(seed, "public", "index.html"), "old release");
    writeFileSync(join(payload, "public", "index.html"), "new release");
    symlinkSync(seed, join(base, "current"), "junction");
    const archive = join(fixture, "release.tgz");
    const tar = spawnSync("tar.exe", ["-czf", archive, "public"], {
      cwd: payload,
      encoding: "utf8",
    });
    assert.equal(tar.status, 0, tar.stderr);
    const c: GuideConfig = {
      ...defaultConfig,
      os: "windows-2025",
      directory: "C:\\Sites\\my-app",
      stack: "html",
      runtime: "none",
    };
    const script = generateWindowsDeploy(c).replace(
      "$base = 'C:\\Sites\\my-app-releases'",
      "$base = " + powershellQuote(base),
    );
    assert.ok(script.includes("$base = " + powershellQuote(base)));
    const scriptFile = join(fixture, "deploy.ps1");
    writeFileSync(scriptFile, script);
    const run = (id: string, fail: boolean) =>
      spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `
      $fixtureBase = ${powershellQuote(base)}
      function Start-Sleep { param($Seconds) }
      function Invoke-WebRequest {
        param([switch]$UseBasicParsing, $Uri, $TimeoutSec)
        ${fail ? "throw 'Simulated HTTP failure'" : ""}
        $content = if ($Uri.EndsWith('/deployguide-release.txt')) { Get-Content -LiteralPath "$fixtureBase\\current\\public\\deployguide-release.txt" -Raw } else { 'ok' }
        [pscustomobject]@{ StatusCode=200; Content=$content }
      }
      try { & ${powershellQuote(scriptFile)} -Archive ${powershellQuote(archive)} -ReleaseId ${powershellQuote(id)}; exit 0 } catch { Write-Output $_; exit 1 }
    `,
        ],
        { encoding: "utf8" },
      );
    const first = "a".repeat(40) + "-1-1";
    const success = run(first, false);
    assert.equal(success.status, 0, success.stdout + success.stderr);
    assert.equal(
      readFileSync(join(base, "current", "public", "index.html"), "utf8"),
      "new release",
    );
    assert.equal(
      resolve(readlinkSync(join(base, "current"))),
      resolve(base, "releases", first),
    );
    const failed = run("b".repeat(40) + "-2-1", true);
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.equal(
      resolve(readlinkSync(join(base, "current"))),
      resolve(base, "releases", first),
    );
    assert.equal(
      readFileSync(join(seed, "public", "index.html"), "utf8"),
      "old release",
    );
  } finally {
    const checked = resolve(fixture);
    assert.ok(checked.startsWith(qaRoot + sep) && checked !== qaRoot);
    rmSync(checked, { recursive: true, force: true });
  }
});

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
