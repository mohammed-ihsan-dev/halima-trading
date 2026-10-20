// Minimal Chrome DevTools Protocol driver for end-to-end tests: a real headless Chrome, real DOM, real network.
// No dependencies (Node's built-in WebSocket). Used by tests/admin-product-gallery.e2e.test.mjs.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const CHROME = process.env.CHROME_PATH || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9300 + Math.floor(Math.random() * 500) } = {}) {
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "chrome-e2e-"))}`, "--no-first-run", "--no-default-browser-check", "--window-size=1400,1000", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 75 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} }
  if (!target) { proc.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pending = new Map(); const listeners = new Set();
  ws.addEventListener("message", (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else listeners.forEach((l) => l(msg)); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  const events = { network: [], console: [], exceptions: [], dialogs: [] };
  const reqs = new Map();
  on((msg) => {
    const p = msg.params;
    if (msg.method === "Network.requestWillBeSent") reqs.set(p.requestId, { method: p.request.method, url: p.request.url });
    if (msg.method === "Network.responseReceived") events.network.push({ ...(reqs.get(p.requestId) ?? {}), status: p.response.status });
    if (msg.method === "Network.loadingFailed") events.network.push({ ...(reqs.get(p.requestId) ?? {}), status: "FAILED", error: p.errorText });
    if (msg.method === "Runtime.consoleAPICalled" && p.type === "error") events.console.push(p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    if (msg.method === "Runtime.exceptionThrown") events.exceptions.push(p.exceptionDetails.exception?.description?.slice(0, 300) ?? p.exceptionDetails.text);
    if (msg.method === "Page.javascriptDialogOpening") { events.dialogs.push(p.message); send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); }
  });
  await send("Page.enable"); await send("Network.enable"); await send("Runtime.enable"); await send("DOM.enable");

  const evaluate = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const goto = async (url) => { await send("Page.navigate", { url }); for (let i = 0; i < 150; i++) { await sleep(200); if ((await evaluate("document.readyState").catch(() => "")) === "complete") break; } };
  const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await evaluate(expr).catch(() => false)) return true; await sleep(150); } return false; };
  const setFiles = async (selector, files) => { const { root } = await send("DOM.getDocument", { depth: -1 }); const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector }); if (!nodeId) throw new Error(`no element ${selector}`); await send("DOM.setFileInputFiles", { nodeId, files }); };
  const screenshot = async (file) => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(data, "base64")); };

  /** Intercepts requests matching a URL pattern; `handler(params)` returns {delay} | {status, body} | undefined (continue). */
  let unhook = null;
  const intercept = async (patterns, handler) => {
    if (unhook) { unhook(); await send("Fetch.disable"); unhook = null; }
    if (!patterns) return;
    await send("Fetch.enable", { patterns: patterns.map((urlPattern) => ({ urlPattern, requestStage: "Request" })) });
    unhook = on(async (msg) => {
      if (msg.method !== "Fetch.requestPaused") return;
      const p = msg.params; const action = (await handler(p)) ?? {};
      if (action.delay) await sleep(action.delay);
      if (action.status) await send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: action.status, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(action.body ?? {})).toString("base64") }).catch(() => {});
      else await send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
    });
  };
  const close = () => { try { ws.close(); } catch {} proc.kill(); };
  return { send, evaluate, goto, waitFor, setFiles, screenshot, intercept, events, close };
}
