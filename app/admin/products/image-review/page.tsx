"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, ImagePlus, Loader2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import { fetchUploadConfig, uploadImagesToStorage, type UploadConfig } from "@/lib/admin-image-upload";
import type { AuthorizationEvidence, AuthorizationType, ReviewRecord, ReviewState } from "@/lib/product-image-review";

const PLACEHOLDER = "/featured/hisense-window-ac.png";
const STATE_LABELS: Record<ReviewState, string> = {
  discovered: "Discovered", needs_manual_verification: "Needs manual verification", needs_manual_source: "Needs manual source",
  pending_review: "Pending review", approved: "Approved", rejected: "Rejected", uploaded: "Uploaded",
};
const STATE_VARIANT: Record<ReviewState, "neutral" | "warning" | "danger" | "info" | "success" | "primary"> = {
  discovered: "neutral", needs_manual_verification: "warning", needs_manual_source: "danger", pending_review: "info", approved: "success", rejected: "neutral", uploaded: "success",
};
const AUTH_LABELS: Record<AuthorizationType, string> = {
  written_permission: "Written permission (brand / distributor)", documented_licence: "Documented licence", client_supplied: "Supplied by the client", own_photography: "Own photography",
};
const FILTERS: { label: string; states: ReviewState[] }[] = [
  { label: "Open", states: ["pending_review", "needs_manual_verification", "discovered"] },
  { label: "Needs source", states: ["needs_manual_source"] },
  { label: "Approved", states: ["approved"] },
  { label: "Uploaded", states: ["uploaded"] },
  { label: "Rejected", states: ["rejected"] },
];

interface ProductFacts { id: string; name: string; brand: string; model: string; sku?: string; category?: string; status?: string; images?: string[] }
interface Group { productId: string; product: ProductFacts | null; reviews: ReviewRecord[] }

const safeSrc = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);
const localSrc = (p?: string) => (p ? `/api/admin/product-image-reviews/preview?path=${encodeURIComponent(p)}` : undefined);
const emptyAuth = (type: AuthorizationType = "written_permission"): AuthorizationEvidence => ({ type, grantedBy: "", reference: "", conditionsMet: false });

function AuthorizationFields({ value, onChange }: { value: AuthorizationEvidence; onChange: (a: AuthorizationEvidence) => void }) {
  const input = "w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs";
  return (
    <div className="space-y-2">
      <select className={input} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as AuthorizationType })}>
        {Object.entries(AUTH_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input className={input} placeholder="Granted by (company / person / licence)" value={value.grantedBy} onChange={(e) => onChange({ ...value, grantedBy: e.target.value })} />
      <input className={input} placeholder="Evidence (email reference, document path or licence URL)" value={value.reference} onChange={(e) => onChange({ ...value, reference: e.target.value })} />
      {value.type === "documented_licence" && (
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={value.conditionsMet === true} onChange={(e) => onChange({ ...value, conditionsMet: e.target.checked })} />
          The licence conditions are implemented on the live site
        </label>
      )}
    </div>
  );
}

