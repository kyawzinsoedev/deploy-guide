import type { CodeBlock, GuideConfig, Source, Step } from "@/lib/types";
import { isWindows, osLabel } from "./platforms";
import {
  generateLinuxDeploy,
  generateWindowsDeploy,
  generateWorkflow,
  isNodeApp,
  isStaticApp,
  outputFolder,
  releaseBase,
} from "@/lib/cicd";
import { powershellQuote as pq, shellQuote as q } from "@/lib/validation";

export const automationSources: Source[] = [
  {
    label: "GitHub: workflow syntax, triggers and permissions",
    url: "https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax",
  },
  {
    label: "GitHub: secure use and self-hosted runner trust",
    url: "https://docs.github.com/en/actions/reference/security/secure-use",
  },
  {
    label: "GitHub: environments, branch restrictions and plan availability",
    url: "https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments",
  },
  {
    label: "GitHub: adding a self-hosted runner",
    url: "https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners",
  },
  {
    label: "GitHub: running a runner as a service",
    url: "https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application",
  },
  {
    label: "GitHub: artifact preservation and transfer",
    url: "https://github.com/actions/upload-artifact",
  },
  {
    label: "GitHub: download artifacts",
    url: "https://github.com/actions/download-artifact",
  },
  {
    label: "GitHub: checkout action",
    url: "https://github.com/actions/checkout",
  },
  {
    label: "GitHub: Node setup action",
    url: "https://github.com/actions/setup-node",
  },
  {
    label: "pnpm: setup action and packageManager version",
    url: "https://github.com/pnpm/action-setup",
  },
  {
    label: "PHP setup action: supported versions and extensions",
    url: "https://github.com/shivammathur/setup-php",
  },
  {
    label: "Microsoft: service security and access rights",
    url: "https://learn.microsoft.com/en-us/windows/win32/services/service-security-and-access-rights",
  },
  {
    label: "PHP: realpath cache",
    url: "https://www.php.net/manual/en/ini.core.php#ini.realpath-cache-size",
  },
  {
    label: "PHP: OPcache configuration",
    url: "https://www.php.net/manual/en/opcache.configuration.php",
  },
];
const block = (
  title: string,
  code: string,
  language: CodeBlock["language"] = "text",
  location: CodeBlock["location"] = "GitHub / CI runner",
  changes = false,
): CodeBlock => ({ title, code, language, location, changes });
const issue = (symptom: string, cause: string, fix: string) => ({
  symptom,
  cause,
  fix,
  tags: ["ci", "cd", "automation", "release"],
});

