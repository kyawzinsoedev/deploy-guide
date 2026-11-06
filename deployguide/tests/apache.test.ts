import { test } from "node:test";
import assert from "node:assert/strict";
import { generateApache } from "../src/lib/apache";
import { generateGuide } from "../src/lib/generator";
import { defaultConfig, stacks } from "../src/content/stacks";
import { databaseName, databaseUser } from "../src/content/databases";
import { configKey, validateConfig } from "../src/lib/validation";
import { toMarkdown } from "../src/lib/downloads";
import type { GuideConfig } from "../src/lib/types";

const windows: GuideConfig = {
  ...defaultConfig,
  os: "windows-2025",
  directory: "C:\\Sites\\my-app",
};
for (const stack of stacks)
  test(`${stack.id}: Apache HTTP and TLS retain routing and ACME access`, () => {
    const c: GuideConfig = {
      ...windows,
      stack: stack.id,
      runtime: stack.runtime,
      www: true,
    };
    const http = generateApache(c),
      tls = generateApache(c, true);
    assert.ok(
      !http.includes("SSLCertificateFile"),
      "initial HTTP must work before issuance",
    );
    assert.ok(
      tls.includes(
        'SSLCertificateFile "C:/ProgramData/DeployGuide/my-app/tls/my-app-chain.pem"',
      ),
    );
    assert.ok(tls.includes("my-app-key.pem"));
    for (const conf of [http, tls]) {
      assert.ok(conf.includes("ServerAlias www.example.com"));
      assert.ok(conf.includes("Alias /.well-known/acme-challenge/"));
      assert.ok(conf.includes("Require all denied"));
      assert.ok(!/undefined|\$\{/.test(conf));
      if (stack.mode === "node") {
        assert.ok(
          conf.indexOf("ProxyPass /.well-known/acme-challenge/ !") <
            conf.indexOf("ProxyPass / http://"),
        );
        assert.ok(conf.includes("ProxyRequests Off"));
        assert.ok(conf.includes("RequestHeader unset X-Forwarded-For"));
      } else assert.ok(conf.includes("AllowOverride None"));
    }
    if (stack.id === "laravel") {
      assert.ok(http.includes('DocumentRoot "C:/Sites/my-app/public"'));
      assert.ok(http.includes("SetHandler application/x-httpd-php"));
      const guard = http
        .match(/<LocationMatch "(\(\?i\)\^\/[^\n]+)">/)![1]
        .replace("(?i)", "");
      const deny = new RegExp(guard, "i");
      for (const path of [
        "/storage/index.php",
        "/storage/INDEX.PHP",
        "/shell.phtml",
        "/index.php.bak",
      ])
        assert.ok(deny.test(path), path);
      assert.ok(!deny.test("/index.php"));
      assert.ok(!deny.test("/build/app.js"));
    }
  });

test("Windows automation preserves administrator-owned Apache config", () => {
  const guide = generateGuide({ ...windows, stack: "laravel", runtime: "8.5" });
  const files = guide.automation!.files.map((f) => f.content).join("\n");
  const md = toMarkdown(guide);
  assert.ok(!files.includes("web.config"));
  assert.ok(!files.includes("IIS AppPool"));
  assert.ok(files.includes("dg-httpd:(OI)(CI)(M)"));
  assert.ok(md.includes("DocumentRoot and its matching Directory path"));
  assert.ok(md.includes("C:\\Apache24\\bin\\httpd.exe"));
  assert.ok(
    md.indexOf("DNS records to configure") <
      md.indexOf("Run the certificate client"),
  );
  assert.ok(md.includes("PHP 8.5"));
});

test("Laravel has an explained, conditional database task before configuration", () => {
  for (const c of [
    { ...windows, stack: "laravel", runtime: "8.4" },
    { ...defaultConfig, stack: "laravel", runtime: "8.4" },
  ] as GuideConfig[]) {
    const guide = generateGuide(c),
      md = toMarkdown(guide);
    const dbIndex = guide.steps.findIndex((s) => s.id === "database-ready");
    assert.ok(dbIndex > 0);
    assert.ok(
      dbIndex <
        guide.steps.findIndex(
          (s) => s.id === (c.os === "24.04" ? "production-build" : "win-files"),
        ),
    );
    assert.ok(md.includes("DB_HOST=127.0.0.1"));
    assert.ok(md.includes("DB_DATABASE=my_app"));
    assert.ok(!/^DB_PASSWORD=/m.test(md));
    assert.ok(md.includes("existing or managed database"));
    assert.ok(md.includes("React/Inertia"));
    assert.ok(md.includes("public/build"));
    assert.equal(
      md.includes("IDENTIFIED BY RANDOM PASSWORD"),
      c.os === "24.04",
    );
  }
});

test("Database names and Windows progress cannot collide with unsafe input or old IIS progress", () => {
  const c = { ...windows, appName: "a".repeat(40) };
  assert.equal(databaseName(c).length, 40);
  assert.equal(databaseUser(c).length, 32);
  assert.ok(validateConfig({ ...windows, username: "dg-httpd" }).username);
  assert.ok(configKey(windows).startsWith("deployguide:progress:v3:"));
  assert.ok(configKey(defaultConfig).startsWith("deployguide:progress:v2:"));
  assert.throws(() =>
    generateApache({ ...windows, domain: "x.example.com\nProxyRequests On" }),
  );
});
