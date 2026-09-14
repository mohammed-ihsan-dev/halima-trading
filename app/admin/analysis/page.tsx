"use client";

import { useState, useEffect } from "react";
import { Package, ShoppingBag, Users, CreditCard, CheckCircle2, AlertTriangle, Clock, Truck, ShieldAlert } from "lucide-react";
import AdminStatCard from "@/components/admin/AdminStatCard";
import type { Product } from "@/data/products";
import type { SafeUser as UserAccount } from "@/lib/repositories/users";
import type { MongoOrderDoc as OrderRecord } from "@/lib/repositories/orders";
import type { MongoPaymentDoc as PaymentRecord } from "@/lib/repositories/payments";

export default function AdminAnalysisPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalysisData() {
      setLoading(true);
      try {
        const [prodRes, orderRes, userRes, payRes] = await Promise.all([
          fetch("/api/admin/products", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/admin/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/admin/users", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/admin/payments", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
        ]);

        if (Array.isArray(prodRes.data)) setProducts(prodRes.data);
        if (Array.isArray(orderRes.data)) setOrders(orderRes.data);
        if (Array.isArray(userRes.data)) setUsers(userRes.data);
        if (Array.isArray(payRes.data)) setPayments(payRes.data);
      } catch (err) {
        console.error("Failed to load analysis data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAnalysisData();
  }, []);

  // Product Analysis
  const totalProducts = products.length;
  const inStockProducts = products.filter((p) => p.inStock && (p.stockCount === undefined || p.stockCount > 0)).length;
  const outOfStockProducts = totalProducts - inStockProducts;

  // Order Analysis
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => (o.orderStatus || (o as any).status) === "PENDING" || (o.orderStatus || (o as any).status) === "Pending").length;
  const paidOrders = orders.filter((o) => (o.orderStatus || (o as any).status) === "PROCESSING" || (o.orderStatus || (o as any).status) === "Paid").length;
  const shippedOrders = orders.filter((o) => (o.orderStatus || (o as any).status) === "SHIPPED" || (o.orderStatus || (o as any).status) === "Shipped").length;
  const cancelledOrders = orders.filter((o) => (o.orderStatus || (o as any).status) === "CANCELLED" || (o.orderStatus || (o as any).status) === "Cancelled").length;

  // User Analysis
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "ACTIVE").length;
  const suspendedUsers = users.filter((u) => u.status === "SUSPENDED").length;

  // Payment Analysis
  const capturedPayments = payments.filter((p) => p.status === "PAID" || p.status === "Captured").length;
  const failedPayments = payments.filter((p) => p.status === "FAILED" || p.status === "Failed").length;
  const refundedPayments = payments.filter((p) => p.status === "REFUNDED" || p.status === "Refunded").length;



  // Category Distribution computed dynamically from actual products
  const categoryCountMap: Record<string, number> = {};
  products.forEach((p) => {
    const cat = p.category || "General";
    categoryCountMap[cat] = (categoryCountMap[cat] || 0) + 1;
  });

  const categoryStats = Object.entries(categoryCountMap).map(([name, count]) => ({
    name,
    count,
  }));

  const maxCategoryCount = Math.max(...categoryStats.map((c) => c.count), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Analysis</h1>
        <p className="text-sm font-semibold text-slate-500 mt-1">
          Operational statistics across Products, Orders, User Accounts, and Payments.
        </p>
      </div>

      {/* 4 Primary Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <AdminStatCard
          title="Total Products"
          value={loading ? "..." : String(totalProducts)}
          subtitle={loading ? "Loading..." : `${inStockProducts} In Stock • ${outOfStockProducts} Out`}
          icon={Package}
          iconBgColor="bg-red-50"
          iconColor="text-red-600"
        />
        <AdminStatCard
          title="Total Orders"
          value={loading ? "..." : String(totalOrders)}
          subtitle={loading ? "Loading..." : `${shippedOrders} Shipped • ${pendingOrders} Pending`}
          icon={ShoppingBag}
          iconBgColor="bg-blue-50"
          iconColor="text-blue-600"
        />
        <AdminStatCard
          title="Total Users"
          value={loading ? "..." : String(totalUsers)}
          subtitle={loading ? "Loading..." : `${activeUsers} Active • ${suspendedUsers} Suspended`}
          icon={Users}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <AdminStatCard
          title="Captured Payments"
          value={loading ? "..." : String(capturedPayments)}
          subtitle={loading ? "Loading..." : `${refundedPayments} Refunded • ${failedPayments} Failed`}
          icon={CreditCard}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
        />
      </div>

      {/* Grid of Module Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Orders Status Breakdown */}
        <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-5">
          <h2 className="text-base md:text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-4 uppercase tracking-wider flex items-center justify-between">
            <span>Orders Pipeline</span>
            <span className="text-xs text-slate-400 font-normal">Real Data</span>
          </h2>
          {loading ? (
            <div className="py-8 text-center text-slate-400 font-semibold text-xs">
              Loading orders pipeline data...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs md:text-sm">
                <span className="flex items-center gap-2 font-bold text-slate-700">
                  <Clock size={16} className="text-amber-500" /> Pending Orders
                </span>
                <span className="font-extrabold text-slate-900">{pendingOrders}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-amber-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${totalOrders ? (pendingOrders / totalOrders) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs md:text-sm pt-1">
                <span className="flex items-center gap-2 font-bold text-slate-700">
                  <CheckCircle2 size={16} className="text-blue-500" /> Paid Orders
                </span>
                <span className="font-extrabold text-slate-900">{paidOrders}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${totalOrders ? (paidOrders / totalOrders) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs md:text-sm pt-1">
                <span className="flex items-center gap-2 font-bold text-slate-700">
                  <Truck size={16} className="text-emerald-500" /> Shipped Orders
                </span>
                <span className="font-extrabold text-slate-900">{shippedOrders}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${totalOrders ? (shippedOrders / totalOrders) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs md:text-sm pt-1">
                <span className="flex items-center gap-2 font-bold text-slate-700">
                  <AlertTriangle size={16} className="text-rose-500" /> Cancelled Orders
                </span>
                <span className="font-extrabold text-slate-900">{cancelledOrders}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-rose-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${totalOrders ? (cancelledOrders / totalOrders) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Payments Breakdown */}
        <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-5">
          <h2 className="text-base md:text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-4 uppercase tracking-wider flex items-center justify-between">
            <span>Payments Status</span>
            <span className="text-xs text-slate-400 font-normal">Real Data</span>
          </h2>
          {loading ? (
            <div className="py-8 text-center text-slate-400 font-semibold text-xs">
              Loading payment metrics...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 md:p-5 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs md:text-sm font-bold text-emerald-800 uppercase block">Captured Payments</span>
                  <span className="text-2xl md:text-3xl font-black text-emerald-900">{capturedPayments}</span>
                </div>
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>

              <div className="p-4 md:p-5 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs md:text-sm font-bold text-rose-800 uppercase block">Refunded Payments</span>
                  <span className="text-2xl md:text-3xl font-black text-rose-900">{refundedPayments}</span>
                </div>
                <AlertTriangle size={28} className="text-rose-600" />
              </div>

              <div className="p-4 md:p-5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs md:text-sm font-bold text-slate-700 uppercase block">Failed Payments</span>
                  <span className="text-2xl md:text-3xl font-black text-slate-900">{failedPayments}</span>
                </div>
                <ShieldAlert size={28} className="text-slate-500" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products by Category Bar Chart */}
      <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-6">
        <h2 className="text-base md:text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-4 uppercase tracking-wider">
          Products Distribution by Category
        </h2>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-slate-400 font-semibold text-xs">
            Loading category distribution...
          </div>
        ) : categoryStats.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-slate-400 font-semibold text-xs">
            No products found for category distribution.
          </div>
        ) : (
          <div className="h-56 flex items-end justify-between gap-4 pt-4 px-2">
            {categoryStats.map((c) => {
              const heightPercent = Math.round((c.count / maxCategoryCount) * 100);
              return (
                <div key={c.name} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-xs md:text-sm font-extrabold text-slate-700">{c.count}</span>
                  <div
                    className="w-full bg-red-600 rounded-t-lg transition-all group-hover:bg-red-700"
                    style={{ height: `${Math.max(heightPercent, 8)}%` }}
                  />
                  <span className="text-xs md:text-sm font-bold text-slate-700 truncate mt-1 max-w-[100px]" title={c.name}>
                    {c.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
