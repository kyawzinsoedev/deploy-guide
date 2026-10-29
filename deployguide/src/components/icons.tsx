import { Braces, FileCode2, Hexagon, Layers, Triangle } from "lucide-react";
import type { StackId } from "@/lib/types";
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
