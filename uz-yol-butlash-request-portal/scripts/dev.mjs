import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = "dist";
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return join(root, normalized === "/" ? "index.html" : normalized);
}

const server = createServer(async (request, response) => {
  let filePath = safePath(request.url || "/");
  if (!existsSync(filePath)) filePath = join(root, "index.html");
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) filePath = join(root, "index.html");
    response.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
    createReadStream(filePath).pipe(response);
  } catch {
    response.statusCode = 404;
    response.end("Topilmadi");
  }
});

server.listen(port, host, () => {
  console.log(`UzYolButlash request portal: http://${host}:${port}/talabnoma`);
});
