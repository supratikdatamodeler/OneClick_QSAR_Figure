const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const exportsDir = path.join(root, "exports");
const port = 8000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png"
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/save-export") {
    saveExport(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }
  serveStatic(req, res);
});

function saveExport(req, res) {
  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 50 * 1024 * 1024) req.destroy();
  });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body || "{}");
      const filename = safeName(payload.filename || "export.txt");
      const encoding = payload.encoding || "text";
      fs.mkdirSync(exportsDir, { recursive: true });
      const outputPath = path.join(exportsDir, filename);
      if (encoding === "base64") {
        fs.writeFileSync(outputPath, Buffer.from(payload.content || "", "base64"));
      } else {
        fs.writeFileSync(outputPath, payload.content || "", "utf8");
      }
      sendJson(res, 200, { ok: true, path: outputPath });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error.message || error) });
    }
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    if (req.method !== "HEAD") res.end(data);
    else res.end();
  });
}

function safeName(value) {
  const name = path.basename(String(value));
  return name.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/^[ .]+|[ .]+$/g, "") || "export.txt";
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

server.listen(port, "127.0.0.1", () => {
  console.log(`QSAR dashboard server: http://127.0.0.1:${port}/index.html`);
  console.log(`Exports folder: ${exportsDir}`);
});
