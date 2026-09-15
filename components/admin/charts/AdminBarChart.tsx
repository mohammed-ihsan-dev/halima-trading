"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface BarChartItem {
  name: string;
  inStock?: number;
  outOfStock?: number;
  count?: number;
}

interface AdminBarChartProps {
  data: BarChartItem[];
  type?: "dual" | "single";
  height?: number;
}

export default function AdminBarChart({ data, type = "dual", height = 200 }: AdminBarChartProps) {
  const shouldReduceMotion = useReducedMotion();

  if (!data || data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-slate-400 font-extrabold text-xs">
        No chart data available.
      </div>
    );
  }

  const maxVal = Math.max(
    ...data.map((item) =>
      type === "dual" ? (item.inStock || 0) + (item.outOfStock || 0) : item.count || 0
    ),
    1
  );

  return (
    <div className="w-full overflow-x-auto scroller-smooth pb-1">
      <div
        style={{ height: `${height}px` }}
        className="w-full min-w-[280px] flex items-end justify-between gap-1.5 sm:gap-3 border-b border-slate-100 pb-3 px-1 sm:px-2"
      >
        {data.map((item, index) => {
          if (type === "dual") {
            const inStock = item.inStock || 0;
            const outOfStock = item.outOfStock || 0;
            const inStockHeight = Math.round((inStock / maxVal) * 100);
            const outOfStockHeight = Math.round((outOfStock / maxVal) * 100);

            return (
              <div key={item.name} className="flex-1 min-w-[36px] sm:min-w-0 flex flex-col items-center gap-1.5 sm:gap-2 h-full justify-end group">
                <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full">
                  {/* In Stock Bar */}
                  <div className="w-1/2 h-full flex items-end justify-center relative">
                    <motion.div
                      initial={shouldReduceMotion ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{
                        duration: 0.6,
                        delay: shouldReduceMotion ? 0 : index * 0.06,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      style={{
                        height: `${Math.max(inStockHeight, 6)}%`,
                        transformOrigin: "bottom",
                      }}
                      className="w-full bg-red-600 rounded-t-md hover:bg-red-700 transition-colors relative"
                      title={`${item.name} - In Stock: ${inStock}`}
                    />
                  </div>

                  {/* Out of Stock Bar */}
                  <div className="w-1/2 h-full flex items-end justify-center relative">
                    <motion.div
                      initial={shouldReduceMotion ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{
                        duration: 0.6,
                        delay: shouldReduceMotion ? 0 : index * 0.06 + 0.03,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      style={{
                        height: `${Math.max(outOfStockHeight, 6)}%`,
                        transformOrigin: "bottom",
                      }}
                      className="w-full bg-slate-200 rounded-t-md hover:bg-slate-300 transition-colors relative"
                      title={`${item.name} - Out of Stock: ${outOfStock}`}
                    />
                  </div>
                </div>

                <span className="text-[10px] sm:text-xs font-bold text-slate-700 truncate max-w-[65px] sm:max-w-[80px]" title={item.name}>
                  {item.name}
                </span>
              </div>
            );
          }

          // Single Bar Chart (e.g. Products Distribution by Category)
          const count = item.count || 0;
          const heightPercent = Math.round((count / maxVal) * 100);

          return (
            <div key={item.name} className="flex-1 min-w-[40px] sm:min-w-0 flex flex-col items-center gap-1.5 sm:gap-2 h-full justify-end group">
              <span className="text-[10px] sm:text-xs md:text-sm font-extrabold text-slate-700">{count}</span>
              <div className="w-full h-full flex items-end justify-center relative">
                <motion.div
                  initial={shouldReduceMotion ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    duration: 0.6,
                    delay: shouldReduceMotion ? 0 : index * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{
                    height: `${Math.max(heightPercent, 8)}%`,
                    transformOrigin: "bottom",
                  }}
                  className="w-full bg-red-600 rounded-t-lg hover:bg-red-700 transition-colors"
                  title={`${item.name}: ${count}`}
                />
              </div>
              <span className="text-[10px] sm:text-xs md:text-sm font-bold text-slate-700 truncate mt-0.5 sm:mt-1 max-w-[70px] sm:max-w-[100px]" title={item.name}>
                {item.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
