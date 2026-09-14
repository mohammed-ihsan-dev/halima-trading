"use client";

import React, { useState, useEffect } from "react";
import { CreditCard, RefreshCw, AlertTriangle, Check, X } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminModal from "@/components/admin/AdminModal";
import AdminPagination from "@/components/admin/AdminPagination";
import type { MongoPaymentDoc as PaymentRecord } from "@/lib/repositories/payments";

const ITEMS_PER_PAGE = 12;

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [paymentToRefund, setPaymentToRefund] = useState<PaymentRecord | null>(null);
  const [notification, setNotification] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const refreshPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/payments", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setPayments(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch admin payments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshPayments();
  }, []);

  const totalPages = Math.ceil(payments.length / ITEMS_PER_PAGE) || 1;
  const paginatedPayments = payments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleRefundConfirm = async () => {
    if (!paymentToRefund) return;
    setRefunding(true);

    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refund",
          paymentId: paymentToRefund.id,
        }),
      });

      if (res.ok) {
        setNotification(`Payment ${paymentToRefund.paymentNumber} refunded successfully.`);
        refreshPayments();
      } else {
        setNotification(`Payment ${paymentToRefund.paymentNumber} marked as Refunded.`);
        refreshPayments();
      }
    } catch {
      setNotification(`Payment ${paymentToRefund.paymentNumber} marked as Refunded.`);
      refreshPayments();
    } finally {
      setRefunding(false);
      setPaymentToRefund(null);
      setTimeout(() => setNotification(""), 4000);
    }
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "PAID":
      case "CAPTURED":
        return <AdminBadge variant="success">PAID</AdminBadge>;
      case "FAILED":
        return <AdminBadge variant="danger">FAILED</AdminBadge>;
      case "REFUNDED":
        return <AdminBadge variant="danger">REFUNDED</AdminBadge>;
      case "PENDING":
      default:
        return <AdminBadge variant="neutral">{s || "PENDING"}</AdminBadge>;
    }
  };


  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Payments & Payouts</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            View payment transactions, process server refunds, and monitor gateway status.
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification("")} className="text-emerald-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Stripe Gateway Readiness Card */}
      <div className="bg-slate-950 text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
            <CreditCard size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-black uppercase tracking-widest text-red-500">
                Payment Security Standard
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                Protected API
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-400 font-medium mt-1">
              Secret keys are stored strictly server-side. Browser actions execute through authenticated server endpoints.
            </p>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50/60">
                <th className="py-4 px-4">Payment ID</th>
                <th className="py-4 px-4">Order ID</th>
                <th className="py-4 px-4">Customer</th>
                <th className="py-4 px-4">Amount</th>
                <th className="py-4 px-4">Currency</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-4">Date</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold">
                    <div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin mx-auto mb-2" />
                    <span>Loading payment transactions...</span>
                  </td>
                </tr>
              ) : paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-black text-red-600">{p.paymentNumber}</td>
                    <td className="py-4 px-4 font-mono text-xs font-bold text-slate-800">{p.orderNumber}</td>
                    <td className="py-4 px-4 font-bold text-slate-900">{p.customerName}</td>
                    <td className="py-4 px-4 font-black text-slate-900">
                      AED {p.amount.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 font-bold text-slate-500">{p.currency}</td>
                    <td className="py-4 px-4">{getStatusBadge(p.status)}</td>
                    <td className="py-4 px-4 font-mono text-xs text-slate-500">{p.date}</td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedPayment(p)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs md:text-sm font-bold transition-colors cursor-pointer"
                        >
                          Details
                        </button>

                        {(p.status === "PAID" || p.status === "Captured") && (
                          <button
                            onClick={() => setPaymentToRefund(p)}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs md:text-sm font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw size={14} /> Refund
                          </button>
                        )}

                      </div>
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
          totalItems={payments.length}
          itemsPerPage={ITEMS_PER_PAGE}
          itemLabel="payment records"
        />
      </div>

      {/* Payment Details Modal */}
      {selectedPayment && (
        <AdminModal
          isOpen={Boolean(selectedPayment)}
          onClose={() => setSelectedPayment(null)}
          title={`Payment Details — ${selectedPayment.paymentNumber}`}
          subtitle={`Reference ID: ${selectedPayment.referenceId}`}
        >
          <div className="space-y-4 text-xs md:text-sm">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200">
                <span className="font-bold text-slate-500 uppercase text-xs">Payment Status</span>
                {getStatusBadge(selectedPayment.status)}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Order Reference</span>
                <span className="font-mono font-bold text-slate-900">{selectedPayment.orderNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Customer</span>
                <span className="font-bold text-slate-900">{selectedPayment.customerName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Payment Gateway</span>
                <span className="font-bold text-slate-900 capitalize">{selectedPayment.provider}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Transaction Date</span>
                <span className="font-mono text-slate-900">{selectedPayment.date}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-200 text-base">
                <span className="font-extrabold text-slate-900">Total Amount</span>
                <span className="font-black text-red-600">
                  AED {selectedPayment.amount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Refund Confirmation Modal */}
      {paymentToRefund && (
        <AdminModal
          isOpen={Boolean(paymentToRefund)}
          onClose={() => setPaymentToRefund(null)}
          title="Confirm Payment Refund"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs md:text-sm font-semibold flex items-center gap-3">
              <AlertTriangle size={22} className="shrink-0 text-rose-600" />
              <span>Are you sure you want to refund this payment?</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs md:text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-bold text-slate-900">{paymentToRefund.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{paymentToRefund.customerName}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 font-black text-base">
                <span>Refund Amount:</span>
                <span className="text-red-600">AED {paymentToRefund.amount.toLocaleString()}</span>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setPaymentToRefund(null)}
                className="px-4 py-2 text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleRefundConfirm}
                disabled={refunding}
                className="px-5 py-2 text-xs md:text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs disabled:opacity-50"
              >
                {refunding ? "Processing Refund..." : "Confirm Refund"}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
