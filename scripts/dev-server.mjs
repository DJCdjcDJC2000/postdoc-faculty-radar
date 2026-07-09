import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const requestedPort = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const requested = decodeURIComponent(url.pathname);
    const resolved = path.resolve(publicRoot, `.${requested}`);

    if (!resolved.toLowerCase().startsWith(publicRoot.toLowerCase())) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const filePath = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
      ? path.join(resolved, "index.html")
      : resolved;

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        "content-type": mimeTypes[ext] ?? "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(data);
    });
  });
}

function listen(port) {
  const server = createServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < requestedPort + 20) {
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, () => {
    console.log(`Postdoc Faculty Radar running at http://localhost:${port}`);
  });
}

listen(requestedPort);
