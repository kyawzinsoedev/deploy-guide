import type { GuideConfig, PhpVersion, ServerOs } from "@/lib/types";
export const serverOptions: { id: ServerOs; label: string }[] = [
  { id: "24.04", label: "Ubuntu 24.04 LTS · Nginx" },
  { id: "windows-2022", label: "Windows Server 2022 · IIS" },
  { id: "windows-2025", label: "Windows Server 2025 · IIS" },
];
export const phpVersions: {
  id: PhpVersion;
  label: string;
  securityUntil: string;
}[] = [
  {
    id: "8.2",
    label: "PHP 8.2 · security fixes only",
    securityUntil: "2026-12-31",
  },
  { id: "8.3", label: "PHP 8.3 · Ubuntu default", securityUntil: "2027-12-31" },
  { id: "8.4", label: "PHP 8.4", securityUntil: "2028-12-31" },
  {
    id: "8.5",
    label: "PHP 8.5 · latest stable branch",
    securityUntil: "2029-12-31",
  },
];
export const isWindows = (os: ServerOs) => os.startsWith("windows-");
export const osLabel = (os: ServerOs) =>
  isWindows(os) ? `Windows Server ${os.slice(8)}` : `Ubuntu ${os} LTS`;
export const defaultDirectory = (os: ServerOs, name: string) =>
  isWindows(os) ? `C:\\Sites\\${name}` : `/var/www/${name}`;
export const runtimeLabel = (c: GuideConfig) =>
  c.stack === "laravel"
    ? `PHP ${c.runtime} · Laravel 12`
    : c.runtime === "none"
      ? "No application runtime"
      : c.stack === "vite" || c.stack === "next-static"
        ? "Node 24 · local build only"
        : "Node.js 24 LTS";
export function phpVersionNote(c: GuideConfig): string {
  const version = phpVersions.find((v) => v.id === c.runtime);
  return `Laravel 12 supports PHP 8.2–8.5, but your Composer lockfile and extensions must also support the selected version. ${c.runtime === "8.2" ? "PHP 8.2 is near end of upstream support; plan an upgrade before 31 December 2026. " : ""}${version ? `Upstream security support ends ${version.securityUntil}. ` : ""}${isWindows(c.os) ? "Use the latest patched x64 Non-Thread Safe build for IIS FastCGI." : c.runtime === "8.3" ? "PHP 8.3 is Ubuntu 24.04’s distribution default." : "This version requires the third-party Ondřej Surý PHP PPA on Ubuntu 24.04. Review that additional package trust before proceeding."} Version choices were reviewed on 2026-10-29; latest is not resolved through a runtime API.`;
}
