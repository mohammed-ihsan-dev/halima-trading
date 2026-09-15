import React from "react";

export default function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-slate-200 rounded-xl" />
          <div className="h-4 w-64 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-10 w-44 bg-slate-200 rounded-xl" />
      </div>

      {/* Grid Stat Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-slate-200 rounded-md" />
              <div className="w-10 h-10 rounded-xl bg-slate-100" />
            </div>
            <div className="h-7 w-20 bg-slate-300 rounded-lg" />
            <div className="h-3 w-32 bg-slate-100 rounded-md" />
          </div>
        ))}
      </div>

      {/* Middle Analytics Section Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 h-80 space-y-4">
          <div className="h-5 w-40 bg-slate-200 rounded-lg" />
          <div className="h-56 bg-slate-50 rounded-xl flex items-end justify-around p-4 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-10 bg-slate-200 rounded-t-lg" style={{ height: `${30 + (i % 3) * 25}%` }} />
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 h-80 flex flex-col items-center justify-center space-y-4">
          <div className="w-40 h-40 rounded-full border-[14px] border-slate-200 border-t-slate-300" />
          <div className="h-4 w-28 bg-slate-200 rounded-md" />
        </div>
      </div>
    </div>
  );
}
