import { commonSources, reviewedOn, stacks } from "./stacks";
import { troubleshooting } from "./troubleshooting";
import type { CodeBlock, Guide, GuideConfig, Step } from "@/lib/types";
import { assertValid, shellQuote as q } from "@/lib/validation";
import { generateNginx, generateService } from "@/lib/commands";
import { phpVersionNote } from "./platforms";
function block(
  title: string,
  code: string,
  location: CodeBlock["location"] = "Server · deployment user",
  changes = true,
  language: CodeBlock["language"] = "bash",
): CodeBlock {
  return { title, code, location, changes, language };
}
function check(
  code: string,
  location: CodeBlock["location"] = "Server · deployment user",
): CodeBlock {
  return block("Check the result", code, location, false);
}
export function generateGuide(c: GuideConfig): Guide {
  assertValid(c);
  const s = stacks.find((s) => s.id === c.stack)!;
  const node = s.mode === "node",
    php = s.mode === "php",
    js = c.runtime === "24";
  const d = q(c.directory),
    name = q(c.appName),
    host = q(`${c.username}@${c.serverIp}`);
  const install =
    c.packageManager === "npm" ? "npm ci" : "pnpm install --frozen-lockfile";
  const build = `${c.packageManager} run build`;
  const root =
    c.directory +
    (c.stack === "vite"
      ? "/dist"
      : c.stack === "next-static"
        ? "/out"
        : "/public");
  const problems = (...indexes: number[]) =>
    indexes.map((i) => troubleshooting[i]);
  const steps: Step[] = [];
  steps.push({
    id: "architecture",
    title: "Understand your deployment",
    goal: `Understand the route from a visitor’s browser to your ${s.name} application.`,
    why: "Knowing which component owns each job makes deployment decisions and errors easier to understand.",
    how:
      s.description +
      " DNS first resolves your domain to an IP address. The browser then connects to Nginx; DNS itself does not forward web requests.",
    before:
      "No terminal is needed. This guide assumes a dedicated Ubuntu 24.04 LTS server and an existing application you have tested locally.",
    blocks: [
      block(
        "Your request path",
        `Browser\n  ↓ DNS resolves ${c.domain} → ${c.serverIp}\nNginx · public ports 80 / 443\n  ↓ ${node ? `reverse proxy → 127.0.0.1:${c.port}\n${s.name} · managed by systemd` : php ? `FastCGI → /run/php/php${c.runtime}-fpm.sock\nPHP-FPM → public/index.php` : `read files → ${root}`}\nResponse returns to the browser`,
        "Configuration",
        false,
        "text",
      ),
    ],
    breakdown: [
      {
        term: "Nginx",
        explanation:
          "Owns the public HTTP and HTTPS connection. It can efficiently send files or hand work to an application.",
      },
      {
        term: node ? "systemd" : php ? "PHP-FPM" : "Static output",
        explanation: node
          ? "Keeps a foreground application running after logout and restarts it after failure. We use this one process manager."
          : php
            ? "Maintains PHP workers so each request does not have to start a new PHP interpreter."
            : "Prebuilt files need no always-running JavaScript process. Node is only used during the build, if needed.",
      },
    ],
    expected:
      "You can name the public entry point and the component that produces a response.",
    verification: check(
      "# Read-only: no server action in this step.\n# Explain the request path in your own words.",
      "Your computer",
    ),
    problems: problems(3, 4),
    next: "Gather the server, access and project details.",
    note: "This is an educational guide. DeployGuide never connects to or inspects your server. All checks are commands you run yourself.",
  });
  steps.push({
    id: "connect",
    title: "Check prerequisites & connect",
    goal: "Open an encrypted terminal session to the correct server.",
    why: "SSH lets you administer the server over an untrusted network without exposing terminal traffic.",
    how: "Your cloud provider gives you an IP address and an initial administrator account. Confirm its SSH host-key fingerprint through the provider before trusting the first connection.",
    before: `On your own computer, use a terminal with OpenSSH. Have provider console recovery access, a sudo-capable administrator, your public SSH key and ownership of ${c.domain}. ${c.serverIp === "203.0.113.10" ? "The displayed IP is reserved for documentation: replace it with your real server IP." : ""} Never enter credentials into this website.`,
    blocks: [
      block(
        "Connect using the provider’s administrator account",
        `# "ubuntu" is the standard Ubuntu cloud-image user.\n# Use your provider's actual administrator if different.\nssh ubuntu@${c.serverIp}`,
        "Your computer",
        false,
      ),
      block(
        "Confirm the operating system",
        "cat /etc/os-release\nuname -m\n# This guide targets Ubuntu 24.04 LTS only.\nsudo -v",
        "Server · administrator",
        false,
      ),
    ],
    breakdown: [
      {
        term: "ssh",
        explanation:
          "Opens an encrypted shell. Keep your private key locally; never paste it into documentation tools.",
      },
      {
        term: "sudo -v",
        explanation:
          "Checks your administrator privileges without modifying application configuration.",
      },
    ],
    expected:
      "The remote prompt belongs to your server, /etc/os-release reports Ubuntu 24.04, and sudo authorization succeeds.",
    verification: check(
      "whoami\nhostname\ncat /etc/os-release",
      "Server · administrator",
    ),
    problems: [
      {
        symptom: "SSH times out or refuses the connection",
        cause:
          "The address, SSH port, provider firewall or SSH service is wrong.",
        fix: "Use the provider console to confirm the SSH service and port. Allow that port from your IP before retrying. Do not disable host-key checks.",
        tags: ["ssh"],
      },
      {
        symptom: "SSH warns that the host key changed",
        cause:
          "The server was rebuilt, the IP was reused, or the connection is not reaching the expected host.",
        fix: "Verify the new fingerprint out of band with your provider. Investigate before updating known_hosts.",
        tags: ["ssh"],
      },
    ],
    next: "Create a separate account that owns the application.",
  });
  steps.push({
    id: "prepare",
    title: "Prepare the server & deployment user",
    goal: "Create a non-root owner and a dedicated project directory.",
    why: "Application commands should not have permission to modify the whole operating system. Separating the application owner limits the impact of mistakes.",
    how: "An administrator creates the account and directory. Group www-data lets Nginx read public files without owning your code. The setgid directory bit preserves the directory group for new files.",
    before: `Server administrator shell; any working directory. The username ${c.username} and directory ${c.directory} must be new. Inspect existing accounts and paths before using this first-deployment guide. Keep the current SSH session open.`,
    blocks: [
      block(
        "Create the account and directory",
        `sudo apt update\nsudo apt install -y nginx git curl rsync dnsutils ca-certificates ufw\n# Stop and inspect if the account already exists.\nsudo adduser --disabled-password --gecos '' ${q(c.username)}\nsudo usermod -aG www-data ${q(c.username)}\n# This account does not need sudo membership.\n# Refuse to reuse an existing project directory.\nsudo test ! -e ${d} && sudo install -d -o ${q(c.username)} -g www-data -m 2750 ${d}\n# Install the administrator's already-authorized PUBLIC keys.\ntest -s "$HOME/.ssh/authorized_keys" && sudo install -d -o ${q(c.username)} -g ${q(c.username)} -m 700 ${q(`/home/${c.username}/.ssh`)}\ntest -s "$HOME/.ssh/authorized_keys" && sudo test ! -e ${q(`/home/${c.username}/.ssh/authorized_keys`)} && sudo install -o ${q(c.username)} -g ${q(c.username)} -m 600 "$HOME/.ssh/authorized_keys" ${q(`/home/${c.username}/.ssh/authorized_keys`)}`,
        "Server · administrator",
      ),
      block(
        "Test a second SSH session",
        `ssh ${host}\n# Set a restrictive default for new files in this shell.\numask 0027\ncd ${d}`,
        "Your computer",
        false,
      ),
    ],
    breakdown: [
      {
        term: "--disabled-password",
        explanation:
          "Creates an account for SSH-key access. It does not copy a private key or grant administrative rights.",
      },
      {
        term: "2750",
        explanation:
          "The owner may write, the web-server group may read/traverse, and other users have no access. The leading 2 preserves group ownership.",
      },
      {
        term: "umask 0027",
        explanation:
          "New files default to owner read/write and group read, with no access for other users. Repeat in each deployment shell.",
      },
    ],
    expected:
      "You can connect in a second terminal as the deployment user and write inside the new directory. Keep administrator access available for system changes.",
    verification: check(
      `id\nstat -c '%U %G %a %n' ${d}\ntest -w ${d} && echo 'Project directory is writable'`,
    ),
    problems: problems(2, 8),
    next: "Install only the runtimes this path needs.",
    note: "If your administrator has no authorized_keys file, install your own public key through the provider’s documented key-management flow. Never copy a private key to the server.",
  });
  const runtimeBlocks: CodeBlock[] = js
    ? [
        block(
          "Inspect the NodeSource repository installer",
          `# NodeSource is a third-party APT repository for Node.js 24.\ncurl -fsSLo /tmp/deployguide-node-setup.sh https://deb.nodesource.com/setup_24.x\nless /tmp/deployguide-node-setup.sh`,
          "Server · administrator",
          true,
        ),
        block(
          "After reviewing and accepting the installer",
          `sudo bash /tmp/deployguide-node-setup.sh\nsudo apt install -y nodejs\nnode --version\nnpm --version${c.packageManager === "pnpm" ? "\n# pnpm 10 supports Node 24; align with package.json packageManager.\nsudo npm install --global pnpm@10\npnpm --version" : ""}`,
          "Server · administrator",
        ),
      ]
    : php
      ? [
          ...(c.runtime !== "8.3"
            ? [
                block(
                  "Add the reviewed PHP package source",
                  `# This adds a third-party repository; review its linked source first.\n# Use a fresh server, or take a recoverable snapshot before changing package sources.\nsudo apt install -y software-properties-common ca-certificates\nsudo add-apt-repository ppa:ondrej/php\nsudo apt update\napt-cache policy php${c.runtime}-cli php${c.runtime}-fpm\n# Inspect candidates and origins. Stop if the selected version has no candidate.\nsudo apt-get --simulate install php${c.runtime}-cli php${c.runtime}-fpm`,
                  "Server · administrator",
                ),
              ]
            : []),
          block(
            "Install PHP-FPM and project tooling",
            `sudo apt update\nsudo apt install -y php${c.runtime}-fpm php${c.runtime}-cli php${c.runtime}-mbstring php${c.runtime}-xml php${c.runtime}-curl php${c.runtime}-zip php${c.runtime}-bcmath php${c.runtime}-intl php${c.runtime}-mysql php${c.runtime}-sqlite3 composer unzip acl\nsudo systemctl enable --now php${c.runtime}-fpm\nphp${c.runtime} --version\nphp${c.runtime} /usr/bin/composer --version`,
            "Server · administrator",
          ),
        ]
      : [
          block(
            "Confirm Nginx is available",
            "nginx -v\nsystemctl is-active nginx",
            "Server · administrator",
            false,
          ),
        ];
  steps.push({
    id: "runtime",
    title: "Install runtime & dependencies",
    goal: js
      ? "Make Node.js 24 LTS available for project tooling."
      : php
        ? `Install PHP ${c.runtime}, PHP-FPM, Composer and common PHP extensions.`
        : "Confirm the web server is ready to serve plain files.",
    why: js
      ? "The production build needs a compatible Node version. A package manager reproduces dependency versions from your lockfile."
      : php
        ? "PHP executes your application; FPM manages PHP workers; Composer installs the exact PHP packages in composer.lock."
        : "Plain HTML, CSS and browser JavaScript do not need a server-side application runtime.",
    how: js
      ? "The chosen default uses NodeSource’s Node 24 APT repository, giving systemd a stable /usr/bin/node path. This adds a third-party trust dependency. An official verified Node binary is an alternative but needs manual architecture and update management."
      : php
        ? `Ubuntu 24.04 provides PHP 8.3 by default. Other versions use the separately reviewed PHP PPA. The CLI, FPM service, Nginx socket and worker commands all use PHP ${c.runtime} explicitly; changing the selection does not upgrade an existing application. Extensions add database and text-processing capabilities.`
        : "Ubuntu’s Nginx package installs a system service. It reads public files independently of your terminal session.",
    before:
      "Server administrator shell; /tmp or any directory. Review package changes and take a provider snapshot before changing a server that already hosts applications. Check project runtime constraints and lockfiles.",
    blocks: runtimeBlocks,
    breakdown: [
      {
        term: js ? "APT repository" : php ? "Composer" : "nginx -v",
        explanation: js
          ? "An additional source of signed packages. Review the repository installer before running it with root privileges."
          : php
            ? `Use the committed composer.lock and php${c.runtime} /usr/bin/composer install, not composer update, for a repeatable deployment.`
            : "Prints the installed version without changing the server.",
      },
      {
        term: js
          ? "Node.js 24 LTS"
          : php
            ? `PHP ${c.runtime} extensions`
            : "systemctl",
        explanation: js
          ? "A specific maintained major version. Confirm package.json engines supports it; do not upgrade an existing application blindly."
          : php
            ? "The list covers common Laravel needs. Check composer.json for project-specific extensions, such as PostgreSQL support."
            : "Asks Ubuntu’s service manager whether Nginx is running.",
      },
    ],
    expected: js
      ? "node --version reports v24.x. Your package manager runs successfully."
      : php
        ? `PHP reports ${c.runtime}.x and php${c.runtime}-fpm is active.`
        : "Nginx is installed and active.",
    verification: check(
      js
        ? "command -v node\nnode --version\n" + c.packageManager + " --version"
        : php
          ? `php${c.runtime} -m\nsystemctl is-active php${c.runtime}-fpm`
          : "nginx -v\nsystemctl is-active nginx",
    ),
    problems: problems(5),
    next: "Put the application source on the server.",
    note: php
      ? phpVersionNote(c) +
        " Frontend assets: if your Laravel project uses Vite, build locally and upload public/build. Node is not needed by PHP-FPM."
      : undefined,
  });
  const upload = c.repository
    ? block(
        "Clone the project into the empty directory",
        `umask 0027\ncd ${d}\ngit clone -- ${q(c.repository)} .`,
      )
    : block(
        "Upload from your project directory",
        `# Run in your local ${c.stack === "html" ? "public-only website directory" : "project root"}. Review what will be uploaded.\nrsync -av --dry-run --exclude '.git' ${php ? "--include '.env.example' " : ""}--exclude '.env*' --exclude 'node_modules' --exclude '.next' ./ ${q(`${c.username}@${c.serverIp}:${c.stack === "html" ? root : c.directory}/`)}\n# After reviewing the dry run, upload (without deleting remote files).\nrsync -av --exclude '.git' ${php ? "--include '.env.example' " : ""}--exclude '.env*' --exclude 'node_modules' --exclude '.next' ./ ${q(`${c.username}@${c.serverIp}:${c.stack === "html" ? root : c.directory}/`)}`,
        "Your computer",
      );
  steps.push({
    id: "project",
    title: "Upload or clone your project",
    goal: "Place a known version of your application in its dedicated directory.",
    why: "The server needs source files for a build, or public files for a plain website. Copying secrets or development caches makes deployments less predictable.",
    how: c.repository
      ? "Git clones your repository and records its commit. HTTPS URLs here cannot include credentials; configure private repository access separately with your provider’s supported mechanism."
      : "rsync compares local and remote files. The dry run shows the proposed copy. This guide does not delete remote files or transfer environment files.",
    before: `${c.repository ? "Server deployment-user shell in an empty " + c.directory : "Your own computer, inside the tested project root"}. ${c.stack === "html" ? "For Git, the repository must contain public/index.html; for upload, your current directory must contain only files intended for public access." : "Keep the lockfile in version control."} Do not upload secrets.`,
    blocks: [
      ...(c.stack === "html" && !c.repository
        ? [
            block(
              "Create the public directory",
              `cd ${d}\nmkdir -m 2750 public`,
            ),
          ]
        : []),
      upload,
    ],
    breakdown: [
      {
        term: c.repository ? "git clone --" : "rsync -av --dry-run",
        explanation: c.repository
          ? "The -- ends command options. Cloning into . requires an empty current directory and preserves version history."
          : "Archive mode preserves useful file attributes; verbose mode lists transfers. --dry-run previews without copying.",
      },
      {
        term: ".env exclusions",
        explanation:
          "Production secrets must be configured on the server. They must not travel in a repository or public upload.",
      },
    ],
    expected: `Your project files are present under ${c.directory}; ${c.stack === "html" ? "public/index.html exists." : "the expected package or Composer lockfile is present."}`,
    verification: check(
      `cd ${d}\nls -la\n${c.stack === "html" ? 'test -f public/index.html && echo "Public entry exists"' : php ? 'test -f composer.lock && echo "Composer lockfile exists"' : `test -f ${c.packageManager === "npm" ? "package-lock.json" : "pnpm-lock.yaml"} && echo "Lockfile exists"`}${c.repository ? "\ngit log -1 --oneline" : ""}`,
    ),
    problems: problems(2, 5),
    next: "Provide production settings outside the public web root.",
  });
  steps.push({
    id: "environment",
    title: "Configure environment variables",
    goal: "Separate production settings from application source and public assets.",
    why: "The same code can run in different environments. Secrets belong on the server, while anything bundled for a browser is public.",
    how: node
      ? "systemd reads a root-owned environment file and passes values to the process at startup. It is not a shell script: use KEY=value lines without export."
      : php
        ? "Laravel reads a .env file outside public. PHP-FPM needs read access, but visitors must never be able to download it."
        : "Static output cannot keep a secret. VITE_ and NEXT_PUBLIC_ values are embedded during the build and can be read by visitors.",
    before: `${node ? "Administrator shell; any directory" : `Deployment-user shell; ${c.directory}`}. Prepare only the settings your app actually requires. No passwords, tokens or secret values should be entered into this website.`,
    blocks: node
      ? [
          block(
            "Create a private environment file",
            `sudo install -d -m 700 ${q(`/etc/${c.appName}`)}\n# Create only if absent; existing settings are preserved.\nsudo test -e ${q(`/etc/${c.appName}/app.env`)} || sudo install -m 600 /dev/null ${q(`/etc/${c.appName}/app.env`)}\nsudoedit ${q(`/etc/${c.appName}/app.env`)}`,
            "Server · administrator",
          ),
          block(
            "Baseline environment values",
            "NODE_ENV=production",
            "Configuration",
            true,
            "ini",
          ),
        ]
      : php
        ? [
            block(
              "Create local production settings",
              `cd ${d}\ntest -e .env || cp .env.example .env\nchmod 640 .env\n# Edit directly on the server; never paste secrets into DeployGuide.\nnano .env`,
            ),
            block(
              "Set these non-secret values",
              `APP_ENV=production\nAPP_DEBUG=false\nAPP_URL=https://${c.domain}`,
              "Configuration",
              true,
              "ini",
            ),
          ]
        : [
            block(
              "Review public build settings",
              `cd ${d}\n# Check your project's documented build variables.\n# VITE_* and NEXT_PUBLIC_* are public, never secret.\n# Plain HTML needs no environment file.\nls -a`,
              "Server · deployment user",
              false,
            ),
          ],
    breakdown: [
      {
        term: node
          ? "EnvironmentFile"
          : php
            ? "APP_DEBUG=false"
            : "Build-time settings",
        explanation: node
          ? "The system service loads this file before changing to the application user; keep it root-readable only. Restart the service after edits."
          : php
            ? "Suppresses detailed error pages that can expose sensitive configuration. Laravel still records application logs."
            : "Changing a static build variable requires rebuilding and uploading the output.",
      },
      {
        term: "Permissions",
        explanation:
          "Give only the intended reader access. Never store environment files inside public, dist or out.",
      },
    ],
    expected:
      "Required settings exist privately; no real production secrets are in Git or public files.",
    verification: check(
      node
        ? `sudo stat -c '%U %a %n' ${q(`/etc/${c.appName}/app.env`)}`
        : php
          ? `cd ${d}\nstat -c '%U %G %a %n' .env\n# Inspect permissions, not secret contents.`
          : `cd ${d}\n# Audit the build inputs; browser-exposed variables must be non-secret.\nls -a`,
      node ? "Server · administrator" : "Server · deployment user",
    ),
    problems: problems(6),
    next: "Install locked dependencies and create the production build.",
    note: node
      ? "Next.js also needs build-time values before next build. NEXT_PUBLIC_ values are fixed into the bundle; systemd’s runtime file does not supply build-time variables. Provide documented non-secret build values in your build environment."
      : php
        ? "Set the database, session, cache and queue drivers your project actually uses. The guide does not provision a database. Configure and test an existing database before running migrations."
        : undefined,
  });
  let buildBlocks: CodeBlock[];
  if (php)
    buildBlocks = [
      block(
        "Install locked PHP dependencies",
        `cd ${d}\nphp${c.runtime} /usr/bin/composer install --no-dev --optimize-autoloader\nphp${c.runtime} /usr/bin/composer check-platform-reqs --no-dev`,
      ),
      {
        ...block(
          "First installation: create the encryption key",
          `cd ${d}\n# ONLY for a new production environment with an empty APP_KEY.\n# If restoring an application, restore its original key instead.\nphp${c.runtime} artisan key:generate`,
        ),
        optional:
          "Required only for a brand-new environment with no APP_KEY. Inspect .env privately first. Never regenerate a working key: existing encrypted data and sessions depend on it.",
      },
      block(
        "Cache the production settings",
        `cd ${d}\n# Continue only after APP_KEY and required database settings are configured.\nphp${c.runtime} artisan config:cache\nphp${c.runtime} artisan view:cache`,
      ),
      block(
        "If your Laravel app uses Vite assets",
        `# On your own computer, from the project root:\n${install}\n${build}\nrsync -av public/build/ ${q(`${c.username}@${c.serverIp}:${c.directory}/public/build/`)}`,
        "Your computer",
      ),
    ];
  else if (c.stack === "html")
    buildBlocks = [
      block(
        "Confirm the public entry point",
        `cd ${d}\ntest -f public/index.html && echo 'Ready to serve'`,
        "Server · deployment user",
        false,
      ),
    ];
  else
    buildBlocks = [
      ...(c.stack === "next-static"
        ? [
            block(
              "Merge into your existing next.config.mjs",
              `// Preserve your other project settings.\nconst nextConfig = {\n  output: 'export',\n  trailingSlash: true,\n  images: { unoptimized: true },\n};\nexport default nextConfig;`,
              "Configuration",
              true,
              "javascript",
            ),
          ]
        : []),
      block(
        "Create the production build",
        `cd ${d}\n${install}\n${c.stack === "express" ? "# Run your documented build script if the app compiles TypeScript.\n# " + build : build}`,
      ),
    ];
  steps.push({
    id: "build",
    title: "Install dependencies & build",
    goal: "Produce the exact files or application artifacts used in production.",
    why: "Development servers prioritize fast editing. Production output is optimized and must be created from reproducible dependencies.",
    how: php
      ? "Composer installs production PHP dependencies. Laravel caches configuration and views to reduce work on each request. JavaScript assets, if used, are built separately."
      : c.stack === "html"
        ? "Your existing public files are already the production output."
        : c.stack === "express"
          ? "A JavaScript Express application may run without a build; TypeScript projects usually compile first. The project must define a foreground production start script."
          : "The package manager reads your lockfile, then your build script creates optimized output. Do not use npm run dev or vite preview as your production server.",
    before: `Deployment-user shell in ${c.directory}. The project works locally, its lockfile is present, and its runtime supports this guide’s version. Keep development dependencies during the build. ${c.stack === "next-static" ? "All routes must be pre-renderable; Server Actions, ISR, runtime cookies and server-only features are unsupported here." : ""}`,
    blocks: buildBlocks,
    breakdown: [
      {
        term: php ? "--no-dev --optimize-autoloader" : install,
        explanation: php
          ? "Omits development-only PHP packages and builds an optimized class lookup. It preserves locked versions."
          : "Installs the locked dependency graph. If the manifest and lockfile disagree, fix and commit them locally before deployment.",
      },
      {
        term: "Production build",
        explanation:
          c.stack === "vite"
            ? "Vite writes dist. The browser runs the resulting JavaScript; Nginx only sends the files."
            : c.stack === "next-static"
              ? "Next writes out. With trailingSlash, a route becomes a directory containing index.html."
              : node
                ? "Build output still needs a long-running Node process. A successful build alone does not make the app reachable."
                : php
                  ? "config:cache means env() should be used only in configuration files. Clear/rebuild cached configuration after environment changes."
                  : "The public directory contains only visitor-facing files.",
      },
    ],
    expected: php
      ? "Composer platform checks pass and Laravel cache commands finish without errors."
      : c.stack === "express"
        ? "Dependencies install and the application’s documented production start script is ready."
        : `The ${c.stack === "vite" ? "dist" : c.stack === "next-static" ? "out" : c.stack === "html" ? "public" : ".next"} directory exists with production output.`,
    verification: check(
      `cd ${d}\n${php ? `php${c.runtime} /usr/bin/composer check-platform-reqs --no-dev\nphp${c.runtime} artisan about` : c.stack === "express" ? "npm pkg get scripts.start\nnode --version" : `ls -la ${q(c.stack === "vite" ? "dist" : c.stack === "next-static" ? "out" : c.stack === "html" ? "public" : ".next")}`}`,
    ),
    problems: problems(5, 6),
    next: node
      ? "Keep the production application alive with systemd."
      : php
        ? "Give PHP-FPM carefully scoped access."
        : "Give Nginx read access to the built files.",
  });
  const queue = `[Unit]\nDescription=${c.appName} queue worker\nAfter=network.target\n\n[Service]\nUser=${c.username}\nGroup=www-data\nWorkingDirectory=${c.directory}\nExecStart=/usr/bin/php${c.runtime} ${c.directory}/artisan queue:work --sleep=3 --tries=3 --timeout=60\nRestart=always\nRestartSec=5\nTimeoutStopSec=90\nUMask=0027\nNoNewPrivileges=true\n\n[Install]\nWantedBy=multi-user.target`;
  const processBlocks: CodeBlock[] = node
    ? [
        ...(c.stack === "express"
          ? [
              block(
                "Express: adapt your existing listen call",
                `// In your application's existing server entry point:\n// app is your Express application.\napp.listen(Number(process.env.PORT || ${c.port}), '127.0.0.1');`,
                "Configuration",
                true,
                "javascript",
              ),
            ]
          : []),
        block(
          "Create a service file",
          `# If this file exists, back it up before editing.\nsudoedit ${q(`/etc/systemd/system/${c.appName}.service`)}`,
          "Server · administrator",
        ),
        block(
          "Paste the service configuration",
          generateService(c),
          "Configuration",
          true,
          "ini",
        ),
        block(
          "Start and enable the application",
          `sudo systemctl daemon-reload\nsudo systemctl enable --now ${name}`,
          "Server · administrator",
        ),
      ]
    : php
      ? [
          block(
            "Set restricted code permissions",
            `# Administrator shell: normalize only this application's permissions.\nsudo chgrp -R www-data ${d}\nsudo chmod -R g-w,o-rwx ${d}\nsudo chmod -R g+rX ${d}\n# Only the runtime directories receive write access.\nsudo find ${q(c.directory + "/storage")} ${q(c.directory + "/bootstrap/cache")} -type d -exec chmod 2770 {} +\nsudo find ${q(c.directory + "/storage")} ${q(c.directory + "/bootstrap/cache")} -type f -exec chmod 660 {} +\n# Named-user ACLs keep CLI and PHP-created files mutually writable.\nsudo setfacl -R -m ${q("u:" + c.username + ":rwX,u:www-data:rwX")} ${q(c.directory + "/storage")} ${q(c.directory + "/bootstrap/cache")}\nsudo find ${q(c.directory + "/storage")} ${q(c.directory + "/bootstrap/cache")} -type d -exec setfacl -d -m ${q("u:" + c.username + ":rwx,u:www-data:rwx,g::rwx,o::---")} {} +\nsudo chmod 640 ${q(c.directory + "/.env")}`,
            "Server · administrator",
          ),
          block(
            "Optional: database migrations and public uploads",
            `cd ${d}\n# ONLY if the application uses database migrations.\n# Take a database backup and review the migration plan first.\n# php${c.runtime} artisan migrate\n# ONLY if the app uses the local public disk for uploads:\n# php${c.runtime} artisan storage:link`,
          ),
          block(
            "Optional queue worker unit",
            queue,
            "Configuration",
            true,
            "ini",
          ),
          block(
            "Optional queue activation and scheduling",
            `# ONLY for an asynchronous queue connection; skip for sync.\n# Save the unit above with sudoedit /etc/systemd/system/${c.appName}-queue.service\n# Then, from the administrator shell:\n# sudo systemctl daemon-reload\n# sudo systemctl enable --now ${c.appName}-queue\n\n# ONLY when the project defines scheduled tasks:\n# Run crontab -e as ${c.username} and ADD the following entry.\n# Do not replace existing cron entries.\n# * * * * * cd ${c.directory} && /usr/bin/php${c.runtime} artisan schedule:run >> ${c.directory}/storage/logs/scheduler.log 2>&1`,
          ),
        ]
      : [
          block(
            "Give Nginx read-only access to public output",
            `cd ${d}\nchgrp -R www-data ${q(root)}\nfind ${q(root)} -type d -exec chmod 2750 {} +\nfind ${q(root)} -type f -exec chmod 640 {} +`,
          ),
        ];
  steps.push({
    id: "process",
    title: node
      ? "Manage the application with systemd"
      : php
        ? "Configure PHP-FPM & optional workers"
        : "Prepare public file permissions",
    goal: node
      ? "Keep the app running after logout and reboot."
      : php
        ? "Let PHP execute the app while restricting write access."
        : "Allow Nginx to read the public build, without letting it modify code.",
    why: node
      ? "A terminal session is temporary. A service manager gives your app a lifecycle, recovery behavior and logs."
      : php
        ? "Nginx does not execute PHP. PHP-FPM does, and needs writable cache/storage directories to operate."
        : "The web server runs as www-data, a different user from the deployment account.",
    how: node
      ? "systemd starts a non-root foreground process on a private loopback port and collects output in the journal. We use systemd alone."
      : php
        ? "The Ubuntu FPM service manages workers as www-data. Optional queue workers handle background jobs, while cron triggers scheduled tasks. Neither is required for every Laravel app."
        : "Owner write access and group read access separate publishing rights from serving rights.",
    before: `${node ? "Administrator shell for the service, with a completed production build" : php ? `Administrator shell for the permission block; deployment-user shell in ${c.directory} for artisan commands` : `Deployment-user shell in ${c.directory}`}. ${node ? "Confirm the selected port is free with sudo ss -ltnp. The Express start script must keep a production process in the foreground." : php ? "Confirm the FPM pool still uses www-data. Back up the database before any migration." : "The public output must exist."}`,
    blocks: processBlocks,
    breakdown: [
      {
        term: node
          ? "Restart=on-failure"
          : php
            ? "PHP-FPM socket"
            : "chmod 2750 / 640",
        explanation: node
          ? "Restarts a crashed process after five seconds. It does not fix the cause of a crash; read the logs first."
          : php
            ? "A local Unix socket connects Nginx to PHP without exposing another network port."
            : "Directories need execute permission for traversal; regular public files need read permission, not execute permission.",
      },
      {
        term: node
          ? "127.0.0.1"
          : php
            ? "Optional queue and schedule"
            : "Least privilege",
        explanation: node
          ? "Only software on this server can reach the application port. Nginx is its public entry point."
          : php
            ? "Skip workers for a synchronous queue and skip cron without scheduled tasks. Worker timeout 60 must be less than your connection retry_after; adapt it for your jobs. Rotate the scheduler log. Runtime-directory ACLs grant named users access; default ACLs also cover newly created files. This prevents CLI and PHP workers from locking each other out without making code writable."
            : "Grant only the access needed for each job; a web worker should not own or rewrite the whole application.",
      },
    ],
    expected: node
      ? "The service is active and a loopback HTTP request reaches it."
      : php
        ? `php${c.runtime}-fpm is active and the runtime directories have restricted write access.`
        : "www-data can read the public entry file and traverse its parents.",
    verification: check(
      node
        ? `sudo systemctl status ${name} --no-pager\ncurl -I ${q(`http://127.0.0.1:${c.port}`)}\nsudo ss -ltnp`
        : php
          ? `systemctl is-active php${c.runtime}-fpm\nls -l /run/php/php${c.runtime}-fpm.sock\nnamei -l ${q(root + "/index.php")}`
          : `namei -l ${q(root + "/index.html")}\nsudo -u www-data test -r ${q(root + "/index.html")} && echo 'Nginx can read the entry file'`,
      "Server · administrator",
    ),
    problems: problems(4, 6, 7, 8),
    next: "Connect Nginx to the public output or private application.",
    note: php
      ? "Preserve APP_KEY across deployments. Only generate a key for a new app with an empty APP_KEY, after Composer is installed. For migrations, interactive artisan migrate keeps the production confirmation; --force would skip it."
      : node
        ? 'Express proxy trust must match your topology. With exactly one local Nginx proxy, configure app.set("trust proxy", "loopback") only if you need proxy-derived client IP or secure-cookie behavior. WebSocket applications need additional Upgrade headers; this baseline covers HTTP and streaming.'
        : undefined,
  });
  steps.push({
    id: "nginx",
    title: "Configure Nginx",
    goal: `Route requests for ${c.domain} to your application.`,
    why: "A server can host multiple domains. A named server block tells Nginx which application should handle each host.",
    how: node
      ? "Nginx forwards requests to the private application port and preserves the original host and protocol through headers."
      : php
        ? "Nginx serves files under public and sends missing application paths to Laravel’s front controller. Only index.php may execute PHP."
        : `Nginx reads files from ${root}. ${c.stack === "vite" ? "Unknown paths fall back to index.html for browser-side routing." : "Missing files return 404 rather than disguising a broken URL."}`,
    before:
      "Server administrator shell; any directory. Keep a recovery console available. Inspect existing Nginx sites for conflicting server_name entries. Take a backup outside included configuration directories.",
    blocks: [
      block(
        "Inspect and back up configuration",
        `sudo nginx -T\nsudo tar --acls -czf "/root/nginx-before-${c.appName}-$(date +%Y%m%d-%H%M%S).tgz" -C /etc nginx\n# Use an editor: review any existing file instead of overwriting it.\nsudoedit ${q(`/etc/nginx/sites-available/${c.appName}`)}`,
        "Server · administrator",
      ),
      block(
        "Your application server block",
        generateNginx(c),
        "Configuration",
        true,
        "nginx",
      ),
      block(
        "Enable, test, then reload",
        `# ln refuses to overwrite an existing file or symlink.\nsudo ln -s ${q(`/etc/nginx/sites-available/${c.appName}`)} ${q(`/etc/nginx/sites-enabled/${c.appName}`)}\n# Reload only when the configuration passes validation.\nsudo nginx -t && sudo systemctl reload nginx`,
        "Server · administrator",
      ),
    ],
    breakdown: [
      {
        term: "server_name",
        explanation:
          "Matches the browser’s Host header. DNS is still configured separately.",
      },
      {
        term: node
          ? "proxy_pass"
          : php
            ? "root + fastcgi_pass"
            : "root + try_files",
        explanation: node
          ? "Hands HTTP requests to a private process. Forwarded headers tell the application the original request context."
          : php
            ? "Restricts public access to public/, then sends PHP execution to the FPM socket. Private source and .env are outside this root."
            : "Maps a URL to a file and explicitly decides what happens when that file does not exist.",
      },
      {
        term: "nginx -t && reload",
        explanation:
          "Checks syntax and referenced files before gracefully loading changes. The && prevents reload after a failed test.",
      },
    ],
    expected:
      "nginx -t reports valid syntax and a successful configuration test. A local request with your domain as Host reaches this application.",
    verification: check(
      `curl -I -H ${q("Host: " + c.domain)} http://127.0.0.1\nsudo tail -n 40 ${q(`/var/log/nginx/${c.appName}.error.log`)}`,
      "Server · administrator",
    ),
    problems: problems(2, 3, 4),
    next: "Point the domain to your server and allow public web traffic.",
    note: "Recovery: locate the timestamped archive under /root and inspect it with sudo tar -tzf. Restore only the previous file you changed, test with nginx -t, then reload. Do not restore the entire archive blindly over unrelated sites.",
  });
  steps.push({
    id: "dns",
    title: "Configure DNS & firewall access",
    goal: "Make the domain reach the correct server while preserving SSH access.",
    why: "Nginx configuration cannot update DNS or open a provider firewall. All layers must allow the connection.",
    how: "An A record maps a hostname to an IPv4 address. UFW controls host network access; your cloud provider may have a separate firewall. HTTPS certificate validation requires public HTTP access first.",
    before:
      "At your DNS provider and in the server administrator shell. Confirm the actual SSH listening port with ss. Keep the existing session open, have provider console access, and test a second SSH connection after changes.",
    blocks: [
      block(
        "DNS records to create",
        `Type    Name    Value\nA       @       ${c.serverIp}${c.www ? `\nCNAME   www     ${c.domain}` : ""}\n\n# Use your DNS provider's notation for the apex name.\n# Publish AAAA only if this server has working public IPv6.`,
        "Configuration",
        true,
        "text",
      ),
      block(
        "Inspect and allow traffic",
        `sudo ss -ltnp\nsudo ufw status verbose\n# The OpenSSH profile assumes port 22. Inspect it first.\nsudo ufw app info OpenSSH\n# Only use this if SSH really listens on port 22:\nsudo ufw allow OpenSSH\n# If SSH uses another port, allow that exact port BEFORE enabling UFW.\nsudo ufw allow 'Nginx Full'\n# First ensure provider-console recovery and a second SSH session.\nsudo ufw enable\nsudo ufw status verbose`,
        "Server · administrator",
      ),
      block(
        "Check from another network",
        `dig +short A ${q(c.domain)}\ndig +short AAAA ${q(c.domain)}${c.www ? `\ndig +short A ${q("www." + c.domain)}\ndig +short AAAA ${q("www." + c.domain)}` : ""}\ncurl -I ${q("http://" + c.domain)}`,
        "Your computer",
        false,
      ),
    ],
    breakdown: [
      {
        term: "A / CNAME / AAAA",
        explanation:
          "A is IPv4, CNAME aliases another name, and AAAA is IPv6. A stale IPv6 record can break both browser access and certificate validation.",
      },
      {
        term: "Nginx Full",
        explanation:
          "Opens TCP 80 and 443. Also allow those ports in the provider firewall. Keep application ports such as 3000 closed to the internet.",
      },
      {
        term: "TTL",
        explanation:
          "DNS responses can be cached for the previous record’s time-to-live. Updates do not appear everywhere instantly.",
      },
    ],
    expected:
      "Every chosen hostname resolves to this server, public HTTP reaches the correct site, and a fresh SSH connection still succeeds.",
    verification: check(
      `curl -I ${q("http://" + c.domain)}${c.www ? `\ncurl -I ${q("http://www." + c.domain)}` : ""}\nssh ${host}`,
      "Your computer",
    ),
    problems: problems(0, 1),
    next: "Request a certificate after DNS and HTTP access are confirmed.",
    note: "For custom SSH ports, use sudo ufw allow followed by your actual numeric port and /tcp; do not enable the firewall until that rule is present. Never assume the OpenSSH profile matches a customized SSH service.",
  });
  steps.push({
    id: "https",
    title: "Set up HTTPS",
    goal: "Encrypt browser traffic and prove the server controls the domain.",
    why: "Plain HTTP exposes content in transit. A trusted certificate lets browsers establish an encrypted TLS connection.",
    how: "Certbot asks Let’s Encrypt to validate each hostname through public HTTP, obtains a certificate, and updates Nginx. Its scheduled renewal keeps certificates from expiring.",
    before:
      "Server administrator shell. Both DNS A and any AAAA records must be correct for every selected hostname. Public port 80 must be reachable. Back up Nginx again before Certbot changes it. If Certbot is already installed, inspect and use the existing installation rather than mixing package sources.",
    blocks: [
      block(
        "Inspect existing certificate tooling",
        `command -v certbot || true\nsnap list certbot\nsystemctl list-timers --all | grep -i certbot`,
        "Server · administrator",
        false,
      ),
      block(
        "Install only if Certbot is absent",
        `sudo apt install -y snapd\nsudo snap install --classic certbot\nsudo tar --acls -czf "/root/nginx-before-https-$(date +%Y%m%d-%H%M%S).tgz" -C /etc nginx`,
        "Server · administrator",
      ),
      block(
        "Issue a certificate and enable redirects",
        `# Certbot prompts for contact details and agreement to terms.\nsudo /snap/bin/certbot --nginx --redirect -d ${q(c.domain)}${c.www ? " -d " + q("www." + c.domain) : ""}\nsudo nginx -t && sudo systemctl reload nginx\n# Test renewal without replacing the production certificate.\nsudo /snap/bin/certbot renew --dry-run`,
        "Server · administrator",
      ),
    ],
    breakdown: [
      {
        term: "--nginx",
        explanation:
          "Uses the Nginx plugin to answer validation challenges and install the certificate in the matching server block.",
      },
      {
        term: "-d",
        explanation:
          "Includes one hostname in the certificate. Every requested hostname must validate; omit the www alias in the builder if you do not use it.",
      },
      {
        term: "--redirect / --dry-run",
        explanation:
          "Redirect sends visitors from HTTP to HTTPS. A renewal dry run tests the renewal flow against a staging certificate service.",
      },
    ],
    expected:
      "Certbot reports successful issuance, HTTPS returns a valid certificate for the chosen domain, and renewal dry run succeeds. These are expected observations, not results DeployGuide has checked.",
    verification: check(
      `curl -I ${q("https://" + c.domain)}\nsudo /snap/bin/certbot certificates\nsystemctl list-timers --all | grep -i certbot`,
      "Server · administrator",
    ),
    problems: problems(1, 0),
    next: "Verify the complete request path from a separate network.",
    note: "Keep port 80 available for HTTP-01 renewals and redirects. Inspect certificate expiry and renewal scheduling regularly. The downloadable Nginx file is the initial HTTP configuration; do not overwrite Certbot’s updated TLS configuration with it afterward.",
  });
  steps.push({
    id: "verify",
    title: "Verify your deployment",
    goal: "Check the public response, application health and security boundaries.",
    why: "A successful service start or build is only one part of deployment. The full browser-to-server path must work.",
    how: "Test from outside the server, then inspect local services and logs. HTTP status alone cannot prove application correctness: test the routes and actions your app provides.",
    before:
      "On your own computer for external requests; administrator shell for service and permission checks. Use test data and avoid publishing real secret contents in screenshots or logs.",
    blocks: [
      block(
        "Test public URLs",
        `curl -I ${q("http://" + c.domain)}\ncurl -I ${q("https://" + c.domain)}${c.www ? `\ncurl -I ${q("https://www." + c.domain)}` : ""}\n# These must never return private file contents.\ncurl -I ${q("https://" + c.domain + "/.env")}\ncurl -I ${q("https://" + c.domain + "/.git/config")}`,
        "Your computer",
        false,
      ),
      block(
        "Inspect local health and logs",
        `sudo nginx -t\nsudo systemctl status nginx --no-pager\n${node ? `sudo systemctl status ${name} --no-pager\nsudo journalctl -u ${name} -n 50 --no-pager\nsudo ss -ltnp` : php ? `sudo systemctl status php${c.runtime}-fpm --no-pager` : `namei -l ${q(root + "/index.html")}`}\nsudo tail -n 50 ${q(`/var/log/nginx/${c.appName}.error.log`)}`,
        "Server · administrator",
        false,
      ),
    ],
    breakdown: [
      {
        term: "curl -I",
        explanation:
          "Requests response headers. Some applications reject HEAD; if so, test a normal GET and inspect its status and body.",
      },
      {
        term: "Private paths",
        explanation:
          "A 403 or 404 is expected for .env and .git. Also check the body is not sensitive content. Never use curl -k to hide a TLS failure.",
      },
      {
        term: "Application smoke test",
        explanation:
          "Open representative routes, refresh a nested route and try essential app actions. Check developer tools for failed assets or mixed-content requests.",
      },
    ],
    expected:
      "HTTP redirects to HTTPS, the certificate matches the domain, app routes work, and secrets are inaccessible. Node listens only on loopback; logs show no unexplained failures.",
    verification: check(
      `# Open in a browser and inspect your application's behavior:\n# https://${c.domain}\ncurl --fail --silent --show-error -o /dev/null -w '%{http_code}\\n' ${q("https://" + c.domain)}`,
      "Your computer",
    ),
    problems: problems(0, 1, 2, 3, 4, 6),
    next: "Record the working release and plan repeatable updates.",
    note: "Marking a step complete only saves your checklist in this browser. It does not run commands, verify security or inspect your server.",
  });
  steps.push({
    id: "maintain",
    title: "Update, maintain & troubleshoot",
    goal: "Keep a known working release and a recovery path before changing production.",
    why: "Updates can fail even if the previous release worked. Backups and a tested restore procedure make recovery possible.",
    how: "Capture the current version and files, review changes, install locked dependencies and rebuild, then test before considering the update successful. This baseline uses a planned maintenance window; a release-directory switch is a future improvement for low-downtime deployment.",
    before: `Administrator shell for backups; deployment-user shell in ${c.directory} for builds. Plan a maintenance window. Back up databases using your database vendor’s procedure, plus uploads and private environment files. Verify recovery in a safe environment before migrations.`,
    blocks: [
      block(
        "Back up before changing files",
        `# Archive is root-only and outside the public directory.\nsudo sh -c 'umask 077; tar --acls -czf "/root/${c.appName}-$(date +%Y%m%d-%H%M%S).tgz" -C /var/www ${q(c.directory.split("/").at(-1)!)}'${node ? `\nsudo sh -c 'umask 077; tar --acls -czf "/root/${c.appName}-environment-$(date +%Y%m%d-%H%M%S).tgz" -C /etc ${name}'` : ""}\n# Copy backups to protected off-server storage and test restoration.\n# A file archive is NOT a database backup.`,
        "Server · administrator",
      ),
      block(
        "Review and build an update",
        `cd ${d}\n${c.repository ? "git status --short\ngit log -1 --oneline\ngit fetch\n# Review the incoming commits and preserve local changes.\ngit log --oneline HEAD..@{upstream}\n# Continue only after review, backup, and a maintenance window.\ngit merge --ff-only @{upstream}" : "# Upload the reviewed update using the earlier rsync dry-run flow."}\n${php ? `php${c.runtime} /usr/bin/composer install --no-dev --optimize-autoloader\nphp${c.runtime} /usr/bin/composer check-platform-reqs --no-dev\nphp${c.runtime} artisan config:cache\nphp${c.runtime} artisan view:cache\n# If a queue worker is in use:\n# php${c.runtime} artisan queue:restart` : js ? install + "\n" + (c.stack === "express" ? "# Run the project-specific build if required." : build) : "# Confirm public/index.html and your updated assets."}\n# Repeat the scoped public/runtime permissions from step 8.`,
      ),
      block(
        "Restart only the relevant service and inspect",
        `${node ? `sudo systemctl restart ${name}\nsudo journalctl -u ${name} -n 50 --no-pager` : php ? `sudo systemctl reload php${c.runtime}-fpm` : "# Static file updates do not need an Nginx restart."}\nsudo nginx -t\ncurl -I ${q("https://" + c.domain)}`,
        "Server · administrator",
      ),
    ],
    breakdown: [
      {
        term: "--ff-only",
        explanation:
          "Updates Git only when it can advance without inventing a merge commit. Stop and investigate divergence rather than resetting away local work.",
      },
      {
        term: "Rollback",
        explanation:
          "Inspect the backup archive, restore into a separate staging directory, compare it with the failed release, then restore the selected known-good files during maintenance. Restore private configuration and ownership carefully; restart the relevant service and repeat checks.",
      },
      {
        term: "Database compatibility",
        explanation:
          "Old code may not work with a new schema. Review reversible migrations and recovery procedures before applying them; a code rollback is not a database rollback.",
      },
    ],
    expected:
      "The new release passes the same checks as the first deployment, and you retain the previous files, runtime version and configuration needed for recovery.",
    verification: check(
      `curl -I ${q("https://" + c.domain)}\n# Re-run representative application flows after every update.\n# Periodically check updates, disk space, backups and renewal.\ndf -h`,
    ),
    problems: troubleshooting,
    next: "Keep learning: inspect the glossary and troubleshoot by symptom before changing configuration.",
    note: "Schedule operating-system security updates, review runtime support dates and check certificate renewal. Keep logs bounded through log rotation. Never rebuild live output casually: a failed in-place build can interrupt traffic, so use the planned maintenance window and retain the backup.",
  });
  return {
    config: { ...c },
    stack: s,
    steps,
    nginx: generateNginx(c),
    sources: [
      ...(php
        ? [
            {
              label: "PHP supported branches",
              url: "https://www.php.net/supported-versions.php",
            },
            {
              label: "Laravel 12 PHP compatibility",
              url: "https://laravel.com/docs/12.x/releases",
            },
            ...(c.runtime !== "8.3"
              ? [
                  {
                    label: "Ondřej Surý PHP PPA (third party)",
                    url: "https://launchpad.net/~ondrej/+archive/ubuntu/php",
                  },
                ]
              : []),
          ]
        : []),
      ...s.sources,
      ...commonSources,
      {
        label: "Let’s Encrypt challenge types",
        url: "https://letsencrypt.org/docs/challenge-types/",
      },
      {
        label: "NodeSource repository installation",
        url: "https://github.com/nodesource/distributions/blob/master/DEV_README.md",
      },
    ],
    reviewedOn: php ? "2026-10-29" : reviewedOn,
  };
}
