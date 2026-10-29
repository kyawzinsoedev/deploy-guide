import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { defaultConfig, stacks } from "../src/content/stacks";
import {
  defaultDirectory,
  phpVersions,
  isWindows,
  osLabel,
  serverOptions,
} from "../src/content/platforms";
import { generateGuide, generateNginx } from "../src/lib/generator";
import { generateWindowsService } from "../src/lib/windows-commands";
import {
  validateConfig,
  powershellQuote,
  configKey,
} from "../src/lib/validation";
import { toMarkdown } from "../src/lib/downloads";
import type { GuideConfig } from "../src/lib/types";

for (const os of serverOptions)
  for (const version of phpVersions)
    test(`${os.label}, PHP ${version.id}: runtime selection is consistent`, () => {
      const c: GuideConfig = {
        ...defaultConfig,
        os: os.id,
        stack: "laravel",
        runtime: version.id,
        directory: defaultDirectory(os.id, "my-app"),
      };
      assert.deepEqual(validateConfig(c), {});
      const g = generateGuide(c),
        md = toMarkdown(g);
      assert.equal(g.steps.length, 7);
      assert.ok(md.includes(osLabel(c.os)));
      assert.ok(md.includes(`PHP ${version.id}`));
      assert.ok(!/undefined|\$\{c\.|TODO|YOUR_SERVER/.test(md));
      if (isWindows(c.os)) {
        assert.ok(g.webConfig!.includes(`C:\\PHP\\${version.id}\\php-cgi.exe`));
        assert.ok(md.includes(`C:\\PHP\\${version.id}\\php.exe`));
        assert.ok(!md.includes("sudo "));
        assert.ok(!g.webConfig!.includes("php-fpm"));
        assert.ok(md.includes("PCNTL"));
      } else {
        assert.ok(g.nginx.includes(`php${version.id}-fpm.sock`));
        assert.ok(md.includes(`php${version.id}-cli`));
        assert.ok(md.includes(`php${version.id} /usr/bin/composer install`));
        assert.ok(md.includes(`/usr/bin/php${version.id} `));
        assert.equal(
          md.includes("sudo add-apt-repository ppa:ondrej/php"),
          version.id !== "8.3",
        );
      }
      assert.notEqual(configKey(c), configKey({ ...c, runtime: "none" }));
    });

for (const os of ["windows-2022", "windows-2025"] as const)
  for (const stack of stacks)
    for (const packageManager of ["npm", "pnpm"] as const)
      for (const www of [false, true])
        test(`${os} ${stack.id} ${packageManager} www=${www}: complete native guide`, () => {
          const c: GuideConfig = {
            ...defaultConfig,
            os,
            stack: stack.id,
            runtime: stack.runtime,
            directory: defaultDirectory(os, "my-app"),
            packageManager,
            www,
          };
          const g = generateGuide(c),
            md = toMarkdown(g);
          assert.equal(
            g.steps.length,
            stack.id === "html" ? 5 : stack.mode === "static" ? 6 : 7,
          );
          assert.equal(g.nginx, "");
          assert.throws(() => generateNginx(c));
          assert.ok(g.webConfig?.includes("<configuration>"));
          assert.ok(!/undefined|\$\{c\.|TODO|YOUR_DOMAIN|YOUR_SERVER/.test(md));
          for (const s of [...g.steps, ...(g.references ?? [])]) {
            for (const f of [
              "goal",
              "why",
              "how",
              "before",
              "expected",
              "next",
            ] as const)
              assert.ok(s[f].length > 20, `${s.id}.${f}`);
            assert.ok(
              s.blocks.length &&
                s.breakdown.length &&
                s.problems.length &&
                s.verification.code,
            );
          }
          assert.ok(
            md.indexOf("DNS records to configure") <
              md.indexOf("Run the certificate client"),
          );
          assert.equal(
            md.includes(
              "New-WebBinding -Name 'my-app' -Protocol http -Port 80 -HostHeader 'www.example.com'",
            ),
            www,
          );
          assert.ok(md.includes("Application pool identity"));
          if (stack.mode === "node") {
            const xml = generateWindowsService(c);
            assert.ok(xml.includes("<user>LocalService</user>"));
            assert.ok(!xml.includes("LocalSystem"));
            assert.ok(g.webConfig!.includes("http://127.0.0.1:3000/"));
          } else if (stack.mode === "static") {
            assert.ok(
              !g.steps.some(
                (s) => s.id === "win-runtime" || s.id === "win-process",
              ),
            );
            for (const block of g.steps
              .flatMap((s) => s.blocks)
              .filter((b) =>
                /npm.cmd ci|pnpm.cmd install|\.cmd run build/.test(b.code),
              ))
              assert.equal(block.location, "Your computer");
          }
        });

test("Windows input validation rejects shell characters, traversal and reserved filenames", () => {
  const c: GuideConfig = {
    ...defaultConfig,
    os: "windows-2025",
    directory: "C:\\Sites\\my-app",
  };
  for (const directory of [
    "C:\\Windows",
    "C:\\Sites\\..\\Windows",
    "C:\\Sites\\a;whoami",
    "C:\\Sites\\a b",
    "C:\\Sites\\a`id",
    "C:\\Sites\\NUL",
    "C:\\Sites\\CON",
    "\\\\server\\share",
    "/var/www/my-app",
  ]) {
    assert.ok(validateConfig({ ...c, directory }).directory, directory);
    assert.throws(() => generateGuide({ ...c, directory }));
  }
  assert.ok(
    validateConfig({ ...c, username: "abcdefghijklmnopqrstu" }).username,
  );
  assert.equal(
    powershellQuote("it's $env:USER; $(whoami)"),
    "'it''s $env:USER; $(whoami)'",
  );
  assert.ok(
    validateConfig({
      ...c,
      stack: "laravel",
      runtime: "8.6" as GuideConfig["runtime"],
    }).runtime,
  );
});

test("Windows PowerShell and XML parse without executing deployment commands", (context) => {
  if (process.platform !== "win32") {
    context.skip("Native PowerShell parser requires Windows.");
    return;
  }
  const blocks: { name: string; code: string }[] = [],
    xml: { name: string; code: string }[] = [];
  for (const stack of stacks)
    for (const runtime of stack.id === "laravel"
      ? phpVersions.map((v) => v.id)
      : [stack.runtime]) {
      const c: GuideConfig = {
        ...defaultConfig,
        os: "windows-2025",
        directory: "C:\\Sites\\my-app",
        stack: stack.id,
        runtime,
      };
      const g = generateGuide(c);
      for (const step of [...g.steps, ...(g.references ?? [])])
        for (const block of [...step.blocks, step.verification]) {
          if (block.language === "powershell")
            blocks.push({
              name: stack.id + "/" + block.title,
              code: block.code,
            });
          if (block.language === "xml")
            xml.push({ name: stack.id + "/" + block.title, code: block.code });
        }
    }
  const script = `$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
 $failures = @()
 foreach ($block in $data.blocks) { $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseInput($block.code,[ref]$tokens,[ref]$errors) | Out-Null; foreach($e in $errors){$failures += ($block.name + ': ' + $e.Message)} }
 foreach ($block in $data.xml) { try { $parsed=[xml]$block.code; if($parsed.configuration -and @($parsed.configuration.'system.webServer'.rewrite).Count -gt 1){throw 'Duplicate rewrite element'} } catch { $failures += ($block.name + ': ' + $_.Exception.Message) } }
 if($failures.Count) { $failures | Write-Output; exit 1 }
 Write-Output ('Parsed ' + $data.blocks.Count + ' PowerShell blocks and ' + $data.xml.Count + ' XML blocks.')`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { input: JSON.stringify({ blocks, xml }), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
});
