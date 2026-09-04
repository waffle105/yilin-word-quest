import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import handler from "../dist/server/index.js";

const clientRoot = path.resolve(process.cwd(), "dist/client");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function fetchAsset(request) {
  const url = new URL(request.url);
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = path.resolve(clientRoot, relativePath);
  if (filePath !== clientRoot && !filePath.startsWith(`${clientRoot}${path.sep}`)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return new Response("Not Found", { status: 404 });
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    return new Response(body, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

async function readBody(request) {
  if (["GET", "HEAD"].includes(request.method ?? "GET")) return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function vercelHandler(req, res) {
  try {
    const protocol = req.headers["x-forwarded-proto"] ?? "https";
    const host = req.headers.host ?? "localhost";
    const request = new Request(`${protocol}://${host}${req.url ?? "/"}`, {
      method: req.method,
      headers: req.headers,
      body: await readBody(req),
    });
    const response = await handler.fetch(request, {
      ASSETS: { fetch: fetchAsset },
    });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Vercel request failed", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}