function bootstrap(c: GuideConfig): string {
  const base = releaseBase(c),
    php = c.stack === "laravel",
    node = isNodeApp(c);
  if (!isWindows(c.os))
    return `# Administrator: a new sibling directory; leave the live project intact.
test ! -e ${q(base)} || { echo 'Release directory already exists; inspect it first.'; exit 1; }
sudo install -d -o ${q(c.username)} -g www-data -m 2750 ${q(base)} ${q(base + "/releases")} ${q(base + "/shared")} ${q(base + "/control")}
# The deployment user needs www-data group membership; sign in again afterward.
sudo usermod -aG www-data ${q(c.username)}
# Switch to the deployment-user SSH session for the remaining commands.
`;
  return `$ErrorActionPreference = 'Stop'
$base = ${pq(base)}
if (Test-Path -LiteralPath $base) { throw 'Release directory already exists; inspect it first' }
New-Item -ItemType Directory -Path $base | Out-Null
icacls.exe $base /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' ${pq(c.username + ":(OI)(CI)(M)")} ${pq((node ? "*S-1-5-19" : "IIS AppPool\\" + c.appName) + ":(OI)(CI)(RX)")}
if ($LASTEXITCODE -ne 0) { throw 'ACL setup failed' }
New-Item -ItemType Directory -Path "$base\\releases", "$base\\shared", "$base\\control" | Out-Null
${php ? "# shared\\storage will later receive pool Modify permission; other files stay read-only to PHP.\n" : ""}# Sign in as the deployment user for the seed-copy task.
`;
}
function seedRelease(c: GuideConfig): string {
  const base = releaseBase(c),
    php = c.stack === "laravel",
    node = isNodeApp(c),
    output = outputFolder(c);
  if (!isWindows(c.os))
    return `set -e
base=${q(base)}
test ! -e "$base/releases/bootstrap"
${php ? `php${c.runtime} ${q(c.directory + "/artisan")} down --retry=60\n# If setup fails, recover the original site with the same CLI and artisan up.\n` : ""}\
cp -a ${q(c.directory)} "$base/releases/bootstrap"
${
  php
    ? `test -f "$base/releases/bootstrap/.env"
mv "$base/releases/bootstrap/.env" "$base/shared/.env"
mv "$base/releases/bootstrap/storage" "$base/shared/storage"
ln -s "$base/shared/.env" "$base/releases/bootstrap/.env"
ln -s "$base/shared/storage" "$base/releases/bootstrap/storage"
chmod 640 "$base/shared/.env"
chmod -R u+rwX,g+rwX,o= "$base/shared/storage"
cd "$base/releases/bootstrap"
php${c.runtime} artisan config:clear
php${c.runtime} artisan config:cache
php${c.runtime} artisan view:cache
# If public/storage already exists, inspect its link target before using uploads.
`
    : ""
}ln -s "$base/releases/bootstrap" "$base/current"
chgrp -R www-data "$base"
ls -ld "$base/current"
# No live configuration has changed yet. Keep the original project as recovery.
`;
  return `$ErrorActionPreference = 'Stop'
$base = ${pq(base)}
$seed = "$base\\releases\\bootstrap"
if (Test-Path -LiteralPath $seed) { throw 'Seed already exists' }
New-Item -ItemType Directory -Path $seed | Out-Null
${
  php
    ? `& ${pq("C:\\PHP\\" + c.runtime + "\\php.exe")} ${pq(c.directory + "\\artisan")} down --retry=60
if ($LASTEXITCODE -ne 0) { throw 'Could not enter maintenance' }
# On setup failure, run artisan up against the original directory to recover.
`
    : ""
}\
# /XJ avoids following directory junctions. /E includes empty directories.
robocopy.exe ${pq(c.directory)} $seed /E /COPY:DAT /DCOPY:DAT /XJ /R:2 /W:2${node ? " /XD node_modules" : ""}
if ($LASTEXITCODE -ge 8) { throw 'Seed copy failed' }
${
  node
    ? `Push-Location -LiteralPath $seed
try {
  ${c.packageManager === "npm" ? "npm.cmd ci --omit=dev" : "pnpm.cmd install --prod --frozen-lockfile"}
  if ($LASTEXITCODE -ne 0) { throw 'Seed dependency installation failed' }
} finally { Pop-Location }
${
  c.stack === "next-node"
    ? `New-Item -ItemType Directory -Path "$seed\\.next\\cache" -Force | Out-Null
icacls.exe "$seed\\.next\\cache" /grant '*S-1-5-19:(OI)(CI)(M)'
if ($LASTEXITCODE -ne 0) { throw 'Next cache ACL failed' }
`
    : ""
}`
    : ""
}
${
  php
    ? `Move-Item -LiteralPath "$seed\\.env" -Destination "$base\\shared\\.env"
Move-Item -LiteralPath "$seed\\storage" -Destination "$base\\shared\\storage"
New-Item -ItemType HardLink -Path "$seed\\.env" -Target "$base\\shared\\.env" | Out-Null
New-Item -ItemType Junction -Path "$seed\\storage" -Target "$base\\shared\\storage" | Out-Null
icacls.exe "$base\\shared\\storage" /grant ${pq("IIS AppPool\\" + c.appName + ":(OI)(CI)(M)")}
if ($LASTEXITCODE -ne 0) { throw 'Storage ACL failed' }
icacls.exe "$seed\\bootstrap\\cache" /grant ${pq("IIS AppPool\\" + c.appName + ":(OI)(CI)(M)")}
if ($LASTEXITCODE -ne 0) { throw 'Cache ACL failed' }
Push-Location -LiteralPath $seed
try {
  foreach ($command in @('config:clear', 'config:cache', 'view:cache')) {
    & ${pq("C:\\PHP\\" + c.runtime + "\\php.exe")} artisan $command
    if ($LASTEXITCODE -ne 0) { throw 'Seed cache preparation failed' }
  }
} finally { Pop-Location }
`
    : ""
}${
    !node
      ? `Copy-Item -LiteralPath "$seed\\${output}\\web.config" -Destination "$base\\shared\\web.config"
`
      : ""
  }New-Item -ItemType Junction -Path "$base\\current" -Target $seed | Out-Null
Get-Item -LiteralPath "$base\\current" | Select-Object FullName, LinkType, Target
# The live IIS site/service still uses the original project until the next task.
`;
}
function servicePermission(c: GuideConfig): string {
  if (!isWindows(c.os))
    return `# Administrator: edit this NEW, app-specific sudoers file using visudo.
sudo visudo -f ${q("/etc/sudoers.d/deployguide-" + c.appName)}
# Add exactly this line; do not grant wildcard commands or a root shell:
# ${c.username} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${c.appName}.service
sudo visudo -cf ${q("/etc/sudoers.d/deployguide-" + c.appName)}
# Confirm the systemd unit remains root-owned and cannot be edited by the runner.
`;
  return `$ErrorActionPreference = 'Stop'
# Administrator: preserve this ONE service's existing permissions.
$serviceName = ${pq(c.appName)}
$sddl = (sc.exe sdshow $serviceName | Where-Object { $_ -match '^[DOGS]:' }) -join ''
if ($LASTEXITCODE -ne 0 -or !$sddl) { throw 'Cannot read service security descriptor' }
$backup = Join-Path $env:ProgramData (${pq(c.appName + "-service-acl-")} + (Get-Date -Format yyyyMMdd-HHmmss) + '.txt')
Set-Content -LiteralPath $backup -Value $sddl
$descriptor = [Security.AccessControl.CommonSecurityDescriptor]::new($false, $false, $sddl)
if (!$descriptor.IsDiscretionaryAclCanonical) { throw 'Review the noncanonical ACL before editing' }
$sid = (Get-LocalUser -Name ${pq(c.username)}).SID
# Query config/status/dependents + start/stop + read control. No change-config or write-DACL.
$descriptor.DiscretionaryAcl.AddAccess([Security.AccessControl.AccessControlType]::Allow, $sid, 0x2003D, [Security.AccessControl.InheritanceFlags]::None, [Security.AccessControl.PropagationFlags]::None)
$updated = $descriptor.GetSddlForm([Security.AccessControl.AccessControlSections]::All)
sc.exe sdset $serviceName $updated
if ($LASTEXITCODE -ne 0) { throw 'Service ACL update failed' }
# Recovery: an administrator can restore the saved descriptor with sc.exe sdset.
# Keep C:\\Services\\${c.appName} (wrapper and XML) writable only by Administrators/SYSTEM.
`;
}

export function generateAutomation(c: GuideConfig) {
  const win = isWindows(c.os),
    php = c.stack === "laravel",
    node = isNodeApp(c),
    base = releaseBase(c),
    slash = win ? "\\" : "/";
  const current = base + slash + "current",
    language = win ? "powershell" : "bash";
  const deployScript = win ? generateWindowsDeploy(c) : generateLinuxDeploy(c);
  const scriptName = win ? "deploy.ps1" : "deploy.sh";
  const scriptPath = base + slash + "control" + slash + scriptName;
  const files = [
    { name: "deployguide.yml", content: generateWorkflow(c) },
    { name: scriptName, content: deployScript },
  ];
  const steps: Step[] = [
    {
      id: "ci-contract",
      title: "Decide what a passing release means",
      goal: "Add automated checks after your first manual deployment works.",
      why: "CI (continuous integration) checks changes before release. CD (continuous delivery) prepares and publishes a passing revision. A successful build alone does not prove an application works.",
      how: "This default uses GitHub Actions. Pull requests and pushes run checks on disposable GitHub-hosted machines. A person starts the production release from main; the same run must pass its checks before the deployment job can start. Other providers and monorepos need an adapted workflow.",
      before: `Your ${osLabel(c.os)} deployment and HTTPS already work. Use a single-package private GitHub repository with trusted writers, a protected main branch, committed lockfiles and a tested recovery backup. ${php ? "Use an external database or an absolute SQLite path in a backed-up shared directory outside releases; Laravel's default per-release database/database.sqlite is unsuitable. This automation baseline excludes queue workers, Horizon and scheduled background jobs; add reviewed coordination before automating those applications." : node ? "Keep uploads, SQLite files and other mutable application data outside release folders; configure the app to use a separate persistent location first." : "Only public build output belongs in the artifact."}`,
      blocks: [
        block(
          "Your project's CI contract",
          c.stack === "html"
            ? "Put public HTML/CSS/JS in public/. The starter checks public/index.html exists.\nAdd an HTML validator and browser/link checks for meaningful coverage.\nNever place .env, credentials or private source files in public/."
            : php
              ? `Add a composer.json script named ci that runs your real automated test suite.\nFor a Laravel project using PHPUnit/Pest, it can invoke php artisan test.\nConfigure a disposable test database and test-only APP_KEY/settings.\nThe CI script must create any test .env or SQLite file it needs and fail on errors.\nDo not connect tests to your production database.\nIf package.json exists, its build script must produce the required frontend assets.\nCommit composer.lock and the selected ${c.packageManager} lockfile.`
              : `Add a package.json script named ci that runs your real non-interactive tests.\nFor example, configure your existing test runner's single-run mode.\nThe script must exit nonzero on failure; no empty "success" script.\n${c.stack === "express" ? "Provide a production start script; add build for compiled TypeScript when needed." : "Provide a production build script."}\nCommit the ${c.packageManager} lockfile.${c.packageManager === "pnpm" ? " Pin an exact pnpm version in packageManager." : ""}\nPublic build variables must be configured for CI and are visible in browser bundles.`,
          "text",
          "Your computer",
        ),
      ],
      breakdown: [
        {
          term: "ci script",
          explanation:
            "Your project defines its tests. The generated workflow deliberately fails if the required script is absent.",
        },
        {
          term: "Artifact",
          explanation:
            "A compressed copy of the checked source/build output. Dependencies are installed from its lockfile on the target OS; private state remains on the server.",
        },
        {
          term: "Provider default",
          explanation:
            "GitHub Actions keeps checks next to repository reviews. It adds trust in GitHub and in the pinned third-party PHP/pnpm setup actions where applicable.",
        },
      ],
      expected:
        "The CI command passes locally against disposable test data, and a deliberately broken test fails.",
      verification: block(
        "Run the same checks locally",
        c.stack === "html"
          ? "Confirm public/index.html exists, then test routes, links and assets in a browser."
          : php
            ? `${win ? "& 'C:\\PHP\\" + c.runtime + "\\php.exe' 'C:\\ProgramData\\ComposerSetup\\bin\\composer.phar'" : "php" + c.runtime + " /usr/bin/composer"} run-script ci`
            : `${c.packageManager}${win ? ".cmd" : ""} run ci`,
        c.stack === "html" ? "text" : language,
        "Your computer",
      ),
      problems: [
        issue(
          "CI passes but the app is broken",
          "The checks cover compilation only or use different settings.",
          "Add a test for the broken behavior. Exercise routes, assets and runtime configuration on staging before production.",
        ),
      ],
      next: "Protect the repository and choose who may release.",
      note: "Optional automation. It does not add requirements to the first-deployment checklist. DeployGuide creates files locally; it does not enable GitHub Actions or connect to your server.",
    },
    {
      id: "ci-access",
      title: "Protect access and register the runner",
      goal: "Allow approved releases to reach one application through a limited account.",
      why: "A deployment system can run repository code on your server. Repository writers and workflow changes therefore need the same trust as your deployment account.",
      how: "The default uses a dedicated self-hosted deployment runner under the existing non-administrator deployment user. It polls GitHub over outbound HTTPS, so no new public SSH/RDP port or deploy private key is required. PR jobs stay on GitHub-hosted runners. This is a simple private-repository default; larger teams should use isolated deployment infrastructure and short-lived credentials.",
      before:
        "Repository owner access and an administrator session on the target server. This recipe requires a private repository and a GitHub plan that supports private environments. Check the linked plan documentation; independent required-reviewer rules are not available on every plan. Do not attach this runner to public repositories or untrusted workflows.",
      blocks: [
        block(
          "Configure GitHub and the server runner",
          `1. Protect main: require reviews and the check job. Restrict who can edit .github/workflows and deployment scripts.\n2. Settings → Environments → production: allow deployments from main only. Enable required reviewers if your plan supports them.\n3. Settings → Actions → Runners → New self-hosted runner: choose ${win ? "Windows x64" : "Linux x64"}. Follow GitHub's current download/checksum and registration commands on the server.\n4. Keep its registration token only in that server session. Never paste it into DeployGuide, commits or screenshots.\n5. Add the custom label deployguide-${c.appName}. Place runner files outside public directories, under the deployment user's private folder.\n6. Configure the runner service to run as ${c.username}; verify it is not Administrator, root or LocalSystem. GitHub's service setup may need an administrator once.\n7. Keep the runner current and permit its documented outbound HTTPS endpoints. Do not open management ports worldwide.\n8. Install the selected Node/package manager or PHP/Composer on the runner account's PATH where this runtime guide requires them. Restart the runner service after PATH changes.`,
          "text",
          "Configuration",
          true,
        ),
      ],
      breakdown: [
        {
          term: "Runner",
          explanation:
            "A machine that executes a workflow job. This runner can change this application's files, so all repository workflow authors must be trusted.",
        },
        {
          term: "Labels",
          explanation:
            "Labels choose a runner; they are not an access-control boundary. Protect the repository and runner group, not just its label.",
        },
        {
          term: "Secrets",
          explanation:
            "No deployment key is needed in this polling-runner default. Production .env/app.env remains on the server. If your tests need credentials, use limited test-only GitHub secrets; never echo them.",
        },
        {
          term: "Manual release",
          explanation:
            "workflow_dispatch is a deliberate release button. It is not an independent approval unless a supported environment reviewer rule also requires another person.",
        },
      ],
      expected:
        "GitHub shows one idle deployment runner with the correct label, operating system and restricted identity. A PR uses a hosted runner.",
      verification: block(
        "Check the runner identity",
        win
          ? "Get-CimInstance Win32_Service | Where-Object Name -Like 'actions.runner.*' | Select-Object Name, StartName, State\n# In GitHub, inspect the runner labels and the check job's hosted runner name."
          : "# Inspect the exact runner service reported by GitHub's svc.sh status.\n# Its User must be the deployment account, not root.\nwhoami\n# Compare runner labels and inspect the PR job's GitHub-hosted runner name.",
        language,
        "Server · deployment user",
      ),
      problems: [
        issue(
          "Production job waits for a runner",
          "The label, OS or service state does not match.",
          "Compare runs-on labels with the registered runner. Check service logs and outbound network access; do not weaken the production environment rules.",
        ),
        issue(
          "Environment protections are unavailable",
          "The repository plan does not support the requested private-environment feature.",
          "Use an eligible plan or keep manual deployments. Do not remove the environment gate merely to make a job green.",
        ),
      ],
      next: "Prepare a release directory without changing the live application.",
    },
    {
      id: "ci-layout",
      title: "Prepare releases and persistent files",
      goal: "Keep the current application, earlier releases and persistent data separate.",
      why: "Replacing files in a running application can mix old and new code. Versioned folders let a failed release return to known files, while environment settings and uploads survive every release.",
      how: `${base} holds releases, shared data and a control folder. A current ${win ? "directory junction" : "symbolic link"} points to the active release. The first copy is named bootstrap and comes from your known-good manual deployment. ${win ? "Use a local NTFS volume. Windows junction replacement has a brief gap, so schedule maintenance." : "Linux can replace this symbolic link atomically, though a Node restart still interrupts requests."}`,
      before:
        "A tested file/database backup exists. Freeze writes for the entire seed copy and configuration switch: put Laravel in maintenance and pause background writers, or arrange a maintenance window for mutable Node data. Otherwise uploads copied during live writes can be lost at cutover. The new sibling directory must not exist. Review disk space; this guide retains old releases instead of deleting them automatically.",
      blocks: [
        block(
          "Create the protected release area",
          bootstrap(c),
          language,
          "Server · administrator",
          true,
        ),
        block(
          "Seed it from the working application",
          seedRelease(c),
          language,
          "Server · deployment user",
          true,
        ),
      ],
      breakdown: [
        {
          term: "bootstrap",
          explanation:
            "The first known-good release, copied from the working application. The original live directory is left available as another recovery option.",
        },
        {
          term: "shared",
          explanation: php
            ? "Holds the existing Laravel .env and storage. APP_KEY is preserved. On Windows .env is hardlinked on the same NTFS volume; after secret replacement by rename, relink retained releases."
            : "Persistent files belong outside generated release folders. Node's original protected app.env path remains in use.",
        },
        {
          term: "Backups",
          explanation:
            "Retained code releases do not back up a database or protect against a lost disk. Back up secrets, uploads and database data separately off the server.",
        },
      ],
      expected:
        "The new current link points inside releases/bootstrap. The live site still works from its original directory.",
      verification: block(
        "Inspect the new layout",
        win
          ? `Get-Item -LiteralPath ${pq(current)} | Select-Object FullName, LinkType, Target\nGet-ChildItem -LiteralPath ${pq(base)}`
          : `readlink -f ${q(current)}\nls -ld ${q(base)} ${q(current)}`,
        language,
        "Server · deployment user",
      ),
      problems: [
        issue(
          "Permission denied or bootstrap already exists",
          "The account does not own the new directory, or setup has already run.",
          "Inspect ownership and existing contents. Continue from the existing setup after review; do not delete it or grant Everyone/chmod 777.",
        ),
      ],
      next: "Point the web server and runtime at current, then test the seed release.",
    },
    {
      id: "ci-connect",
      title: "Connect the release path safely",
      goal: "Make the existing web server use the stable current path and grant only necessary restart rights.",
      why: "The deployment runner can publish files without changing global web-server settings. It needs limited restart rights only for this application's Node service.",
      how: "An administrator makes this one-time configuration change after a backup. Later releases change the link target. HTTPS settings, host bindings, logs and other websites stay in their existing configurations.",
      before: `The bootstrap copy is ready. Use an administrator session and preserve your HTTPS-enabled configuration. ${php ? "Back up the PHP configuration too. This recipe requires file-based Laravel maintenance and storage; distributed maintenance or background workers need a separate reviewed design." : ""}`,
      blocks: [
        block(
          "Update these existing settings",
          win
            ? node
              ? `Back up C:\\Services\\${c.appName}\\${c.appName}.xml. Stop only the ${c.appName} service.\nSet its workingdirectory to ${current}.\n${c.stack === "next-node" ? "In arguments, change the Next CLI path to " + current + "\\node_modules\\next\\dist\\bin\\next.\n" : ""}Keep the existing protected app.env and LocalService identity.\nKeep IIS's wwwroot/web.config and HTTPS bindings unchanged.\nStart the service and verify local and public responses.\nEnsure only Administrators/SYSTEM can modify the wrapper and XML.`
              : `Back up IIS configuration and the site's web.config.\nIn IIS Manager → ${c.appName} → Basic Settings, change Physical path to ${current}\\${outputFolder(c)}.\nKeep the existing pool, anonymous Application pool identity and HTTPS bindings.\nThe shared\\web.config copy includes your existing routing and HTTPS redirect rules.\n${php ? "In the selected PHP php.ini, review and set realpath_cache_size=0, opcache.validate_timestamps=1, opcache.revalidate_freq=0 and opcache.revalidate_path=1. Recycle only this app pool once as administrator. Verify the actual CGI settings locally, then remove any diagnostic page; never publish phpinfo. These settings trade extra filesystem checks for correct junction changes.\n" : ""}Test routes, assets and HTTPS before continuing.`
            : node
              ? `Back up /etc/systemd/system/${c.appName}.service.\nSet WorkingDirectory=${current}.\n${c.stack === "next-node" ? "Update ExecStart's Next CLI path to " + current + "/node_modules/next/dist/bin/next.\n" : ""}Keep User=${c.username} and the existing EnvironmentFile.\nRun sudo systemctl daemon-reload, then sudo systemctl restart ${c.appName}.service.\nVerify loopback and public responses. Keep the unit root-owned.`
              : `Back up the active HTTPS-enabled Nginx site configuration.\nChange only its root to ${current}/${outputFolder(c)}. Preserve certificates and redirects.\nRun sudo nginx -t. Reload Nginx only if that test passes.\n${php ? "Keep SCRIPT_FILENAME using $realpath_root. Review PHP FPM realpath/OPcache settings for symlink releases: realpath_cache_size=0, opcache.validate_timestamps=1, opcache.revalidate_freq=0, opcache.revalidate_path=1. Reload the selected PHP FPM service once as administrator. Verify web-worker settings locally, not just CLI php -i.\n" : ""}Test the bootstrap release at https://${c.domain}/.`,
          "text",
          "Server · administrator",
          true,
        ),
        ...(node
          ? [
              block(
                "Delegate only this service's restart",
                servicePermission(c),
                language,
                "Server · administrator",
                true,
              ),
            ]
          : []),
        ...(php
          ? [
              block(
                "Leave bootstrap maintenance after switching paths",
                win
                  ? `& ${pq("C:\\PHP\\" + c.runtime + "\\php.exe")} ${pq(current + "\\artisan")} up\nif ($LASTEXITCODE -ne 0) { throw 'Could not leave maintenance' }`
                  : `php${c.runtime} ${q(current + "/artisan")} up`,
                language,
                "Server · deployment user",
                true,
              ),
            ]
          : []),
        block(
          "Enable deployment only after your checks pass",
          win
            ? `# Deployment user, only after the bootstrap site is verified:
New-Item -ItemType File -Path ${pq(base + "\\control\\ready")} -ErrorAction Stop | Out-Null`
            : `# Deployment user, only after the bootstrap site is verified:
touch ${q(base + "/control/ready")}`,
          language,
          "Server · deployment user",
          true,
        ),
      ],
      breakdown: [
        {
          term: "current",
          explanation:
            "A stable path. Configurations point here once; each release chooses a new target underneath it.",
        },
        {
          term: "PHP caches",
          explanation:
            "PHP's web workers cache both resolved paths and compiled code. CLI cache resets do not reset web workers. The documented cache settings favor correct release switching over maximum filesystem-cache performance.",
        },
        {
          term: "Scoped privileges",
          explanation: node
            ? "The runner may restart only this service. It cannot edit the root/administrator-owned service definition. Never add it to Administrators or give it unrestricted sudo."
            : "The runner changes application files; it receives no Nginx, IIS or PHP service administration rights.",
        },
      ],
      expected:
        "The known-good bootstrap release serves correctly through current. The runner account has only the permissions described above.",
      verification: block(
        "Verify before enabling automation",
        win
          ? `Invoke-WebRequest -UseBasicParsing -Uri ${pq("https://" + c.domain + "/")} | Select-Object StatusCode\nGet-Item -LiteralPath ${pq(current)} | Select-Object Target`
          : `curl --fail --show-error --location ${q("https://" + c.domain + "/")} -o /dev/null\nreadlink -f ${q(current)}`,
        language,
        "Server · deployment user",
      ),
      problems: [
        issue(
          "The old release is still served",
          "A web root, service path, PHP cache or CDN still refers to old files.",
          "Inspect the live path and process configuration. Verify web-worker PHP cache settings, clear only the relevant CDN paths, and repeat the seed-release check before enabling the ready marker.",
        ),
        issue(
          "Service restart is denied",
          "Restart rights were not granted to the runner's actual account.",
          "Inspect its service identity and the narrow permission rule. Do not run the application or runner as root/Administrator to bypass this error.",
        ),
      ],
      next: "Save the generated workflow and deployment script.",
      note: php
        ? "If you use public uploads, create and verify a public/storage link into shared/storage/app/public in each release. This baseline does not automatically create that optional link; extend the reviewed script before enabling uploads. Existing queue/scheduler processes also need their own coordinated path and restart design."
        : undefined,
    },
    {
      id: "ci-files",
      title: "Install the automation files",
      goal: "Connect the checked artifact to a reviewed deployment script.",
      why: "Keeping the workflow and deployment logic explicit makes permissions, state changes and recovery behavior reviewable. Pinned action commits prevent an action tag from silently selecting different code.",
      how: "Save deployguide.yml under .github/workflows in your project. Save the server script in the protected control directory. CI packages the checked output, adds a checksum, and the deployment job downloads only that same run's artifact. The script installs locked runtime dependencies, switches current, checks HTTP, and attempts to restore the previous release if the switch or check fails.",
      before: `The runner is private and restricted; current serves bootstrap correctly; control/ready exists. ${node ? "The application's production start command and loopback binding work. / must return a successful response for the starter health check; adapt it to a dedicated health route if needed." : "The generated public release marker must be reachable without CDN caching."} Review all scripts on a disposable staging server before production.`,
      blocks: [
        block(
          ".github/workflows/deployguide.yml",
          files[0].content,
          "yaml",
          "Configuration",
          true,
        ),
        block(
          scriptPath,
          deployScript,
          language,
          "Server · deployment user",
          true,
        ),
      ],
      breakdown: [
        {
          term: "needs: check",
          explanation:
            "The deployment job cannot run when the check job fails.",
        },
        {
          term: "workflow_dispatch + main",
          explanation:
            "Only a deliberate run against main can deploy. Normal pushes and pull requests perform checks only.",
        },
        {
          term: "permissions: contents: read",
          explanation:
            "The built-in GitHub token has no repository write permission. Checkout does not persist that credential in the worktree.",
        },
        {
          term: "concurrency",
          explanation:
            "Only one production job proceeds at a time. Existing deployment jobs are not canceled midway. A filesystem lock also rejects a simultaneous local invocation.",
        },
        {
          term: "No automatic data changes",
          explanation:
            "The script never generates a new APP_KEY or runs migrations. Database changes need a separate backup, review and backward-compatible rollout.",
        },
      ],
      expected:
        "The workflow and server script are saved in their stated locations, inspected and version-reviewed. The first hosted check succeeds before a production run is attempted.",
      verification: block(
        "Inspect without deploying",
        win
          ? `$tokens=$null; $errors=$null\n[Management.Automation.Language.Parser]::ParseFile(${pq(scriptPath)}, [ref]$tokens, [ref]$errors) | Out-Null\n$errors\n# A clean parse is syntax only; rehearse the release on staging.`
          : `bash -n ${q(scriptPath)}\n# Syntax only: rehearse release and recovery on staging before production.`,
        language,
        "Server · deployment user",
      ),
      problems: [
        issue(
          "CI fails before deployment",
          "Missing ci script, wrong lockfile, unavailable extension or a failing test.",
          "Read the first failing step. Reproduce with the selected runtime and locked dependencies locally. Fix the test/configuration; do not add continue-on-error or --ignore-platform-reqs.",
        ),
        issue(
          "Artifact or checksum is missing",
          "The job was not a main-branch manual release, or packaging failed.",
          "Inspect the same run's check job and release artifact. Do not substitute an artifact from an unreviewed PR or another run.",
        ),
      ],
      next: "Rehearse a release and rollback on staging, then use the release button.",
    },
    {
      id: "ci-release",
      title: "Release, verify and recover",
      goal: "Run a controlled production release and know how to recover.",
      why: "An automated HTTP check catches availability failures, but it cannot prove logins, database writes, background work or every application feature is correct.",
      how: "After a staging rehearsal, Actions → Checks and release → Run workflow → main starts a checked release. Review the exact commit and any environment approval. Watch each job, then perform application smoke tests. Failed activation attempts restore the retained previous code, but recovery itself still needs verification.",
      before:
        "A maintenance window and recent tested backup are available. Review database/schema compatibility and runtime changes. No migrations run automatically. Keep your management session open until the release is verified.",
      blocks: [
        block(
          "Release checklist",
          `1. Confirm the intended commit is on reviewed main and checks are meaningful.\n2. Rehearse the same release and a failure recovery on a separate staging server.\n3. In GitHub Actions, run Checks and release on main. Review/approve the production environment if configured.\n4. Watch the check job, artifact transfer, dependency installation and HTTP check.\n5. At https://${c.domain}, test the important routes, assets and app-specific read/write flows.\n6. Inspect ${win ? "IIS and application/Event Viewer logs" : "Nginx and application/service logs"}; confirm no new errors.\n7. Keep earlier releases until recovery confidence and backup retention permit cleanup. Monitor disk space.`,
          "text",
          "Configuration",
          true,
        ),
        block(
          "Recovery during a maintenance window",
          win
            ? `1. Pause new releases; inspect ${base}\\control\\previous.txt and the retained releases.\n2. ${node ? "Stop only the " + c.appName + " service using the delegated account." : php ? "Run the selected PHP CLI with current\\artisan down." : "Expect a brief gap while the junction changes."}\n3. Verify current is a Junction and the intended previous target is a retained directory inside ${base}\\releases.\n4. Remove only that junction with [IO.Directory]::Delete(currentPath, $false), never recursively delete the target. Create the current junction to the inspected previous release.\n5. ${node ? "Start the service." : php ? "Run the selected PHP CLI with current\\artisan up." : "Let IIS serve the restored files."}\n6. Verify public responses and application behavior. If junction creation fails, use the original project's known-good IIS/service configuration after administrator review.\n7. A code rollback cannot reverse schema/data changes. Restore data only through a separately rehearsed database procedure.`
            : `1. Pause new releases. Inspect ${base}/control/previous.txt and retained releases.\n2. Verify the target is a known directory under ${base}/releases.\n3. During maintenance, create a new temporary symlink to that target beside current, then atomically replace current with mv -Tf. Never delete the release directory.\n4. ${node ? "Restart only " + c.appName + ".service using the scoped rule." : php ? "Use the selected PHP CLI with current/artisan down before switching and current/artisan up afterward." : "Nginx follows the restored current link; it needs no config reload."}\n5. Check public HTTP, important app workflows and logs. Keep the original project/configuration as another recovery option.\n6. Code rollback does not reverse a migration or restore a database.`,
          "text",
          "Server · deployment user",
          true,
        ),
      ],
      breakdown: [
        {
          term: "Health check",
          explanation:
            "The template checks HTTP and, for file-serving paths, a release marker. This is an availability check, not complete application verification.",
        },
        {
          term: "Recovery",
          explanation:
            "The script attempts to restore the previous target. Disk, permission or service errors can also break recovery, so inspect the logs and confirm the site yourself.",
        },
        {
          term: "Rollback boundary",
          explanation:
            "Code and data have different lifecycles. Keep database changes backward-compatible with the previous release and maintain tested database backups.",
        },
      ],
      expected:
        "The intended release serves correctly, critical smoke tests pass, and the preceding version remains available. Only you can record those observations.",
      verification: block(
        "Check the release after the job",
        win
          ? `Get-Item -LiteralPath ${pq(current)} | Select-Object Target\nInvoke-WebRequest -UseBasicParsing -Uri ${pq("https://" + c.domain + "/")} | Select-Object StatusCode`
          : `readlink -f ${q(current)}\ncurl --fail --show-error --location ${q("https://" + c.domain + "/")} -o /dev/null`,
        language,
        "Server · deployment user",
      ),
      problems: [
        issue(
          "Release rolled back or health check failed",
          "The new code did not start, HTTP was unsuccessful, or the release marker was stale.",
          "Inspect runner output and app logs before another run. Verify the current target and service. Check CDN behavior, the health route, locked dependencies and environment compatibility.",
        ),
        issue(
          "Uploads or secrets disappear after release",
          "Persistent data was stored inside a versioned folder.",
          "Stop new releases, recover data from the backup, and move it to a reviewed shared location. For Laravel, check shared/storage, the .env link and any public upload link.",
        ),
      ],
      next: "Keep checks, action pins, backups and runner/runtime security updates maintained. Automation is optional and can be disabled without deleting the working site.",
    },
  ];
  return { steps, files };
}
