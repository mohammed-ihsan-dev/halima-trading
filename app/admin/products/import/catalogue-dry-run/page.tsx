"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Database,
  Download,
  FileJson,
  Loader2,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminPagination from "@/components/admin/AdminPagination";
import type { DryRunGroup, DryRunReport, DryRunRow } from "@/lib/catalogue-dry-run";

const ROWS_PER_PAGE = 50;
const MAX_BYTES = 4 * 1024 * 1024;

const GROUPS: { key: DryRunGroup; label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }[] = [
  { key: "SAFE_TO_IMPORT", label: "Safe to import", variant: "success" },
  { key: "SKIP_SKU_EXISTS", label: "Skip — SKU exists", variant: "warning" },
  { key: "SKIP_SLUG_EXISTS", label: "Skip — slug exists", variant: "warning" },
  { key: "SKIP_SKU_AND_SLUG_EXIST", label: "Skip — SKU and slug exist", variant: "warning" },
  { key: "SKIP_DUPLICATE_IN_FILE", label: "Skip — duplicate in file", variant: "danger" },
  { key: "INVALID", label: "Invalid", variant: "danger" },
];
const groupMeta = (g: DryRunGroup) => GROUPS.find((x) => x.key === g)!;

function conflictIds(row: DryRunRow): string {
  return [...new Set(row.conflicts.map((c) => c.existing.id || c.existing.sku || c.existing.slug))].join(" | ");
}

