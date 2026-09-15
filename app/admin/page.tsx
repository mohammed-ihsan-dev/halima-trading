"use client";

import React, { useEffect, useState } from "react";
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  ShoppingCart,
  Clock,
  Users,
  UserX,
  CreditCard,
  Calendar,
} from "lucide-react";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AnimatedFadeIn, { AnimatedStaggerGroup, AnimatedStaggerItem } from "@/components/admin/AnimatedFadeIn";
import DashboardSkeleton from "@/components/admin/DashboardSkeleton";
import AdminBarChart from "@/components/admin/charts/AdminBarChart";
import AdminDonutChart from "@/components/admin/charts/AdminDonutChart";

interface AdminStatsData {
  totalProducts: number;
  activeProducts: number;
  outOfStockProducts: number;
  totalOrders: number;
  pendingOrders: number;
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  deletedUsers: number;
  capturedPayments: number;
  categoryData: Array<{ name: string; inStock: number; outOfStock: number }>;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [formattedDate, setFormattedDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("");

  useEffect(() => {
    const now = new Date();
    setFormattedDate(
      now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    );
    setDayOfWeek(now.toLocaleDateString("en-US", { weekday: "long" }));
  }, []);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        const data = await res.json();
        if (data && data.success && data.stats) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error("Error loading dashboard metrics:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading || !stats) {
    return <DashboardSkeleton />;
  }

  const {
    totalProducts,
    activeProducts,
    outOfStockProducts,
    totalOrders,
    pendingOrders,
    totalUsers,
    activeUsers,
    suspendedUsers,
    deletedUsers,
    capturedPayments,
    categoryData,
  } = stats;

  return (
    <div className="space-y-8">
      {/* Title & Subtitle Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Welcome back, Admin! Here&apos;s what&apos;s happening today.
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-white border border-slate-200/80 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold text-slate-700 shadow-2xs self-start sm:self-auto">
          <Calendar size={16} className="text-slate-400" />
          <span>{formattedDate || "Today"}</span>
          {dayOfWeek && <span className="text-slate-400 font-normal">| {dayOfWeek}</span>}
        </div>
      </div>

      {/* Summary Stat Cards Grid */}
      <AnimatedStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Total Products"
            value={totalProducts}
            icon={Package}
            subtitle={`${activeProducts} In Stock • ${outOfStockProducts} Out`}
            iconBgColor="bg-red-50"
            iconColor="text-red-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Active Products"
            value={activeProducts}
            icon={CheckCircle2}
            subtitle="In Stock"
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Out of Stock"
            value={outOfStockProducts}
            icon={AlertTriangle}
            subtitle="Needs restocking"
            iconBgColor="bg-amber-50"
            iconColor="text-amber-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Total Orders"
            value={totalOrders}
            icon={ShoppingCart}
            subtitle={`${pendingOrders} Pending fulfillment`}
            iconBgColor="bg-red-50"
            iconColor="text-red-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Pending Orders"
            value={pendingOrders}
            icon={Clock}
            trend="Needs fulfillment"
            trendDirection="neutral"
            iconBgColor="bg-blue-50"
            iconColor="text-blue-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Total Users"
            value={totalUsers}
            icon={Users}
            subtitle={`${activeUsers} Active accounts`}
            iconBgColor="bg-red-50"
            iconColor="text-red-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Suspended Users"
            value={suspendedUsers}
            icon={UserX}
            subtitle="Suspended"
            iconBgColor="bg-rose-50"
            iconColor="text-rose-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Captured Payments"
            value={capturedPayments}
            icon={CreditCard}
            subtitle="Processed payments"
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </AnimatedStaggerItem>
      </AnimatedStaggerGroup>

      {/* Visual Analytics Middle Section */}
      <AnimatedFadeIn delay={0.15} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products Overview Bar Chart Visualizer (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Products Overview</h2>
              <p className="text-xs md:text-sm text-slate-500 font-semibold mt-0.5">Stock ratio across product categories</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-3 h-3 rounded-xs bg-red-600 inline-block" /> In Stock
              </span>
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-3 h-3 rounded-xs bg-slate-300 inline-block" /> Out of Stock
              </span>
            </div>
          </div>

          {/* Animated Bar Chart */}
          <div className="pt-4 pb-2">
            <AdminBarChart data={categoryData} type="dual" height={200} />
          </div>
        </div>

        {/* Users Status Donut Visualizer (1 Col) */}
        <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-6 flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900">Users Status</h2>
            <p className="text-xs md:text-sm text-slate-500 font-semibold mt-0.5">User account breakdown</p>
          </div>

          {/* Animated Donut Chart */}
          <AdminDonutChart
            totalUsers={totalUsers}
            activeUsers={activeUsers}
            suspendedUsers={suspendedUsers}
            deletedUsers={deletedUsers}
          />
        </div>
      </AnimatedFadeIn>
    </div>
  );
}

