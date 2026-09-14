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
import type { Product } from "@/data/products";
import type { SafeUser as UserAccount } from "@/lib/repositories/users";
import type { MongoOrderDoc as OrderRecord } from "@/lib/repositories/orders";
import type { MongoPaymentDoc as PaymentRecord } from "@/lib/repositories/payments";


export default function AdminDashboardPage() {
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [ordersList, setOrdersList] = useState<OrderRecord[]>([]);
  const [paymentsList, setPaymentsList] = useState<PaymentRecord[]>([]);
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
        const [prodRes, orderRes, userRes, payRes] = await Promise.all([
          fetch("/api/admin/products", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/admin/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/admin/users", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/admin/payments", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
        ]);

        if (Array.isArray(prodRes.data)) setProductsList(prodRes.data);
        if (Array.isArray(orderRes.data)) setOrdersList(orderRes.data);
        if (Array.isArray(userRes.data)) setUsersList(userRes.data);
        if (Array.isArray(payRes.data)) setPaymentsList(payRes.data);
      } catch (err) {
        console.error("Error loading dashboard metrics:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);


  const totalProducts = productsList.length;
  const activeProducts = productsList.filter((p) => p.inStock).length;
  const outOfStockProducts = productsList.filter((p) => !p.inStock || (p.stockCount !== undefined && p.stockCount <= 0)).length;

  const totalOrders = ordersList.length;
  const pendingOrders = ordersList.filter((o) => o.orderStatus === "PENDING" || o.orderStatus === "Pending" || (o as any).status === "Pending").length;


  const totalUsers = usersList.length;
  const activeUsers = usersList.filter((u) => u.status === "ACTIVE").length;
  const suspendedUsers = usersList.filter((u) => u.status === "SUSPENDED").length;
  const deletedUsers = usersList.filter((u) => u.status === "DELETED").length;


  const capturedPayments = paymentsList.filter((p) => p.status === "PAID" || p.status === "Captured").length;


  // Build dynamic category distribution from actual products
  const categoryMap: Record<string, { inStock: number; outOfStock: number }> = {};
  productsList.forEach((p) => {
    const cat = p.category || "General";
    if (!categoryMap[cat]) categoryMap[cat] = { inStock: 0, outOfStock: 0 };
    if (p.inStock && (p.stockCount === undefined || p.stockCount > 0)) {
      categoryMap[cat].inStock += 1;
    } else {
      categoryMap[cat].outOfStock += 1;
    }
  });

  const categoryData = Object.entries(categoryMap).map(([name, counts]) => ({
    name,
    inStock: counts.inStock,
    outOfStock: counts.outOfStock,
  }));

  const maxCategoryTotal = Math.max(
    ...categoryData.map((c) => c.inStock + c.outOfStock),
    1
  );

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
            value={loading ? "..." : totalProducts}
            icon={Package}
            subtitle={loading ? "Loading MongoDB products..." : `${activeProducts} In Stock • ${outOfStockProducts} Out`}
            iconBgColor="bg-red-50"
            iconColor="text-red-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Active Products"
            value={loading ? "..." : activeProducts}
            icon={CheckCircle2}
            subtitle={loading ? "Loading..." : "In Stock"}
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Out of Stock"
            value={loading ? "..." : outOfStockProducts}
            icon={AlertTriangle}
            subtitle={loading ? "Loading..." : "Needs restocking"}
            iconBgColor="bg-amber-50"
            iconColor="text-amber-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Total Orders"
            value={loading ? "..." : totalOrders}
            icon={ShoppingCart}
            subtitle={loading ? "Loading..." : `${pendingOrders} Pending fulfillment`}
            iconBgColor="bg-red-50"
            iconColor="text-red-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Pending Orders"
            value={loading ? "..." : pendingOrders}
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
            value={loading ? "..." : totalUsers}
            icon={Users}
            subtitle={loading ? "Loading..." : `${activeUsers} Active accounts`}
            iconBgColor="bg-red-50"
            iconColor="text-red-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Suspended Users"
            value={loading ? "..." : suspendedUsers}
            icon={UserX}
            subtitle={loading ? "Loading..." : "Suspended"}
            iconBgColor="bg-rose-50"
            iconColor="text-rose-600"
          />
        </AnimatedStaggerItem>
        <AnimatedStaggerItem>
          <AdminStatCard
            title="Captured Payments"
            value={loading ? "..." : capturedPayments}
            icon={CreditCard}
            subtitle={loading ? "Loading..." : "Processed payments"}
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

          {/* Bar Chart Graphics */}
          <div className="pt-4 pb-2">
            {loading ? (
              <div className="h-52 flex items-center justify-center text-slate-400 font-extrabold text-xs">
                Loading category chart data...
              </div>
            ) : categoryData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-slate-400 font-extrabold text-xs">
                No product categories available.
              </div>
            ) : (
              <div className="h-52 flex items-end justify-between gap-4 border-b border-slate-100 pb-3 px-2">
                {categoryData.map((cat) => {
                  const inStockHeight = Math.round((cat.inStock / maxCategoryTotal) * 100);
                  const outOfStockHeight = Math.round((cat.outOfStock / maxCategoryTotal) * 100);

                  return (
                    <div key={cat.name} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                      <div className="w-full flex items-end justify-center gap-1.5 h-full">
                        <div
                          className="w-1/2 bg-red-600 rounded-t-md transition-all group-hover:bg-red-700 relative"
                          style={{ height: `${Math.max(inStockHeight, 6)}%` }}
                          title={`In Stock: ${cat.inStock}`}
                        />
                        <div
                          className="w-1/2 bg-slate-200 rounded-t-md transition-all group-hover:bg-slate-300 relative"
                          style={{ height: `${Math.max(outOfStockHeight, 6)}%` }}
                          title={`Out of Stock: ${cat.outOfStock}`}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 truncate max-w-[80px]" title={cat.name}>
                        {cat.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Users Status Donut Visualizer (1 Col) */}
        <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-6 flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900">Users Status</h2>
            <p className="text-xs md:text-sm text-slate-500 font-semibold mt-0.5">User account breakdown</p>
          </div>

          {/* Ring Donut Representation */}
          <div className="relative flex items-center justify-center my-2">
            <div className="w-44 h-44 rounded-full border-[16px] border-red-600 border-t-amber-500 border-r-slate-300 flex items-center justify-center shadow-inner">
              <div className="text-center leading-none">
                <span className="text-2xl font-black text-slate-900 block">
                  {loading ? "..." : totalUsers}
                </span>
                <span className="text-xs font-bold text-slate-500 block mt-1 uppercase tracking-wider">
                  Total Users
                </span>
              </div>
            </div>
          </div>

          {/* Status Breakdown Legend */}
          <div className="space-y-3 pt-3 border-t border-slate-100 text-xs md:text-sm font-bold text-slate-700">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-600" /> Active
              </span>
              <span>{loading ? "..." : `${activeUsers} (${totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 0}%)`}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" /> Suspended
              </span>
              <span>{loading ? "..." : `${suspendedUsers} (${totalUsers ? Math.round((suspendedUsers / totalUsers) * 100) : 0}%)`}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-300" /> Deleted
              </span>
              <span>{loading ? "..." : `${deletedUsers} (${totalUsers ? Math.round((deletedUsers / totalUsers) * 100) : 0}%)`}</span>
            </div>
          </div>
        </div>
      </AnimatedFadeIn>
    </div>
  );
}
