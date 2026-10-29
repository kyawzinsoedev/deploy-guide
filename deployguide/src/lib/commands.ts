import { stacks } from "@/content/stacks";

import type { GuideConfig } from "./types";
import { assertValid, shellQuote as q } from "./validation";
import { isWindows } from "@/content/platforms";

export function generateNginx(c: GuideConfig): string {
  assertValid(c);
  if (isWindows(c.os))
    throw new Error(
      "Windows Server uses IIS web.config, not this Nginx configuration.",
    );
  const s = stacks.find((s) => s.id === c.stack)!;
  const root =
    c.directory +
    (c.stack === "vite"
      ? "/dist"
      : c.stack === "next-static"
        ? "/out"
        : "/public");
  const shared = `server {\n    listen 80;\n    listen [::]:80;\n    server_name ${c.domain}${c.www ? " www." + c.domain : ""};\n\n    # Separate logs make this application easier to investigate.\n    access_log /var/log/nginx/${c.appName}.access.log;\n    error_log /var/log/nginx/${c.appName}.error.log;\n\n    # Keep dotfiles private, while allowing certificate challenges.\n    location ~ /\\.(?!well-known) { deny all; }\n`;
  if (s.mode === "node")
    return (
      shared +
      `\n    location / {\n        proxy_pass http://127.0.0.1:${c.port};\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        # Allow streamed responses, including Next.js rendering.\n        proxy_buffering off;\n    }\n}\n`
    );
  if (s.mode === "php")
    return (
      shared +
      `\n    root ${root};\n    index index.php;\n    charset utf-8;\n\n    location / {\n        try_files $uri $uri/ /index.php?$query_string;\n    }\n\n    # Only Laravel's front controller may execute PHP.\n    location ~ ^/index\\.php$ {\n        include fastcgi_params;\n        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;\n        fastcgi_pass unix:/run/php/php${c.runtime}-fpm.sock;\n        fastcgi_hide_header X-Powered-By;\n    }\n    location ~ \\.php$ { return 404; }\n}\n`
    );
  return (
    shared +
    `\n    root ${root};\n    index index.html;\n\n    location / {\n        try_files $uri $uri/ ${c.stack === "vite" ? "/index.html" : "=404"};\n    }\n}\n`
  );
}
export function generateService(c: GuideConfig): string {
  assertValid(c);
  return `[Unit]\nDescription=${c.appName} production application\nAfter=network.target\n\n[Service]\nType=simple\nUser=${c.username}\nGroup=www-data\nWorkingDirectory=${c.directory}\nEnvironment=NODE_ENV=production\nEnvironment=HOST=127.0.0.1\nEnvironment=PORT=${c.port}\nEnvironmentFile=/etc/${c.appName}/app.env\nExecStart=${c.stack === "next-node" ? `/usr/bin/node ${c.directory}/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${c.port}` : "/usr/bin/npm start"}\nRestart=on-failure\nRestartSec=5\nUMask=0027\nNoNewPrivileges=true\nPrivateTmp=true\n\n[Install]\nWantedBy=multi-user.target\n`;
}
