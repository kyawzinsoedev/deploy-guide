import { stacks } from "@/content/stacks";
import type { GuideConfig } from "./types";
import { isWindows, phpVersions, serverOptions } from "@/content/platforms";
export type ValidationErrors = Partial<Record<keyof GuideConfig, string>>;
export function validateConfig(c: GuideConfig): ValidationErrors {
  const errors: ValidationErrors = {};
  const textKeys = [
    "stack",
    "os",
    "appName",
    "domain",
    "serverIp",
    "username",
    "directory",
    "repository",
    "packageManager",
    "port",
    "runtime",
  ] as const;
  if (!c || typeof c !== "object")
    return { stack: "Choose a valid guide configuration." };
  for (const key of textKeys) {
    if (typeof c[key] !== "string" || /[\x00-\x1f\x7f]/.test(c[key]))
      errors[key] = "Use plain text without control characters.";
  }
  if (typeof c.www !== "boolean")
    errors.www = "Choose whether to include the www alias.";
  if (Object.keys(errors).length) return errors;
  const stack = stacks.find((s) => s.id === c.stack);
  if (!stack) errors.stack = "Choose one of the six supported paths.";
  if (!serverOptions.some((o) => o.id === c.os))
    errors.os = "Choose a documented Ubuntu or Windows Server version.";
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(c.appName))
    errors.appName =
      "Use 2–40 lowercase letters, numbers or hyphens, starting with a letter.";
  if (
    c.domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(c.domain)
  )
    errors.domain =
      "Enter a lowercase domain, without https://, a path or wildcard.";
  if (c.www && c.domain.startsWith("www."))
    errors.domain = "Enter the base domain when adding a www alias.";
  const ip = c.serverIp.split(".");
  if (
    ip.length !== 4 ||
    ip.some(
      (x) =>
        !/^\d{1,3}$/.test(x) ||
        Number(x) > 255 ||
        (x.length > 1 && x.startsWith("0")),
    ) ||
    Number(ip[0]) === 0 ||
    Number(ip[0]) >= 224
  )
    errors.serverIp =
      "Enter a valid unicast IPv4 address, such as 203.0.113.10.";
  if (
    !/^[a-z][a-z0-9_-]{0,31}$/.test(c.username) ||
    (isWindows(c.os) && c.username.length > 20) ||
    ["root", "www-data", "ubuntu", "daemon", "nobody", "bin", "sys"].includes(
      c.username,
    )
  )
    errors.username = "Choose a dedicated, non-root username such as deploy.";
  if (
    !(
      isWindows(c.os)
        ? /^C:\\Sites\\[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
        : /^\/var\/www\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
    ).test(c.directory)
  )
    errors.directory = isWindows(c.os)
      ? "Use a dedicated direct child of C:\\Sites, e.g. C:\\Sites\\my-app. No spaces or traversal."
      : "Use a dedicated direct child of /var/www, e.g. /var/www/my-app. No spaces or traversal.";
  if (
    isWindows(c.os) &&
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:$|\.)/i.test(
      c.directory.split("\\").at(-1)!,
    )
  )
    errors.directory =
      "Choose a folder name that is not a Windows reserved device name.";
  if (
    c.repository &&
    (!/^https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9_./-]+(?:\.git)?$/.test(
      c.repository,
    ) ||
      c.repository.includes("..") ||
      c.repository.length > 250)
  )
    errors.repository =
      "Use an HTTPS repository URL without credentials, queries or fragments.";
  if (!["npm", "pnpm"].includes(c.packageManager))
    errors.packageManager = "Choose npm or pnpm.";
  if (
    !/^\d{4,5}$/.test(c.port) ||
    Number(c.port) < 1024 ||
    Number(c.port) > 65535
  )
    errors.port = "Use a private application port between 1024 and 65535.";
  if (
    stack &&
    (stack.id === "laravel"
      ? !phpVersions.some((v) => v.id === c.runtime)
      : c.runtime !== stack.runtime)
  )
    errors.runtime = `This path uses ${stack.runtime === "none" ? "no runtime" : stack.runtime === "8.3" ? "PHP 8.3" : "Node.js 24 LTS"}.`;
  return errors;
}
/** Literal PowerShell single-quoted value; never evaluated as code. */
export function powershellQuote(value: string): string {
  return "'" + value.replaceAll("'", "''") + "'";
}
export function assertValid(c: GuideConfig): void {
  const errors = validateConfig(c);
  if (Object.keys(errors).length)
    throw new Error(Object.values(errors).join(" "));
}
/** POSIX single-quote escaping. Validation still constrains values used in non-shell config. */
export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
export function configKey(c: GuideConfig): string {
  return (
    "deployguide:progress:v2:" +
    JSON.stringify([
      c.stack,
      c.os,
      c.appName,
      c.domain,
      c.www,
      c.serverIp,
      c.username,
      c.directory,
      c.repository,
      c.packageManager,
      c.port,
      c.runtime,
    ])
  );
}
