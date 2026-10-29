// Development-only preview of the static export. Production hosts serve out/.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const port = 4173;
const types = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon", ".woff2":"font/woff2", ".json":"application/json", ".txt":"text/plain; charset=utf-8"};
try { await stat(resolve(root,"index.html")); }
catch { console.error("Run npm run build first. The out/ directory is missing."); process.exit(1); }

const server = createServer(async (req,res)=>{
  if (req.method !== "GET" && req.method !== "HEAD") {res.writeHead(405);res.end();return;}
  try {
    const pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    let file = resolve(root, "."+pathname);
    if (!file.startsWith(root.endsWith(sep) ? root : root+sep) && file !== resolve(root)) {res.writeHead(403);res.end();return;}
    if ((await stat(file)).isDirectory()) file=resolve(file,"index.html");
    const body = await readFile(file);
    res.writeHead(200,{"Content-Type":types[extname(file)]??"application/octet-stream","Cache-Control":"no-cache","X-Content-Type-Options":"nosniff"});
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {res.writeHead(404,{"Content-Type":"text/plain"});res.end("Not found");}
});
server.on("error",error=>{console.error(error.code === "EADDRINUSE" ? `Port ${port} is already occupied. Close the existing preview or reuse http://127.0.0.1:${port}.` : error.message);process.exitCode=1;});
server.listen(port,"127.0.0.1",()=>console.log(`Static export preview: http://127.0.0.1:${port}\nPress Ctrl+C to stop.`));
