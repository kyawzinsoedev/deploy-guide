import type { GuideConfig, Stack } from "@/lib/types";
export const stacks: Stack[] = [
  {
    id: "html",
    name: "HTML / CSS / JS",
    subtitle: "The essentials, beautifully simple.",
    mode: "static",
    badge: "Static files",
    runtime: "none",
    description:
      "Nginx reads your files and sends them directly to visitors. No application runtime or build process is needed.",
    sources: [
      {
        label: "Nginx beginner’s guide",
        url: "https://nginx.org/en/docs/beginners_guide.html",
      },
    ],
  },
  {
    id: "vite",
    name: "React + Vite",
    subtitle: "Build once. Serve everywhere.",
    mode: "static",
    badge: "Static build",
    runtime: "24",
    description:
      "Vite compiles your React project into a dist directory. Nginx serves that output; Node is only a build tool.",
    sources: [
      {
        label: "Vite: deploying a static site",
        url: "https://vite.dev/guide/static-deploy.html",
      },
    ],
  },
  {
    id: "express",
    name: "Node.js / Express",
    subtitle: "Your application, always running.",
    mode: "node",
    badge: "Reverse proxy",
    runtime: "24",
    description:
      "A Node process handles requests on a private port. Nginx accepts public traffic and passes it to that process.",
    sources: [
      {
        label: "Express production best practices",
        url: "https://expressjs.com/en/advanced/best-practice-performance.html",
      },
      { label: "Node.js downloads", url: "https://nodejs.org/en/download" },
    ],
  },
  {
    id: "next-static",
    name: "Next.js",
    subtitle: "Pre-rendered and ready to serve.",
    mode: "static",
    badge: "Static export",
    runtime: "24",
    description:
      "Choose static export when every page can be generated at build time. Server Actions, request-time cookies, ISR and runtime rendering require the Node path instead.",
    sources: [
      {
        label: "Next.js static exports",
        url: "https://nextjs.org/docs/app/guides/static-exports",
      },
    ],
  },
  {
    id: "next-node",
    name: "Next.js",
    subtitle: "Full-stack, with a Node runtime.",
    mode: "node",
    badge: "Node server",
    runtime: "24",
    description:
      "Choose a Node server for request-time rendering, Server Actions and other server features. systemd keeps next start alive behind Nginx.",
    sources: [
      {
        label: "Next.js self-hosting",
        url: "https://nextjs.org/docs/app/guides/self-hosting",
      },
    ],
  },
  {
    id: "laravel",
    name: "Laravel",
    subtitle: "PHP, with a production foundation.",
    mode: "php",
    badge: "PHP-FPM",
    runtime: "8.3",
    description:
      "Nginx serves public assets and passes PHP requests to PHP-FPM. Only Laravel’s public directory is exposed to the web.",
    sources: [
      {
        label: "Laravel 12 deployment",
        url: "https://laravel.com/docs/12.x/deployment",
      },
      {
        label: "Laravel 12 encryption and application keys",
        url: "https://laravel.com/docs/12.x/encryption",
      },
      {
        label: "Laravel 12 queues",
        url: "https://laravel.com/docs/12.x/queues",
      },
      {
        label: "Laravel 12 scheduling",
        url: "https://laravel.com/docs/12.x/scheduling",
      },
      {
        label: "Ubuntu PHP 8.3 FPM package",
        url: "https://packages.ubuntu.com/noble/php8.3-fpm",
      },
    ],
  },
];
export const defaultConfig: GuideConfig = {
  stack: "vite",
  os: "24.04",
  appName: "my-app",
  domain: "example.com",
  www: true,
  serverIp: "203.0.113.10",
  username: "deploy",
  directory: "/var/www/my-app",
  repository: "",
  packageManager: "npm",
  port: "3000",
  runtime: "24",
};
export const commonSources = [
  {
    label: "Ubuntu: file access control lists",
    url: "https://manpages.ubuntu.com/manpages/noble/man1/setfacl.1.html",
  },
  {
    label: "Ubuntu: Nginx",
    url: "https://documentation.ubuntu.com/server/how-to/web-services/install-nginx/",
  },
  {
    label: "Ubuntu: OpenSSH",
    url: "https://documentation.ubuntu.com/server/how-to/security/openssh-server/",
  },
  {
    label: "Ubuntu: firewall",
    url: "https://documentation.ubuntu.com/server/how-to/security/firewalls/",
  },
  {
    label: "Nginx HTTP proxy module",
    url: "https://nginx.org/en/docs/http/ngx_http_proxy_module.html",
  },
  {
    label: "systemd service units",
    url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html",
  },
  {
    label: "Certbot with Nginx on Linux",
    url: "https://certbot.eff.org/instructions?ws=nginx&os=snap",
  },
  {
    label: "Node.js release schedule",
    url: "https://nodejs.org/en/about/previous-releases",
  },
  {
    label: "nvm installation",
    url: "https://github.com/nvm-sh/nvm#installing-and-updating",
  },
  { label: "pnpm installation", url: "https://pnpm.io/installation" },
  { label: "Composer installation", url: "https://getcomposer.org/download/" },
];
export const reviewedOn = "2026-10-28";
