import type { GuideConfig } from "./types";
import {
  assertValid,
  powershellQuote as pq,
  shellQuote as q,
} from "./validation";
import { isWindows } from "@/content/platforms";

/** Reviewed release commits, not mutable action tags. Revisit when updating the review date. */
export const actions = {
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", // v7.0.1
  node: "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", // v7.1.0
  upload: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9", // v7.0.2
  download:
    "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333", // v8.0.2
  php: "shivammathur/setup-php@eb7c497e18156a6bbabfef1d3a82760b9eda3962", // 2.40.0
  pnpm: "pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413", // v6.1.0
};
export const isNodeApp = (c: GuideConfig) =>
  ["express", "next-node"].includes(c.stack);
export const isStaticApp = (c: GuideConfig) =>
  !isNodeApp(c) && c.stack !== "laravel";
export const outputFolder = (c: GuideConfig) =>
  c.stack === "vite" ? "dist" : c.stack === "next-static" ? "out" : "public";
export const releaseBase = (c: GuideConfig) => c.directory + "-releases";

export function generateWorkflow(c: GuideConfig): string {
  assertValid(c);
  const win = isWindows(c.os),
    php = c.stack === "laravel",
    js = c.stack !== "html";
  const pm = c.packageManager;
  const indent = (s: string, n = 10) =>
    s
      .split("\n")
      .map((l) => " ".repeat(n) + l)
      .join("\n");
  const install = pm === "npm" ? "npm ci" : "pnpm install --frozen-lockfile";
  const checks =
    c.stack === "html"
      ? "test -s public/index.html\n# Structural check only: add your HTML validator/browser tests here."
      : php
        ? `composer validate --strict\ncomposer install --prefer-dist --no-interaction\n# Your ci script must use a disposable test database and test-only settings.\ncomposer run-script ci\nif [ -f package.json ]; then\n  ${install}\n  ${pm} run build\nfi`
        : `${install}\n# Required: define a non-interactive ci script that fails on test errors.\n${pm} run ci\n${c.stack === "express" ? (pm === "npm" ? "npm run build --if-present" : "pnpm run --if-present build") : `${pm} run build`}`;
  const archive = isStaticApp(c)
    ? `test -s ${outputFolder(c)}/index.html\ntest -z "$(find ${outputFolder(c)} -name '.env*' -o -name '.git')"\ntar -czf "$artifact_dir/release.tgz" ${outputFolder(c)}`
    : `# Preserve build output, but never package local secrets or runtime data.\n# Tar is outside the project, so it cannot include itself.\ntar --exclude='./.git' --exclude='./.github' --exclude='./node_modules' --exclude='./vendor' --exclude='./.env*' --exclude='./storage' --exclude='*.sqlite' --exclude='*.sqlite-*' --exclude='*.log' --exclude='./bootstrap/cache/*.php' --exclude='./.next/cache' -czf "$artifact_dir/release.tgz" .`;
  return `# DeployGuide · reviewed 2026-10-29 · single-package repositories only.
# Read all CI/CD setup steps before enabling the deployment runner.
name: Checks and release
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  check:
    runs-on: ${win ? c.os : "ubuntu-24.04"}
    timeout-minutes: 30
    defaults:
      run:
        shell: bash
    steps:
      - uses: ${actions.checkout}
        with:
          persist-credentials: false
${
  js
    ? `      - uses: ${actions.node}
        with:
          node-version: '24'
          package-manager-cache: false
${
  pm === "pnpm"
    ? `      - uses: ${actions.pnpm}
${php ? "        if: hashFiles('package.json') != ''\n" : ""}        # Pin an exact pnpm version in package.json's packageManager field.
`
    : ""
}`
    : ""
}${
    php
      ? `      - uses: ${actions.php}
        with:
          php-version: '${c.runtime}'
          extensions: mbstring, intl, pdo_sqlite, pdo_mysql, bcmath, zip
          tools: composer:v2
          coverage: none
`
      : ""
  }      - name: Check and build
        run: |
${indent(checks)}
${
  !isStaticApp(c)
    ? `      - name: Verify production dependency installation
        run: |
${indent(php ? "composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction\ncomposer check-platform-reqs --no-dev" : pm === "npm" ? "npm ci --omit=dev" : "pnpm install --prod --frozen-lockfile")}
`
    : ""
}\
      - name: Package this checked revision
        if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'
        run: |
          artifact_dir=$(cd "$RUNNER_TEMP" && pwd)
${indent(archive)}
          cd "$RUNNER_TEMP"
          sha256sum release.tgz > release.sha256
      - uses: ${actions.upload}
        if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'
        with:
          name: release
          path: |
            \${{ runner.temp }}/release.tgz
            \${{ runner.temp }}/release.sha256
          if-no-files-found: error
          retention-days: 7
  deploy:
    needs: check
    # Pull requests NEVER run on the production deployment runner.
    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.event.repository.private == true
    environment: production
    runs-on: [self-hosted, ${win ? "Windows" : "Linux"}, X64, deployguide-${c.appName}]
    timeout-minutes: 30
    concurrency:
      group: production-${c.appName}
      cancel-in-progress: false
    steps:
      - uses: ${actions.download}
        with:
          name: release
          path: \${{ runner.temp }}/deployguide-release
      - name: Install and verify the release
        shell: ${win ? "powershell" : "bash"}
        env:
          RELEASE_ID: \${{ github.sha }}-\${{ github.run_id }}-\${{ github.run_attempt }}
        run: |
${indent(
  win
    ? `$ErrorActionPreference = 'Stop'\n$archive = Join-Path $env:RUNNER_TEMP 'deployguide-release\\release.tgz'\n$expected = ((Get-Content (Join-Path $env:RUNNER_TEMP 'deployguide-release\\release.sha256') -Raw) -split '\\s+')[0]\nif ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Artifact checksum mismatch' }\n& ${pq(releaseBase(c) + "\\control\\deploy.ps1")} -Archive $archive -ReleaseId $env:RELEASE_ID`
    : `cd "$RUNNER_TEMP/deployguide-release"\nsha256sum -c release.sha256\nbash ${q(releaseBase(c) + "/control/deploy.sh")} "$PWD/release.tgz" "$RELEASE_ID"`,
)}
`;
}

export function generateLinuxDeploy(c: GuideConfig): string {
  assertValid(c);
  if (isWindows(c.os))
    throw new Error("Use the PowerShell deployment script for Windows.");
  const php = c.stack === "laravel",
    node = isNodeApp(c),
    base = releaseBase(c),
    output = outputFolder(c);
  return `#!/usr/bin/env bash
