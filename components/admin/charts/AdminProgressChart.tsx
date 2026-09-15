"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LucideIcon } from "lucide-react";

export interface ProgressChartItem {
  id: string;
  label: string;
  count: number;
  total: number;
  colorClass: string;
  icon: LucideIcon;
}

interface AdminProgressChartProps {
  items: ProgressChartItem[];
}

export default function AdminProgressChart({ items }: AdminProgressChartProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        const percent = item.total > 0 ? Math.round((item.count / item.total) * 100) : 0;

        return (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="flex items-center gap-2 font-bold text-slate-700">
                <Icon size={16} className={item.colorClass.replace("bg-", "text-")} />
                {item.label}
              </span>
              <span className="font-extrabold text-slate-900">
                {item.count} <span className="text-xs text-slate-400 font-normal">({percent}%)</span>
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <motion.div
                initial={shouldReduceMotion ? false : { width: "0%" }}
                animate={{ width: `${percent}%` }}
                transition={{
                  duration: 0.65,
                  delay: shouldReduceMotion ? 0 : index * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`h-2.5 rounded-full ${item.colorClass}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