// Spreadsheet apps execute cells starting with these characters; prefix them so the export is inert.
const csvCell = (value: string | number) => {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CatalogueDryRunPage() {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<DryRunGroup | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const choose = (picked?: File | null) => {
    setReport(null);
    setError("");
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(".json")) return setError("Please choose a .json file.");
    if (picked.size > MAX_BYTES) return setError("The file is larger than 4 MB.");
    setFile(picked);
  };

  const run = async () => {
    if (!file) return;
    setRunning(true);
    setError("");
    setReport(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/admin/products/import/catalogue-dry-run", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.report) {
        setError(data.error || `The dry run failed (HTTP ${res.status}).`);
      } else {
        setReport(data.report);
        setGroup("ALL");
        setQuery("");
        setPage(1);
      }
    } catch {
      setError("Network error — the dry run did not complete.");
    } finally {
      setRunning(false);
    }
  };

  const rows = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    return report.rows.filter(
      (r) =>
        (group === "ALL" || r.group === group) &&
        (!q || [r.name, r.model, r.sku, r.slug, r.brand, r.category, ...r.reasons].some((v) => v.toLowerCase().includes(q)))
    );
  }, [report, query, group]);
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pageRows = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const exportCsv = () => {
    if (!report) return;
    const header = ["Record", "Name", "Model", "SKU", "Slug", "Brand", "Category", "Status", "Reason", "Conflicting existing product", "Warnings"];
    const lines = report.rows.map((r) =>
      [r.recordNumber, r.name, r.model, r.sku, r.slug, r.brand, r.category, groupMeta(r.group).label,
        r.reasons.join(" | "), conflictIds(r), r.warnings.join(" | ")].map(csvCell).join(",")
    );
    download(`dry-run-${report.fileName.replace(/\.json$/i, "")}.csv`, "text/csv;charset=utf-8",
      "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n"));
  };
  const exportJson = () => {
    if (!report) return;
    download(`dry-run-${report.fileName.replace(/\.json$/i, "")}.json`, "application/json", JSON.stringify(report, null, 2));
  };

  const s = report?.summary;

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm font-semibold text-slate-400 mb-1">
          <Link href="/admin/products" className="hover:text-slate-600">Products</Link>
          <ChevronRight size={14} className="text-slate-300" />
          <Link href="/admin/products/import" className="hover:text-slate-600">Bulk Import</Link>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="text-slate-900 font-bold">JSON catalogue dry run</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">JSON Catalogue Dry Run</h1>
        <p className="text-sm font-semibold text-slate-500 mt-1">
          Check a product catalogue JSON file against the live product database before anything is imported.
        </p>
      </div>

      <div role="note" className="rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-4 flex items-start gap-3">
        <ShieldCheck size={22} className="text-emerald-700 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm md:text-base font-black tracking-wide text-emerald-900">DRY RUN — NO DATABASE CHANGES</p>
          <p className="text-xs md:text-sm font-semibold text-emerald-800">
            This only reads the products collection. Nothing is inserted, updated or deleted. Importing will be a
            separate action that you confirm explicitly.
          </p>
        </div>
      </div>

      <section className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs space-y-4">
        <label
          htmlFor="catalogue-file"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!running) choose(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-red-500 text-center ${
            running ? "opacity-60 pointer-events-none" : "cursor-pointer"
          }`}
        >
          {file ? (
            <>
              <FileJson size={28} className="text-emerald-600" />
              <span className="text-sm font-extrabold text-slate-900 break-all">{file.name}</span>
              <span className="text-[11px] text-slate-500 font-medium">
                {(file.size / 1024).toFixed(1)} KB{s ? ` · ${s.totalRecords.toLocaleString()} records` : ""} · click or drop to replace
              </span>
            </>
          ) : (
            <>
              <Upload size={26} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-600">Drop a catalogue .json file here, or click to browse</span>
              <span className="text-[11px] text-slate-400 font-medium">
                A JSON array of products, or an object with a &quot;products&quot; array · up to 4 MB
              </span>
            </>
          )}
        </label>
        <input id="catalogue-file" type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={run}
            disabled={!file || running}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-extrabold text-xs md:text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
            {running ? "Checking against the database…" : "Run dry run"}
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs md:text-sm font-semibold flex items-start gap-2">
          <AlertCircle size={18} className="text-rose-600 shrink-0 mt-px" />
          <span>{error} No result is shown because the check did not complete.</span>
        </div>
      )}

      {report && s && (
        <>
          <section className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs space-y-3">
            <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">Database check</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs md:text-sm">
              {[
                ["Collection checked", `${report.database.name}.${report.database.collection}`],
                ["Existing products", report.database.existingCountBefore.toLocaleString()],
                ["Count before → after", `${report.database.existingCountBefore} → ${report.database.existingCountAfter}`],
                ["Content fingerprint", report.database.unchanged ? `Unchanged (${report.database.fingerprintAfter})` : "CHANGED"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{k}</dt>
                  <dd className="font-black text-slate-900 break-all">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] md:text-xs text-slate-500 font-medium">
              {s.conflictsWithExisting.toLocaleString()} incoming record(s) conflict with existing products · checked{" "}
              {new Date(report.generatedAt).toLocaleString()} in {report.durationMs} ms · {report.fileName}
            </p>
            {report.fileWarnings.map((w) => (
              <p key={w} className="text-xs font-semibold text-amber-700 flex items-start gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-px" /> {w}
              </p>
            ))}
          </section>

          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              ["Total records", s.totalRecords, "text-slate-900"],
              ["Passed validation", s.validated, "text-slate-900"],
              ["Safe to import", s.safeToImport, "text-emerald-700"],
              ["SKU exists", s.skipSkuExists, "text-amber-700"],
              ["Slug exists", s.skipSlugExists, "text-amber-700"],
              ["SKU and slug exist", s.skipSkuAndSlugExist, "text-amber-700"],
              ["Duplicate in file", s.duplicatesInFile, "text-rose-700"],
              ["Invalid", s.invalid, "text-rose-700"],
              ["Records with warnings", s.recordsWithWarnings, "text-amber-700"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <span className={`block text-xl md:text-2xl font-black ${color}`}>{Number(value).toLocaleString()}</span>
              </div>
            ))}
          </section>

          {report.issueBreakdown.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <h2 className="px-5 pt-5 text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">Issues by type</h2>
              <ul className="p-5 space-y-1.5 text-xs md:text-sm">
                {report.issueBreakdown.slice(0, 25).map((i) => (
                  <li key={`${i.kind}${i.message}`} className="flex items-start gap-3">
                    <span className={`shrink-0 w-14 text-right font-black ${i.kind === "error" ? "text-rose-700" : "text-amber-700"}`}>
                      {i.count.toLocaleString()}×
                    </span>
                    <span className={`font-semibold break-words min-w-0 ${i.kind === "error" ? "text-rose-800" : "text-slate-700"}`}>
                      {i.kind === "error" ? "✕" : "⚠"} {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden min-w-0">
            <div className="p-3 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder="Search name, model, SKU, slug, brand, reason…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs md:text-sm font-semibold focus:outline-hidden focus:border-red-500"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-extrabold text-slate-800 cursor-pointer">
                  <Download size={14} /> CSV
                </button>
                <button type="button" onClick={exportJson} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-extrabold text-slate-800 cursor-pointer">
                  <Download size={14} /> JSON
                </button>
              </div>
            </div>
            <div className="flex gap-1.5 p-3 border-b border-slate-100 overflow-x-auto">
              {[{ key: "ALL" as const, label: "All", count: s.totalRecords },
                ...GROUPS.map((g) => ({ key: g.key, label: g.label, count: report.rows.filter((r) => r.group === g.key).length }))]
                .filter((t) => t.key === "ALL" || t.count > 0)
                .map((t) => (
                  <button key={t.key} type="button" onClick={() => { setGroup(t.key); setPage(1); }}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                      group === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {t.label} <span className="opacity-70">{t.count.toLocaleString()}</span>
                  </button>
                ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {["#", "Product", "Model", "SKU", "Slug", "Brand", "Category", "Status", "Reason", "Existing product"].map((h) => (
                      <th key={h} className="px-3 py-3 font-extrabold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => (
                    <tr key={r.recordNumber} className="align-top">
                      <td className="px-3 py-2.5 font-mono text-slate-400">{r.recordNumber}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 max-w-[220px] break-words">{r.name || "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-700 break-all">{r.model || "—"}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-800 break-all">{r.sku || "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 max-w-[200px] break-all">{r.slug || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.brand || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.category || "—"}</td>
                      <td className="px-3 py-2.5"><AdminBadge variant={groupMeta(r.group).variant}>{groupMeta(r.group).label}</AdminBadge></td>
                      <td className="px-3 py-2.5 max-w-[320px] space-y-1">
                        {r.reasons.map((m) => (
                          <p key={m} className={`break-words font-semibold ${r.group === "SAFE_TO_IMPORT" ? "text-slate-500" : "text-rose-700"}`}>{m}</p>
                        ))}
                        {r.warnings.map((w) => <p key={w} className="break-words text-amber-700 font-medium">⚠ {w}</p>)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 break-all">{conflictIds(r) || "—"}</td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400 font-semibold">No records match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {rows.length > ROWS_PER_PAGE && (
              <div className="p-3 border-t border-slate-100">
                <AdminPagination currentPage={page} totalPages={totalPages} onPageChange={setPage}
                  totalItems={rows.length} itemsPerPage={ROWS_PER_PAGE} itemLabel="records" />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
