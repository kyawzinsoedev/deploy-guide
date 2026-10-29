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
export function generateWebConfig(c: GuideConfig): string {
  assertValid(c);
  if (!isWindows(c.os))
    throw new Error("IIS configuration requires Windows Server.");
  const node = c.stack === "express" || c.stack === "next-node",
    php = c.stack === "laravel";
  const rewrite = node
    ? `<rule name="Private application HTTPS" stopProcessing="true"><match url="(.*)" /><conditions><add input="{HTTPS}" pattern="^on$" /></conditions><serverVariables><set name="HTTP_X_FORWARDED_PROTO" value="https" /><set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" /></serverVariables><action type="Rewrite" url="http://127.0.0.1:${c.port}/{R:1}" /></rule><rule name="Private application HTTP" stopProcessing="true"><match url="(.*)" /><serverVariables><set name="HTTP_X_FORWARDED_PROTO" value="http" /><set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" /></serverVariables><action type="Rewrite" url="http://127.0.0.1:${c.port}/{R:1}" /></rule>`
    : c.stack === "vite"
      ? `<rule name="Client routes" stopProcessing="true"><match url=".*" /><conditions logicalGrouping="MatchAll"><add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" /><add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" /></conditions><action type="Rewrite" url="index.html" /></rule>`
      : php
        ? `<rule name="Laravel front controller" stopProcessing="true"><match url=".*" /><conditions logicalGrouping="MatchAll"><add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" /><add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" /></conditions><action type="Rewrite" url="index.php" appendQueryString="true" /></rule>`
        : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Initial site configuration. Merge into an existing web.config after backup. -->
<configuration><system.webServer>
  <directoryBrowse enabled="false" />
  <security><requestFiltering><hiddenSegments><add segment=".env" /><add segment=".git" /></hiddenSegments></requestFiltering></security>
  ${node ? "" : `<defaultDocument><files><clear /><add value="${php ? "index.php" : "index.html"}" /></files></defaultDocument>`}
  ${rewrite ? `<rewrite><rules>${php ? '<rule name="Block other PHP scripts" stopProcessing="true"><match url="^(?!index[.]php$).*?[.]php(?:/.*)?$" ignoreCase="true" /><action type="CustomResponse" statusCode="404" statusReason="Not Found" statusDescription="Not Found" /></rule>' : ""}${rewrite}</rules></rewrite>` : ""}
  ${
    php
      ? `<!-- Scoped to this site; only index.php executes PHP. -->
  <handlers><clear /><add name="LaravelFrontController" path="index.php" verb="*" modules="FastCgiModule" scriptProcessor="C:\\PHP\\${c.runtime}\\php-cgi.exe" resourceType="File" /><add name="StaticFile" path="*" verb="GET,HEAD" modules="StaticFileModule,DefaultDocumentModule,DirectoryListingModule" resourceType="Either" requireAccess="Read" /></handlers>`
      : ""
  }
</system.webServer></configuration>
`;
}
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
  <description>Private Node application behind IIS</description>
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
