"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Download, ImagePlus, Loader2, RefreshCw, Upload, X } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import { fetchUploadConfig, uploadImagesToStorage, type UploadConfig } from "@/lib/admin-image-upload";
import {
  BULK_INPUT_TYPES,
  planBulkImages,
  plannedImages,
  type BulkMode,
  type BulkPlan,
  type BulkProduct,
  type ProductPlan,
} from "@/lib/bulk-image-match";

const CONCURRENCY = 3; // products uploading at the same time

type RowState = "pending" | "uploading" | "done" | "failed";
interface RowResult {
  state: RowState;
  newImages?: string[];
  error?: string;
  at?: string;
}

const MODE_LABELS: Record<BulkMode, string> = {
  "empty-only": "Only products without images (safest)",
  add: "Add to existing images",
  replace: "Replace existing images",
};
const ACTION_LABELS: Record<ProductPlan["action"], string> = { set: "Set images", add: "Add images", replace: "Replace images", skip: "Skip" };
const PROBLEM_LABELS: Record<string, string> = {
  "invalid-file": "Invalid file", unmatched: "No matching product", ambiguous: "Ambiguous", duplicate: "Duplicate", "too-many": "Too many",
};

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

async function discard(urls: string[]) {
  if (!urls.length) return;
  await fetch("/api/admin/uploads/discard", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }),
  }).catch(() => undefined); // left for the orphan clean-up script
}

