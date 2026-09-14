"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Eye, Search } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminPagination from "@/components/admin/AdminPagination";
import type { MongoOrderDoc as OrderRecord } from "@/lib/repositories/orders";

const ITEMS_PER_PAGE = 12;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const refreshOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setOrders(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch admin orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshOrders();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const filteredOrders = orders.filter((o) => {
    const currentStatus = (o.orderStatus || (o as any).status || "").toLowerCase();

    const matchesStatus =
      statusFilter === "all" || currentStatus === statusFilter.toLowerCase();
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerEmail.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getOrderStatusBadge = (status?: string) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "PENDING":
        return <AdminBadge variant="warning">PENDING</AdminBadge>;
      case "PROCESSING":
      case "PAID":
        return <AdminBadge variant="info">PROCESSING</AdminBadge>;
      case "SHIPPED":
        return <AdminBadge variant="primary">SHIPPED</AdminBadge>;
      case "DELIVERED":
        return <AdminBadge variant="success">DELIVERED</AdminBadge>;
      case "CANCELLED":
        return <AdminBadge variant="danger">CANCELLED</AdminBadge>;
      default:
        return <AdminBadge variant="neutral">{status || "PENDING"}</AdminBadge>;
    }
  };

  const getPaymentStatusBadge = (status?: string) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "PAID":
      case "CAPTURED":
        return <AdminBadge variant="success">PAID</AdminBadge>;
      case "REFUNDED":
        return <AdminBadge variant="danger">REFUNDED</AdminBadge>;
      case "FAILED":
        return <AdminBadge variant="danger">FAILED</AdminBadge>;
      case "UNPAID":
      case "PENDING":
      default:
        return <AdminBadge variant="warning">UNPAID</AdminBadge>;
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Orders</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Track customer order fulfillments, update statuses, and log tracking numbers.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 md:p-5 shadow-2xs flex flex-col md:flex-row items-center gap-4 justify-between">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          {["all", "Pending", "Paid", "Shipped", "Cancelled"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-xs md:text-sm font-extrabold transition-all cursor-pointer ${
                statusFilter === status
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80"
              }`}
            >
              {status === "all" ? "All Orders" : status}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, customer, email..."
            className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-800 font-medium focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50/60">
                <th className="py-4 px-4">Order ID</th>
                <th className="py-4 px-4">Customer</th>
                <th className="py-4 px-4">Items</th>
                <th className="py-4 px-4">Total</th>
                <th className="py-4 px-4">Payment Status</th>
                <th className="py-4 px-4">Order Status</th>
                <th className="py-4 px-4">Date</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold">
                    <div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin mx-auto mb-2" />
                    <span>Loading orders...</span>
                  </td>
                </tr>
              ) : paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold">
                    No orders found.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-black text-red-600">{o.orderNumber}</td>
                    <td className="py-4 px-4">
                      <div>
                        <span className="font-bold text-slate-900 block">{o.customerName}</span>
                        <span className="text-xs text-slate-500 block">{o.customerEmail}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-extrabold text-slate-700">
                      {o.items.length} {o.items.length === 1 ? "item" : "items"}
                    </td>
                    <td className="py-4 px-4 font-black text-slate-900">
                      AED {o.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-4 px-4">{getPaymentStatusBadge(o.paymentStatus)}</td>
                    <td className="py-4 px-4">{getOrderStatusBadge(o.orderStatus || (o as any).status)}</td>
                    <td className="py-4 px-4 font-mono text-xs text-slate-500">
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Recent"}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs md:text-sm font-bold rounded-xl transition-colors"
                      >
                        <Eye size={16} /> Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Global Reusable Pagination */}
        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => setCurrentPage(page)}
          totalItems={filteredOrders.length}
          itemsPerPage={ITEMS_PER_PAGE}
          itemLabel="orders"
        />
      </div>
    </div>
  );
}
