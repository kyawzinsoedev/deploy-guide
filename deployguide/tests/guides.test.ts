import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { defaultConfig, stacks } from "../src/content/stacks";
import {
  generateGuide,
  generateNginx,
  generateService,
} from "../src/lib/generator";
import { validateConfig, shellQuote, configKey } from "../src/lib/validation";
import { toMarkdown } from "../src/lib/downloads";
import type { Guide, Step, GuideConfig } from "../src/lib/types";

function tasks(g: Guide): Step[] {
  return [...g.steps, ...(g.references ?? [])].flatMap((s) => s.parts ?? [s]);
}
function task(g: Guide, id: string): Step {
  const found = tasks(g).find((s) => s.id === id);
  assert.ok(found, id);
  return found;
}
for (const stack of stacks)
  for (const packageManager of ["npm", "pnpm"] as const)
    for (const www of [false, true]) {
      test(`${stack.id}: ${packageManager}, www=${www} produces a complete personalized guide`, () => {
        const config: GuideConfig = {
          ...defaultConfig,
          stack: stack.id,
          runtime: stack.runtime,
          packageManager,
          www,
          domain: "app.example.org",
          appName: "release-app",
          directory: "/var/www/release-app",
          username: "publisher",
          port: "4100",
          repository: "https://github.com/example/site.git",
        };
        const guide = generateGuide(config);
        const count = stack.id === "html" ? 5 : stack.mode === "static" ? 6 : 7;
        assert.equal(guide.steps.length, count);
        assert.equal(new Set(guide.steps.map((s) => s.id)).size, count);
        for (const step of [...guide.steps, ...tasks(guide)]) {
          for (const field of [
            "goal",
            "why",
            "how",
            "before",
            "expected",
            "next",
          ] as const)
            assert.ok(step[field].length > 20, `${step.id}.${field}`);
          assert.ok(step.blocks.length);
          assert.ok(step.breakdown.length);
          assert.ok(step.problems.length);
          assert.ok(step.verification.code);
        }
        const md = toMarkdown(guide);
        assert.ok(md.includes("app.example.org"));
        assert.ok(md.includes("publisher"));
        assert.ok(md.includes(guide.reviewedOn));
        assert.ok(md.includes("Official sources"));
        assert.ok(
          !/undefined|\$\{c\.|TODO|YOUR_DOMAIN|YOUR_SERVER|<your/i.test(md),
        );
        assert.ok(
          guide.nginx.includes(
            `server_name app.example.org${www ? " www.app.example.org" : ""};`,
          ),
        );
        assert.ok(md.indexOf("Configure DNS") < md.indexOf("Set up HTTPS"));
        if (stack.mode === "node") {
          assert.ok(guide.nginx.includes("proxy_pass http://127.0.0.1:4100"));
          assert.ok(!guide.nginx.includes("root /var/www"));
          assert.ok(generateService(config).includes("User=publisher"));
          assert.ok(!generateService(config).includes("User=root"));
          assert.ok(md.includes("systemd"));
        }
        if (stack.id === "html")
          assert.ok(guide.nginx.includes("root /var/www/release-app/public;"));
        if (stack.id === "vite") {
          assert.ok(guide.nginx.includes("root /var/www/release-app/dist;"));
          assert.ok(guide.nginx.includes("try_files $uri $uri/ /index.html;"));
        }
        if (stack.id === "next-static") {
          assert.ok(guide.nginx.includes("root /var/www/release-app/out;"));
          assert.ok(guide.nginx.includes("try_files $uri $uri/ =404;"));
          assert.ok(md.includes("output: 'export'"));
        }
        if (stack.id === "laravel") {
          assert.ok(guide.nginx.includes("root /var/www/release-app/public;"));
          assert.ok(guide.nginx.includes("/run/php/php8.3-fpm.sock"));
          assert.ok(guide.nginx.includes("location ~ \\.php$ { return 404; }"));
          assert.ok(md.includes("Restart=always"));
          assert.ok(md.includes("APP_DEBUG=false"));
        }
        assert.ok(md.includes("sudo nginx -t && sudo systemctl reload nginx"));
        assert.ok(md.includes("renew --dry-run"));
      });
    }
test("attack-like and unsupported configuration values never reach generators", () => {
  const attacks: Partial<GuideConfig>[] = [
    { domain: "example.com;id" },
    { domain: "$(id).com" },
    { domain: "example.com\n" },
    { domain: "https://example.com" },
    { domain: "example.com/path" },
    { username: "root" },
    { username: "deploy;id" },
    { username: "www-data" },
    { directory: "/var/www/site/../../etc" },
    { directory: "/etc/nginx" },
    { directory: "/var/www/a b" },
    { directory: "/var/www/a$(id)" },
    { appName: "app\n" },
    { appName: "a;reboot" },
    { serverIp: "999.0.0.1" },
    { serverIp: "1.2.3.4;id" },
    { serverIp: "127.01.0.1" },
    { repository: "https://token@github.com/a/b" },
    { repository: "https://github.com/a/b?token=secret" },
    { repository: "git@github.com:a/b" },
    { repository: "https://github.com/a/../b" },
    { os: "22.04" as "24.04" },
    { runtime: "8.3" },
    { stack: "unknown" as GuideConfig["stack"] },
    { www: "yes" as unknown as boolean },
  ];
  for (const attack of attacks) {
    const config = { ...defaultConfig, ...attack };
    assert.ok(
      Object.keys(validateConfig(config)).length,
      JSON.stringify(attack),
    );
    assert.throws(() => generateGuide(config));
    assert.throws(() => generateNginx(config));
  }
});
test("ports must be unprivileged, numeric and within the TCP range", () => {
  for (const port of [
    "80",
    "0",
    "1023",
    "65536",
    "3000;id",
    "3000\n",
    "3e3",
    "-3000",
  ])
    assert.ok(
      validateConfig({ ...defaultConfig, stack: "express", port }).port,
    );
  for (const port of ["1024", "3000", "65535"])
    assert.equal(
      validateConfig({ ...defaultConfig, stack: "express", port }).port,
      undefined,
    );
});
test("shellQuote treats shell metacharacters and embedded quotes as literal data", () => {
  assert.equal(shellQuote("it's a $HOME; $(id)"), "'it'\\''s a $HOME; $(id)'");
  assert.equal(shellQuote(""), "''");
});
test("saved progress is scoped to every guide setting", () => {
  const key = configKey(defaultConfig);
  assert.ok(key.startsWith("deployguide:progress:v2:"));
  for (const override of [
    { domain: "other.example.com" },
    { www: false },
    { port: "4000" },
    { username: "publisher" },
    { directory: "/var/www/other" },
    { packageManager: "pnpm" as const },
    { repository: "https://github.com/a/b" },
  ])
    assert.notEqual(key, configKey({ ...defaultConfig, ...override }));
  assert.equal(key, configKey({ ...defaultConfig }));
});

test("static launch paths build locally and never install or run Node on the server", () => {
  for (const stack of stacks.filter((s) => s.mode === "static")) {
    const g = generateGuide({
      ...defaultConfig,
      stack: stack.id,
      runtime: stack.runtime,
    });
    assert.ok(
      !g.steps.some(
        (s) => s.id === "production-build" || s.id === "application-ready",
      ),
    );
    const all = g.steps.flatMap((s) => s.blocks);
    assert.ok(
      !all.some((b) => /ExecStart|setup_24|install -y nodejs/.test(b.code)),
    );
    for (const b of all.filter((b) =>
      /npm ci|pnpm install|run build/.test(b.code),
    ))
      assert.equal(b.location, "Your computer");
    assert.ok(
      task(g, "upload-output").blocks.some((b) => b.code.includes("--dry-run")),
    );
    assert.ok(g.references?.some((s) => s.id === "maintain"));
    if (stack.id === "html")
      assert.ok(!all.some((b) => /npm |pnpm |node --/.test(b.code)));
  }
});

test("optional Laravel actions are conditional and downloads preserve task context", () => {
  const g = generateGuide({
    ...defaultConfig,
    stack: "laravel",
    runtime: "8.3",
  });
  const blocks = task(g, "process").blocks;
  assert.ok(
    blocks
      .filter((b) => b.title.startsWith("Optional"))
      .every((b) => Boolean(b.optional)),
  );
  const keyBlock = task(g, "build").blocks.find((b) =>
    b.code.includes("key:generate"),
  )!;
  assert.ok(keyBlock.optional?.includes("Never regenerate"));
  const md = toMarkdown(g);
  assert.ok(md.includes("**Optional:**"));
  for (const part of tasks(g)) {
    assert.ok(md.includes(part.before));
    assert.ok(md.includes(part.expected));
    assert.ok(md.includes(part.verification.code));
  }
  assert.ok(!md.includes("from step 8"));
});

test("first setup stops before mutating an existing deployment", () => {
  const setup = task(generateGuide(defaultConfig), "prepare").blocks.find((b) =>
    b.code.includes("sudo adduser"),
  )!.code;
  assert.ok(setup.indexOf("getent passwd") < setup.indexOf("sudo adduser"));
  assert.ok(setup.includes("set -eu"));
  assert.ok(setup.includes("exit 1"));
});
test("upload paths are safe and uploads preview changes without deleting remote files", () => {
  for (const stack of stacks) {
    const g = generateGuide({
      ...defaultConfig,
      stack: stack.id,
      runtime: stack.runtime,
    });
    const code = task(g, stack.mode === "static" ? "upload-output" : "project")
      .blocks.map((b) => b.code)
      .join("\n");
    assert.ok(code.includes("--dry-run"));
    assert.ok(!code.includes("--delete"));
    assert.ok(code.includes("--exclude '.env*'"));
  }
});
test("Node and static Next use different production execution paths", () => {
  const node = { ...defaultConfig, stack: "next-node" as const };
  assert.ok(
    generateService(node).includes(
      "next start --hostname 127.0.0.1 --port 3000",
    ),
  );
  const staticGuide = generateGuide({ ...defaultConfig, stack: "next-static" });
  assert.ok(
    !staticGuide.steps
      .flatMap((s) => s.blocks)
      .map((b) => b.code)
      .join("\n")
      .includes("ExecStart"),
  );
});

test("generated shell blocks parse without executing any commands", (context) => {
  const bash =
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const available = spawnSync(bash, ["--version"], { encoding: "utf8" });
  if (available.error) {
    context.skip("Bash is unavailable on this test host.");
    return;
  }
  const scripts: string[] = [];
  for (const stack of stacks) {
    for (const repository of ["", "https://github.com/example/site.git"]) {
      const guide = generateGuide({
        ...defaultConfig,
        stack: stack.id,
        runtime: stack.runtime,
        repository,
      });
      for (const step of guide.steps) {
        for (const block of [...step.blocks, step.verification].filter(
          (b) => b.language === "bash",
        )) {
          scripts.push(
            `# ${stack.id}/${step.id}/${block.title}\n(\n:\n${block.code}\n)\n`,
          );
        }
      }
    }
  }
  const result = spawnSync(bash, ["-n"], {
    input: scripts.join("\n"),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("Laravel upload preserves only the environment template and restricts group writes", () => {
  const guide = generateGuide({
    ...defaultConfig,
    stack: "laravel",
    runtime: "8.3",
  });
  const upload = task(guide, "project")
    .blocks.map((b) => b.code)
    .join("\n");
  assert.ok(
    upload.indexOf("--include '.env.example'") <
      upload.indexOf("--exclude '.env*'"),
  );
  const permissions = task(guide, "process")
    .blocks.map((b) => b.code)
    .join("\n");
  assert.ok(permissions.includes("sudo chmod -R g-w,o-rwx '/var/www/my-app'"));
  assert.ok(permissions.includes("-type d -exec chmod 2770"));
  assert.ok(
    task(guide, "prepare").blocks.some((b) =>
      b.code.includes("usermod -aG www-data"),
    ),
  );
});
