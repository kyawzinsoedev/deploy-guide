import type { CodeBlock, Guide, GuideConfig, Problem, Step } from "@/lib/types";
import { assertValid, powershellQuote as q } from "@/lib/validation";
import { generateWindowsService, windowsRoot } from "@/lib/windows-commands";
import { generateApache, apacheAccount } from "@/lib/apache";
import { databaseStep, databaseSources, laravelEnvironment } from "./databases";
import { stacks } from "./stacks";
import { osLabel, phpVersionNote } from "./platforms";

const sources = [
  {
    label: "Apache: Windows installation and services",
    url: "https://httpd.apache.org/docs/2.4/platform/windows.html",
  },
  {
    label: "Apache: reverse proxy",
    url: "https://httpd.apache.org/docs/2.4/mod/mod_proxy.html",
  },
  {
    label: "Apache: rewrite rules",
    url: "https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html",
  },
  {
    label: "Apache: TLS settings",
    url: "https://httpd.apache.org/docs/2.4/mod/mod_ssl.html",
  },
  {
    label: "PHP: Apache on Windows",
    url: "https://www.php.net/manual/en/install.windows.apache2.php",
  },
  {
    label: "Microsoft: Robocopy",
    url: "https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy",
  },
  {
    label: "win-acme: filesystem validation",
    url: "https://www.win-acme.com/reference/plugins/validation/http/filesystem",
  },
  {
    label: "win-acme: PEM files",
    url: "https://www.win-acme.com/reference/plugins/store/pemfiles",
  },
  {
    label: "win-acme: renewal scripts",
    url: "https://www.win-acme.com/reference/plugins/installation/script",
  },
  {
    label: "win-acme: automatic renewal",
    url: "https://www.win-acme.com/manual/automatic-renewal",
  },
];
const code = (
  title: string,
  value: string,
  location: CodeBlock["location"] = "Server · administrator",
  changes = true,
  language: CodeBlock["language"] = "powershell",
): CodeBlock => ({ title, code: value, location, changes, language });
const problem = (
  symptom: string,
  cause: string,
  fix: string,
  tags: string[],
): Problem => ({ symptom, cause, fix, tags });
const problems = {
  permissions: problem(
    "Apache returns 403",
    "The web account cannot read the root, or directory rules deny it.",
    "Read the Apache error log. Check DocumentRoot, its matching Directory rule and icacls output. Grant read/execute to the web account; Modify only to documented runtime folders.",
    ["403", "permissions", "windows"],
  ),
  config: problem(
    "Apache will not start",
    "A module is missing, a path is wrong or a port is occupied.",
    "Run httpd.exe -t and -S. Inspect the named file and line and Get-NetTCPConnection. PHP module errors often mean mismatched architecture/TS builds or missing Visual C++ libraries. Restore the configuration backup if needed.",
    ["config", "port", "apache"],
  ),
  routing: problem(
    "A route or asset returns 404",
    "The root, build output or routing rules are wrong.",
    "Inspect access/error logs and the requested file. Laravel React needs public/build/manifest.json; Vite routes use index.html and Laravel routes use index.php. Never expose the project root to fix missing assets.",
    ["404", "assets", "manifest"],
  ),
  proxy: problem(
    "Apache returns 502 or Node crashes",
    "The private service is stopped or listens on another address or port.",
    "Read WinSW logs, inspect Get-NetTCPConnection and request the loopback URL. Repair the application before changing Apache. Keep its port private.",
    ["502", "crash", "port"],
  ),
  tls: problem(
    "Certificate issuance fails",
    "DNS, AAAA records, firewall access or the challenge path points elsewhere.",
    "Test every hostname from outside the server and read win-acme logs. Check the challenge probe over HTTP. Correct routing before retrying; do not use a self-signed certificate to hide the problem.",
    ["dns", "certificate", "https"],
  ),
  build: problem(
    "Build or Composer checks fail",
    "The runtime, extensions or lockfile do not match the project.",
    "Read the first error. Check php --ini, php -m and Composer platform requirements. Fix the lockfile in development rather than bypassing platform checks.",
    ["build", "php", "composer"],
  ),
};
function step(
  id: string,
  title: string,
  goal: string,
  why: string,
  how: string,
  before: string,
  blocks: CodeBlock[],
  breakdown: Step["breakdown"],
  expected: string,
  verify: string,
  issues: Problem[],
  note?: string,
): Step {
  return {
    id,
    title,
    goal,
    why,
    how,
    before,
    blocks,
    breakdown,
    expected,
    verification: code(
      "Check the result",
      verify,
      "Server · administrator",
      false,
    ),
    problems: issues,
    next: "Continue only after your own verification passes.",
    note,
  };
}