# Run as ${c.username}. Provision release directories and switch configuration first.
set -Eeuo pipefail
umask 027
base=${q(base)}
archive="\${1:?Pass the checked release.tgz}"
id="\${2:?Pass the release ID}"
[[ "$id" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release ID'; exit 1; }
[[ -f "$base/control/ready" && -L "$base/current" ]] || { echo 'Finish the one-time release setup first'; exit 1; }
exec 9>"$base/control/deploy.lock"
flock -n 9 || { echo 'Another release is running'; exit 1; }
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* ]] || { echo 'Unexpected current target'; exit 1; }
release="$base/releases/$id"
mkdir "$release" # Refuse to overwrite an existing release.
tar -xzf "$archive" -C "$release" --no-same-owner
cd "$release"
${
  php
    ? `# Private state is retained across releases, never downloaded from CI.
test ! -e .env && test ! -e storage
ln -s "$base/shared/.env" .env
ln -s "$base/shared/storage" storage
mkdir -p bootstrap/cache
php${c.runtime} /usr/bin/composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
php${c.runtime} /usr/bin/composer check-platform-reqs --no-dev
php${c.runtime} artisan config:cache
php${c.runtime} artisan view:cache
# No migrations, key generation, queue restarts or data deletion are automated.
`
    : node
      ? `${c.packageManager === "npm" ? "npm ci --omit=dev" : "pnpm install --prod --frozen-lockfile"}
${c.stack === "next-node" ? "test -s .next/BUILD_ID" : "# The start script must run production code and bind to loopback."}
`
      : `test -s ${output}/index.html
`
}chgrp -R www-data "$release"
chmod -R u=rwX,g=rX,o= "$release"
${
  php
    ? `chmod -R g+rwX bootstrap/cache
`
    : ""
}${
    !node
      ? `printf '%s\\n' "$id" > ${output}/deployguide-release.txt
`
      : ""
  }switched=0
