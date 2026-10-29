import type { CodeBlock, Guide, GuideConfig, Problem, Step } from "@/lib/types";
import { assertValid, powershellQuote as q } from "@/lib/validation";
import {
  generateWebConfig,
  generateWindowsService,
  windowsRoot,
} from "@/lib/windows-commands";
import { stacks } from "./stacks";
import { osLabel, phpVersionNote } from "./platforms";

const sources = [
  {
    label: "Microsoft: forwarded request headers and allowed server variables",
    url: "https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/setting-http-request-headers-and-iis-server-variables",
  },
  {
    label: "Microsoft: install Windows Server roles",
    url: "https://learn.microsoft.com/en-us/powershell/module/servermanager/install-windowsfeature?view=windowsserver2025-ps",
  },
  {
    label: "Microsoft: IIS application pool identities",
    url: "https://learn.microsoft.com/en-us/iis/manage/configuring-security/application-pool-identities",
  },
  {
    label: "Microsoft: anonymous authentication",
    url: "https://learn.microsoft.com/en-us/iis/configuration/system.webserver/security/authentication/anonymousauthentication/",
  },
  {
    label: "Microsoft: create an IIS website",
    url: "https://learn.microsoft.com/en-us/powershell/module/webadministration/new-website?view=windowsserver2025-ps",
  },
  {
    label: "Microsoft: URL Rewrite download",
    url: "https://www.iis.net/downloads/microsoft/url-rewrite",
  },
  {
    label: "Microsoft: ARR download",
    url: "https://www.iis.net/downloads/microsoft/application-request-routing",
  },
  {
    label: "Microsoft: URL Rewrite and ARR proxy",
    url: "https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing",
  },
  {
    label: "Microsoft: Robocopy options and exit codes",
    url: "https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy",
  },
  {
    label: "Microsoft: IIS configuration backup",
    url: "https://learn.microsoft.com/en-us/powershell/module/webadministration/backup-webconfiguration?view=windowsserver2025-ps",
  },
  {
    label: "win-acme: IIS certificate setup",
    url: "https://www.win-acme.com/manual/getting-started",
  },
  {
    label: "win-acme: automatic renewal",
    url: "https://www.win-acme.com/manual/automatic-renewal",
  },
  {
    label: "Nginx on Windows limitations",
    url: "https://nginx.org/en/docs/windows.html",
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
    "IIS returns 401.3 or 403",
    "The worker identity cannot read the root, or the default document is missing.",
    "Inspect IIS logs, the configured physical path, anonymous authentication identity, and icacls output. Grant the intended pool read/execute only; do not grant Everyone full control.",
    ["403", "permissions", "windows"],
  ),
  config: problem(
    "IIS returns 500.19",
    "web.config is invalid, a section is locked, or URL Rewrite is missing.",
    "Read the detailed IIS configuration error locally. Check XML and installed modules. Merge the site configuration carefully; do not unlock server-wide sections blindly.",
    ["500", "config", "windows"],
  ),
  routing: problem(
    "IIS returns 404 or assets are missing",
    "The public root, build output, default document, MIME type or rewrite rule is wrong.",
    "Inspect the status subcode in IIS logs. Check the requested file exists under the configured public root. Vite needs an SPA fallback; static Next.js needs directory indexes. Add only the specific missing MIME mapping when a 404.3 confirms it.",
    ["404", "assets", "windows"],
  ),
  proxy: problem(
    "IIS returns 502 or the application crashes",
    "The private Node service is stopped, using another port, or ARR proxying is disabled.",
    "Read WinSW logs and Event Viewer; request the loopback URL on the server. Inspect Get-NetTCPConnection and the process owner before changing a port or restarting. Keep the private port closed externally.",
    ["502", "crash", "port", "windows"],
  ),
  tls: problem(
    "Certificate issuance fails or the domain shows another site",
    "DNS, an incorrect AAAA record, IIS host bindings, or a firewall prevents validation.",
    "Resolve every hostname from outside the server; verify each reaches this IIS site on port 80. Read win-acme logs. Correct routing first, then retry without repeatedly requesting certificates.",
    ["dns", "certificate", "windows"],
  ),
  build: problem(
    "Build or Composer platform checks fail",
    "The selected runtime, extensions or locked dependencies differ from the project requirements.",
    "Read the first real error. Check the selected CLI version, php --ini and composer check-platform-reqs. Repair the lockfile locally; never bypass platform requirements to force a deployment.",
    ["build", "php", "windows"],
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
    publicDir = q(root),
    pool = q(`IIS:\\AppPools\\${c.appName}`);
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
      "Prepare Windows Server",
      "Connect through your protected management channel and create an isolated site workspace.",
      "IIS is the native Windows web server. A separate application pool gives the website its own restricted identity, while your deployment account owns the source files.",
      "Use your provider console or RDP through a VPN or an allowlisted management address. Server Manager installs IIS; Windows access-control lists decide which accounts can read or change files. Native Nginx for Windows remains beta and is not the default here.",
      `A fresh ${osLabel(c.os)} x64 installation with Desktop Experience, administrator access and tested console recovery. Run server commands in elevated 64-bit Windows PowerShell 5.1. Keep the existing management connection open. Passwords are entered only on the server, never in DeployGuide.`,
      [
        code(
          "Inspect the operating system and existing services",
          `Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture\nGet-NetTCPConnection -State Listen | Where-Object LocalPort -in 80,443\nGet-LocalUser -Name ${q(c.username)} -ErrorAction SilentlyContinue\nTest-Path -LiteralPath ${dir}`,
          undefined,
          false,
        ),
        code(
          "Install the required IIS roles",
          `Install-WindowsFeature -Name Web-Server,Web-Static-Content,Web-Default-Doc,Web-Http-Errors,Web-Http-Logging,Web-Filtering${php ? ",Web-CGI" : ""} -IncludeManagementTools\n# If Restart Needed is Yes, schedule the reboot before continuing.\nImport-Module WebAdministration\nGet-Website`,
        ),
        code(
          "Create a new site owner, folder and pool",
          `$ErrorActionPreference = 'Stop'\nif ((Get-LocalUser -Name ${q(c.username)} -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath ${dir}) -or (Test-Path ${pool})) { throw 'Existing account, directory or pool. Inspect before reusing; do not overwrite.' }\n$deployPassword = Read-Host 'Password for the deployment account (server only)' -AsSecureString\nNew-LocalUser -Name ${q(c.username)} -Password $deployPassword -Description 'Application deployment owner'\nNew-Item -ItemType Directory -Path ${dir}\nNew-WebAppPool -Name ${name}\nSet-ItemProperty ${pool} -Name managedRuntimeVersion -Value ''\nSet-ItemProperty ${pool} -Name processModel.identityType -Value 4\n# Apply only to this new application directory. Keep administrator recovery access.\nicacls.exe ${dir} /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' "$env:COMPUTERNAME\\${c.username}:(OI)(CI)(M)"\nif ($LASTEXITCODE -ne 0) { throw 'Directory ACL failed; stop and inspect.' }`,
        ),
      ],
      [
        {
          term: "ApplicationPoolIdentity",
          explanation:
            "IIS creates a virtual account named IIS AppPool\\" +
            c.appName +
            ". It receives read access later; it is not an administrator.",
        },
        {
          term: "icacls /inheritance:r",
          explanation:
            "Removes inherited grants on this newly created folder. Explicit SYSTEM, Administrators and deployment-owner grants preserve administration and limit access. Do not run this on C:\\ or a shared folder.",
        },
      ],
      "The selected Windows Server version is confirmed, IIS roles report installed, and a uniquely named pool and directory exist.",
      `Get-WindowsFeature Web-Server${php ? ",Web-CGI" : ""}\nGet-WebAppPoolState -Name ${name}\nicacls.exe ${dir}`,
      [problems.permissions],
      "Existing prepared server? Inspect its owners, permissions and bindings first, then skip creation only when equivalent isolation already exists. Do not open RDP to the whole internet.",
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
        "Install the selected runtime and required IIS extensions.",
        php
          ? "IIS does not execute PHP itself. FastCGI launches the selected php-cgi.exe, while the PHP CLI runs Composer and Artisan."
          : "IIS forwards requests to Node. A stable runtime path and a service wrapper let Windows start the process without an open terminal.",
        php
          ? "Use an x64 Non-Thread Safe PHP ZIP and its required Microsoft Visual C++ runtime. PHP-FPM and Unix sockets are Linux concepts; IIS uses FastCGI on Windows."
          : "Install the official Node.js 24 x64 MSI for all users. URL Rewrite and Application Request Routing (ARR) provide the proxy, while WinSW manages Node as a Windows service.",
        "Administrator session on the server. Download installers only from the linked vendor sources, check signatures/checksums, and review release security notices. Use a fresh server or take a recoverable snapshot first.",
        [
          code(
            "Runtime installation checklist",
            php
              ? `1. From windows.php.net, download the latest patched PHP ${c.runtime} x64 NTS ZIP and verify its published checksum.\n2. Install the matching x64 Visual C++ Redistributable linked by PHP.\n3. Extract into ${phpDir}. Keep other PHP versions separate.\n4. Copy php.ini-production to php.ini only if php.ini does not exist.\n5. In php.ini set extension_dir="${phpDir}\\ext", cgi.force_redirect=0, fastcgi.impersonate=1, display_errors=Off and log_errors=On.\n6. Enable the extensions required by composer.lock (commonly curl, fileinfo, mbstring, openssl, pdo_mysql, pdo_sqlite, intl, zip). Use matching PHP-version DLLs.\n7. Install Composer from getcomposer.org using this selected PHP CLI; the system-wide installer normally stores composer.phar under C:\\ProgramData\\ComposerSetup\\bin. Verify the actual path.\n8. Install Microsoft IIS URL Rewrite from its official download page.`
              : `1. Install the current patched Node.js 24 x64 MSI from nodejs.org. Verify its signature.\n2. Install Microsoft URL Rewrite and ARR from the official IIS download pages.\n3. In IIS Manager, select the SERVER > Application Request Routing Cache > Server Proxy Settings > Enable proxy > Apply. This is a server-wide change; review other sites first.\n4. Download WinSW 2.12.0 WinSW.NET461.exe from its official release. Use the patched .NET Framework on Windows Server. The standalone x64 asset bundles obsolete .NET Core 3.1; do not use that asset.\n5. Keep the wrapper in a protected permanent folder as C:\\Services\\${c.appName}\\${c.appName}.exe. Only administrators may modify the wrapper and its XML.`,
            undefined,
            true,
            "text",
          ),
          code(
            "Verify installed tools",
            php
              ? `${phpCmd} --version\n${phpCmd} --ini\n${phpCmd} -m\n${composer} --version\nTest-Path -LiteralPath ${q(phpDir + "\\php-cgi.exe")}`
              : `& 'C:\\Program Files\\nodejs\\node.exe' --version\nnpm.cmd --version${c.packageManager === "pnpm" ? "\n# Install only the project-compatible pnpm major.\nnpm.cmd install --global pnpm@10\npnpm.cmd --version" : ""}\nGet-WebGlobalModule | Where-Object Name -match 'Rewrite|Routing'`,
            undefined,
            c.packageManager === "pnpm" && !php,
          ),
        ],
        [
          {
            term: php ? "NTS + php-cgi.exe" : "Windows service",
            explanation: php
              ? "Non-thread-safe builds suit IIS FastCGI. The web handler must point to php-cgi.exe; using php.exe or a different PHP folder produces incorrect behavior."
              : "A Windows service starts after reboot and can restart after failure. WinSW is a third-party dependency; version 3 is not used because its releases are prereleases.",
          },
          {
            term: "Version compatibility",
            explanation:
              "The framework, lockfile and native extensions must support the selected runtime. Install current patch releases within the chosen minor/major branch.",
          },
        ],
        php
          ? `CLI reports PHP ${c.runtime}.x, the configured php.ini loads, and required extensions are listed.`
          : "Node reports v24.x and IIS exposes the required Rewrite/ARR modules.",
        php
          ? `${phpCmd} --version\nGet-WindowsFeature Web-CGI`
          : `Get-Command node,npm.cmd\nGet-WebGlobalModule | Where-Object Name -match 'Rewrite|Routing'`,
        [problems.build, problems.config],
        php
          ? phpVersionNote(c)
          : "WinSW is explicitly configured as LocalService below. Its default LocalSystem identity would be too privileged.",
      ),
    );

  const uploadBlocks: CodeBlock[] = [
    code(
      "Stage files through your management connection",
      `# Copy the reviewed ${built ? "CONTENTS of " + (c.stack === "vite" ? "dist" : "out") : node || php ? "project source (no node_modules, vendor cache or secrets)" : "public-only website folder"} into ${staged} using your approved RDP drive redirection or secured file transfer.\n# Do not enable anonymous FTP or public SMB.\nGet-ChildItem -LiteralPath ${q(staged)}\n# Create only the required public directory if absent.\nif (!(Test-Path -LiteralPath ${publicDir})) { New-Item -ItemType Directory -Path ${publicDir} }`,
    ),
    code(
      "Preview the copy, then apply it",
      `robocopy.exe ${q(staged)} ${node || php ? dir : publicDir} /E /COPY:DAT /DCOPY:DAT /L /XD .git node_modules vendor .next /XF .env .env.* web.config\n# Inspect the preview. /L lists only; remove it for the reviewed copy.\nrobocopy.exe ${q(staged)} ${node || php ? dir : publicDir} /E /COPY:DAT /DCOPY:DAT /XD .git node_modules vendor .next /XF .env .env.* web.config\nif ($LASTEXITCODE -ge 8) { throw 'Copy failed. Inspect robocopy output.' }\n# /MIR and /PURGE are deliberately absent; no remote files are deleted.${php ? `\n# Transfer only the non-secret template separately if the destination is absent.\nif (!(Test-Path -LiteralPath ${q(c.directory + "\\.env.example")})) { Copy-Item -LiteralPath ${q(staged + "\\.env.example")} -Destination ${q(c.directory + "\\.env.example")} }` : ""}`,
    ),
  ];
  if (php)
    uploadBlocks.push(
      code(
        "Configure privately and install PHP dependencies",
        `Set-Location -LiteralPath ${dir}\nif (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }\n# Edit on the server. Never place secrets in public or paste them into this website.\nnotepad.exe .env\n# Set APP_ENV=production, APP_DEBUG=false and APP_URL=https://${c.domain}.\n# Configure your existing database and the drivers your project uses.\n${composer} install --no-dev --optimize-autoloader\n${composer} check-platform-reqs --no-dev`,
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
          "Optional Laravel frontend assets",
          `${install}\n${build}\n# Transfer public/build through the same approved staging/copy flow.`,
          "Your computer",
        ),
        optional:
          "Only if the project uses Vite assets. Run locally in the project root with its required Node version.",
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
            ? "Laravel .env stays above public. Composer and Artisan use the explicitly selected PHP executable."
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
        php ? "Connect PHP to IIS" : "Keep Node running",
        "Configure the runtime identity and its limited filesystem access.",
        php
          ? "IIS FastCGI launches PHP workers. Only Laravel storage and cache directories should be writable by the web process."
          : "Closing a terminal must not stop production. A Windows service manages the process and records crashes without giving it administrator privileges.",
        php
          ? "Register the version-specific CGI executable, then use a site-scoped handler for index.php. The application pool identity reads code and writes only runtime files."
          : "WinSW reads its adjacent XML and launches Node as LocalService. Node loads a protected environment file; IIS reaches it only over loopback.",
        "Elevated Windows PowerShell on the server. The preceding build is complete. Back up existing IIS/service configuration before editing; never clear global PHP registrations.",
        php
          ? [
              code(
                "Register the selected FastCGI executable",
                `Import-Module WebAdministration\n$phpCgi = ${q(phpDir + "\\php-cgi.exe")}\n$existing = Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.webServer/fastCgi/application[@fullPath='$phpCgi']"\nif (!$existing) { Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/fastCgi' -Name '.' -Value @{fullPath=$phpCgi} }\n# In IIS Manager > FastCGI Settings > this executable > Environment Variables:\n# add PHPRC=${phpDir}\\php.ini. Keep unrelated entries.\nicacls.exe ${q(phpDir)} /grant ${q("IIS AppPool\\" + c.appName + ":(OI)(CI)(RX)")}\nicacls.exe ${dir} /grant ${q("IIS AppPool\\" + c.appName + ":(OI)(CI)(RX)")}\nicacls.exe ${q(c.directory + "\\storage")} /grant ${q("IIS AppPool\\" + c.appName + ":(OI)(CI)(M)")}\nicacls.exe ${q(c.directory + "\\bootstrap\\cache")} /grant ${q("IIS AppPool\\" + c.appName + ":(OI)(CI)(M)")}\n# Inspect each exit code; stop on an ACL error.`,
              ),
              {
                ...code(
                  "Optional migrations and uploads",
                  `Set-Location -LiteralPath ${dir}\n# Only after a database backup and migration review:\n# ${phpCmd} artisan migrate\n# Only for the public local upload disk:\n# ${phpCmd} artisan storage:link\n# Windows link creation may need an administrator to create the reviewed link once.`,
                  "Server · deployment user",
                ),
                optional:
                  "Skip when the application does not use these features. Do not grant ongoing administrator rights just to create a link.",
              },
              {
                ...code(
                  "Optional Windows scheduling",
                  "In Task Scheduler, create a task under the deployment account, using its approved credential handling.\nTrigger every minute; choose “Do not start a new instance” if already running.\nProgram: " +
                    phpDir +
                    "\\php.exe\nArguments: artisan schedule:run\nStart in: " +
                    c.directory +
                    "\nRun a manual test and inspect Last Run Result and application logs.",
                  "Server · administrator",
                  true,
                  "text",
                ),
                optional:
                  "Only when the project defines scheduled tasks. Do not create multiple schedulers for the same application.",
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
            term: php ? "FastCGI identity" : "LocalService",
            explanation: php
              ? "The pool account needs read access to PHP binaries and the application. Only storage and bootstrap\\cache receive Modify. Configure a writable PHP error log path under storage when enabling file logging."
              : "A built-in non-administrator service identity, SID S-1-5-19. It is shared with other LocalService processes; sensitive multi-tenant hosts should use a separately reviewed dedicated service identity.",
          },
          {
            term: "Optional background work",
            explanation: php
              ? "Windows PHP lacks PCNTL, which Laravel uses for queue timeouts. This guide does not configure native production queue workers or Horizon. Use separately reviewed Linux workers when these features are required."
              : "Keep logs bounded. If a Node project needs writable uploads or generated data, grant Modify only to that documented runtime directory, outside wwwroot.",
          },
        ],
        php
          ? "The selected CGI executable is registered and runtime-directory ACLs are scoped."
          : "The service is Running and the application answers on its private loopback port.",
        php
          ? `Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/fastCgi'\nicacls.exe ${q(c.directory + "\\storage")}`
          : `Get-Service -Name ${name}\nGet-NetTCPConnection -LocalPort ${c.port}\ncurl.exe -I http://127.0.0.1:${c.port}`,
        [problems.permissions, php ? problems.build : problems.proxy],
        php
          ? "PHP-FPM, systemd, and Linux queue timeout commands do not apply to this Windows path."
          : "The runtime file does not supply Next.js build-time settings. Never place its secrets in the service XML, browser bundle or Git.",
      ),
    );

  steps.push(
    step(
      "win-iis",
      "Connect IIS to your application",
      `Bind ${c.domain} to the correct public root.`,
      "Host bindings select the website for an incoming domain. A narrowly scoped physical path prevents source files and secrets from becoming downloadable.",
      node
        ? "IIS URL Rewrite sends requests to ARR and the private Node service. The site folder contains web.config only. Configure trusted-proxy handling in your application before relying on HTTPS redirects, secure cookies or client IPs."
        : "IIS serves existing assets from disk. Vite rewrites client-side routes; Laravel rewrites application routes to public/index.php; static Next.js serves generated directory indexes.",
      `Elevated Windows PowerShell. ${c.stack === "vite" || node || php ? "Microsoft URL Rewrite must already be installed (Vite also needs this extension). " : ""}Inspect existing sites, host bindings and web.config first.`,
      [
        code(
          "Install the rewrite module if missing",
          "Use the official Microsoft URL Rewrite download linked in Sources. Install its matching x64 package as administrator. If already installed, preserve it. IIS Manager should show URL Rewrite for this site. All paths use it for the HTTPS redirect; Vite, Laravel and Node also need it for routing.",
          undefined,
          true,
          "text",
        ),
        code(
          "Back up IIS and inspect bindings",
          `Import-Module WebAdministration\nBackup-WebConfiguration -Name (${q(c.appName + "-before-")} + (Get-Date -Format yyyyMMdd-HHmmss))\nGet-WebBinding\n# If web.config exists, preserve and merge it instead of replacing it.\nif (Test-Path -LiteralPath ${q(root + "\\web.config")}) { Copy-Item -LiteralPath ${q(root + "\\web.config")} -Destination (${q(root + "\\web.config.backup-")} + (Get-Date -Format yyyyMMdd-HHmmss)) }\nnotepad.exe ${q(root + "\\web.config")}`,
        ),
        code(
          "Review and save this site configuration",
          generateWebConfig(c),
          "Configuration",
          true,
          "xml",
        ),
        code(
          "Create the unique site and read permissions",
          `if (Test-Path ${q("IIS:\\Sites\\" + c.appName)}) { throw 'Site already exists; inspect its settings first.' }\nNew-Website -Name ${name} -Port 80 -HostHeader ${q(c.domain)} -PhysicalPath ${publicDir} -ApplicationPool ${name}${c.www ? `\nNew-WebBinding -Name ${name} -Protocol http -Port 80 -HostHeader ${q("www." + c.domain)}` : ""}\nicacls.exe ${publicDir} /grant ${q("IIS AppPool\\" + c.appName + ":(OI)(CI)(RX)")}\n# At this SITE in IIS Manager > Authentication > Anonymous Authentication > Edit:\n# choose Application pool identity (not the default IUSR account).\n# Do not enable directory browsing or expose the project root.`,
        ),
        ...(node
          ? [
              code(
                "Allow the proxy's reviewed headers",
                `After creating the site, open IIS Manager as administrator → ${c.appName} → URL Rewrite → View Server Variables.\nAdd HTTP_X_FORWARDED_PROTO and HTTP_X_FORWARDED_HOST to the allowed list for this site, keeping existing entries.\nThe two proxy rules overwrite these headers based on the actual IIS connection and host; they do not trust client-supplied values.\nFor Express, configure app.set('trust proxy', 'loopback') before using req.protocol or secure proxy cookies. Keep the app bound to 127.0.0.1.\nTest HTTPS redirects and cookies after certificate setup. A 500.50 can mean an allowed server variable was not configured.`,
                "Server · administrator",
                true,
                "text",
              ),
            ]
          : []),
      ],
      [
        {
          term: "web.config",
          explanation:
            "IIS reads XML configuration for this website. Downloaded configuration is a starting point: merge any existing project rules and preserve other sites.",
        },
        {
          term: "Binding and identity",
          explanation:
            "The hostname routes a request to a site. The pool identity controls file access. Using IUSR instead would make the pool-only ACLs ineffective.",
        },
      ],
      "A local request using your Host header reaches the correct site without 500.19, 403 or a default IIS welcome page.",
      `Get-WebBinding -Name ${name}\ncurl.exe -I -H ${q("Host: " + c.domain)} http://127.0.0.1\n# XML syntax alone is not proof IIS accepts the configuration:\n[xml](Get-Content -LiteralPath ${q(root + "\\web.config")} -Raw) | Out-Null`,
      [
        problems.config,
        problems.routing,
        problems.permissions,
        ...(node ? [problems.proxy] : []),
      ],
      "IIS applies site configuration automatically. Inspect local HTTP responses and logs immediately; avoid iisreset, which interrupts unrelated sites. Restore the backed-up file if this change fails.",
    ),
  );

  steps.push(
    step(
      "win-https",
      "Connect DNS & enable HTTPS",
      "Make the domain reachable, then install a trusted certificate.",
      "DNS finds the server; firewall rules allow traffic; HTTPS encrypts the connection. Certificate validation cannot succeed until DNS and public HTTP reach this IIS site.",
      "Create A records for the selected hostnames, remove or correct stale AAAA records, open only web ports, then let win-acme validate the hostnames and configure IIS HTTPS bindings. It schedules renewal after successful issuance.",
      "You control the domain and provider firewall. Use an external network to test public reachability. Keep VPN/RDP recovery access unchanged. Download current win-acme from its official site into C:\\Tools\\win-acme, a permanent administrator-protected folder.",
      [
        code(
          "DNS records to configure",
          `${c.domain}  A  ${c.serverIp}${c.www ? "\nwww." + c.domain + "  A  " + c.serverIp : ""}\nReview AAAA records: they must reach this same site over IPv6, or be removed if IPv6 is not configured.`,
          "Configuration",
          true,
          "text",
        ),
        code(
          "Inspect and allow public web traffic",
          `Resolve-DnsName ${q(c.domain)} -Type A\nGet-NetFirewallRule -Enabled True | Select-Object DisplayName,Direction,Action\n# Review equivalent existing rules first; do not change management-port access.\nNew-NetFirewallRule -DisplayName ${q(c.appName + " HTTP HTTPS")} -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80,443\n# Also allow 80/443 in your provider firewall. Keep private app ports closed.`,
        ),
        code(
          "Verify DNS and HTTP from outside",
          `Resolve-DnsName ${q(c.domain)} -Type A\ncurl.exe -I ${q("http://" + c.domain)}${c.www ? "\ncurl.exe -I " + q("http://www." + c.domain) : ""}`,
          "Your computer",
          false,
        ),
        code(
          "Run the certificate client",
          `& 'C:\\Tools\\win-acme\\wacs.exe'\n# Choose N (new certificate with default settings), select this IIS site\n# and only the hostnames you configured. Review terms and contact information.\n# Let the IIS installer add the HTTPS bindings and scheduled renewal task.\n# Once HTTPS works, add an HTTP-to-HTTPS redirect rule in IIS URL Rewrite.\n# Keep /.well-known/acme-challenge/ excluded from that redirect rule.`,
        ),
        code(
          "After successful issuance: merge this as the first rewrite rule",
          `<!-- In web.config, inside system.webServer/rewrite/rules, BEFORE application rules. -->
<rule name="HTTPS redirect" stopProcessing="true">
  <match url="(.*)" />
  <conditions logicalGrouping="MatchAll">
    <add input="{HTTPS}" pattern="^OFF$" />
    <add input="{REQUEST_URI}" pattern="^/[.]well-known/acme-challenge/" negate="true" />
  </conditions>
  <action type="Redirect" url="https://${c.domain}/{R:1}" redirectType="Permanent" />
</rule>`,
          "Configuration",
          true,
          "xml",
        ),
      ],
      [
        {
          term: "win-acme",
          explanation:
            "An ACME client obtains certificates and automates renewal. It is a third-party Windows tool; keep the install folder protected and review its release updates.",
        },
        {
          term: "Renewal verification",
          explanation:
            "Inspect the scheduled task, certificate expiry, Event Viewer and win-acme logs. Its --test option uses a staging CA; it is not a harmless production dry-run like Certbot renew --dry-run.",
        },
      ],
      "Every hostname reaches this site, HTTPS shows a trusted matching certificate, and a renewal task exists with a reviewed schedule.",
      `Get-WebBinding -Name ${name}\nGet-ScheduledTask | Where-Object TaskName -match 'win-acme' | Get-ScheduledTaskInfo\nGet-ChildItem Cert:\\LocalMachine\\My | Select-Object Subject,NotAfter\ncurl.exe -I ${q("https://" + c.domain)}`,
      [problems.tls],
      "Do not use a self-signed certificate for the public deployment, disable TLS checks, or close port 80 after HTTP-01 validation. Confirm HTTP redirects only after valid HTTPS is in place.",
    ),
  );

  steps.push(
    step(
      "win-verify",
      "Check before going live",
      "Test the public website, routing, security boundaries and logs.",
      "A running IIS service is not proof that your application, certificate, assets and permissions work together.",
      "Test from your own computer, then correlate failures with IIS status subcodes, application logs and Event Viewer. A checkbox only records your progress; DeployGuide cannot inspect the server.",
      "Use safe test data and a separate network. PowerShell curl.exe explicitly uses the real curl tool rather than the older PowerShell curl alias.",
      [
        code(
          "Public smoke tests",
          `curl.exe -I ${q("http://" + c.domain)}\ncurl.exe -I ${q("https://" + c.domain)}${c.www ? "\ncurl.exe -I " + q("https://www." + c.domain) : ""}\ncurl.exe -I ${q("https://" + c.domain + "/.env")}\ncurl.exe -I ${q("https://" + c.domain + "/.git/config")}\n# Open the site in a browser. Refresh a nested route; check assets and key actions.\n# A HEAD response alone cannot establish application correctness.`,
          "Your computer",
          false,
        ),
        code(
          "Inspect local services and logs",
          `Get-Website -Name ${name}\nGet-WebAppPoolState -Name ${name}\nGet-ChildItem -LiteralPath 'C:\\inetpub\\logs\\LogFiles'\n${node ? `Get-Service -Name ${name}\nGet-ChildItem -LiteralPath ${q(runtimeDir + "\\logs")}\nGet-NetTCPConnection -LocalPort ${c.port}` : php ? `Get-ChildItem -LiteralPath ${q(c.directory + "\\storage\\logs")}` : `icacls.exe ${publicDir}`}\n# Use Event Viewer for application and IIS errors. Do not publish secret log content.`,
          undefined,
          false,
        ),
      ],
      [
        {
          term: "Status subcodes",
          explanation:
            "IIS logs distinguish different causes of a 403, 404 or 500. Start with the exact status/subcode and log message before changing configuration.",
        },
        {
          term: "Private paths",
          explanation:
            "Private file requests must not return secrets. Usually they return 403/404; also inspect the response body. Never use curl -k to hide certificate problems.",
        },
      ],
      "Public routes and assets work, HTTP redirects to trusted HTTPS, private files remain inaccessible, and there are no unexplained application errors.",
      `curl.exe --fail --silent --show-error -o NUL -w '%{http_code}' ${q("https://" + c.domain)}\n# Repeat from YOUR COMPUTER; investigate failures before marking complete.`,
      Object.values(problems),
    ),
  );
  const localBuild = steps.find((s) => s.id === "win-local-build");
  if (localBuild) localBuild.verification.location = "Your computer";
  for (let i = 0; i < steps.length; i++)
    steps[i].next =
      i + 1 < steps.length
        ? steps[i + 1].goal
        : "Keep a known-good release and use the maintenance reference for future updates.";
  const architecture = step(
    "architecture",
    "How your Windows deployment works",
    "Understand the request path before changing production.",
    "Each component has one job: DNS locates the host, IIS terminates public HTTP(S), and the chosen runtime handles application work.",
    node
      ? "IIS proxies to a loopback Windows service."
      : php
        ? "IIS sends PHP requests to the selected FastCGI executable; public is the only document root."
        : "IIS serves built files directly; no application process runs.",
    "No terminal is required for the diagram. Server commands elsewhere use Windows PowerShell, not Bash.",
    [
      code(
        "Request path",
        `Browser → DNS → ${c.serverIp}\nIIS :80/:443 → ${node ? "127.0.0.1:" + c.port + " → Node Windows service" : php ? "PHP " + c.runtime + " FastCGI → public/index.php" : root}`,
        "Configuration",
        false,
        "text",
      ),
    ],
    [
      {
        term: "IIS",
        explanation:
          "Internet Information Services is the Windows web server. Linux Nginx/systemd/PHP-FPM commands are not interchangeable with this path.",
      },
    ],
    "You can identify the public entry point and whether an application runtime is needed.",
    "# Explain the diagram in your own words; this is not a server probe.",
    [problems.routing],
  );
  const maintenance = step(
    "maintain",
    "After launch: updates & recovery",
    "Keep a recoverable release and maintain patching and certificates.",
    "An in-place deployment can fail or interrupt traffic. Backups and a planned maintenance window limit downtime and data loss.",
    "Back up IIS configuration, files, secrets, uploads and the database separately. Test recovery away from production. Stage and review the next build, stop only this application when needed, copy the update, repeat scoped ACL checks, restart and smoke-test.",
    "Administrator session for backups/service changes, deployment-user session for builds. Choose an access-controlled backup destination outside public files. File backups do not replace database-native backups.",
    [
      code(
        "Back up before changing the release",
        `Import-Module WebAdministration\nBackup-WebConfiguration -Name (${q(c.appName + "-release-")} + (Get-Date -Format yyyyMMdd-HHmmss))\n# Copy the application, environment settings and uploads to protected off-server storage.\n# Use the database vendor's backup procedure and test restoration.\nGet-WebBinding -Name ${name}\n${node ? "Get-Service -Name " + name : "Get-WebAppPoolState -Name " + name}`,
      ),
      code(
        "Update checklist",
        `1. Review the release and its runtime/lockfile requirements; build static output locally.\n2. Take the backups above and schedule maintenance.\n3. ${node ? "Stop only the " + c.appName + " Windows service before replacing runtime files." : "Stop only this application pool if updating PHP runtime files; static uploads need no whole-IIS restart."}\n4. Preview the file copy; retain web.config and private environment settings.\n5. Reinstall locked dependencies/build when applicable, then restore the scoped runtime ACLs.\n6. Start this service/pool, verify all public paths and inspect logs.\n7. If it fails, inspect the backup and restore the known-good release during maintenance. A code rollback does not reverse a database migration.`,
        undefined,
        true,
        "text",
      ),
    ],
    [
      {
        term: "IIS backup scope",
        explanation:
          "Backup-WebConfiguration captures IIS settings, not application files or a database. A whole-IIS restore affects other sites; prefer selective recovery after inspection.",
      },
      {
        term: "Patching and renewal",
        explanation:
          "Review Windows, runtime, extensions, service wrapper and ACME-client updates. Monitor disk space, logs, certificate expiry and renewal task history.",
      },
    ],
    "The previous working artifact and configuration remain recoverable after the update, and the public smoke tests pass.",
    `Get-ScheduledTask | Where-Object TaskName -match 'win-acme' | Get-ScheduledTaskInfo\nGet-Volume | Select-Object DriveLetter,SizeRemaining\ncurl.exe -I ${q("https://" + c.domain)}`,
    Object.values(problems),
  );
  return {
    config: { ...c },
    stack: { ...base, badge: php ? "IIS FastCGI" : base.badge },
    steps,
    nginx: "",
    webConfig: generateWebConfig(c),
    references: [architecture, maintenance],
    reviewedOn: "2026-10-29",
    sources: [
      ...sources,
      ...base.sources.filter((s) => !s.label.includes("Ubuntu")),
      ...(php
        ? [
            {
              label: "PHP Windows IIS installation",
              url: "https://www.php.net/manual/en/install.windows.iis.php",
            },
            {
              label: "PHP Windows downloads",
              url: "https://windows.php.net/download/",
            },
            {
              label: "PHP supported versions",
              url: "https://www.php.net/supported-versions.php",
            },
            {
              label: "PHP PCNTL is unavailable on Windows",
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
              label: "Node CLI environment files and run scripts",
              url: "https://nodejs.org/docs/latest-v24.x/api/cli.html",
            },
          ]
        : []),
    ],
  };
}
