import { generateGuide as generateDetailedGuide } from "./guides";
import { shellQuote as q } from "@/lib/validation";
import type { CodeBlock, Guide, GuideConfig, Step } from "@/lib/types";

export function launchStepCount(stack: GuideConfig["stack"]): number {
  return stack === "html"
    ? 5
    : stack === "vite" || stack === "next-static"
      ? 6
      : 7;
}

function code(
  title: string,
  value: string,
  location: CodeBlock["location"],
  changes = true,
): CodeBlock {
  return { title, code: value, location, changes, language: "bash" };
}

function stage(
  id: string,
  title: string,
  goal: string,
  why: string,
  parts: Step[],
): Step {
  const last = parts[parts.length - 1];
  return {
    id,
    title,
    goal,
    why,
    how: parts.map((p) => p.how).join(" "),
    before:
      "Work through the tasks below in order. Each task tells you where to run its commands. Stop if a check fails.",
    parts,
    blocks: parts.flatMap((p) => p.blocks),
    breakdown: parts.flatMap((p) => p.breakdown),
    expected: last.expected,
    verification: last.verification,
    problems: [
      ...new Map(
        parts.flatMap((p) => p.problems).map((p) => [p.symptom, p]),
      ).values(),
    ],
    next: last.next,
  };
}