export default function BulkImageUploadPage() {
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [products, setProducts] = useState<BulkProduct[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<BulkMode>("empty-only");
  const [results, setResults] = useState<Record<string, RowResult>>({});
  // Once an upload starts, the plan is frozen: its rows, expected images and counts must not change
  // as products are updated. Changing files or mode, or reloading products, starts a new plan.
  const [frozenPlan, setFrozenPlan] = useState<BulkPlan | null>(null);
  const resetRun = () => {
    setFrozenPlan(null);
    setResults({});
  };
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const loadProducts = () =>
    fetch("/api/admin/products", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.data)) throw new Error(data.error || "Could not load products.");
        setLoadError("");
        setProducts(data.data);
      })
      .catch((error) => setLoadError((error as Error).message));

  useEffect(() => {
    fetchUploadConfig().then(setConfig);
    loadProducts();
  }, []);

  // Local previews of the selected files (never uploaded until "Start upload").
  const thumbs = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const livePlan = useMemo(
    () => (products ? planBulkImages(files.map((f) => ({ name: f.name, size: f.size, type: f.type })), products, mode) : null),
    [files, products, mode]
  );
  const plan = frozenPlan ?? livePlan;
  const toUpload = useMemo(() => plan?.products.filter((p) => p.action !== "skip") ?? [], [plan]);
  const counts = useMemo(() => {
    const c = { done: 0, failed: 0, pending: 0, uploading: 0 };
    for (const p of toUpload) c[results[p.product.id]?.state ?? "pending"]++;
    return c;
  }, [toUpload, results]);

  const setRow = (id: string, row: RowResult) => setResults((r) => ({ ...r, [id]: row }));

  const processProduct = async (p: ProductPlan) => {
    const id = p.product.id;
    setRow(id, { state: "uploading" });
    let uploaded: string[] = [];
    try {
      const chosen = p.fileIndexes.map((i) => files[i]);
      const { urls, errors } = await uploadImagesToStorage(chosen, config!, p.product.sku || p.product.id);
      uploaded = urls;
      // All-or-nothing per product: a partly uploaded set is never attached.
      if (errors.length || urls.length !== chosen.length) throw new Error(errors.join(" ") || "Some images could not be uploaded.");
      const images = plannedImages(p, urls);
      const res = await fetch("/api/admin/products/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, expectedImages: p.expectedImages, images }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The product could not be updated (HTTP ${res.status}).`);
      setRow(id, { state: "done", newImages: images, at: new Date().toISOString() });
    } catch (error) {
      await discard(uploaded); // compensation: remove objects that are not attached to any product
      setRow(id, { state: "failed", error: (error as Error).message, at: new Date().toISOString() });
    }
  };

  const run = async (only: ProductPlan[]) => {
    if (runningRef.current || !config?.enabled || only.length === 0) return;
    runningRef.current = true;
    setRunning(true);
    const queue = [...only];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await processProduct(next);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    runningRef.current = false;
    setRunning(false);
  };

  const start = () => {
    const pending = toUpload.filter((p) => (results[p.product.id]?.state ?? "pending") === "pending");
    if (!pending.length || !plan) return;
    setFrozenPlan(plan);
    // Backup first: the current images of every product this run may change.
    download(
      `halima-image-backup-${stamp()}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), products: pending.map((p) => ({ id: p.product.id, sku: p.product.sku, model: p.product.model, images: p.expectedImages })) }, null, 2),
      "application/json"
    );
    run(pending);
  };
  const retryFailed = () => run(toUpload.filter((p) => results[p.product.id]?.state === "failed"));

  const manifestRows = () =>
    (plan?.products ?? []).map((p) => {
      const r = results[p.product.id];
      return {
        productId: p.product.id, sku: p.product.sku ?? "", model: p.product.model ?? "", name: p.product.name,
        files: p.fileIndexes.map((i) => files[i]?.name).join(" | "),
        action: p.action, status: p.action === "skip" ? "skipped" : r?.state ?? "pending",
        reason: p.reason ?? r?.error ?? "", previousImages: p.expectedImages, newImages: r?.newImages ?? [], at: r?.at ?? "",
      };
    }).concat(
      (plan?.files ?? []).filter((f) => !f.productId).map((f) => ({
        productId: "", sku: "", model: "", name: "", files: f.file.name, action: "skip" as const, status: "skipped",
        reason: `${PROBLEM_LABELS[f.problem!]}: ${f.detail}`, previousImages: [], newImages: [], at: "",
      }))
    );
  const exportJson = () => download(`halima-image-manifest-${stamp()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), mode, rows: manifestRows() }, null, 2), "application/json");
  const exportCsv = () => {
    const rows = manifestRows();
    const head = ["productId", "sku", "model", "name", "files", "action", "status", "reason", "previousImages", "newImages", "at"];
    const body = rows.map((r) => head.map((h) => csvCell(Array.isArray(r[h as keyof typeof r]) ? (r[h as keyof typeof r] as string[]).join(" ") : r[h as keyof typeof r])).join(","));
    download(`halima-image-manifest-${stamp()}.csv`, [head.join(","), ...body].join("\n"), "text/csv");
  };

  const problems = plan?.files.filter((f) => f.problem) ?? [];
  const badge = (p: ProductPlan) => {
    if (p.action === "skip") return <AdminBadge variant="warning">Skipped</AdminBadge>;
    const r = results[p.product.id];
    if (!r || r.state === "pending") return <AdminBadge variant="neutral">Pending</AdminBadge>;
    if (r.state === "uploading") return <AdminBadge variant="info">Uploading…</AdminBadge>;
    if (r.state === "done") return <AdminBadge variant="success">Done</AdminBadge>;
    return <AdminBadge variant="danger">Failed</AdminBadge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/products" className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Back to products">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Bulk Image Upload</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">
              Name each file after the product&apos;s SKU or model number (e.g. <code>SGR186E.jpg</code>, extra images <code>SGR186E-2.jpg</code>).
            </p>
          </div>
        </div>
      </div>

      {config && !config.enabled && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold flex gap-2">
          <AlertTriangle size={18} className="shrink-0" /> Image storage is not configured on this server, so images cannot be uploaded. You can still check the file matching below.
        </div>
      )}
      {loadError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold">{loadError}</div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 md:items-end">
          <label className="flex-1 text-xs font-bold text-slate-600 space-y-2">
            <span>Image files</span>
            <input
              id="bulk-image-files"
              type="file"
              multiple
              accept={BULK_INPUT_TYPES.join(", ")}
              disabled={running}
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []));
                resetRun();
              }}
              className="block w-full text-sm text-slate-700 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-slate-900 file:text-white file:font-bold"
            />
          </label>
          <label className="text-xs font-bold text-slate-600 space-y-2">
            <span>Products that already have images</span>
            <select
              value={mode}
              disabled={running}
              onChange={(e) => {
                setMode(e.target.value as BulkMode);
                resetRun();
              }}
              className="block bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800"
            >
              {Object.entries(MODE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              resetRun();
              loadProducts();
            }}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} /> Reload products
          </button>
        </div>

        {plan && files.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs font-bold" data-testid="bulk-summary">
            <AdminBadge variant="neutral">{plan.summary.files} files</AdminBadge>
            <AdminBadge variant="success">{plan.summary.productsToUpdate} products to update</AdminBadge>
            <AdminBadge variant="warning">{plan.summary.productsSkipped} products skipped</AdminBadge>
            <AdminBadge variant={plan.summary.problemFiles ? "danger" : "neutral"}>{plan.summary.problemFiles} files with problems</AdminBadge>
            {toUpload.length > 0 && (
              <>
                <AdminBadge variant="success">{counts.done} done</AdminBadge>
                <AdminBadge variant={counts.failed ? "danger" : "neutral"}>{counts.failed} failed</AdminBadge>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={start}
            disabled={running || !config?.enabled || counts.pending === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm rounded-xl disabled:opacity-50"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {running ? "Uploading…" : `Start upload (${counts.pending})`}
          </button>
          <button
            type="button"
            onClick={retryFailed}
            disabled={running || counts.failed === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} /> Retry failed ({counts.failed})
          </button>
          <button type="button" onClick={exportCsv} disabled={!plan || files.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 disabled:opacity-50">
            <Download size={16} /> Manifest CSV
          </button>
          <button type="button" onClick={exportJson} disabled={!plan || files.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 disabled:opacity-50">
            <Download size={16} /> Manifest JSON
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Nothing is uploaded or changed until you press Start upload. Starting downloads a backup of the current images of every product
          that will change. Products are uploaded {CONCURRENCY} at a time; each product is updated only if its images have not changed since
          this page loaded them.
        </p>
      </div>

      {plan && plan.products.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-x-auto">
          <table className="w-full text-sm" data-testid="bulk-plan">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-3">Product</th>
                <th className="text-left p-3">Files</th>
                <th className="text-left p-3">Current</th>
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.products.map((p) => {
                const r = results[p.product.id];
                return (
                  <tr key={p.product.id} className="border-t border-slate-100 align-top" data-product-id={p.product.id}>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{p.product.name}</div>
                      <div className="text-xs text-slate-500">{p.product.brand} · Model {p.product.model} · SKU {p.product.sku}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {p.fileIndexes.map((i) => (
                          <figure key={i} className="w-16 text-[10px] text-slate-500">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbs[i]} alt={files[i]?.name} className="w-16 h-16 object-contain border border-slate-200 rounded-lg bg-slate-50" />
                            <figcaption className="truncate">{files[i]?.name}</figcaption>
                          </figure>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-slate-600">{p.expectedImages.filter((i) => i !== "/featured/hisense-window-ac.png").length} image(s)</td>
                    <td className="p-3 text-xs">
                      <div className="font-bold">{ACTION_LABELS[p.action]}</div>
                      {p.reason && <div className="text-slate-500">{p.reason}</div>}
                    </td>
                    <td className="p-3 text-xs space-y-1">
                      {badge(p)}
                      {r?.state === "done" && <Check size={14} className="text-emerald-600" />}
                      {r?.error && <div className="text-rose-700">{r.error}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {problems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5" data-testid="bulk-problems">
          <h2 className="font-extrabold text-slate-900 mb-3 flex items-center gap-2"><X size={16} className="text-rose-600" /> Files that will not be used</h2>
          <ul className="space-y-1 text-sm">
            {problems.map((f) => (
              <li key={f.fileIndex}>
                <b>{f.file.name}</b> — {PROBLEM_LABELS[f.problem!]}: {f.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
          <ImagePlus size={40} className="mx-auto text-slate-300 mb-2" />
          Select image files to see which products they match. Nothing is changed until you start the upload.
        </div>
      )}
    </div>
  );
}
