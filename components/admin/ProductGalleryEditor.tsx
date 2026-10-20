"use client";

/**
 * Product gallery for Add / Edit Product: upload from the computer to image storage (Supabase or R2),
 * add by URL, set the primary image and remove images.
 *
 * `images` is the product's committed `images: string[]` (permanent URLs only — the display placeholder is
 * never an item). Every change goes through `onCommit`, which the Edit page persists immediately and the
 * Add page keeps until the product is created. Selected files show a local preview while they upload; that
 * temporary preview is never committed. A file that uploaded but could not be committed stays listed with a
 * "Retry saving" action, so it is never uploaded twice.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ImageIcon, Loader2, RefreshCw, Star, Trash2, Upload, X } from "lucide-react";
import { checkImageFile, fetchUploadConfig, uploadImagesToStorage, type UploadConfig } from "@/lib/admin-image-upload";
import { appendImages, makePrimary, permanentImageProblem, realImages, removeImage } from "@/lib/admin-gallery";

export type CommitResult = { ok: true; images: string[] } | { ok: false; error: string };

interface Props {
  images: string[];
  onCommit: (next: string[]) => Promise<CommitResult>;
  /** SKU or id used as the storage folder for uploads. */
  productRef?: string;
  inputId: string;
  /** Edit page: changes are saved to the product immediately. Add page: kept until the product is created. */
  autoSave: boolean;
  onBusyChange?: (busy: boolean) => void;
}

interface Pending { id: string; name: string; preview: string; error?: string }
type Item =
  | { kind: "saved"; key: string; src: string }
  | { kind: "unsaved"; key: string; src: string }
  | { kind: "pending"; key: string; src: string; name: string; error?: string };

function GalleryImg({ src, alt, className, onState }: { src: string; alt: string; className: string; onState?: (ok: boolean) => void }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null); // a new src gets a fresh attempt
  if (failedSrc === src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center text-rose-600 gap-1 p-2" data-image-failed={src}>
        <AlertCircle size={20} />
        <span className="text-[10px] font-bold leading-tight">Image could not be loaded</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onLoad={() => onState?.(true)} onError={() => { setFailedSrc(src); onState?.(false); }} />;
}

