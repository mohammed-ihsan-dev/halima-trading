"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Save, Truck, User, MapPin, Package, CreditCard, ShieldCheck } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import type { MongoOrderDoc as OrderRecord } from "@/lib/repositories/orders";

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OrderRecord["orderStatus"]>("PENDING");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [notification, setNotification] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchOrderDetails = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        const found = data.data.find(
          (o: OrderRecord) => o.id === orderId || o.orderNumber === orderId
        );
        if (found) {
          setOrder(found);
          setStatus(found.orderStatus || found.status || "PENDING");
          setTrackingNumber(found.trackingNumber || "");
        }
      }
    } catch (err) {
      console.error("Failed to fetch order details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSaving(true);

    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          status,
          trackingNumber,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNotification("Order status and tracking information updated successfully.");
        fetchOrderDetails();
      } else {
        setNotification(`Error: ${data.error || "Failed to update order status"}`);
      }
    } catch {
      setNotification("Failed to update order status.");
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(""), 4000);
    }
  };


  if (loading) {
    return (
      <div className="p-12 text-center text-sm font-bold text-slate-400">
        Loading order details...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 p-8 text-center bg-white rounded-2xl border border-slate-200">
        <h2 className="text-xl font-black text-slate-900">Order Not Found</h2>
        <p className="text-sm text-slate-500">The order reference could not be found in our records.</p>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs md:text-sm font-bold"
        >
          <ArrowLeft size={16} /> Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{order.orderNumber}</h1>
              <AdminBadge variant={order.orderStatus === "SHIPPED" ? "primary" : order.orderStatus === "PROCESSING" || order.orderStatus === "Paid" ? "info" : order.orderStatus === "CANCELLED" ? "danger" : "warning"}>
                {order.orderStatus}
              </AdminBadge>

            </div>
            <p className="text-xs md:text-sm font-semibold text-slate-500 mt-1">
              Placed on {order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Recent"}
            </p>
          </div>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600" />
            <span>{notification}</span>
          </div>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Items & Customer Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ordered Items */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-4 flex items-center gap-2 uppercase tracking-wider">
              <Package size={18} className="text-red-600" /> Ordered Items ({order.items.length})
            </h2>

            <div className="divide-y divide-slate-100">
              {order.items.map((item: any, idx: number) => (
                <div key={item.id || item.productId || idx} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200/80 overflow-hidden shrink-0">
                      <img
                        src={item.image || "/featured/hisense-window-ac.png"}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">{item.name}</h3>
                      <span className="font-mono text-xs font-extrabold text-red-600 block mt-1">
                        SKU: {item.sku}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs md:text-sm font-bold text-slate-500 block">
                      {item.quantity || item.qty} × AED {(item.unitPrice || item.price || 0).toLocaleString()}
                    </span>
                    <span className="text-sm md:text-base font-black text-slate-900 block mt-0.5">
                      AED {(item.total || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>


            {/* Total Summary Breakdown */}
            <div className="border-t border-slate-100 pt-4 space-y-2 text-xs md:text-sm">
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>Subtotal</span>
                <span>AED {order.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>VAT (5%)</span>
                <span>AED {order.taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base md:text-lg font-black text-slate-900 pt-3 border-t border-slate-100">
                <span>Grand Total</span>
                <span className="text-red-600">AED {order.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Customer & Shipping Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Details */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-4">
              <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
                <User size={16} className="text-slate-500" /> Customer Information
              </h2>
              <div className="space-y-3 text-xs md:text-sm">
                <div>
                  <span className="text-slate-400 text-xs block font-semibold">Name</span>
                  <span className="font-bold text-slate-900">{order.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block font-semibold">Email</span>
                  <span className="font-bold text-slate-900">{order.customerEmail}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block font-semibold">Phone</span>
                  <span className="font-bold text-slate-900">{order.customerPhone}</span>
                </div>
                {order.company && (
                  <div>
                    <span className="text-slate-400 text-xs block font-semibold">Company</span>
                    <span className="font-bold text-slate-900">{order.company}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Shipping Details */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-4">
              <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
                <MapPin size={16} className="text-slate-500" /> Shipping Address
              </h2>
              <div className="space-y-3 text-xs md:text-sm">
                <div>
                  <span className="text-slate-400 text-xs block font-semibold">Address</span>
                  <span className="font-bold text-slate-900 leading-relaxed block">
                    {order.shippingAddress.address}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 text-xs block font-semibold">City</span>
                    <span className="font-bold text-slate-900">{order.shippingAddress.city}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block font-semibold">Emirate</span>
                    <span className="font-bold text-slate-900">{order.shippingAddress.emirate}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block font-semibold">Country</span>
                  <span className="font-bold text-slate-900">{order.shippingAddress.country}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Order Fulfillment & Tracking Control */}
        <div className="space-y-6">
          {/* Order Status & Fulfillment Form */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
              <Truck size={16} className="text-red-600" /> Fulfillment Management
            </h2>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Order Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OrderRecord["orderStatus"])}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm font-bold text-slate-900 focus:outline-hidden focus:border-red-500 cursor-pointer"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="SHIPPED">SHIPPED</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>

              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Tracking Number (Courier / DHL)
                </label>
                <input
                  type="text"
                  placeholder="e.g. DHL-9921029381"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:border-red-500"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 hover:bg-black text-white font-extrabold text-xs md:text-sm rounded-xl shadow-xs transition-all disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Updating..." : "Save Order Status"}
              </button>
            </form>
          </div>

          {/* Payment Overview Box */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
              <CreditCard size={16} className="text-emerald-600" /> Payment Summary
            </h2>
            <div className="flex justify-between items-center text-xs md:text-sm">
              <span className="text-slate-500 font-semibold">Payment Status:</span>
              <AdminBadge variant={order.paymentStatus === "Captured" ? "success" : order.paymentStatus === "Refunded" ? "danger" : "warning"}>
                {order.paymentStatus}
              </AdminBadge>
            </div>
            <div className="flex justify-between items-center text-xs md:text-sm">
              <span className="text-slate-500 font-semibold">Currency:</span>
              <span className="font-bold text-slate-900">{order.currency}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
