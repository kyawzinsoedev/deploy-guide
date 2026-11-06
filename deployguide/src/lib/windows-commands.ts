import type { GuideConfig } from "./types";
import { assertValid } from "./validation";
import { isWindows } from "@/content/platforms";
export const windowsRoot = (c: GuideConfig) =>
  c.directory +
  (c.stack === "vite"
    ? "\\dist"
    : c.stack === "next-static"
      ? "\\out"
      : c.stack === "express" || c.stack === "next-node"
        ? "\\wwwroot"
        : "\\public");
export function generateWindowsService(c: GuideConfig): string {
  assertValid(c);
  if (!isWindows(c.os) || !["express", "next-node"].includes(c.stack))
    throw new Error("This service is for Windows Node applications.");
  const args =
    `--env-file="C:\\ProgramData\\DeployGuide\\${c.appName}\\app.env" ` +
    (c.stack === "next-node"
      ? `"${c.directory}\\node_modules\\next\\dist\\bin\\next" start --hostname 127.0.0.1 --port ${c.port}`
      : "--run start");
  return `<service>
  <id>${c.appName}</id><name>${c.appName} application</name>
  <description>Private Node application behind Apache</description>
  <executable>C:\\Program Files\\nodejs\\node.exe</executable>
  <arguments>${args.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</arguments>
  <workingdirectory>${c.directory}</workingdirectory>
  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <logpath>C:\\ProgramData\\DeployGuide\\${c.appName}\\logs</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
</service>`;
}