recover() {
  status=$?
  trap - ERR
  if [[ "$switched" == 1 ]]; then
    ln -s "$previous" "$base/restore-$id"
    mv -Tf "$base/restore-$id" "$base/current"
    ${node ? `sudo -n /usr/bin/systemctl restart ${c.appName}.service` : php ? `php${c.runtime} "$base/current/artisan" up` : ":"}
  ${
    php
      ? `else
    php${c.runtime} "$base/current/artisan" up`
      : ""
  }
  fi
  echo 'Release failed. Previous files retained; inspect logs and verify recovery.' >&2
  exit "$status"
}
trap recover ERR
${
  php
    ? `php${c.runtime} "$base/current/artisan" down --retry=60
`
    : ""
}ln -s "$release" "$base/next-$id"
mv -Tf "$base/next-$id" "$base/current"
switched=1
${
  node
    ? `sudo -n /usr/bin/systemctl restart ${c.appName}.service
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:${c.port}/ > /dev/null
`
    : php
      ? `php${c.runtime} "$base/current/artisan" up
`
      : ""
}curl --fail --silent --show-error --location --retry 5 --retry-delay 2 ${q("https://" + c.domain + "/")} > /dev/null
${
  !node
    ? `test "$(curl --fail --silent --show-error ${q("https://" + c.domain + "/deployguide-release.txt")})" = "$id"
`
    : ""
}trap - ERR
printf '%s\\n' "$previous" > "$base/control/previous.txt"
echo "Published $id. Run the project-specific smoke tests next."
# Retain earlier releases. Review disk usage and clean up manually after backups.
`;
}

export function generateWindowsDeploy(c: GuideConfig): string {
  assertValid(c);
  if (!isWindows(c.os))
    throw new Error("Use the Bash deployment script for Ubuntu.");
  const php = c.stack === "laravel",
    node = isNodeApp(c),
    output = outputFolder(c);
  const phpExe = pq(`C:\\PHP\\${c.runtime}\\php.exe`);
  return `# Run as ${c.username}, never as Administrator or LocalSystem.
