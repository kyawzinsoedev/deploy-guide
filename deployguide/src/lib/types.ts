export type StackId =
  "html" | "vite" | "express" | "next-static" | "next-node" | "laravel";
export type DeploymentMode = "static" | "node" | "php";
export type PackageManager = "npm" | "pnpm";
export type PhpVersion = "8.2" | "8.3" | "8.4" | "8.5";
export type ServerOs = "24.04" | "windows-2022" | "windows-2025";
export interface GuideConfig {
  stack: StackId;
  os: ServerOs;
  appName: string;
  domain: string;
  www: boolean;
  serverIp: string;
  username: string;
  directory: string;
  repository: string;
  packageManager: PackageManager;
  port: string;
  runtime: "24" | PhpVersion | "none";
}
export interface Source {
  label: string;
  url: string;
}
export interface Stack {
  id: StackId;
  name: string;
  subtitle: string;
  mode: DeploymentMode;
  badge: string;
  description: string;
  runtime: GuideConfig["runtime"];
  sources: Source[];
}
export interface Problem {
  symptom: string;
  cause: string;
  fix: string;
  tags: string[];
}
export interface CodeBlock {
  title: string;
  language:
    | "bash"
    | "powershell"
    | "xml"
    | "yaml"
    | "nginx"
    | "ini"
    | "javascript"
    | "text";
  code: string;
  location:
    | "Your computer"
    | "Server · administrator"
    | "Server · deployment user"
    | "GitHub / CI runner"
    | "Configuration";
  changes: boolean;
  optional?: string;
}
export interface Step {
  id: string;
  title: string;
  goal: string;
  why: string;
  how: string;
  before: string;
  blocks: CodeBlock[];
  breakdown: { term: string; explanation: string }[];
  expected: string;
  verification: CodeBlock;
  problems: Problem[];
  next: string;
  note?: string;
  /** Small tasks in a launch stage, with their own location and checks. */
  parts?: Step[];
}
export interface Guide {
  config: GuideConfig;
  stack: Stack;
  steps: Step[];
  nginx: string;
  webConfig?: string;
  sources: Source[];
  reviewedOn: string;
  references?: Step[];
  automation?: { steps: Step[]; files: { name: string; content: string }[] };
}
