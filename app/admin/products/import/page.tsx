"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminPagination from "@/components/admin/AdminPagination";
import type { ImportResult, ImportRowResult, ImportSummary, RowStatus } from "@/lib/product-import";

const ROWS_PER_PAGE = 50;
const MAX_BYTES = 4 * 1024 * 1024;

interface Preview {
  fileName: string;
  ignoredHeaders: string[];
  summary: ImportSummary;
  rows: ImportRowResult[];
}

type Phase = "idle" | "validating" | "preview" | "importing" | "done";
type Filter = "all" | "problems" | RowStatus;

const STATUS_META: Record<RowStatus, { label: string; variant: "success" | "info" | "neutral" | "warning" | "danger" }> = {
  new: { label: "New", variant: "success" },
  skipped: { label: "Skipped", variant: "warning" },
  duplicate: { label: "Duplicate", variant: "danger" },
  error: { label: "Error", variant: "danger" },
};

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

export default function AdminBulkImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [allowNewBrands, setAllowNewBrands] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  // Any change to the inputs makes an existing preview stale.
  const resetPreview = () => {
    setPreview(null);
    setResult(null);
    setError("");
    setPhase("idle");
    setFilter("all");
    setPage(1);
  };

  const chooseFile = (picked: File | null | undefined) => {
    resetPreview();
    if (!picked) return;
    const name = picked.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      setFile(null);
      setError("Please upload a CSV or Excel (.xlsx) file.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFile(null);
      setError("The file is larger than 4 MB. Split it into smaller files.");
      return;
    }
    setFile(picked);
  };

  const send = async (action: "preview" | "import") => {
    if (!file) return;
    setError("");
    setPhase(action === "preview" ? "validating" : "importing");
    const body = new FormData();
    body.append("file", file);
    body.append("action", action);
    body.append("allowNewBrands", String(allowNewBrands));

    try {
      const res = await fetch("/api/admin/products/import", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!data.preview) {
        setError(data.error || "The server could not process this file.");
        setPhase(action === "import" && preview ? "preview" : "idle");
        return;
      }
      setPreview(data.preview);
      setPage(1);
      if (action === "import") {
        setResult(data.result);
        setFilter(data.result?.failed?.length ? "problems" : "all");
        setPhase("done");
      } else {
        setFilter(data.preview.summary.errors + data.preview.summary.duplicates > 0 ? "problems" : "all");
        setPhase("preview");
      }
    } catch {
      setError(
        action === "import"
          ? "Lost connection during the import. Some products may have been saved — check the product list. Uploading the same file again is safe."
          : "Network error while validating the file."
      );
      setPhase(action === "import" && preview ? "preview" : "idle");
    }
  };

  const summary = preview?.summary;
  const willImport = summary ? summary.toCreate : 0;
  const notImported = summary ? summary.errors + summary.duplicates + summary.skippedExisting : 0;
  const failedRows = useMemo(() => new Map(result?.failed.map((f) => [f.rowNumber, f.message]) ?? []), [result]);

  const visibleRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    if (filter === "all") return rows;
    if (filter === "problems") {
      return rows.filter((r) => r.status === "error" || r.status === "duplicate" || failedRows.has(r.rowNumber));
    }
    return rows.filter((r) => r.status === filter);
  }, [preview, filter, failedRows]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / ROWS_PER_PAGE));
  const pageRows = visibleRows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
  const busy = phase === "validating" || phase === "importing";

  const tabs: { key: Filter; label: string; count: number }[] = summary
    ? ([
        { key: "all", label: "All rows", count: summary.totalRows },
        { key: "problems", label: "Problems", count: summary.errors + summary.duplicates + (result?.failed.length ?? 0) },
        { key: "new", label: "New", count: summary.toCreate },
        { key: "skipped", label: "Skipped", count: summary.skippedExisting },
      ] as { key: Filter; label: string; count: number }[]).filter((t) => t.key === "all" || t.count > 0)
    : [];

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-400 mb-1">
          <Link href="/admin/products" className="hover:text-slate-600">
            Products
          </Link>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="text-slate-900 font-bold">Bulk Import</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Bulk Import Products</h1>
        <p className="text-sm font-semibold text-slate-500 mt-1">
          Import multiple products using CSV or Excel. Have a JSON catalogue?{" "}
          <Link href="/admin/products/import/catalogue-dry-run" className="text-red-600 hover:underline">
            Run a read-only dry run
          </Link>
          .
        </p>
      </div>

      {/* 1 — Template */}
      <section className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">
              1 · Download template
            </h2>
            <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">
              Columns match the Add Product form. Red headers are required. The Excel template includes category and
              brand lists. Delete the two grey example rows before uploading.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <a
              href="/api/admin/products/import/template?format=xlsx"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-black text-white font-extrabold text-xs md:text-sm rounded-xl transition-colors"
            >
              <Download size={16} /> Excel template
            </a>
            <a
              href="/api/admin/products/import/template?format=csv"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-extrabold text-xs md:text-sm rounded-xl transition-colors"
            >
              <Download size={16} /> CSV template
            </a>
          </div>
        </div>
      </section>

      {/* 2 — Upload & options */}
      {phase !== "done" && (
        <section className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs space-y-5">
          <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">2 · Upload file</h2>

          <label
            htmlFor="import-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) chooseFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center justify-center gap-2 p-6 md:p-8 rounded-xl border-2 border-dashed text-center transition-all ${
              busy ? "opacity-60 pointer-events-none" : "cursor-pointer"
            } ${
              dragging
                ? "border-red-500 bg-red-50/40 text-red-600"
                : "border-slate-300 bg-slate-50 hover:border-red-500 hover:bg-red-50/20 text-slate-600"
            }`}
          >
            {file ? (
              <>
                <FileSpreadsheet size={28} className="text-emerald-600" />
                <span className="text-sm font-extrabold text-slate-900 break-all">{file.name}</span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {(file.size / 1024).toFixed(1)} KB
                  {summary ? ` · ${plural(summary.totalRows, "product row")} detected` : ""} · click or drop to replace
                </span>
              </>
            ) : (
              <>
                <Upload size={26} className="text-slate-400" />
                <span className="text-sm font-bold">Drop a file here, or click to browse</span>
                <span className="text-[11px] text-slate-400 font-medium">CSV or Excel (.xlsx) · up to 4 MB · up to 2,000 products</span>
              </>
            )}
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              chooseFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Import mode</span>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="block text-xs md:text-sm font-extrabold text-slate-900">Create new products only</span>
                <span className="block text-[11px] md:text-xs text-slate-500 font-medium">
                  Rows whose SKU already exists are skipped and reported. Existing products are never updated, replaced or
                  merged by an import — use Edit Product to change them.
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Brands</span>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowNewBrands}
                  disabled={busy}
                  onChange={(e) => {
                    setAllowNewBrands(e.target.checked);
                    resetPreview();
                  }}
                  className="mt-0.5 accent-red-600"
                />
                <span className="min-w-0">
                  <span className="block text-xs md:text-sm font-extrabold text-slate-900">Allow new brands</span>
                  <span className="block text-[11px] md:text-xs text-slate-500 font-medium">
                    Off: a brand must match an existing one (Samsung, SAMSUNG and samsung all match “Samsung”). On: unknown
                    brands are added as written.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {phase !== "preview" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => send("preview")}
                disabled={!file || busy}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm shadow-md shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {phase === "validating" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {phase === "validating" ? "Reading & validating file…" : "Validate & preview"}
              </button>
            </div>
          )}
        </section>
      )}

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs md:text-sm font-semibold flex items-start gap-2">
          <AlertCircle size={18} className="text-rose-600 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {/* 5 — Result */}
      {phase === "done" && result && summary && (
        <section
          className={`rounded-2xl p-5 md:p-6 border shadow-2xs space-y-4 ${
            result.failed.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
          }`}
        >
          <div className="flex items-start gap-3">
            {result.failed.length ? (
              <AlertTriangle size={22} className="text-amber-600 shrink-0" />
            ) : (
              <Check size={22} className="text-emerald-600 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-black text-slate-900">
                {result.failed.length ? "Import finished with problems" : "Import complete"}
              </h2>
              <p className="text-xs md:text-sm text-slate-600 font-medium break-all">{preview?.fileName}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Created", result.created],
              ["Skipped", summary.skippedExisting + summary.errors + summary.duplicates],
              ["Failed on save", result.failed.length],
              ["Total rows", summary.totalRows],
            ].map(([label, value]) => (
              <div key={label} className="bg-white/80 rounded-xl border border-white p-3">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <span className="block text-xl md:text-2xl font-black text-slate-900">{Number(value).toLocaleString()}</span>
              </div>
            ))}
          </div>
          {summary.errors + summary.duplicates > 0 && (
            <p className="text-xs md:text-sm font-semibold text-slate-700">
              {plural(summary.errors, "row")} with errors and {plural(summary.duplicates, "duplicate row")} were not imported.
              Fix them in your file and upload it again — products already imported will be skipped, not duplicated.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/products"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm shadow-md shadow-red-600/30"
            >
              View products
            </Link>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                resetPreview();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-xs md:text-sm cursor-pointer"
            >
              <RefreshCw size={15} /> Import another file
            </button>
          </div>
        </section>
      )}

      {/* 3 & 4 — Preview + confirm */}
      {preview && summary && (
        <>
          {phase !== "done" && (
            <section className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs space-y-4">
              <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">3 · Import preview</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  ["Total rows", summary.totalRows, "text-slate-900"],
                  ["New", summary.toCreate, "text-emerald-700"],
                  ["Skipped", summary.skippedExisting, "text-amber-700"],
                  ["Errors", summary.errors, "text-rose-700"],
                  ["Duplicates", summary.duplicates, "text-rose-700"],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                    <span className={`block text-xl md:text-2xl font-black ${color}`}>{Number(value).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {preview.ignoredHeaders.length > 0 && (
                <p className="text-[11px] md:text-xs font-semibold text-amber-700 flex items-start gap-1.5">
                  <AlertTriangle size={14} className="shrink-0 mt-px" />
                  Ignored unknown columns: {preview.ignoredHeaders.join(", ")}
                </p>
              )}
            </section>
          )}

          {phase !== "done" && (
            <section className="bg-white rounded-2xl p-5 md:p-6 border-2 border-slate-900/90 shadow-2xs space-y-4">
              <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">4 · Confirm</h2>
              {willImport > 0 ? (
                <ul className="text-xs md:text-sm font-semibold text-slate-700 space-y-1">
                  <li className="text-base md:text-lg font-black text-slate-900">
                    You are about to import {plural(willImport, "product")}.
                  </li>
                  <li>{plural(summary.toCreate, "new product")} will be created.</li>
                  <li>No existing product will be changed.</li>
                  {notImported > 0 && (
                    <li className="text-rose-700">
                      {plural(notImported, "row")} will not be imported because they contain errors, duplicates
                      {summary.skippedExisting ? " or existing SKUs" : ""}.
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-xs md:text-sm font-semibold text-slate-700">
                  Nothing to import — fix the problems below and upload the file again.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    resetPreview();
                  }}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs md:text-sm cursor-pointer disabled:opacity-50"
                >
                  <X size={15} /> Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || willImport === 0}
                  onClick={() => send("import")}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm shadow-md shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {phase === "importing" && <Loader2 size={16} className="animate-spin" />}
                  {phase === "importing" ? "Importing products…" : `Confirm import of ${plural(willImport, "product")}`}
                </button>
              </div>
            </section>
          )}

          {/* Row table */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden min-w-0">
            <div className="flex gap-1.5 p-3 border-b border-slate-100 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setFilter(t.key);
                    setPage(1);
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                    filter === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t.label} <span className="opacity-70">{t.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs md:text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-extrabold w-16">Row</th>
                    <th className="px-4 py-3 font-extrabold w-28">Status</th>
                    <th className="px-4 py-3 font-extrabold w-40">SKU</th>
                    <th className="px-4 py-3 font-extrabold">Product</th>
                    <th className="px-4 py-3 font-extrabold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => {
                    const saveError = failedRows.get(r.rowNumber);
                    const meta = saveError ? { label: "Failed", variant: "danger" as const } : STATUS_META[r.status];
                    return (
                      <tr key={r.rowNumber} className="align-top">
                        <td className="px-4 py-3 font-mono text-slate-500">{r.rowNumber}</td>
                        <td className="px-4 py-3">
                          <AdminBadge variant={meta.variant}>{meta.label}</AdminBadge>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-800 break-all">{r.sku || "—"}</td>
                        <td className="px-4 py-3 font-bold text-slate-900 break-words">{r.name || "—"}</td>
                        <td className="px-4 py-3 space-y-1">
                          {saveError && <p className="text-rose-700 font-semibold">✕ {saveError}</p>}
                          {r.errors.map((e) => (
                            <p key={e} className="text-rose-700 font-semibold break-words">✕ {e}</p>
                          ))}
                          {r.warnings.map((w) => (
                            <p key={w} className="text-amber-700 font-medium break-words">⚠ {w}</p>
                          ))}
                          {!saveError && !r.errors.length && !r.warnings.length && (
                            <p className="text-slate-400">Ready</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-semibold">
                        No rows in this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {visibleRows.length > ROWS_PER_PAGE && (
              <div className="p-3 border-t border-slate-100">
                <AdminPagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  totalItems={visibleRows.length}
                  itemsPerPage={ROWS_PER_PAGE}
                  itemLabel="rows"
                />
              </div>
            )}
          </section>
        </>
      )}

      {phase === "idle" && !preview && (
        <p className="text-[11px] md:text-xs text-slate-400 font-medium flex items-center gap-1.5">
          <Info size={13} /> Nothing is written to the database until you review the preview and confirm.
        </p>
      )}
    </div>
  );
}