function CandidateCard({ review, onAction, busy }: { review: ReviewRecord; onAction: (body: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const c = review.candidate;
  const [mode, setMode] = useState<"" | "approve" | "reject">("");
  const [exact, setExact] = useState(false);
  const [auth, setAuth] = useState<AuthorizationEvidence>(review.authorization ?? emptyAuth(c.sourceType === "client_supplied" ? "client_supplied" : "written_permission"));
  const [reason, setReason] = useState("");
  const open = ["discovered", "pending_review", "needs_manual_verification"].includes(review.state);
  const base = { reviewId: review.reviewId, expectedVersion: review.version };
  const src = safeSrc(c.storageUrl ?? c.url) ?? localSrc(c.localPreview);
  const cat = c.catalogue;
  const ai = c.aiAssessment;

  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white" data-review-id={review.reviewId}>
      <div className="flex items-start gap-3">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" referrerPolicy="no-referrer" className="w-28 h-28 object-contain border border-slate-200 rounded-lg bg-slate-50 shrink-0" />
        ) : (
          <div className="w-28 h-28 border border-dashed border-slate-300 rounded-lg grid place-items-center text-[10px] text-slate-400 shrink-0">no image</div>
        )}
        <div className="text-xs space-y-1 min-w-0">
          <div className="flex flex-wrap gap-1">
            <AdminBadge variant={STATE_VARIANT[review.state]}>{STATE_LABELS[review.state]}</AdminBadge>
            {c.sourceType && <AdminBadge variant={c.sourceType === "manufacturer" ? "success" : c.sourceType === "other" ? "warning" : "info"}>{c.sourceType.replace(/_/g, " ")}</AdminBadge>}
            {c.permissionStatus && <AdminBadge variant={c.permissionStatus === "confirmed" || c.permissionStatus === "client_supplied" ? "success" : c.permissionStatus === "permission_denied" ? "danger" : "warning"}>{c.permissionStatus.replace(/_/g, " ")}</AdminBadge>}
          </div>
          {c.sourcePage && /^https:\/\//.test(c.sourcePage) ? (
            <a href={c.sourcePage} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-1 break-all"><ExternalLink size={12} /> {c.sourcePage.slice(0, 90)}</a>
          ) : c.sourcePage ? <div className="text-slate-600 break-all">{c.sourcePage}</div> : null}
          {c.title && <div className="text-slate-500 truncate">“{c.title}”</div>}
          <div className="text-slate-600">
            {c.width && c.height ? `${c.width}×${c.height}` : "size unknown"}{c.format ? ` · ${c.format}` : ""} ·{" "}
            {c.technicallyValid === false ? <span className="text-rose-700">invalid: {c.technicalIssue}</span> : c.technicallyValid ? <span className="text-emerald-700">file valid</span> : "not checked"}
          </div>
          {c.modelEvidence && <div className="text-slate-700"><b>Model:</b> {c.modelEvidence}</div>}
          {cat && (
            <div className="text-slate-700 space-y-0.5" data-testid="catalogue-evidence">
              <div><b>Catalogue:</b> {cat.pdf} · page {cat.page} · printed “{cat.evidenceText}” ({cat.matchLevel.toLowerCase().replace(/_/g, " ")})</div>
              <div>
                <b>Match:</b>{" "}
                <span className={cat.identity === "EXACT_UNAMBIGUOUS" ? "text-emerald-700" : "text-amber-700"}>{cat.identity.toLowerCase().replace(/_/g, " ")}</span>
                {cat.rowModels.length > 1 && <> · heading row: {cat.rowModels.join(", ")}</>} · image quality: {cat.quality.toLowerCase().replace(/_/g, " ")}
                {cat.nativeLongestPx ? ` (${cat.nativeLongestPx} px)` : ""}
              </div>
              {cat.issues.length > 0 && <div className="text-amber-700">{cat.issues.join(" · ")}</div>}
            </div>
          )}
          {c.permissionReason && <div className="text-slate-700"><b>Authorization:</b> {c.permissionReason}</div>}
          {(c.licenceEvidence ?? []).slice(0, 3).map((e, i) => (
            <div key={i} className="text-slate-500 break-all">· {e.url ?? e.document}{e.quote ? ` — “${e.quote.slice(0, 140)}”` : e.finding ? ` — ${e.finding}` : ""}</div>
          ))}
          {ai && (
            <div className="text-slate-600">
              <b>AI (advisory only):</b> {ai.error ? ai.error : `${ai.score ?? "–"}/100 — ${ai.summary ?? ""}`}
              {(ai.issues ?? []).length > 0 && <span className="text-amber-700"> · {(ai.issues ?? []).join("; ")}</span>}
            </div>
          )}
          {(c.checks ?? []).map((x, i) => <div key={i} className="text-slate-500">· {x}</div>)}
          {review.authorization && review.state !== "pending_review" && (
            <div className="text-emerald-800"><ShieldCheck size={12} className="inline" /> {AUTH_LABELS[review.authorization.type]} — {review.authorization.grantedBy} ({review.authorization.reference})</div>
          )}
          {review.rejectionReason && <div className="text-rose-700">Rejected: {review.rejectionReason}</div>}
          {review.decidedBy && <div className="text-slate-400">Decided by {review.decidedBy} · {review.decidedAt?.slice(0, 16).replace("T", " ")}</div>}
        </div>
      </div>

      {c.pagePreview && (
        <a href={localSrc(c.pagePreview)} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-slate-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={localSrc(c.pagePreview)} alt="Catalogue page with the crop outlined" className="w-full max-h-72 object-contain border border-slate-200 rounded-lg bg-slate-50" />
          Catalogue page {cat?.page}: crop outlined in orange, model code in green (opens full size)
        </a>
      )}

      {open && mode === "" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !src} onClick={() => setMode("approve")} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"><Check size={14} /> Approve…</button>
          <button type="button" disabled={busy} onClick={() => setMode("reject")} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg"><X size={14} /> Reject…</button>
          {review.state !== "needs_manual_verification" && (
            <button type="button" disabled={busy} onClick={() => onAction({ ...base, action: "needs_manual_verification" })} className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg">Mark for manual review</button>
          )}
        </div>
      )}
      {review.state === "approved" && (
        <button type="button" disabled={busy} onClick={() => setMode("reject")} className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg">Withdraw approval…</button>
      )}

      {mode === "approve" && (
        <div className="border-t border-slate-100 pt-2 space-y-2">
          <label className="flex items-start gap-2 text-xs font-bold text-slate-800">
            <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} />
            I checked that this image shows exactly {review.product?.brand} {review.product?.model} (not a similar model or a series photo).
          </label>
          <AuthorizationFields value={auth} onChange={setAuth} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !exact} onClick={async () => { if (await onAction({ ...base, action: "approve", exactModelConfirmed: exact, authorization: auth })) setMode(""); }} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg disabled:opacity-50">Confirm approval</button>
            <button type="button" onClick={() => setMode("")} className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg">Cancel</button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <div className="border-t border-slate-100 pt-2 space-y-2">
          <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" placeholder="Reason (e.g. different model, watermark, no permission)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !reason.trim()} onClick={async () => { if (await onAction({ ...base, action: "reject", reason })) setMode(""); }} className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg disabled:opacity-50">Confirm rejection</button>
            <button type="button" onClick={() => setMode("")} className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientImageForm({ group, config, onDone }: { group: Group; config: UploadConfig | null; onDone: (msg: string, ok: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [auth, setAuth] = useState<AuthorizationEvidence>(emptyAuth("client_supplied"));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!file || !config?.enabled) return;
    setBusy(true);
    try {
      const up = await uploadImagesToStorage([file], config, group.product?.sku || group.productId);
      if (!up.urls.length) return onDone(up.errors.join(" ") || "Upload failed.", false);
      const res = await fetch("/api/admin/product-image-reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "client_image", productId: group.productId, storageUrl: up.urls[0], authorization: auth }),
      });
      const data = await res.json().catch(() => ({}));
      onDone(res.ok ? "Client image added for review. It still needs an approval." : data.error || "Could not record the image.", res.ok);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-3 space-y-2 text-xs">
      <div className="font-bold text-slate-800">Upload a client-supplied, authorized image</div>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-xs" />
      <AuthorizationFields value={auth} onChange={setAuth} />
      <button type="button" disabled={busy || !file || !config?.enabled || !auth.grantedBy.trim() || !auth.reference.trim()} onClick={submit} className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white font-bold rounded-lg disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Upload for review
      </button>
      {!config?.enabled && <div className="text-amber-700">Image storage uploads are not configured.</div>}
      <div className="text-slate-500">The file is stored but not added to the product. It is linked only after approval, by the backed-up apply step.</div>
    </div>
  );
}

