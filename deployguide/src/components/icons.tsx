import {
  Braces,
  FileCode2,
  Hexagon,
  Layers,
  Triangle,
  Server,
  Package,
  Upload,
  Wrench,
  Settings2,
  ShieldCheck,
  ListChecks,
  BookOpen,
  GitBranch,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";
import type { StackId } from "@/lib/types";

const guideIcons: Record<string, LucideIcon> = {
  "server-ready": Server,
  "win-prepare": Server,
  "local-build": Wrench,
  "win-local-build": Wrench,
  "upload-public": Upload,
  "project-ready": Package,
  "win-runtime": Package,
  "production-build": Wrench,
  "win-files": Upload,
  "application-ready": Settings2,
  "win-process": Settings2,
  "web-server": Server,
  "win-iis": Server,
  "secure-domain": ShieldCheck,
  "win-https": ShieldCheck,
  "launch-check": ListChecks,
  "win-verify": ListChecks,
};

export function GuideNavIcon({
  id,
  complete,
}: {
  id: string;
  complete: boolean;
}) {
  const Icon = complete
    ? CircleCheck
    : (guideIcons[id] ?? (id.startsWith("ci-") ? GitBranch : BookOpen));
  return (
    <Icon
      size={18}
      className={`sidebar-collapsed-icon${complete ? " completed-icon" : ""}`}
      aria-hidden="true"
    />
  );
}
export function StackIcon({
  id,
  className = "",
}: {
  id: StackId;
  className?: string;
}) {
  if (id === "vite")
    return (
      <svg
        className={className}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="20" cy="20" r="3" fill="currentColor" />
        <ellipse
          cx="20"
          cy="20"
          rx="17"
          ry="6.6"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <ellipse
          cx="20"
          cy="20"
          rx="17"
          ry="6.6"
          transform="rotate(60 20 20)"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <ellipse
          cx="20"
          cy="20"
          rx="17"
          ry="6.6"
          transform="rotate(120 20 20)"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  if (id === "next-static" || id === "next-node")
    return (
      <span className={`next-icon ${className}`} aria-hidden="true">
        N<span>↘</span>
      </span>
    );
  const Icon =
    id === "html"
      ? FileCode2
      : id === "express"
        ? Hexagon
        : id === "laravel"
          ? Layers
          : Braces;
  return <Icon className={className} strokeWidth={1.6} aria-hidden="true" />;
}
