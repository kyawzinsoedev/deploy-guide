import type { GuideConfig } from "./types";
import { assertValid } from "./validation";
import { isWindows } from "@/content/platforms";
import { windowsRoot } from "./windows-commands";

/** Dedicated non-administrator account for this Apache installation. */
export const apacheAccount = "dg-httpd";

/** Validated input only; no arbitrary Apache directives or filesystem paths. */
export function generateApache(c: GuideConfig, https = false): string {
  assertValid(c);
  if (!isWindows(c.os))
    throw new Error("Apache configuration requires Windows Server.");
  const node = c.stack === "express" || c.stack === "next-node";
  const php = c.stack === "laravel";
  const root = windowsRoot(c).replaceAll("\\", "/");
  const state = `C:/ProgramData/DeployGuide/${c.appName}`;
  const names = `    ServerName ${c.domain}\n${c.www ? `    ServerAlias www.${c.domain}\n` : ""}`;
  const acme = `    # Stable validation directory, independent of application releases.
    Alias /.well-known/acme-challenge/ "${state}/acme/.well-known/acme-challenge/"
    <Directory "${state}/acme/.well-known/acme-challenge">
        Options None
        AllowOverride None
        Require all granted
    </Directory>
`;
  const protection = `    # Block hidden paths except the certificate challenge.
    <LocationMatch "(?i)/[.](?!well-known/acme-challenge/)">
        Require all denied
    </LocationMatch>
`;
  const phpUrlGuard = `    # An uploaded or nested index.php must never execute.
    <LocationMatch "(?i)^/(?!index[.]php$).*\\.(?:php|phtml|phar)(?:[./]|$)">
        Require all denied
    </LocationMatch>
`;
  const app = node
    ? `    ProxyRequests Off
    ProxyPreserveHost On
    # Discard public clients' forwarded headers before creating trusted ones.
    RequestHeader unset X-Forwarded-For
    RequestHeader unset X-Forwarded-Host
    RequestHeader set X-Forwarded-Proto "${https ? "https" : "http"}"
    ProxyPass /.well-known/acme-challenge/ !
    ProxyPass / http://127.0.0.1:${c.port}/
    ProxyPassReverse / http://127.0.0.1:${c.port}/
`
    : `    DocumentRoot "${root}"
    <Directory "${root}">
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
        DirectoryIndex ${php ? "index.php" : "index.html"}
${
  php
    ? `        # Only the front controller executes PHP, including case variants on Windows.
        <FilesMatch "(?i)^(?!index[.]php$).*\\.(?:php|phtml|phar)(?:[.]|$)">
            Require all denied
        </FilesMatch>
        <FilesMatch "(?i)^index[.]php$">
            SetHandler application/x-httpd-php
        </FilesMatch>
        RewriteEngine On
        RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
        RewriteRule .* - [E=HTTP_X_XSRF_TOKEN:%{HTTP:X-XSRF-Token}]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ index.php [END]
`
    : c.stack === "vite"
      ? `        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ index.html [END]
`
      : ""
}    </Directory>
`;
  const logs = `    ErrorLog "logs/${c.appName}-error.log"
    CustomLog "logs/${c.appName}-access.log" common
`;
  return `# Apache 2.4: C:/Apache24/conf/extra/${c.appName}.conf
# Include this file once in httpd.conf. Test before restarting.
${
  https
    ? `# Add Listen 443 once in httpd.conf after enabling ssl and socache_shmcb.
# Activate only after win-acme has created the certificate files below.
<VirtualHost *:80>
${names}${acme}${protection}    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/
    RewriteRule ^ https://${c.domain}%{REQUEST_URI} [R=301,L,NE]
</VirtualHost>
<VirtualHost *:443>
${names}    SSLEngine on
    SSLProtocol -all +TLSv1.2 +TLSv1.3
    SSLCertificateFile "${state}/tls/${c.appName}-chain.pem"
    SSLCertificateKeyFile "${state}/tls/${c.appName}-key.pem"
${acme}${protection}${php ? phpUrlGuard : ""}${app}${logs}</VirtualHost>
`
    : `<VirtualHost *:80>
${names}${acme}${protection}${php ? phpUrlGuard : ""}${app}${logs}</VirtualHost>
`
}`;
}