export default function ImageReviewPage() {
  const [filter, setFilter] = useState(0);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch(`/api/admin/product-image-reviews?state=${FILTERS[filter].states.join(",")}`, { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not load the review queue.");
          setError("");
          setGroups(data.groups);
          setCounts(data.counts ?? {});
        })
        .catch((e) => setError((e as Error).message)),
    [filter]
  );

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchUploadConfig().then(setConfig); }, []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/product-image-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setNotice({ msg: res.ok ? "Saved." : data.error || "Action failed.", ok: res.ok });
      await load();
      return res.ok;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/products" className="text-xs font-bold text-slate-500 inline-flex items-center gap-1 hover:text-slate-800"><ArrowLeft size={14} /> Products</Link>
          <h1 className="text-2xl font-extrabold text-slate-900">Image Review</h1>
          <p className="text-sm text-slate-500 max-w-3xl">
            Candidate product images found by the image pipeline. An image can be approved only when you confirm it shows the exact model
            and record the commercial-use authorization. AI scores are advisory. Approving never publishes or changes the product — approved
            images are linked later by the backed-up apply step.
          </p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} /> Reload
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f, i) => (
          <button key={f.label} type="button" onClick={() => setFilter(i)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${i === filter ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"}`}>
            {f.label} ({f.states.reduce((s, st) => s + (counts[st] ?? 0), 0)})
          </button>
        ))}
      </div>

      {notice && <div className={`text-sm font-bold ${notice.ok ? "text-emerald-700" : "text-rose-700"}`}>{notice.msg}</div>}
      {error && <div className="text-sm font-bold text-rose-700">{error}</div>}
      {!groups && !error && <div className="text-sm text-slate-500 inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>}
      {groups?.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
          <Search size={40} className="mx-auto text-slate-300 mb-2" /> Nothing in this list. Candidates appear here after the pipeline&apos;s review-import step.
        </div>
      )}

      {groups?.map((g) => {
        const p = g.product;
        const current = (p?.images ?? []).find((i) => i !== PLACEHOLDER && /^https:\/\//.test(i));
        const snapshot = g.reviews[0]?.product;
        return (
          <div key={g.productId} className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3" data-product-id={g.productId}>
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div className="flex gap-3">
                {current ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current} alt="" referrerPolicy="no-referrer" className="w-16 h-16 object-contain border border-slate-200 rounded-lg bg-slate-50" />
                ) : <div className="w-16 h-16 border border-dashed border-slate-300 rounded-lg grid place-items-center text-[10px] text-slate-400">no image</div>}
                <div>
                  <div className="font-extrabold text-slate-900">{p?.name ?? snapshot?.name ?? g.productId}</div>
                  <div className="text-xs text-slate-500">
                    {p?.brand ?? snapshot?.brand} · Model {p?.model ?? snapshot?.model} · SKU {p?.sku ?? snapshot?.sku ?? "—"} · {p?.category ?? snapshot?.category ?? ""}
                  </div>
                  <div className="text-xs text-slate-500">Status: {p?.status ?? "active"} · current images: {(p?.images ?? []).filter((i) => i !== PLACEHOLDER).length}</div>
                  {!p && <div className="text-xs text-rose-700">Product no longer exists.</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => act({ action: "request_more", productId: g.productId })} className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg">Request more candidates</button>
                <button type="button" onClick={() => setUploadFor(uploadFor === g.productId ? null : g.productId)} className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg">Upload client image</button>
              </div>
            </div>
            {uploadFor === g.productId && (
              <ClientImageForm group={g} config={config} onDone={(msg, ok) => { setNotice({ msg, ok }); if (ok) { setUploadFor(null); load(); } }} />
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {g.reviews.map((r) => <CandidateCard key={`${r.reviewId}:${r.version}`} review={r} onAction={act} busy={busy} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
