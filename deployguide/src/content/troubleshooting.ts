import type { Problem } from "@/lib/types";
export const troubleshooting: Problem[] = [
  {
    symptom: "The domain does not reach my server",
    cause:
      "An A record is missing, cached, or points elsewhere. A stale AAAA record may send IPv6 visitors to another machine.",
    fix: "Compare dig +short A and AAAA results with your server addresses. Correct records at the authoritative DNS provider; wait for the previous TTL. Test from another network before changing Nginx.",
    tags: ["dns", "domain", "timeout", "ip"],
  },
  {
    symptom: "HTTPS certificate issuance fails",
    cause:
      "HTTP-01 validation cannot reach port 80, or one requested hostname resolves incorrectly.",
    fix: "Check every A/AAAA record, cloud firewall and UFW rule. Confirm an external HTTP request reaches this Nginx site. Inspect /var/log/letsencrypt/letsencrypt.log before retrying; repeated attempts can hit rate limits.",
    tags: ["ssl", "tls", "https", "certificate", "certbot"],
  },
  {
    symptom: "Nginx returns 403 Forbidden",
    cause:
      "There is no index file, or Nginx cannot traverse a parent directory or read the public output.",
    fix: "Inspect the error log, the configured root and namei -l on index.html (or public/index.php). Give www-data only the necessary group read/traverse access. Do not open permissions globally.",
    tags: ["403", "permissions", "forbidden"],
  },
  {
    symptom: "Nginx returns 404 Not Found",
    cause:
      "The document root does not match the build output, or a route was not exported.",
    fix: "Check nginx -T and the actual output files. Vite client-side routes use an index.html fallback; Next static routes must exist in out. Laravel requests must reach public/index.php.",
    tags: ["404", "routing", "not found", "static"],
  },
  {
    symptom: "Nginx returns 502 Bad Gateway",
    cause:
      "The upstream Node process or PHP-FPM is stopped, listening elsewhere, or inaccessible.",
    fix: "Read the Nginx error log. Check systemctl status and journalctl for the upstream. For Node, curl its loopback port and inspect ss -ltnp. For PHP, verify the socket and php8.3-fpm service.",
    tags: ["502", "gateway", "fpm", "proxy"],
  },
  {
    symptom: "The production build fails",
    cause:
      "A runtime version, lockfile, dependency, memory limit or required build variable is wrong.",
    fix: "Read the first actual build error. Check node --version and package.json engines; use the committed lockfile and install development dependencies for the build. Keep the old output until the new build succeeds.",
    tags: ["build", "npm", "pnpm", "memory", "dependency"],
  },
  {
    symptom: "The application stops or keeps restarting",
    cause:
      "The start script exits, an environment setting is missing, or a dependency cannot be reached.",
    fix: "Read journalctl before restarting repeatedly. Confirm the production start script stays in the foreground, the working directory is right and the environment file can be read. After correcting the cause, reset the failed service and start it.",
    tags: ["crash", "systemd", "restart", "environment"],
  },
  {
    symptom: "Address already in use / EADDRINUSE",
    cause: "Another process already listens on the chosen port.",
    fix: "Inspect sudo ss -ltnp to identify the owner. Stop it only if you know it is obsolete, or choose an unused port and update both the application service and Nginx upstream. Do not kill arbitrary processes.",
    tags: ["port", "occupied", "EADDRINUSE", "listen"],
  },
  {
    symptom: "Permission denied while writing Laravel cache",
    cause: "The PHP worker cannot write storage or bootstrap/cache.",
    fix: "Check the FPM pool user and directory groups. Grant www-data write access only to storage and bootstrap/cache. Keep code and .env read-only to that group; never use chmod 777.",
    tags: ["laravel", "cache", "storage", "permissions"],
  },
];
