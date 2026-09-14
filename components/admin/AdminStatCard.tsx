"use client";

import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import AnimatedCountUp from "./AnimatedCountUp";

interface AdminStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: string;
  trendDirection?: "up" | "down" | "neutral";
  iconBgColor?: string;
  iconColor?: string;
}

export default function AdminStatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  trendDirection = "up",
  iconBgColor = "bg-red-50",
  iconColor = "text-red-600",
}: AdminStatCardProps) {
  const isUp = trendDirection === "up";
  const isDown = trendDirection === "down";

  // Check if value is numeric or numeric string
  const numValue = typeof value === "number" ? value : Number(value);
  const isNumeric = !isNaN(numValue) && value !== "...";

  return (
    <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4 hover:shadow-xs transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs md:text-sm font-extrabold text-slate-500 tracking-wider uppercase">
          {title}
        </span>
        <div className={`w-11 h-11 rounded-xl ${iconBgColor} ${iconColor} flex items-center justify-center shrink-0`}>
          <Icon size={22} />
        </div>
      </div>

      <div className="flex items-baseline justify-between pt-1">
        <span className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-none">
          {isNumeric ? <AnimatedCountUp value={numValue} /> : value}
        </span>

        {trend && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-full ${
              isUp
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                : isDown
                ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                : "bg-slate-50 text-slate-700 border border-slate-200/60"
            }`}
          >
            {isUp && <TrendingUp size={13} />}
            {isDown && <TrendingDown size={13} />}
            <span>{trend}</span>
          </span>
        )}
      </div>

      {subtitle && (
        <span className="text-xs font-bold text-slate-500 block pt-2 border-t border-slate-100">
          {subtitle}
        </span>
      )}
    </div>
  );
}
