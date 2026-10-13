import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { catalogueHref, pageNumbers, type CatalogueState } from "@/lib/catalogue-query";

interface ShopPaginationProps {
  state: CatalogueState;
  currentPage: number;
  totalPages: number;
}

/** Real links (shareable, prefetchable, Back/Forward friendly) — the URL holds the page. */
export default function ShopPagination({ state, currentPage, totalPages }: ShopPaginationProps) {
  if (totalPages <= 1) return null;
  const href = (page: number) => catalogueHref("/shop", { ...state, page });
  return (
    <nav className="shop-pagination" aria-label="Product pages">
      {currentPage > 1 ? (
        <Link href={href(currentPage - 1)} aria-label="Previous page" rel="prev">
          <ChevronLeft size={16} />
        </Link>
      ) : (
        <span aria-disabled="true" className="is-disabled"><ChevronLeft size={16} /></span>
      )}
      {pageNumbers(currentPage, totalPages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="gap">…</span>
        ) : p === currentPage ? (
          <span key={p} className="is-current" aria-current="page">{p}</span>
        ) : (
          <Link key={p} href={href(p)} aria-label={`Page ${p}`}>{p}</Link>
        )
      )}
      {currentPage < totalPages ? (
        <Link href={href(currentPage + 1)} aria-label="Next page" rel="next">
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span aria-disabled="true" className="is-disabled"><ChevronRight size={16} /></span>
      )}
    </nav>
  );
}
