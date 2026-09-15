"use client";

import { useState, useEffect } from "react";
import { Package, ShoppingBag, Users, CreditCard, CheckCircle2, AlertTriangle, Clock, Truck, ShieldAlert } from "lucide-react";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminBarChart from "@/components/admin/charts/AdminBarChart";
import AdminProgressChart from "@/components/admin/charts/AdminProgressChart";
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

  const orderPipelineItems = [
    { id: "pending", label: "Pending Orders", count: pendingOrders, total: totalOrders, colorClass: "bg-amber-500", icon: Clock },
    { id: "paid", label: "Paid Orders", count: paidOrders, total: totalOrders, colorClass: "bg-blue-500", icon: CheckCircle2 },
    { id: "shipped", label: "Shipped Orders", count: shippedOrders, total: totalOrders, colorClass: "bg-emerald-500", icon: Truck },
    { id: "cancelled", label: "Cancelled Orders", count: cancelledOrders, total: totalOrders, colorClass: "bg-rose-500", icon: AlertTriangle },
  ];

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
            <div className="py-8 space-y-4 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded-md w-1/3" />
                  <div className="h-2.5 bg-slate-100 rounded-full w-full" />
                </div>
              ))}
            </div>
          ) : (
            <AdminProgressChart items={orderPipelineItems} />
          )}
        </div>

        {/* Payments Breakdown */}
        <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-5">
          <h2 className="text-base md:text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-4 uppercase tracking-wider flex items-center justify-between">
            <span>Payments Status</span>
            <span className="text-xs text-slate-400 font-normal">Real Data</span>
          </h2>
          {loading ? (
            <div className="space-y-4 animate-pulse py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-100 h-20" />
              ))}
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
          <div className="h-56 flex items-end justify-between gap-4 pt-4 px-2 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-1 bg-slate-100 rounded-t-lg" style={{ height: `${40 + i * 12}%` }} />
            ))}
          </div>
        ) : (
          <AdminBarChart data={categoryStats} type="single" height={220} />
        )}
      </div>
    </div>
  );
}
