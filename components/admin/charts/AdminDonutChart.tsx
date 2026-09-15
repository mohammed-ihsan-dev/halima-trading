"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface AdminDonutChartProps {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  deletedUsers: number;
}

export default function AdminDonutChart({
  totalUsers,
  activeUsers,
  suspendedUsers,
  deletedUsers,
}: AdminDonutChartProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const radius = 68;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius; // ~427.26

  const safeTotal = totalUsers > 0 ? totalUsers : 1;
  const activeRatio = activeUsers / safeTotal;
  const suspendedRatio = suspendedUsers / safeTotal;
  const deletedRatio = deletedUsers / safeTotal;

  const activeStroke = activeRatio * circumference;
  const suspendedStroke = suspendedRatio * circumference;
  const deletedStroke = deletedRatio * circumference;

  // Calculate cumulative offsets
  const activeOffset = 0;
  const suspendedOffset = -activeStroke;
  const deletedOffset = -(activeStroke + suspendedStroke);

  const slices = [
    {
      id: "active",
      label: "Active",
      count: activeUsers,
      ratio: activeRatio,
      color: "#dc2626", // Red 600
      strokeLength: activeStroke,
      offset: activeOffset,
    },
    {
      id: "suspended",
      label: "Suspended",
      count: suspendedUsers,
      ratio: suspendedRatio,
      color: "#f59e0b", // Amber 500
      strokeLength: suspendedStroke,
      offset: suspendedOffset,
    },
    {
      id: "deleted",
      label: "Deleted",
      count: deletedUsers,
      ratio: deletedRatio,
      color: "#cbd5e1", // Slate 300
      strokeLength: deletedStroke,
      offset: deletedOffset,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-between h-full space-y-6">
      <div className="relative flex items-center justify-center my-2">
        <svg width="180" height="180" viewBox="0 0 180 180" className="rotate-[-90deg]">
          {/* Base Background Ring */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />

          {/* Animated Slices */}
          {slices.map((slice, index) => {
            if (slice.strokeLength <= 0) return null;

            return (
              <motion.circle
                key={slice.id}
                cx="90"
                cy="90"
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={hoveredSlice === slice.id ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={`${slice.strokeLength} ${circumference}`}
                strokeDashoffset={slice.offset}
                strokeLinecap="round"
                onMouseEnter={() => setHoveredSlice(slice.id)}
                onMouseLeave={() => setHoveredSlice(null)}
                className="cursor-pointer transition-all duration-200"
                initial={shouldReduceMotion ? false : { strokeDashoffset: circumference + slice.offset }}
                animate={{ strokeDashoffset: slice.offset }}
                transition={{
                  duration: 0.75,
                  delay: shouldReduceMotion ? 0 : index * 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            );
          })}
        </svg>

        {/* Center Donut Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center leading-none">
          <motion.span
            initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-2xl font-black text-slate-900 block"
          >
            {totalUsers}
          </motion.span>
          <span className="text-[11px] font-bold text-slate-500 block mt-1 uppercase tracking-wider">
            Total Users
          </span>
        </div>
      </div>

      {/* Legend Breakdown */}
      <div className="w-full space-y-3 pt-3 border-t border-slate-100 text-xs md:text-sm font-bold text-slate-700">
        <div
          onMouseEnter={() => setHoveredSlice("active")}
          onMouseLeave={() => setHoveredSlice(null)}
          className={`flex items-center justify-between p-1.5 rounded-lg transition-colors cursor-pointer ${
            hoveredSlice === "active" ? "bg-red-50" : ""
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600" /> Active
          </span>
          <span>{`${activeUsers} (${Math.round(activeRatio * 100)}%)`}</span>
        </div>

        <div
          onMouseEnter={() => setHoveredSlice("suspended")}
          onMouseLeave={() => setHoveredSlice(null)}
          className={`flex items-center justify-between p-1.5 rounded-lg transition-colors cursor-pointer ${
            hoveredSlice === "suspended" ? "bg-amber-50" : ""
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500" /> Suspended
          </span>
          <span>{`${suspendedUsers} (${Math.round(suspendedRatio * 100)}%)`}</span>
        </div>

        <div
          onMouseEnter={() => setHoveredSlice("deleted")}
          onMouseLeave={() => setHoveredSlice(null)}
          className={`flex items-center justify-between p-1.5 rounded-lg transition-colors cursor-pointer ${
            hoveredSlice === "deleted" ? "bg-slate-100" : ""
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-300" /> Deleted
          </span>
          <span>{`${deletedUsers} (${Math.round(deletedRatio * 100)}%)`}</span>
        </div>
      </div>
    </div>
  );
}