param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$ReleaseId)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$base = ${pq(releaseBase(c))}
if ($ReleaseId -notmatch '^[a-f0-9]{40}-[0-9]+-[0-9]+$') { throw 'Invalid release ID' }
if (!(Test-Path -LiteralPath "$base\\control\\ready")) { throw 'Finish the one-time release setup first' }
$lock = [IO.File]::Open("$base\\control\\deploy.lock", 'OpenOrCreate', 'ReadWrite', 'None')
function Checked { param([scriptblock]$Command) & $Command; if ($LASTEXITCODE -ne 0) { throw "External command failed: $LASTEXITCODE" } }
function Point-Current { param([string]$Target)
  if (!$Target.StartsWith("$base\\releases\\", [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $Target -PathType Container)) { throw 'Unexpected release target' }
  $link = Get-Item -LiteralPath "$base\\current" -Force
  if ($link.LinkType -ne 'Junction') { throw 'Current must be a directory junction' }
  # Delete only the verified junction itself. Never recursively delete its target.
  [IO.Directory]::Delete("$base\\current", $false)
  New-Item -ItemType Junction -Path "$base\\current" -Target $Target | Out-Null
}
$previous = $null
$switchAttempted = $false
$activationStarted = $false
try {
  $link = Get-Item -LiteralPath "$base\\current" -Force
  if ($link.LinkType -ne 'Junction') { throw 'Current must be a junction' }
  $previous = [string]@($link.Target)[0]
  if (!$previous.StartsWith("$base\\releases\\", [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected current target' }
  $release = "$base\\releases\\$ReleaseId"
  New-Item -ItemType Directory -Path $release -ErrorAction Stop | Out-Null
  Checked { tar.exe -xzf $Archive -C $release }
  Push-Location -LiteralPath $release
  try {
${
  php
    ? `    if ((Test-Path .env) -or (Test-Path storage)) { throw 'Archive must not contain private runtime state' }
    New-Item -ItemType HardLink -Path .env -Target "$base\\shared\\.env" | Out-Null
    New-Item -ItemType Junction -Path storage -Target "$base\\shared\\storage" | Out-Null
    New-Item -ItemType Directory -Path bootstrap\\cache -Force | Out-Null
    Checked { & ${phpExe} 'C:\\ProgramData\\ComposerSetup\\bin\\composer.phar' install --no-dev --prefer-dist --optimize-autoloader --no-interaction }
    Checked { & ${phpExe} 'C:\\ProgramData\\ComposerSetup\\bin\\composer.phar' check-platform-reqs --no-dev }
    Checked { & ${phpExe} artisan config:cache }
    Checked { & ${phpExe} artisan view:cache }
    Checked { icacls.exe bootstrap\\cache /grant ${pq("IIS AppPool\\" + c.appName + ":(OI)(CI)(M)")} }
`
    : node
      ? `    Checked { ${c.packageManager === "npm" ? "npm.cmd ci --omit=dev" : "pnpm.cmd install --prod --frozen-lockfile"} }
${
  c.stack === "next-node"
    ? `    if (!(Test-Path .next\\BUILD_ID)) { throw 'Next.js build is missing' }
    New-Item -ItemType Directory -Path .next\\cache -Force | Out-Null
    Checked { icacls.exe .next\\cache /grant '*S-1-5-19:(OI)(CI)(M)' }
`
    : ""
}`
      : `    if (!(Test-Path ${output}\\index.html)) { throw 'Static index is missing' }
`
}${
    !node
      ? `    Copy-Item -LiteralPath "$base\\shared\\web.config" -Destination ${output}\\web.config
    Set-Content -LiteralPath ${output}\\deployguide-release.txt -Value $ReleaseId -Encoding ascii
`
      : ""
  }  } finally { Pop-Location }
$activationStarted = $true
${
  php
    ? `  Checked { & ${phpExe} "$base\\current\\artisan" down --retry=60 }
`
    : node
      ? `  Stop-Service -Name ${pq(c.appName)} -ErrorAction Stop
  (Get-Service -Name ${pq(c.appName)}).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
`
      : ""
}  # Windows junction replacement has a short gap: schedule a maintenance window.
  $switchAttempted = $true
  Point-Current $release
${
  node
    ? `  Start-Service -Name ${pq(c.appName)}
`
    : php
      ? `  Checked { & ${phpExe} "$base\\current\\artisan" up }
`
      : ""
}  $healthy = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri ${pq("https://" + c.domain + "/")} -TimeoutSec 15
${
  !node
    ? `      $marker = Invoke-WebRequest -UseBasicParsing -Uri ${pq("https://" + c.domain + "/deployguide-release.txt")} -TimeoutSec 15
      if ($marker.Content.Trim() -ne $ReleaseId) { throw 'Wrong release served' }
`
    : ""
}      $healthy = $response.StatusCode -eq 200
      if ($healthy) { break }
    } catch { Start-Sleep -Seconds 3 }
  }
  if (!$healthy) { throw 'Release failed the public HTTP check' }
  Set-Content -LiteralPath "$base\\control\\previous.txt" -Value $previous
  Write-Output "Published $ReleaseId. Run application-specific smoke tests next."
} catch {
  $failure = $_
  if ($switchAttempted -and $previous) {
    ${node ? `Stop-Service -Name ${pq(c.appName)} -ErrorAction SilentlyContinue` : "# Restore the retained release; database changes are never automated."}
    if (Test-Path -LiteralPath "$base\\current") { Point-Current $previous }
    else { New-Item -ItemType Junction -Path "$base\\current" -Target $previous | Out-Null }
  }
  if ($activationStarted) {
    ${node ? `Start-Service -Name ${pq(c.appName)} -ErrorAction Continue` : php ? `& ${phpExe} "$base\\current\\artisan" up` : "# Inspect public responses after recovery."}
  }
  throw $failure
} finally { $lock.Dispose() }
# Old releases are retained. Back up persistent data separately.
`;
}