export default function ProductGalleryEditor({ images: committed, onCommit, productRef, inputId, autoSave, onBusyChange }: Props) {
  const images = useMemo(() => realImages(committed), [committed]);
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "uploading" | "saving">("");
  const [error, setError] = useState("");
  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");
  const previews = useRef<string[]>([]);

  useEffect(() => { fetchUploadConfig().then(setConfig); }, []);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => { onBusyChange?.(busy !== "" || unsaved.length > 0); }, [busy, unsaved.length, onBusyChange]);
  useEffect(() => {
    if (busy === "" && unsaved.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, unsaved.length]);

  const items: Item[] = [
    ...images.map((src) => ({ kind: "saved" as const, key: src, src })),
    ...unsaved.filter((u) => !images.includes(u)).map((src) => ({ kind: "unsaved" as const, key: src, src })),
    ...pending.map((p) => ({ kind: "pending" as const, key: p.id, src: p.preview, name: p.name, error: p.error })),
  ];
  const current = items.find((i) => i.key === selected) ?? items[0] ?? null;

  const commit = async (next: string[], select?: string | null): Promise<boolean> => {
    setBusy("saving");
    setError("");
    const res = await onCommit(next);
    setBusy("");
    if (!res.ok) { setError(res.error); return false; }
    if (select !== undefined) setSelected(select);
    return true;
  };

  const dropPending = (ids: string[]) => setPending((prev) => prev.filter((p) => {
    if (!ids.includes(p.id)) return true;
    URL.revokeObjectURL(p.preview);
    return false;
  }));

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (!config?.enabled) { setError(config?.reason ?? "Image storage is not available."); return; }
    setError("");
    const problems: string[] = [];
    const valid = files.filter((f) => { const p = checkImageFile(f, config); if (p) problems.push(p); return !p; });
    if (valid.length === 0) { setError(problems.join(" ")); return; }

    const batch: Pending[] = valid.map((f, i) => {
      const preview = URL.createObjectURL(f); // local preview only — never saved
      previews.current.push(preview);
      return { id: `pending-${Date.now()}-${i}`, name: f.name, preview };
    });
    setPending((prev) => [...prev, ...batch]);
    setSelected(batch[0].id);
    setBusy("uploading");

    const { results } = await uploadImagesToStorage(valid, config, productRef, { preserveOriginal: true });
    const okIds = batch.filter((_, i) => results[i].url).map((p) => p.id);
    const urls = results.map((r) => r.url).filter((u): u is string => !!u);
    setPending((prev) => prev.map((p) => { const i = batch.findIndex((b) => b.id === p.id); return i >= 0 && results[i].error ? { ...p, error: results[i].error } : p; }));
    const failures = results.map((r) => r.error).filter(Boolean) as string[];
    setBusy("");

    if (urls.length) {
      const { images: next, select } = appendImages([...images, ...unsaved], urls);
      dropPending(okIds);
      const saved = await commit(next, select);
      if (saved) setUnsaved([]);
      else { setUnsaved((prev) => [...new Set([...prev, ...urls])]); setSelected(urls[0]); }
    }
    if (failures.length || problems.length) setError((prev) => [prev, ...problems, ...failures].filter(Boolean).join(" "));
  };

  const retrySave = async () => {
    const { images: next, select } = appendImages(images, unsaved);
    if (await commit(next, select)) setUnsaved([]);
  };

  const handleAddUrl = async () => {
    const url = urlInput.trim();
    const problem = permanentImageProblem(url);
    if (problem) { setError(problem); return; }
    if (images.includes(url)) { setError("That image is already in the gallery."); return; }
    const { images: next } = appendImages(images, [url]);
    if (await commit(next, url)) setUrlInput("");
  };

  const handleRemove = async (item: Item) => {
    if (item.kind === "pending") { dropPending([item.key]); setError(""); return; }
    if (item.kind === "unsaved") {
      setUnsaved((prev) => prev.filter((u) => u !== item.src));
      fetch("/api/admin/uploads/discard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: [item.src] }) }).catch(() => undefined);
      return;
    }
    if (autoSave && !window.confirm("Remove this image from the product? This is saved immediately.")) return;
    const { images: next, select } = removeImage(images, item.src);
    await commit(next, select);
  };

  const handleMakePrimary = (src: string) => commit(makePrimary(images, src), src);

  const savedCount = images.length;
  const disabled = busy !== "";

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4" data-gallery>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">Product Gallery</h2>
          <p className="text-[11px] text-slate-400 font-medium" data-testid="gallery-count">
            {savedCount} {savedCount === 1 ? "image" : "images"} {autoSave ? "saved" : "added"}
            {unsaved.length > 0 && ` · ${unsaved.length} not saved yet`}
            {pending.some((p) => !p.error) && ` · uploading ${pending.filter((p) => !p.error).length}`}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
          {(["file", "url"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setUploadMethod(m)}
              className={`px-2.5 py-1 rounded-md transition-all ${uploadMethod === m ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"}`}>
              {m === "file" ? "Upload File" : "URL Path"}
            </button>
          ))}
        </div>
      </div>

      {/* Main preview */}
      <div className="w-full aspect-square max-h-[320px] rounded-xl bg-slate-50/80 border border-slate-200/80 overflow-hidden flex items-center justify-center p-3 relative group mx-auto" data-testid="gallery-main">
        {current ? (
          <>
            <GalleryImg src={current.src} alt="Product Preview" className="w-full h-full object-contain object-center transition-all duration-200" />
            {current.kind === "pending" && !current.error && (
              <div className="absolute inset-0 bg-white/60 flex flex-col items-center justify-center gap-2 text-slate-700 text-xs font-bold">
                <Loader2 size={22} className="animate-spin text-red-600" /> Uploading {current.name}…
              </div>
            )}
            {current.kind === "pending" && current.error && (
              <div className="absolute inset-x-3 bottom-3 p-2 rounded-lg bg-rose-600/95 text-white text-[11px] font-semibold">Upload failed — not saved. {current.error}</div>
            )}
            {current.kind === "unsaved" && (
              <div className="absolute inset-x-3 bottom-3 p-2 rounded-lg bg-amber-500/95 text-white text-[11px] font-semibold flex items-center justify-between gap-2">
                <span>Uploaded, but not saved to the product yet.</span>
                <button type="button" onClick={retrySave} disabled={disabled} className="px-2 py-1 bg-white/20 rounded-md flex items-center gap-1"><RefreshCw size={12} /> Retry saving</button>
              </div>
            )}
            {current.kind === "saved" && (images[0] === current.src ? (
              <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[10px] font-extrabold tracking-wider uppercase flex items-center gap-1 shadow-md">
                <Star size={12} fill="white" /><span>Primary Image</span>
              </div>
            ) : (
              <button type="button" disabled={disabled} onClick={() => handleMakePrimary(current.src)}
                className="absolute top-3 left-3 px-2.5 py-1 bg-slate-900/90 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-md transition-all cursor-pointer disabled:opacity-50">
                <Star size={12} /> Set as Primary
              </button>
            ))}
            {!(current.kind === "pending" && !current.error) && (
              <button type="button" disabled={disabled && current.kind === "saved"} onClick={() => handleRemove(current)} title={current.kind === "pending" ? "Dismiss" : "Remove Image"}
                className="absolute top-3 right-3 p-2 bg-rose-600 text-white rounded-xl opacity-90 hover:opacity-100 transition-opacity shadow-md hover:bg-rose-700 cursor-pointer disabled:opacity-50">
                {current.kind === "pending" ? <X size={16} /> : <Trash2 size={16} />}
              </button>
            )}
          </>
        ) : (
          <div className="text-center text-slate-400 space-y-2 p-4">
            <ImageIcon size={44} className="mx-auto text-slate-300" />
            <span className="text-xs font-semibold block">No images added yet</span>
            <span className="text-[10px] text-slate-400 block font-normal">The first image will automatically become the primary image.</span>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {items.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">Thumbnails ({items.length})</span>
          <div className="grid grid-cols-4 gap-2">
            {items.map((item, idx) => (
              <div key={item.key} onClick={() => setSelected(item.key)} data-thumb-kind={item.kind}
                className={`relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer bg-slate-50 transition-all p-1 group ${
                  current?.key === item.key ? "border-red-600 shadow-xs ring-2 ring-red-500/20" : "border-slate-200/80 hover:border-slate-400"}`}>
                <GalleryImg src={item.src} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-contain" />
                {item.kind === "saved" && idx === 0 && (
                  <div className="absolute top-0.5 left-0.5 bg-amber-500 text-white p-0.5 rounded-full shadow-xs"><Star size={10} fill="white" /></div>
                )}
                {item.kind === "pending" && (
                  <div className={`absolute inset-0 flex items-center justify-center ${item.error ? "bg-rose-600/40" : "bg-white/50"}`}>
                    {item.error ? <AlertCircle size={16} className="text-white" /> : <Loader2 size={16} className="animate-spin text-red-600" />}
                  </div>
                )}
                {item.kind === "unsaved" && <div className="absolute bottom-0 inset-x-0 bg-amber-500 text-white text-[9px] font-bold text-center">not saved</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2" data-testid="gallery-error">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} className="text-rose-500"><X size={14} /></button>
        </div>
      )}
      {busy && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-2" data-testid="gallery-busy">
          <Loader2 size={16} className="animate-spin text-red-600 shrink-0" />
          <span>{busy === "uploading" ? "Uploading product image(s) to storage…" : autoSave ? "Saving gallery to the product…" : "Updating gallery…"}</span>
        </div>
      )}

      {uploadMethod === "file" ? (
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">Add Images from Computer</label>
          <label htmlFor={inputId}
            className={`w-full flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 transition-all text-center ${
              config?.enabled && !disabled ? "hover:border-red-500 hover:bg-red-50/20 hover:text-red-600 cursor-pointer" : "opacity-60 cursor-not-allowed"}`}>
            <Upload size={22} className="text-slate-400" />
            <span className="text-xs font-bold">Click to Browse &amp; Select Photos</span>
            <span className="text-[10px] text-slate-400 font-medium">
              {config === null ? "Checking image storage…" : config.enabled
                ? `Stored in ${config.provider === "r2" ? "Cloudflare R2" : "Supabase Storage"} · JPG, PNG, WEBP, AVIF up to ${Math.round(config.maxBytes / 1024 / 1024)} MB · ${autoSave ? "saved to the product automatically" : "saved when you create the product"}`
                : config.reason}
            </span>
          </label>
          <input id={inputId} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleFiles} disabled={!config?.enabled || disabled} className="hidden" />
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">Image URL / Asset Path</label>
          <div className="flex gap-2">
            <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="Paste an image URL (https://…)"
              className="flex-1 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-xs md:text-sm text-slate-900 font-medium focus:outline-hidden focus:border-red-500" />
            <button type="button" onClick={handleAddUrl} disabled={disabled || !urlInput.trim()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold disabled:opacity-50">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