/** Native Windows instructions are independent of the Ubuntu shell/content path. */
export function generateWindowsGuide(c: GuideConfig): Guide {
  assertValid(c);
  const base = stacks.find((s) => s.id === c.stack)!;
  const php = c.stack === "laravel",
    node = base.mode === "node",
    built = c.stack === "vite" || c.stack === "next-static";
  const name = q(c.appName),
    dir = q(c.directory),
    root = windowsRoot(c),
    publicDir = q(root);
  const staged = `C:\\DeployGuideUpload\\${c.appName}`,
    runtimeDir = `C:\\ProgramData\\DeployGuide\\${c.appName}`;
  const phpDir = `C:\\PHP\\${c.runtime}`,
    phpCmd = `& ${q(phpDir + "\\php.exe")}`,
    composer = `${phpCmd} 'C:\\ProgramData\\ComposerSetup\\bin\\composer.phar'`;
  const install =
    c.packageManager === "npm"
      ? "npm.cmd ci"
      : "pnpm.cmd install --frozen-lockfile";
  const build = `${c.packageManager}.cmd run build`;
  const steps: Step[] = [];
  steps.push(
    step(
      "win-prepare",
      "Prepare Windows & Apache",
      "Install Apache and separate the deployment owner from the web process.",
      "Apache receives public HTTP requests. A dedicated service account reads the website without administrator rights; your deployment account owns and updates the source.",
      "Apache runs as a Windows service. Configuration stays under C:\\Apache24, outside uploads. Windows access-control lists control read and write access.",
      `A fresh ${osLabel(c.os)} x64 Desktop Experience server, administrator PowerShell and tested provider-console recovery. Keep RDP behind a VPN or management allowlist. This recipe uses one Apache instance and one PHP version, not multi-tenant isolation.`,
      [
        code(
          "Inspect existing services and ports",
          `Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture\nGet-NetTCPConnection -State Listen | Where-Object LocalPort -in 80,443\nGet-Service -Name Apache2.4 -ErrorAction SilentlyContinue\nTest-Path -LiteralPath ${dir}`,
          undefined,
          false,
        ),
        code(
          "Install Apache 2.4",
          `1. Get a current patched x64 Apache 2.4 build from Apache Lounge, the third-party distributor linked in Apache's Windows documentation. Apache itself distributes source, not Windows installers. Verify the download and build requirements.\n2. Install its matching Microsoft Visual C++ runtime; extract to C:\\Apache24. Do not overlay an existing installation.\n3. Back up conf\\httpd.conf. Confirm ServerRoot "C:/Apache24", Listen 80 and ServerName ${c.domain}:80. Preserve the default deny rule for <Directory /> and the stock TypesConfig.\n4. Enable the existing LoadModule lines for authz_core, authz_host, dir, mime, log_config, alias, rewrite and headers. ${node ? "Also enable proxy and proxy_http." : ""} Do not duplicate module entries.\n5. Inspect and disable unused sample virtual hosts, CGI/status pages and example content on this dedicated installation. If another service owns 80/443, plan its migration before starting Apache.`,
          undefined,
          true,
          "text",
        ),
        code(
          "Create the new deployment and web accounts",
          `$ErrorActionPreference = 'Stop'\nif ((Get-LocalUser -Name ${q(c.username)} -ErrorAction SilentlyContinue) -or (Get-LocalUser -Name '${apacheAccount}' -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath ${dir})) { throw 'An account or folder already exists; inspect before adapting this first-install recipe.' }\nNew-LocalUser -Name ${q(c.username)} -Password (Read-Host 'Deployment password: server only' -AsSecureString)\nNew-LocalUser -Name '${apacheAccount}' -Password (Read-Host 'Apache service password: server only' -AsSecureString) -Description 'Restricted Apache service account'\nNew-Item -ItemType Directory -Path ${dir}\nicacls.exe ${dir} /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' ${q(c.username + ":(OI)(CI)(M)")} '${apacheAccount}:(OI)(CI)(RX)'\nif ($LASTEXITCODE -ne 0) { throw 'Directory ACL failed' }`,
        ),
        code(
          "Register Apache without starting it",
          `& 'C:\\Apache24\\bin\\httpd.exe' -t\nif ($LASTEXITCODE -ne 0) { throw 'Fix configuration before continuing' }\n& 'C:\\Apache24\\bin\\httpd.exe' -k install -n 'Apache2.4'\nif ($LASTEXITCODE -ne 0) { throw 'Service installation failed' }\nicacls.exe 'C:\\Apache24' /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' '${apacheAccount}:(OI)(CI)(RX)'\nicacls.exe 'C:\\Apache24\\logs' /grant '${apacheAccount}:(OI)(CI)(M)'\n# Check each ACL command's exit code before continuing.\nservices.msc\n# Apache2.4 > Properties > Log On > This account: .\\${apacheAccount}\n# Enter its password privately. Set startup type Automatic.\n# Windows grants Log on as a service; domain policy may require administrator approval.\n# Do not start under the installer-default LocalSystem account.`,
        ),
      ],
      [
        {
          term: "Service account",
          explanation:
            "dg-httpd is a non-administrator account. It needs read/execute on Apache and site files, Modify on Apache logs, and traversal through parent folders. Monitor password expiry and update service credentials when rotating it.",
        },
        {
          term: "Configuration backup",
          explanation:
            "Back up httpd.conf to a timestamped protected file before editing. Existing servers require a reviewed migration. Apache is started only after the app and virtual host are ready.",
        },
      ],
      "The service is registered under the dedicated account, file access is limited and public ports have no unresolved conflict.",
      `Get-CimInstance Win32_Service -Filter "Name='Apache2.4'" | Select-Object Name,StartName,State\nicacls.exe ${dir}\n& 'C:\\Apache24\\bin\\httpd.exe' -t`,
      [problems.config, problems.permissions],
    ),
  );

  if (built)
    steps.push(
      step(
        "win-local-build",
        "Build on your computer",
        "Produce browser-ready files before uploading to Windows Server.",
        "A static server needs only public output. Keeping build tooling on your computer reduces the production server’s responsibilities.",
        "Your locked dependencies and build command create dist or out. All browser-exposed environment values become public. Next.js request-time features require its Node-server path instead.",
        "Your computer, PowerShell in the tested project root. Node.js 24 and the chosen package manager must already be installed. Keep the committed lockfile.",
        [
          ...(c.repository
            ? [
                code(
                  "Optional local clone",
                  `# Use an empty parent directory only if you do not already have a checkout.\ngit clone -- ${q(c.repository)} ${name}\nSet-Location ${name}`,
                  "Your computer",
                ),
              ]
            : []),
          ...(c.stack === "next-static"
            ? [
                code(
                  "Merge into the local Next.js configuration",
                  `// Preserve other settings in your existing config.\nexport default { output: 'export', trailingSlash: true, images: { unoptimized: true } };`,
                  "Configuration",
                  true,
                  "javascript",
                ),
              ]
            : []),
          code(
            "Build the public output",
            `node --version\n${install}\n${build}\nGet-ChildItem -LiteralPath ${q(c.stack === "vite" ? "dist" : "out")}`,
            "Your computer",
          ),
        ],
        [
          {
            term: "Locked dependencies",
            explanation:
              "npm ci and pnpm --frozen-lockfile refuse a manifest/lockfile mismatch. Fix it locally rather than installing unexpected versions.",
          },
          {
            term: "Static export",
            explanation:
              "The browser receives prebuilt files. Do not start npm run dev, vite preview, or a Node service on this static server.",
          },
        ],
        "The public output directory contains index.html and compiled assets.",
        `# On YOUR COMPUTER in the project root:\nTest-Path -LiteralPath ${q((c.stack === "vite" ? "dist" : "out") + "\\index.html")}`,
        [problems.build],
      ),
    );

  if (node || php)
    steps.push(
      step(
        "win-runtime",
        "Install the application runtime",
        "Install the selected production runtime and check its dependencies.",
        php
          ? "Apache needs PHP to execute Laravel. Composer installs locked dependencies; PHP CLI runs Artisan. The CLI and web module must use the selected PHP branch."
          : "Node executes the app behind Apache. WinSW lets Windows supervise it after you close the terminal.",
        php
          ? "Use an x64 Thread Safe (TS) build with php8apache2_4.dll. Apache loads PHP into its threaded worker process; one Apache instance loads one PHP version."
          : "Use Node 24 and one WinSW service. Apache's proxy modules forward HTTP to loopback.",
        "Administrator on the server, any directory. Verify installer signatures/checksums and compatibility with your lockfile. Install current patch releases within the selected branch.",
        [
          code(
            "Runtime installation checklist",
            php
              ? `1. From windows.php.net, download the current PHP ${c.runtime} x64 Thread Safe ZIP including php8apache2_4.dll. Match Apache's build requirements and install the required Visual C++ runtime.\n2. Extract to ${phpDir}. Copy php.ini-production to php.ini only if absent.\n3. Set extension_dir="${phpDir.replaceAll("\\", "/")}/ext", display_errors=Off, log_errors=On and expose_php=Off. Enable curl, fileinfo, mbstring, openssl, pdo_mysql and other extensions required by composer.lock (often intl and zip).\n4. Install Composer from getcomposer.org using this PHP CLI. Verify composer.phar exists at C:\\ProgramData\\ComposerSetup\\bin\\composer.phar, or adapt its path.\n5. Merge the PHP module block below into httpd.conf once, after a backup. Do not add a global PHP handler: the later virtual host restricts execution to public/index.php.`
              : `1. Install the current patched Node.js 24 x64 MSI from nodejs.org for all users.\n2. Download WinSW 2.12.0 WinSW.NET461.exe from its official release. Use the patched .NET Framework on Windows Server. The standalone x64 asset bundles obsolete .NET Core 3.1; do not use it.\n3. Store it as C:\\Services\\${c.appName}\\${c.appName}.exe. Only Administrators and SYSTEM may modify the wrapper folder and XML.\n4. ${c.packageManager === "pnpm" ? "Install project-compatible pnpm 10 using npm.cmd install --global pnpm@10 and verify pnpm.cmd --version." : "Use npm with the project's committed package-lock.json."}`,
            undefined,
            true,
            "text",
          ),
          ...(php
            ? [
                code(
                  "Merge into httpd.conf once",
                  `LoadModule php_module "C:/PHP/${c.runtime}/php8apache2_4.dll"\nPHPIniDir "C:/PHP/${c.runtime}"`,
                  "Configuration",
                  true,
                  "apache",
                ),
              ]
            : []),
          code(
            "Verify installed tools",
            php
              ? `${phpCmd} --version\n${phpCmd} --ini\n${phpCmd} -m\n${composer} --version\n& 'C:\\Apache24\\bin\\httpd.exe' -t\n& 'C:\\Apache24\\bin\\httpd.exe' -M`
              : "& 'C:\\Program Files\\nodejs\\node.exe' --version\nnpm.cmd --version",
            undefined,
            false,
          ),
        ],
        [
          {
            term: php ? "Thread Safe PHP" : "Windows service",
            explanation: php
              ? "TS is required by the Apache module. NTS is for a different execution model. php.exe runs Composer/Artisan; Apache loads the DLL. Both need compatible extensions."
              : "WinSW starts the app after reboot and can restart after failure. Use the explicit LocalService identity below rather than its privileged default.",
          },
          {
            term: "Production execution",
            explanation:
              "Do not use php artisan serve, npm run dev or a Vite development server for production traffic. PHP executes inside Apache here; Node uses its production start command.",
          },
        ],
        php
          ? `The CLI reports PHP ${c.runtime}.x, required extensions load and httpd -M lists php_module.`
          : "Node reports v24.x and the service wrapper is in its protected directory.",
        php
          ? `${phpCmd} --ini\n& 'C:\\Apache24\\bin\\httpd.exe' -M`
          : "Get-Command node,npm.cmd",
        [problems.build, problems.config],
        php ? phpVersionNote(c) : undefined,
      ),
    );

  if (php) steps.push(databaseStep(c));
  const uploadBlocks: CodeBlock[] = [
    code(
      "Choose Git or ZIP on your computer",
      c.repository
        ? `# Clone only if you do not have a checkout; run from a local parent folder.\ngit clone -- ${q(c.repository)} ${name}\nSet-Location -LiteralPath ${name}\ngit log -1 --oneline`
        : "Extract the reviewed ZIP into a new local folder. Open the actual project root, not a wrapper directory. Keep the lockfiles and non-secret .env.example; exclude .env, credentials, .git, node_modules, vendor and development caches.",
      "Your computer",
      !!c.repository,
      c.repository ? "powershell" : "text",
    ),
    code(
      "Stage files through your management connection",
      `# Copy the reviewed ${built ? "CONTENTS of " + (c.stack === "vite" ? "dist" : "out") : node || php ? "project source (no node_modules, vendor cache or secrets)" : "public-only website folder"} into ${staged} using your approved RDP drive redirection or secured file transfer.\n# Do not enable anonymous FTP or public SMB.\nGet-ChildItem -LiteralPath ${q(staged)}\n# Create only the required public directory if absent.\nif (!(Test-Path -LiteralPath ${publicDir})) { New-Item -ItemType Directory -Path ${publicDir} }`,
    ),
    code(
      "Preview the copy, then apply it",
      `robocopy.exe ${q(staged)} ${node || php ? dir : publicDir} /E /COPY:DAT /DCOPY:DAT /XJ /R:2 /W:2 /L /XD .git node_modules vendor .next /XF .env .env.* hot\n# Inspect the preview. /L lists only; remove it for the reviewed copy.\nrobocopy.exe ${q(staged)} ${node || php ? dir : publicDir} /E /COPY:DAT /DCOPY:DAT /XJ /R:2 /W:2 /XD .git node_modules vendor .next /XF .env .env.* hot\nif ($LASTEXITCODE -ge 8) { throw 'Copy failed. Inspect robocopy output.' }\n# /MIR and /PURGE are deliberately absent; no remote files are deleted.${php ? `\n# Transfer only the non-secret template separately if the destination is absent.\nif (!(Test-Path -LiteralPath ${q(c.directory + "\\.env.example")})) { Copy-Item -LiteralPath ${q(staged + "\\.env.example")} -Destination ${q(c.directory + "\\.env.example")} }` : ""}`,
    ),
  ];
  if (php)
    uploadBlocks.push(
      code(
        "Merge these non-secret .env settings",
        laravelEnvironment(c),
        "Configuration",
        true,
        "ini",
      ),
      code(
        "Configure privately and install PHP dependencies",
        `Set-Location -LiteralPath ${dir}\nif (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }\n# Edit on the server. Never place secrets in public or paste them into this website.\nnotepad.exe .env\n# Set APP_ENV=production, APP_DEBUG=false and APP_URL=https://${c.domain}.\n# Set DB_PASSWORD privately using the database account created earlier. Keep existing APP_KEY.\n${composer} install --no-dev --optimize-autoloader\n${composer} check-platform-reqs --no-dev`,
        "Server · deployment user",
      ),
      {
        ...code(
          "First installation only: encryption key",
          `${phpCmd} artisan key:generate`,
          "Server · deployment user",
        ),
        optional:
          "Run from the project root only for a new environment with an empty APP_KEY. Restore the original key for an existing application; never rotate it casually.",
      },
      code(
        "Cache the configured application",
        `Set-Location -LiteralPath ${dir}\n${phpCmd} artisan config:cache\n${phpCmd} artisan view:cache`,
        "Server · deployment user",
      ),
      {
        ...code(
          "Build Laravel React / Vite assets locally",
          `${install}\n${build}\n# Confirm public/build/manifest.json exists. Transfer public/build through the same approved staging/copy flow. Never upload public/hot (Vite development marker).`,
          "Your computer",
        ),
        optional:
          "Required for Laravel React/Inertia starter kits and Vite frontends. Run locally in the project root with its required Node version. Skip only if the app has no frontend build.",
      },
    );
  if (node)
    uploadBlocks.push(
      code(
        "Install and build as the deployment owner",
        `Set-Location -LiteralPath ${dir}\n${install}\n${c.stack === "next-node" ? build : "# Run the project-specific production build if it compiles TypeScript."}\n# Do not use a development server as the start script.`,
        "Server · deployment user",
      ),
    );
  steps.push(
    step(
      "win-files",
      node || php ? "Upload, configure & build" : "Upload your public files",
      node || php
        ? "Copy the tested project and prepare its production artifacts."
        : "Copy only files that visitors may download.",
      "A reviewable copy separates deployment artifacts from source secrets. The website’s public directory must never expose credentials or private configuration.",
      "Robocopy previews and copies files on the server after you transfer them through an approved management channel. It preserves data and timestamps, not source ACLs. Exit codes below 8 do not indicate a copy failure.",
      `Administrator for staging/copy. ${node || php ? "Use a non-elevated PowerShell session as " + c.username + " inside " + c.directory + " for dependency/build commands. Grant that user access through an existing approved login method; it does not need administrator membership." : "Stage only the public artifact."} Stop if a command fails. ${c.repository ? "Repository chosen: " + c.repository + ". Clone it on your computer first if needed; use an existing checkout otherwise." : ""}`,
      uploadBlocks,
      [
        {
          term: "/L, /E and /COPY:DAT",
          explanation:
            "List-only previews without copying; /E includes subdirectories; DAT transfers data, attributes and timestamps. Review source and destination carefully.",
        },
        {
          term: "Environment settings",
          explanation: php
            ? "Laravel .env stays above public. React/Inertia belongs to this Laravel app: upload public/build, including manifest.json. Do not create a separate React document root or run npm run dev. SSR/Reverb need additional services outside this baseline."
            : node
              ? "Next.js build-time values must be supplied before build. Runtime secrets are set privately in the service environment file in the next task."
              : "Static output has no private server environment; anything built into browser JavaScript is public.",
        },
      ],
      node || php
        ? "Locked dependencies and any required build complete successfully. Private settings remain outside the web root."
        : "The public directory contains index.html and the intended assets.",
      `Get-ChildItem -LiteralPath ${node || php ? dir : publicDir}\n${php ? `${composer} check-platform-reqs --no-dev` : node ? "# Inspect the production start script and build output." : `Test-Path -LiteralPath ${q(root + "\\index.html")}`}`,
      [problems.build, problems.permissions],
    ),
  );

  if (node || php)
    steps.push(
      step(
        "win-process",
        php ? "Prepare Laravel permissions & data" : "Keep Node running",
        "Give the application only the access it needs and prepare its runtime behavior.",
        php
          ? "Laravel writes logs, sessions and cached files. Apache needs read access to code and secrets; only storage and bootstrap/cache should be writable."
          : "A Windows service keeps Node running after logout and can restart it after a crash without administrator privileges.",
        php
          ? "Apache executes PHP under the dedicated web account. Database migrations and public upload links are separate, conditional tasks."
          : "WinSW launches Node as LocalService with protected runtime settings. Apache connects over loopback; no public application-port rule is needed.",
        `Administrator for ACL/service changes; deployment user in ${c.directory} for Artisan. Build and settings must be complete. Back up the database before any migration.`,
        php
          ? [
              code(
                "Grant only the web process's required access",
                `icacls.exe ${q(phpDir)} /grant '${apacheAccount}:(OI)(CI)(RX)'\nicacls.exe ${dir} /grant '${apacheAccount}:(OI)(CI)(RX)'\nicacls.exe ${q(c.directory + "\\storage")} /grant '${apacheAccount}:(OI)(CI)(M)'\nicacls.exe ${q(c.directory + "\\bootstrap\\cache")} /grant '${apacheAccount}:(OI)(CI)(M)'\n# Check each exit code. Do not grant Modify to the whole project.\n# Set PHP error_log to a protected writable log under storage/logs.`,
              ),
              {
                ...code(
                  "Review and run required migrations",
                  `Set-Location -LiteralPath ${dir}\n${phpCmd} artisan migrate:status\n# After reviewing pending migrations and backing up the database:\n${phpCmd} artisan migrate\n# Read the production confirmation. Do not run development seeders automatically.`,
                  "Server · deployment user",
                ),
                optional:
                  "Only if the app uses database migrations. Starter kits normally need tables for user accounts and any database-backed sessions/cache/queues. Existing data needs a tested backup and rollback plan.",
              },
              {
                ...code(
                  "Link public uploads",
                  `Set-Location -LiteralPath ${dir}\n${phpCmd} artisan storage:link\n# If Windows requires elevation for this link, ask an administrator to create it once.`,
                  "Server · deployment user",
                ),
                optional:
                  "Only for Laravel's local public storage disk. Skip for no uploads or remote object storage.",
              },
              {
                ...code(
                  "Configure scheduled tasks",
                  `Task Scheduler → Create Task under the deployment account with approved credential handling.\nTrigger: every minute. If already running: do not start another instance.\nProgram: ${phpDir}\\php.exe\nArguments: artisan schedule:run\nStart in: ${c.directory}\nRun once manually and inspect Last Run Result and application logs.`,
                  undefined,
                  true,
                  "text",
                ),
                optional:
                  "Only if the app defines scheduled tasks. Create one scheduler for the application.",
              },
            ]
          : [
              code(
                "Create the protected runtime settings directory",
                `New-Item -ItemType Directory -Path ${q(runtimeDir + "\\logs")} -Force\nicacls.exe ${q(runtimeDir)} /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' '*S-1-5-19:(OI)(CI)(RX)'\nicacls.exe ${q(runtimeDir + "\\logs")} /grant '*S-1-5-19:(OI)(CI)(M)'\nicacls.exe ${dir} /grant '*S-1-5-19:(OI)(CI)(RX)'\n${c.stack === "next-node" ? `# Next.js may write its runtime cache. Grant only that directory.\nNew-Item -ItemType Directory -Path ${q(c.directory + "\\.next\\cache")} -Force\nicacls.exe ${q(c.directory + "\\.next\\cache")} /grant '*S-1-5-19:(OI)(CI)(M)'\n` : ""}if (!(Test-Path -LiteralPath ${q(runtimeDir + "\\app.env")})) { New-Item -ItemType File -Path ${q(runtimeDir + "\\app.env")} }\nnotepad.exe ${q(runtimeDir + "\\app.env")}`,
              ),
              code(
                "Private runtime environment values",
                `NODE_ENV=production\nHOST=127.0.0.1\nPORT=${c.port}`,
                "Configuration",
                true,
                "ini",
              ),
              ...(c.stack === "express"
                ? [
                    code(
                      "Adapt the existing Express listener",
                      `// Modify the existing listen call; do not add a second listener.\napp.listen(Number(process.env.PORT || ${c.port}), '127.0.0.1');`,
                      "Configuration",
                      true,
                      "javascript",
                    ),
                  ]
                : []),
              code(
                `Save beside the wrapper as ${c.appName}.xml`,
                generateWindowsService(c),
                "Configuration",
                true,
                "xml",
              ),
              code(
                "Install and start the service",
                `# Inspect the port owner before starting. Do not kill an unrelated process.\nGet-NetTCPConnection -LocalPort ${c.port} -ErrorAction SilentlyContinue\n# Confirm C:\\Services\\${c.appName} is writable only by administrators and SYSTEM.\nif (Get-Service -Name ${name} -ErrorAction SilentlyContinue) { throw 'Service already exists. Inspect before making changes.' }\n& ${q("C:\\Services\\" + c.appName + "\\" + c.appName + ".exe")} install\nif ($LASTEXITCODE -ne 0) { throw 'Service installation failed' }\nStart-Service -Name ${name}`,
              ),
            ],
        [
          {
            term: php ? "Apache service identity" : "LocalService",
            explanation: php
              ? "The dg-httpd account reads PHP and the application and modifies only runtime storage/cache. It does not belong to Administrators."
              : "LocalService is a built-in non-administrator account shared with other LocalService processes. Multi-tenant deployments need a separately reviewed identity design.",
          },
          {
            term: "Optional background work",
            explanation: php
              ? "Windows PHP lacks PCNTL used for Laravel queue timeouts. This baseline does not configure native production queue workers or Horizon. Use separately reviewed Linux workers when needed. Sync queues need no worker."
              : "Keep logs bounded and grant Modify only to explicitly documented runtime data directories outside public files.",
          },
        ],
        php
          ? "Runtime directory permissions are scoped and any required migrations have completed."
          : "The service runs and responds at its private loopback address.",
        php
          ? `icacls.exe ${q(c.directory + "\\storage")}\n& 'C:\\Apache24\\bin\\httpd.exe' -M`
          : `Get-Service -Name ${name}\nGet-NetTCPConnection -LocalPort ${c.port}\ncurl.exe -I http://127.0.0.1:${c.port}`,
        [problems.permissions, php ? problems.build : problems.proxy],
        php
          ? "PHP-FPM and systemd are Linux concepts; Apache hosts PHP directly on this Windows path."
          : "Runtime settings do not supply Next.js build-time values. Never put secrets in service XML or browser bundles.",
      ),
    );

  const conf = `C:\\Apache24\\conf\\extra\\${c.appName}.conf`;
  const reloadScript = `$ErrorActionPreference = 'Stop'\n& 'C:\\Apache24\\bin\\httpd.exe' -t\nif ($LASTEXITCODE -ne 0) { throw 'Apache syntax check failed; restore the reviewed configuration.' }\n& 'C:\\Apache24\\bin\\httpd.exe' -k restart -n 'Apache2.4'\nif ($LASTEXITCODE -ne 0) { throw 'Apache restart failed; inspect logs and service state.' }`;
  steps.push(
    step(
      "win-apache",
      "Connect Apache to your application",
      `Route ${c.domain} to the correct public files or private Node service.`,
      "A virtual host selects the site for a hostname. A narrow document root keeps source and private settings outside what visitors can download.",
      node
        ? "Apache reverse-proxies HTTP to Node on loopback. It overwrites proxy headers, and the application trusts only that local proxy."
        : "Apache serves existing assets directly. Vite falls back to index.html; Laravel sends application routes to public/index.php. Static Next.js serves exported directory indexes.",
      "Elevated PowerShell on the server. Preserve existing Apache configuration, review modules and confirm the service uses dg-httpd. The application files/build must be ready. This is a new-site baseline; merge custom rules after reviewing them.",
      [
        code(
          "Prepare protected certificate-validation folders",
          `New-Item -ItemType Directory -Path ${q(runtimeDir + "\\acme\\.well-known\\acme-challenge")}, ${q(runtimeDir + "\\tls")} -Force\nicacls.exe ${q(runtimeDir)} /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)'\nicacls.exe ${q(runtimeDir + "\\acme")} /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' '${apacheAccount}:(OI)(CI)(RX)'\nicacls.exe ${q(runtimeDir + "\\tls")} /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' '${apacheAccount}:(OI)(CI)(RX)'\n# Check each exit code. Certificate keys stay outside the document root.`,
        ),
        code(
          "Back up and edit the site configuration",
          `Copy-Item -LiteralPath 'C:\\Apache24\\conf\\httpd.conf' -Destination ('C:\\Apache24\\conf\\httpd.conf.backup-' + (Get-Date -Format yyyyMMdd-HHmmss))\nif (Test-Path -LiteralPath ${q(conf)}) { Copy-Item -LiteralPath ${q(conf)} -Destination (${q(conf + ".backup-")} + (Get-Date -Format yyyyMMdd-HHmmss)) }\nnotepad.exe ${q(conf)}\n# Save the configuration below. In httpd.conf, add this Include once:\n# Include conf/extra/${c.appName}.conf`,
        ),
        code(
          "Initial HTTP virtual host",
          generateApache(c),
          "Configuration",
          true,
          "apache",
        ),
        ...(node
          ? [
              code(
                "Application proxy trust",
                "For Express, configure app.set('trust proxy', 'loopback') before using req.protocol or secure proxy cookies. Keep the existing listener bound to 127.0.0.1. Apache discards client-supplied forwarded headers before proxying. Test redirects, cookies and authentication after HTTPS setup.",
                "Configuration",
                true,
                "text",
              ),
            ]
          : []),
        code(
          "Test, then start Apache",
          `& 'C:\\Apache24\\bin\\httpd.exe' -t\nif ($LASTEXITCODE -ne 0) { throw 'Do not start Apache until this check passes.' }\n& 'C:\\Apache24\\bin\\httpd.exe' -S\n# Check the virtual host, port and hostname mapping above.\nGet-CimInstance Win32_Service -Filter "Name='Apache2.4'" | Select-Object StartName\n# Confirm the dedicated account before starting, not LocalSystem.\nStart-Service -Name Apache2.4\n# If already running, use the tested restart procedure in the HTTPS step.`,
        ),
      ],
      [
        {
          term: "DocumentRoot / Directory",
          explanation:
            "Both must name the same public directory. Laravel exposes public only. AllowOverride None keeps rules in administrator-owned Apache configuration; the app cannot override them using .htaccess.",
        },
        {
          term: "httpd -t and -S",
          explanation:
            "Check syntax first, then inspect virtual-host mappings. A syntax pass cannot prove application correctness. Restarting this Apache instance affects its sites; plan a maintenance window and restore the backed-up file if needed.",
        },
      ],
      "A request using the domain's Host header reaches this app. No directory listing, private source or unexpected default page is exposed.",
      `curl.exe -I -H ${q("Host: " + c.domain)} http://127.0.0.1\nGet-Content -LiteralPath ${q("C:\\Apache24\\logs\\" + c.appName + "-error.log")} -Tail 30`,
      [
        problems.config,
        problems.permissions,
        problems.routing,
        ...(node ? [problems.proxy] : []),
      ],
    ),
  );

  steps.push(
    step(
      "win-https",
      "Connect DNS & enable HTTPS",
      "Make every hostname reachable and install a browser-trusted certificate.",
      "DNS locates the server, firewall rules allow web traffic, and HTTPS encrypts it. Certificate validation only works after public HTTP reaches the challenge directory.",
      "win-acme writes a temporary HTTP challenge, obtains a certificate, stores PEM files outside the public root and schedules renewal. Apache reads those files; a protected renewal script tests and restarts Apache after replacement.",
      "You control DNS and the provider firewall. Keep management access unchanged. Use your public server address (or correctly configured public NAT), not a private LAN address. Download current win-acme from its official site into the permanent, administrator-protected C:\\Tools\\win-acme folder.",
      [
        code(
          "DNS records to configure",
          `${c.domain}  A  ${c.serverIp}${c.www ? "\nwww." + c.domain + "  A  " + c.serverIp : ""}\nCorrect or remove stale AAAA records unless IPv6 reaches the same site.`,
          "Configuration",
          true,
          "text",
        ),
        code(
          "Inspect firewall rules and allow web traffic",
          `Resolve-DnsName ${q(c.domain)} -Type A\nGet-NetFirewallRule -Enabled True | Select-Object DisplayName,Direction,Action\n# Review equivalent existing rules before creating this rule. Preserve VPN/RDP access.\nNew-NetFirewallRule -DisplayName ${q(c.appName + " HTTP HTTPS")} -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80,443\n# Also allow 80/443 through provider firewalls. Keep database and app ports private.\nSet-Content -LiteralPath ${q(runtimeDir + "\\acme\\.well-known\\acme-challenge\\deployguide-check.txt")} -Value 'deployguide-check' -Encoding ascii`,
        ),
        code(
          "Verify public HTTP challenge access first",
          `Resolve-DnsName ${q(c.domain)} -Type A\ncurl.exe --fail ${q("http://" + c.domain + "/.well-known/acme-challenge/deployguide-check.txt")}${c.www ? "\ncurl.exe --fail " + q("http://www." + c.domain + "/.well-known/acme-challenge/deployguide-check.txt") : ""}\n# Expect deployguide-check, not an application page. Check from an external network.`,
          "Your computer",
          false,
        ),
        code(
          `Save as C:\\Apache24\\bin\\renew-${c.appName}.ps1`,
          reloadScript,
          "Configuration",
          true,
          "powershell",
        ),
        code(
          "Run the certificate client",
          `& 'C:\\Tools\\win-acme\\wacs.exe' --pemfilesname ${name}\n# Choose M: create certificate with full options. Follow the checklist below.`,
        ),
        code(
          "Certificate wizard choices",
          `1. Source: manually enter ${c.domain}${c.www ? ",www." + c.domain : ""}. Include only the hostnames just tested.\n2. Validation: HTTP-01, save verification files on a local path (filesystem). Webroot: ${runtimeDir}\\acme. Do not choose the temporary self-hosting listener while Apache owns port 80. Decline the IIS web.config option if offered.\n3. Storage: PEM encoded files (Apache). Folder: ${runtimeDir}\\tls. The launch argument sets the PEM filename prefix to ${c.appName}.\n4. Installation: run an external script, C:\\Apache24\\bin\\renew-${c.appName}.ps1, with no arguments. It can safely restart the initial HTTP configuration on first issuance.\n5. Review CA terms and contact details yourself. Let win-acme create its scheduled renewal task. Inspect the result; continue only after successful issuance.`,
          undefined,
          true,
          "text",
        ),
        code(
          "Check certificate files before enabling TLS",
          `Test-Path -LiteralPath ${q(runtimeDir + "\\tls\\" + c.appName + "-chain.pem")}\nTest-Path -LiteralPath ${q(runtimeDir + "\\tls\\" + c.appName + "-key.pem")}\nicacls.exe ${q(runtimeDir + "\\tls")}\n# Enable ssl_module and socache_shmcb_module in httpd.conf; add Listen 443 once.\n# Back up the working HTTP site file, then replace its content with the full configuration below.\nCopy-Item -LiteralPath ${q(conf)} -Destination (${q(conf + ".before-tls-")} + (Get-Date -Format yyyyMMdd-HHmmss))`,
        ),
        code(
          "After successful issuance: full HTTPS site configuration",
          generateApache(c, true),
          "Configuration",
          true,
          "apache",
        ),
        code("Test and restart after the TLS edit", reloadScript),
      ],
      [
        {
          term: "PEM files and renewal",
          explanation:
            "The chain file contains the server certificate plus intermediates; the key file is secret. Apache's account gets read access, and only administrators/SYSTEM can update the files and renewal script. Renewal must restart Apache to load the replacement.",
        },
        {
          term: "Trusted HTTPS",
          explanation:
            "A self-signed certificate may encrypt traffic but is not browser-trusted public HTTPS. Keep port 80 reachable for HTTP-01 renewal. win-acme --test uses a staging CA; it is not a harmless production dry-run. Never overwrite live PEM files with staging certificates.",
        },
      ],
      "Every hostname serves trusted HTTPS, ordinary HTTP redirects, the challenge path remains reachable, and renewal has a scheduled task and restart script.",
      `curl.exe -I ${q("https://" + c.domain)}${c.www ? "\ncurl.exe -I " + q("https://www." + c.domain) : ""}\nGet-ScheduledTask | Where-Object TaskName -match 'win-acme' | Get-ScheduledTaskInfo\n# Inspect certificate expiry in the browser, win-acme logs and the task's last-run result.\n# Test renewal separately in staging with separate output paths; monitor the first real renewal.`,
      [problems.tls, problems.config],
    ),
  );

  steps.push(
    step(
      "win-verify",
      "Check before going live",
      "Test public routes, assets, HTTPS and private-file boundaries.",
      "A running web service is not proof that the app, certificate, database and permissions work together.",
      "Test from another network, then correlate failures with Apache access/error logs, application logs and Windows Event Viewer. A checkbox records personal progress; DeployGuide cannot inspect the server.",
      "Use safe test data from your own computer. Run log commands on the server. curl.exe explicitly selects curl instead of PowerShell's older alias.",
      [
        code(
          "Public smoke tests",
          `curl.exe -I ${q("http://" + c.domain)}\ncurl.exe -I ${q("https://" + c.domain)}${c.www ? "\ncurl.exe -I " + q("https://www." + c.domain) : ""}\ncurl.exe -I ${q("https://" + c.domain + "/.env")}\ncurl.exe -I ${q("https://" + c.domain + "/.git/config")}\n# Open the browser, refresh nested routes, inspect assets and test key actions.\n# For Laravel React: check login, sessions, validation and form submissions.`,
          "Your computer",
          false,
        ),
        code(
          "Read service status and logs",
          `Get-Service -Name Apache2.4\nGet-Content -LiteralPath ${q("C:\\Apache24\\logs\\" + c.appName + "-error.log")} -Tail 50\n${node ? `Get-Service -Name ${name}\nGet-ChildItem -LiteralPath ${q(runtimeDir + "\\logs")}\nGet-NetTCPConnection -LocalPort ${c.port}` : php ? `Get-ChildItem -LiteralPath ${q(c.directory + "\\storage\\logs")}` : `icacls.exe ${publicDir}`}\n# Never publish log content containing credentials or personal data.`,
          undefined,
          false,
        ),
      ],
      [
        {
          term: "HTTP results",
          explanation:
            "Inspect both status and body. A HEAD request only tests headers; it cannot prove that routes, forms or permissions work. Private paths should return 403/404 and never secret contents.",
        },
        {
          term: "Investigate before changing",
          explanation:
            "Use the exact Apache log message, process state and listener address to distinguish a permission problem from a build failure or stopped application. Do not hide TLS errors with curl -k.",
        },
      ],
      "The site and key actions work over trusted HTTPS, HTTP redirects, and private files cannot be downloaded.",
      `curl.exe --fail --silent --show-error -o NUL -w '%{http_code}' ${q("https://" + c.domain)}\n# Repeat from your computer before marking complete.`,
      Object.values(problems),
    ),
  );
  const localBuild = steps.find((s) => s.id === "win-local-build");
  if (localBuild) localBuild.verification.location = "Your computer";
  steps[steps.length - 1].verification.location = "Your computer";
  for (let i = 0; i < steps.length; i++)
    steps[i].next =
      steps[i + 1]?.goal ??
      "Keep a known-good release and follow the maintenance reference.";
  const architecture = step(
    "architecture",
    "How your Windows deployment works",
    "Understand each component before changing production.",
    "DNS locates the server, Apache handles public HTTP(S), and the selected runtime handles application work.",
    node
      ? "Apache proxies to a private Node Windows service."
      : php
        ? "Apache loads Thread Safe PHP and executes Laravel's public/index.php. React/Inertia assets are served from the same public directory."
        : "Apache serves built files directly; no application process is required.",
    "No terminal is needed to explore the diagram. Server instructions use Windows PowerShell.",
    [
      code(
        "Request path",
        `Browser → DNS → ${c.serverIp}\nApache :80/:443 → ${node ? "127.0.0.1:" + c.port + " → Node service" : php ? "PHP " + c.runtime + " module → Laravel → private MariaDB" : root}`,
        "Configuration",
        false,
        "text",
      ),
    ],
    [
      {
        term: "Apache",
        explanation:
          "A web server that serves public files, negotiates HTTPS and can proxy requests. On this Windows path PHP is an Apache module; Ubuntu uses Nginx with PHP-FPM instead.",
      },
    ],
    "You can identify the public entry point and explain which files and ports must stay private.",
    "# Explain the request path in your own words; this is not a server probe.",
    [problems.routing],
  );
  const maintenance = step(
    "maintain",
    "After launch: updates & recovery",
    "Keep recoverable releases and maintain patching and certificate renewal.",
    "A file update, PHP upgrade or database migration can fail. Tested backups and a maintenance window limit downtime and data loss.",
    "Back up application files, Apache configuration, secrets, uploads and the database separately. Stage the next release, review changes, apply it during maintenance, then test the public site. Restore the previous artifact if necessary; a code rollback cannot reverse a schema change.",
    "Administrator for protected backups and service changes, deployment owner for builds. Use access-controlled off-server storage and test restoration away from production. Coordinate any shared Apache restart.",
    [
      code(
        "Back up configuration before an update",
        `Copy-Item -LiteralPath 'C:\\Apache24\\conf\\httpd.conf' -Destination ('C:\\Apache24\\conf\\httpd.conf.backup-' + (Get-Date -Format yyyyMMdd-HHmmss))\nCopy-Item -LiteralPath ${q(conf)} -Destination (${q(conf + ".backup-")} + (Get-Date -Format yyyyMMdd-HHmmss))\n# Copy app files, private settings, uploads and protected configuration off-server.\n# Back up the database using its vendor's backup tool and test restoration.`,
      ),
      code(
        "Update and recovery checklist",
        `1. Review changes, lockfiles and runtime compatibility. Build frontend assets locally.\n2. Take the backups above and schedule maintenance.\n3. ${node ? "Stop only the " + c.appName + " Node service before replacing its runtime files." : php ? "Enter Laravel maintenance mode with the selected PHP CLI and artisan down. Keep the original key and database settings." : "Prepare the previous public artifact for rollback."}\n4. Preview and copy the release. Preserve private settings and administrator-owned Apache/TLS configuration.\n5. Install locked dependencies, restore scoped permissions, review any migrations and refresh caches.\n6. ${node ? "Start the app service." : php ? "Run artisan up with the selected CLI. PHP binary/module changes also need a tested Apache restart." : "Check the uploaded output."} Test the public site and logs.\n7. If checks fail, restore the known-good artifact and configuration during maintenance. Review schema compatibility before any database recovery.`,
        undefined,
        true,
        "text",
      ),
    ],
    [
      {
        term: "Backup scope",
        explanation:
          "A configuration copy does not back up the database, uploaded files or encryption key. Protect them separately and keep recovery instructions. Never casually regenerate APP_KEY.",
      },
      {
        term: "Patches and renewal",
        explanation:
          "Review Windows, Apache, PHP/Node, MariaDB, extensions, WinSW and win-acme updates. Monitor disk space, logs, certificate expiry and scheduled-task results. Keep service passwords in sync with Windows account rotation.",
      },
    ],
    "The previous release is recoverable, public checks pass, and renewal is monitored.",
    `Get-ScheduledTask | Where-Object TaskName -match 'win-acme' | Get-ScheduledTaskInfo\nGet-Volume | Select-Object DriveLetter,SizeRemaining\ncurl.exe -I ${q("https://" + c.domain)}`,
    Object.values(problems),
  );
  return {
    config: { ...c },
    stack: { ...base, badge: php ? "Apache + PHP" : base.badge },
    steps,
    nginx: "",
    apache: generateApache(c),
    references: [architecture, maintenance],
    reviewedOn: "2026-10-30",
    sources: [
      ...sources,
      ...base.sources.filter((s) => !s.label.includes("Ubuntu")),
      ...(php
        ? [
            ...databaseSources.filter((s) => !/Ubuntu|MySQL 8/.test(s.label)),
            {
              label: "PHP Windows downloads",
              url: "https://windows.php.net/download/",
            },
            {
              label: "PHP supported versions",
              url: "https://www.php.net/supported-versions.php",
            },
            {
              label: "PCNTL is unavailable on Windows",
              url: "https://www.php.net/manual/en/pcntl.installation.php",
            },
          ]
        : []),
      ...(node
        ? [
            {
              label: "WinSW stable releases",
              url: "https://github.com/winsw/winsw/releases",
            },
            {
              label: "WinSW 2.12 XML reference",
              url: "https://github.com/winsw/winsw/blob/v2.12.0/doc/xmlConfigFile.md",
            },
            {
              label: "Node CLI environment files",
              url: "https://nodejs.org/docs/latest-v24.x/api/cli.html",
            },
          ]
        : []),
    ],
  };
}
