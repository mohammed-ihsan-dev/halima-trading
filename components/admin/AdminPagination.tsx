"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AdminPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
  itemLabel?: string;
}

export default function AdminPagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 12,
  itemLabel = "items",
}: AdminPaginationProps) {
  if (totalPages <= 1 && (!totalItems || totalItems <= itemsPerPage)) {
    if (!totalItems) return null;
    return (
      <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs md:text-sm text-slate-500 font-semibold">
        <span>Showing {totalItems} of {totalItems} {itemLabel}</span>
      </div>
    );
  }

  const startIndex = Math.min((currentPage - 1) * itemsPerPage + 1, totalItems || 0);
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems || 0);

  // Generate page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="p-4 md:p-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs md:text-sm text-slate-500 font-semibold bg-white rounded-b-2xl">
      <div>
        {totalItems !== undefined && (
          <span>
            Showing <strong className="text-slate-900">{startIndex}</strong> to{" "}
            <strong className="text-slate-900">{endIndex}</strong> of{" "}
            <strong className="text-slate-900">{totalItems.toLocaleString()}</strong> {itemLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
          aria-label="Previous Page"
        >
          <ChevronLeft size={16} />
        </button>

        {getPageNumbers().map((p, idx) => {
          if (p === "...") {
            return (
              <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 font-bold">
                ...
              </span>
            );
          }
          const isCurrent = p === currentPage;
          return (
            <button
              key={`page-${p}`}
              onClick={() => onPageChange(p as number)}
              className={`w-8 h-8 md:w-9 md:h-9 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center transition-all cursor-pointer ${
                isCurrent
                  ? "bg-red-600 text-white shadow-xs shadow-red-600/30"
                  : "border border-slate-200/80 hover:bg-slate-100 text-slate-700"
              }`}
            >
              {p}
            </button>
          );
        })}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
          aria-label="Next Page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