/** A short first-deployment path. Reference material does not count as launch work. */
export function generateLaunchGuide(c: GuideConfig): Guide {
  const detailed = generateDetailedGuide(c);
  const byId = (id: string) => detailed.steps.find((s) => s.id === id)!;
  const isStatic = detailed.stack.mode === "static";
  const plain = c.stack === "html";
  const output =
    c.stack === "vite" ? "dist" : c.stack === "next-static" ? "out" : "public";
  const remote = `${c.directory}/${output}`;
  const install =
    c.packageManager === "npm" ? "npm ci" : "pnpm install --frozen-lockfile";
  const prepare = byId("prepare");
  const setup = prepare.blocks[0];
  const accountCheck = `# This first-setup block refuses to reuse an existing account or path.\n(\nset -eu\nif getent passwd ${q(c.username)} >/dev/null || test -e ${q(c.directory)} || test -L ${q(c.directory)}; then\n  echo 'Account or project path already exists. Inspect it before proceeding.' >&2\n  exit 1\nfi\n`;
  setup.code =
    accountCheck +
    setup.code.replace(
      "sudo apt update\nsudo apt install -y nginx git curl rsync dnsutils ca-certificates ufw\n",
      "",
    ) +
    "\n)";
  prepare.breakdown.push({
    term: "Subshell and set -eu",
    explanation:
      "Runs this setup as one block and stops on a failed command. The account/path check prevents changing an existing deployment. Exiting the block does not close your SSH session.",
  });
  prepare.note +=
    " Already have a dedicated account and directory? Run the verification first and skip creation only if their owner, group and permissions match.";
  // Keep an SSH command in its actual local context; shell settings run after login.
  prepare.blocks[1] = code(
    "Open a second terminal and connect",
    `ssh ${q(c.username + "@" + c.serverIp)}`,
    "Your computer",
    false,
  );
  prepare.blocks.push(
    code(
      "Inside the new deployment-user session",
      `umask 0027\ncd ${q(c.directory)}`,
      "Server · deployment user",
      false,
    ),
  );
  prepare.blocks.unshift(
    code(
      "Install the server tools",
      `sudo apt update\nsudo apt install -y nginx ${c.repository && !isStatic ? "git " : ""}curl rsync dnsutils ca-certificates ufw`,
      "Server · administrator",
    ),
  );
  const steps: Step[] = [
    stage(
      "server-ready",
      "Prepare your server",
      "Connect safely, then create a dedicated owner for this application.",
      "A non-root application account separates everyday deployment from system administration.",
      [byId("connect"), prepare],
    ),
  ];

  if (isStatic) {
    const localSource: CodeBlock[] = c.repository
      ? [
          code(
            "Clone locally only if you do not already have the project",
            `# Run from a local parent folder; the destination must not exist.\ngit clone -- ${q(c.repository)} ${q(c.appName)}\ncd ${q(c.appName)}`,
            "Your computer",
          ),
        ]
      : [];
    if (!plain) {
      const build = byId("build");
      const localBuild: Step = {
        ...build,
        id: "local-build",
        title: "Create the production files",
        goal: `Build ${output}/ on your computer; the server only needs Nginx.`,
        why: "Compiling locally avoids installing Node and source dependencies on the production server.",
        how: `Your package manager creates browser-ready files in ${output}/. You upload that output, not node_modules or your repository.`,
        before: `Use a local Bash terminal (WSL on Windows) in your project root, with Node.js 24 and ${c.packageManager === "pnpm" ? "pnpm 10" : "npm"} installed. Match the project lockfile. All VITE_ and NEXT_PUBLIC_ values are public; provide required non-secret build values before building.`,
        blocks: [
          ...localSource,
          code(
            "Check your local build tools",
            "node --version\n" + c.packageManager + " --version",
            "Your computer",
            false,
          ),
          ...build.blocks
            .filter((b) => b.language === "javascript")
            .map((b) => ({
              ...b,
              title: "In your local Next.js config: merge these settings",
            })),
          code(
            "Build locally",
            `${install}\n${c.packageManager} run build`,
            "Your computer",
          ),
        ],
        verification: code(
          "Check the local output",
          `test -f ${q(output + "/index.html")} && echo 'Production entry exists'\nls -la ${q(output)}`,
          "Your computer",
          false,
        ),
        note:
          c.stack === "next-static"
            ? "Static export cannot use request-time rendering, Server Actions, ISR or runtime cookies. Choose the Next.js Node server path if your app needs them."
            : "vite preview is only for a local smoke test. Nginx serves the production files.",
        next: "Upload the built directory to the server.",
      };
      steps.push(
        stage(
          "local-build",
          "Build on your computer",
          localBuild.goal,
          localBuild.why,
          [localBuild],
        ),
      );
    }
    const publicSource = plain
      ? c.repository
        ? "public/"
        : "./"
      : output + "/";
    const upload: Step = {
      ...byId("project"),
      id: "upload-output",
      title: "Upload public files",
      goal: `Copy only public output to ${remote}.`,
      why: "The production web root should contain only files visitors are allowed to download.",
      how: "rsync previews the transfer, then copies changed files over SSH. A trailing slash copies the contents of the directory.",
      before: plain
        ? `Use a local Bash terminal with rsync (WSL on Windows). ${c.repository ? "The cloned repository must have public/index.html." : "Run inside your public-only website folder containing index.html; do not run from a repository root containing private source."}`
        : `Local Bash terminal (WSL on Windows), in the project root after a successful build. Server commands use the deployment-user SSH session.`,
      blocks: [
        ...(plain ? localSource : []),
        code(
          "Create the destination on the server",
          `mkdir -m 2750 -p ${q(remote)}`,
          "Server · deployment user",
        ),
        code(
          "Preview the upload",
          `rsync -av --dry-run --exclude '.git' --exclude '.env*' ${q(publicSource)} ${q(`${c.username}@${c.serverIp}:${remote}/`)}`,
          "Your computer",
          false,
        ),
        code(
          "After reviewing the preview, upload",
          `rsync -av --exclude '.git' --exclude '.env*' ${q(publicSource)} ${q(`${c.username}@${c.serverIp}:${remote}/`)}`,
          "Your computer",
        ),
      ],
      verification: code(
        "Check uploaded files",
        `test -f ${q(remote + "/index.html")} && echo 'Public entry exists'\nls -la ${q(remote)}`,
        "Server · deployment user",
        false,
      ),
      breakdown: [
        {
          term: "--dry-run",
          explanation:
            "Shows proposed transfers without changing remote files. The real upload has no --delete flag.",
        },
        {
          term: "Public output only",
          explanation:
            "Do not upload environment files, private keys, node_modules or server source. Inspect your HTML and assets for accidental secrets.",
        },
      ],
      expected:
        "The public entry and its assets are present in the destination directory.",
      next: "Give Nginx read access to these files.",
    };
    steps.push(
      stage(
        "upload-public",
        "Upload your website",
        "Send only the public files and let Nginx read them.",
        "No Node process, PHP runtime or environment file is needed on this static server.",
        [upload, byId("process")],
      ),
    );
  } else {
    steps.push(
      stage(
        "project-ready",
        "Install runtime & upload project",
        "Prepare the runtime and transfer your tested application.",
        "Server applications need their language runtime and source code on the server.",
        [byId("runtime"), byId("project")],
      ),
    );
    const build = byId("build");
    if (c.stack === "laravel")
      build.blocks = build.blocks.map((b) =>
        b.title.includes("Vite assets")
          ? {
              ...b,
              optional:
                "Only if this Laravel project uses Vite frontend assets. Build locally and upload public/build.",
            }
          : b,
      );
    steps.push(
      stage(
        "production-build",
        "Configure & build",
        "Set private production settings and install locked dependencies.",
        "A production build and private settings replace development defaults.",
        [byId("environment"), build],
      ),
    );
    const process = byId("process");
    if (c.stack === "laravel")
      process.blocks = process.blocks.map((b) =>
        b.title.startsWith("Optional")
          ? {
              ...b,
              optional: b.title.includes("migrations")
                ? "Only if your app uses migrations or public uploads. Back up the database before any migration."
                : "Only if your app uses asynchronous queues or scheduled tasks. Skip for sync queues or no scheduled tasks.",
            }
          : b,
      );
    steps.push(
      stage(
        "application-ready",
        c.stack === "laravel"
          ? "Prepare PHP-FPM"
          : "Keep the application running",
        process.goal,
        process.why,
        [process],
      ),
    );
  }
  steps.push(
    stage(
      "web-server",
      "Connect Nginx",
      byId("nginx").goal,
      byId("nginx").why,
      [byId("nginx")],
    ),
  );
  steps.push(
    stage(
      "secure-domain",
      "Connect your domain & HTTPS",
      "Resolve the domain, open web traffic, then enable HTTPS.",
      "Certificate validation works only after DNS and public HTTP access are ready.",
      [byId("dns"), byId("https")],
    ),
  );
  steps.push(
    stage(
      "launch-check",
      "Check before going live",
      "Test the public site and verify that private files stay private.",
      "A successful build is not proof that routing, TLS and application behavior work together.",
      [byId("verify")],
    ),
  );
  for (let i = 0; i < steps.length; i++)
    steps[i].next =
      i < steps.length - 1
        ? steps[i + 1].goal
        : "Your first deployment is complete when your own checks pass. Use After launch for updates, backups and renewal checks.";
  const maintenance = byId("maintain");
  if (isStatic) {
    maintenance.before =
      "Administrator shell for the server backup; a local Bash terminal in your project root for preparing the next release. Plan a maintenance window and keep a copy of the working public files outside the web root.";
    maintenance.how =
      "Back up the working public output first. Build the next release locally, preview the upload, then transfer it during a planned maintenance window. Keep the previous artifact for recovery.";
    maintenance.blocks = maintenance.blocks.map((b) =>
      b.title === "Review and build an update"
        ? code(
            "Prepare the next release locally",
            `${plain ? "# Prepare reviewed public-only files." : `${install}\n${c.packageManager} run build`}\n# Repeat the upload preview, transfer and permission checks from your guide.\n# Keep the previous artifact until the public smoke tests pass.`,
            "Your computer",
          )
        : b,
    );
  }
  maintenance.blocks = maintenance.blocks.map((b) => ({
    ...b,
    code: b.code.replace(
      "from step 8",
      "from the application or public-file permissions task",
    ),
  }));
  return {
    ...detailed,
    steps,
    references: [
      { ...byId("architecture"), title: "How your deployment works" },
      { ...maintenance, title: "After launch: updates & recovery" },
    ],
  };
}
