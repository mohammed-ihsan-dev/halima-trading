// A minimal stand-in for the Supabase Storage REST API, for local tests only.
// Implements just the endpoints the app uses, with the same auth rules that matter here:
// privileged calls need the secret key; a signed upload URL works once, without a key,
// and can never overwrite an existing object.
//
//   node tests/support/fake-supabase-storage.mjs <port> <secret>      (standalone)
//   import { startFakeSupabase } from "./support/fake-supabase-storage.mjs"
//
// Test controls: GET /__objects (keys), POST /__fail-puts?count=N (next N uploads fail with 500).
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export function startFakeSupabase({ port = 0, secret }) {
  const objects = new Map(); // "<bucket>/<key>" → { body, contentType, cacheControl, createdAt }
  const tokens = new Map(); // token → "<bucket>/<key>"
  let failPuts = 0;

  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" };
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...cors, ...headers });
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const storageError = (res, status, error, message) => send(res, 400, { statusCode: String(status), error, message });
  const authorized = (req) => req.headers.apikey === secret || req.headers.authorization === `Bearer ${secret}`;
  const readBody = (req) => new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://fake");
    const path = decodeURIComponent(url.pathname);
    if (req.method === "OPTIONS") return send(res, 204, "");
    if (path === "/__objects") return send(res, 200, [...objects.keys()]);
    if (path === "/__fail-puts") { failPuts = Number(url.searchParams.get("count") ?? 1); return send(res, 200, { failPuts }); }

    let m;
    if (req.method === "POST" && (m = path.match(/^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/))) {
      if (!authorized(req)) return storageError(res, 403, "Unauthorized", "new row violates row-level security policy");
      const token = randomUUID();
      tokens.set(token, `${m[1]}/${m[2]}`);
      return send(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=${token}` });
    }
    if (req.method === "PUT" && (m = path.match(/^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/))) {
      const id = `${m[1]}/${m[2]}`;
      const token = url.searchParams.get("token");
      const body = await readBody(req);
      if (!token || tokens.get(token) !== id) return storageError(res, 403, "InvalidSignature", "The signature is invalid");
      tokens.delete(token); // one use only
      if (failPuts > 0) { failPuts--; return send(res, 500, { message: "simulated failure" }); }
      if (objects.has(id)) return storageError(res, 409, "Duplicate", "The resource already exists");
      objects.set(id, { body, contentType: req.headers["content-type"] ?? "application/octet-stream", cacheControl: req.headers["cache-control"] ?? "", createdAt: new Date().toISOString() });
      return send(res, 200, { Key: id });
    }
    if (req.method === "GET" && (m = path.match(/^\/storage\/v1\/object\/info\/([^/]+)\/(.+)$/))) {
      if (!authorized(req)) return storageError(res, 403, "Unauthorized", "Unauthorized");
      const o = objects.get(`${m[1]}/${m[2]}`);
      if (!o) return storageError(res, 404, "not_found", "Object not found");
      return send(res, 200, { name: m[2], size: o.body.length, content_type: o.contentType, metadata: { size: o.body.length, mimetype: o.contentType } });
    }
    if (req.method === "GET" && (m = path.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/))) {
      const o = objects.get(`${m[1]}/${m[2]}`);
      if (!o) return storageError(res, 404, "not_found", "Object not found");
      return send(res, 200, o.body, { "Content-Type": o.contentType, "Cache-Control": o.cacheControl });
    }
    if (req.method === "GET" && (m = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/))) {
      if (!authorized(req)) return storageError(res, 403, "Unauthorized", "Unauthorized");
      const o = objects.get(`${m[1]}/${m[2]}`);
      if (!o) return storageError(res, 404, "not_found", "Object not found");
      const range = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? "");
      if (range) return send(res, 206, o.body.subarray(Number(range[1]), Number(range[2]) + 1), { "Content-Type": o.contentType });
      return send(res, 200, o.body, { "Content-Type": o.contentType });
    }
    if (req.method === "DELETE" && (m = path.match(/^\/storage\/v1\/object\/([^/]+)$/))) {
      if (!authorized(req)) return storageError(res, 403, "Unauthorized", "Unauthorized");
      const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || "{}");
      const removed = prefixes.filter((k) => objects.delete(`${m[1]}/${k}`)).map((name) => ({ name }));
      return send(res, 200, removed);
    }
    if (req.method === "POST" && (m = path.match(/^\/storage\/v1\/object\/list\/([^/]+)$/))) {
      if (!authorized(req)) return storageError(res, 403, "Unauthorized", "Unauthorized");
      const { prefix = "", limit = 100, offset = 0 } = JSON.parse((await readBody(req)).toString() || "{}");
      const base = `${m[1]}/${prefix ? `${prefix.replace(/\/$/, "")}/` : ""}`;
      const entries = new Map();
      for (const [id, o] of objects) {
        if (!id.startsWith(base)) continue;
        const rest = id.slice(base.length);
        const [head, ...tail] = rest.split("/");
        if (tail.length) entries.set(head, { name: head, id: null, metadata: null });
        else entries.set(head, { name: head, id: randomUUID(), created_at: o.createdAt, metadata: { size: o.body.length, mimetype: o.contentType } });
      }
      return send(res, 200, [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit));
    }
    send(res, 404, { message: `fake: no route for ${req.method} ${path}` });
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, objects })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [port, secret] = process.argv.slice(2);
  startFakeSupabase({ port: Number(port), secret }).then(({ port: p }) => console.log(`fake Supabase Storage on http://127.0.0.1:${p}`));
}
