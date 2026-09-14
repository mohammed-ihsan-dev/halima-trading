"use client";

export default function ProductCardSkeleton() {
  return (
    <article className="product-card skeleton-card" aria-hidden="true">
      <div className="product-img skeleton-pulse" style={{ height: "270px", background: "#f1f5f9" }} />
      <div className="product-info" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="skeleton-pulse" style={{ height: "12px", width: "40%", borderRadius: "4px", background: "#e2e8f0" }} />
        <div className="skeleton-pulse" style={{ height: "20px", width: "85%", borderRadius: "4px", background: "#e2e8f0" }} />
        <div className="skeleton-pulse" style={{ height: "12px", width: "50%", borderRadius: "4px", background: "#e2e8f0" }} />
        <div className="skeleton-pulse" style={{ height: "14px", width: "75%", borderRadius: "4px", background: "#e2e8f0" }} />
        <div className="skeleton-pulse" style={{ height: "24px", width: "35%", marginTop: "4px", borderRadius: "4px", background: "#e2e8f0" }} />
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <div className="skeleton-pulse" style={{ height: "38px", flex: 1, borderRadius: "6px", background: "#e2e8f0" }} />
          <div className="skeleton-pulse" style={{ height: "38px", width: "38px", borderRadius: "6px", background: "#e2e8f0" }} />
          <div className="skeleton-pulse" style={{ height: "38px", width: "38px", borderRadius: "6px", background: "#e2e8f0" }} />
        </div>
      </div>
    </article>
  );
}
