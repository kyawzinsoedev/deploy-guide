# DeployGuide

An educational deployment documentation website. Choose one of six deployment paths, enter non-secret project details, and get a complete, locally generated guide explaining **why** each step exists. It never connects to a server or claims to verify one.

## Run locally

Requires Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Next.js. The application has no backend, API routes, server actions, authentication, database, analytics, or runtime external API requests. Official source links open only when requested.

Run only one development server for this checkout. If Next.js reports “Another next dev server is already running,” use its existing URL, or stop that server with Ctrl+C in its original terminal before starting again. A second port does not permit a second dev server in the same project.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The complete static website is emitted to **out/**. `npm run dev` is for development. Do not run `next start` for this exported website. Serve `out/` with a static HTTP server, an Nginx document root, or a static hosting provider. For Nginx, use `try_files $uri $uri/ =404;` and an appropriate document root. Deploy at an origin root; subdirectory hosting requires a deliberate Next.js `basePath` configuration and a rebuild.

`npm run preview` serves the exported files at http://127.0.0.1:4173 for local checks. It is a development tool, not an application backend or production server. Stop it with Ctrl+C. All dependencies are pinned in the manifest and lockfile so `npm ci` reproduces the checked versions.

## A shorter first deployment

- Plain HTML: **5 steps**. Prepare the server, upload public files, configure Nginx, connect DNS/HTTPS, and check the result.
- Vite and Next.js static export: **6 steps**, adding a **local** production build. These paths do not install Node, create a service, or configure a server-side environment file on the static server.
- Express, Next.js Node, and Laravel: **7 steps**. Runtime installation, application configuration, and process/PHP setup appear only where needed.

Each stage opens its first task and lets readers expand the rest. The explanations, prerequisites, checks, and troubleshooting remain available. Architecture and maintenance live under “When you need it” instead of inflating the launch checklist. Laravel migrations, uploads, queues, scheduling, encryption-key initialization, and frontend assets explain their conditions before exposing commands. Existing keys must be preserved.

The wizard asks for app name, domain, and IP up front; username, directory, repository, and Node port live in Advanced settings. It follows the app name when the directory still uses the default. The guide resumes at the saved step after reload. Checklist v2 uses new progress keys because the old thirteen-step checkmarks do not map reliably to the revised stages.

## Supported deployment guides

| Application              | Public request handling                       | Production output/runtime       |
| ------------------------ | --------------------------------------------- | ------------------------------- |
| HTML / CSS / JavaScript  | Nginx serves public files                     | `public/`; no runtime           |
| React + Vite             | Nginx serves static output, with SPA fallback | `dist/`; Node 24 for build only |
| Express                  | Nginx reverse-proxies a loopback process      | Node 24, managed by systemd     |
| Next.js static export    | Nginx serves generated routes                 | `out/`; Node 24 for build only  |
| Next.js Node application | Nginx reverse-proxies `next start`            | Node 24, managed by systemd     |
| Laravel 12               | Nginx serves `public/` and delegates PHP      | Ubuntu PHP 8.3 FPM              |

The explicit OS baseline is **Ubuntu 24.04 LTS**. The guide instructions were reviewed against official documentation on **2026-10-28**; they have not been executed on a live Ubuntu instance during this build. A successful website build does not verify a user's server or every application. Project scripts, dependencies, SSH ports, database choices and provider firewalls need project-specific inspection.

## Structure and architectural choices

```text
src/app/                 App Router server entry, metadata, static export, global styles
src/components/          Interactive browser UI, wizard, diagram, tabs, modal and code viewer
src/content/stacks.ts    Typed path metadata, defaults, review date and source registry
src/content/guides.ts    Structured teaching tasks, adapted to each stack
src/content/launch-flow.ts  Stack-specific 5–7 stage composition and optional work
src/content/glossary.ts  Local definitions used by keyboard/touch disclosures
src/content/troubleshooting.ts  Symptom, cause, investigation and fix records
src/lib/types.ts         Shared strict TypeScript contracts
src/lib/commands.ts      Pure Nginx and systemd configuration generators
src/lib/generator.ts     Public guide-generation interface
src/lib/validation.ts    Input constraints, POSIX quoting, configuration identity
src/lib/downloads.ts     Complete Markdown serialization and browser downloads
src/lib/themes.ts       Theme metadata; CSS custom properties define theme palettes
tests/                  Generation, validation, escaping and path regression tests
```

Next.js App Router pre-renders the app to static HTML. Interactive components hydrate in the browser because selection, filtering, local storage, clipboard and downloads need browser capabilities. The root page and layout remain server components at build time. No remote service is required by the finished app. Tailwind 4 is available for utilities; theme-aware CSS provides the documentation layout and all four palettes. Motion handles wizard/tab/diagram transitions and progress. Motion's `reducedMotion="user"` and CSS reduced-motion queries disable movement when requested.

Guide data uses a single typed `Step` contract for goal, rationale, mechanics, prerequisites, command blocks, breakdown, expected result, verification, problems and next action. Screen UI, Markdown and print consume the same data. Commands and configuration are never independently retyped in downloads.

Nginx is the public entry point for every guide; systemd is the only Node process manager. Static exports have no process service. Laravel only exposes its public directory, and executes only the PHP front controller. The beginner path uses a maintenance window and timestamped backups; it does not promise zero-downtime releases.

## Input and command safety

- Every generator rejects invalid input before interpolation. Domain names, IPv4 addresses, non-root usernames, unprivileged TCP ports, application names and paths have narrow allowlists. Control characters, credentials in URLs, query strings, path traversal and unknown version combinations are rejected.
- Project directories are intentionally restricted to a direct child of `/var/www`. Broad path support is not safe to add casually: shell, Nginx and systemd each have different parsers.
- Values in shell arguments use a POSIX single-quote helper. Values in Nginx/systemd configuration must pass the stricter context-specific allowlists.
- Repository input accepts HTTPS without embedded credentials. The website never asks for passwords, private keys, tokens or environment secrets.
- Node processes run as a dedicated account and bind to loopback. The public firewall permits only the intended SSH and HTTP(S) access. Commands test Nginx before reloading.
- The example IP, `203.0.113.10`, is reserved for documentation. The UI calls this out before generation. Replace example values before deployment.

## Browser features

The workspace offers six stack cards, a validated wizard, local documentation search (`Ctrl/Cmd + K`), sticky step navigation, syntax-colored code with copy feedback, command explanations, expected-result tabs, an interactive request diagram, a symptom search, glossary disclosures, four persistent themes, a complete print layout, Markdown download and the initial HTTP Nginx configuration download.

Checklist progress is saved under a canonical configuration key containing all builder settings. Editing the configuration switches to that configuration's own progress. A confirmed reset clears only the current checklist. A checkmark means **the user marked it complete**, never a server test. Storage failures keep the current session usable and display feedback. Clearing browser storage removes preferences and progress; Markdown remains a portable guide.

## Add a deployment path

1. Extend `StackId` and add typed metadata to `content/stacks.ts`.
2. Specify its deployment mode, public output, supported runtime and official documentation sources.
3. Extend the command generators and structured task content, then compose an appropriate launch path in `launch-flow.ts`. Keep every teaching field and verification path complete. Update `launchStepCount` and its regression cases.
4. Add a recognizable stack icon and validation rules for every new field or version. Avoid unrestricted executable inputs.
5. Add regression tests for its request path, service model, public root, downloads and invalid combinations.
6. Test generation in the browser, at mobile width, with keyboard input, all themes, reduced motion, print, and persisted progress.

Adding an OS version requires a reviewed mapping for packages, PHP sockets, service defaults and runtime installation. Do not simply append a version to a dropdown. The current singular OS/runtime choices communicate the deliberately narrow baseline.

## Maintaining technical accuracy

The primary source registry is in `content/stacks.ts`; additional official links accompany generated guides. Before changing the reviewed date, revisit the specific framework, Ubuntu, Nginx, systemd, runtime and Certbot sources; examine their actual compatibility requirements. Run the generator regression suite and static build. Separately test commands on disposable Ubuntu servers when available, including both fresh setup and update/recovery. Record the scope and outcome honestly; never equate unit tests or documentation review with server validation.

Pay particular attention to runtime support dates, NodeSource repository trust, PHP extension requirements, Certbot packaging, custom SSH ports, AAAA records, Next.js unsupported static features, browser-visible environment variables, queue timeouts and irreversible database changes. The guide uses the project lockfile and does not force dependency upgrades or destructive resets.

## Deployment files

`.openai/hosting.json` declares private Sites hosting of `out/`. The app itself is host-independent and contains no Site authentication or runtime integration code. Hosting access controls, if enabled by the provider, exist outside this static application.
